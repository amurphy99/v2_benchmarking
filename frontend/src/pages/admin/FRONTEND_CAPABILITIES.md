# Frontend Capability Profiles

How the AdminChat control panel decides which robot action buttons to show, and what you need
to collect about a new robot or interface before you can add one.

The wire format for the actions themselves is documented in
`backend/chat_app/websocket/consumers/CLIENT_PROTOCOL.md`. This file is only about the admin
page's side of it.

<!-- -------------------------------------------------------------------------------- -->
<!-- The rule                                                                         -->
<!-- -------------------------------------------------------------------------------- -->
## The rule

**The backend sends every interface the same action vocabulary.** It does not know and does
not care what any particular robot can do. `format_send_actions_command()` deliberately does
not branch on `consumer.source`.

**Mapping that vocabulary onto real behavior is the frontend's job.** If the LLM sends
`Sick` and your robot has no sick face, your robot decides what to show instead. It must never
crash or go silent on a value it does not recognize — fall back to an idle or neutral state.

The panel exposes two related but different controls:

1. **Emotion buttons use backend mood labels.** They normally contain the LLM's mood vocabulary,
   plus any confirmed frontend-specific emotions that an admin may trigger directly. Buddy's
   `Angry` is the standing example: the robot supports it, but the LLM cannot select it.
2. **Animation buttons use the frontend's own action names.** A literal `HEAD TILT` or
   `Nodding Yes` button bypasses mood mapping and asks the frontend to play that named behavior.
3. **Mood buttons (optional) list the LLM's moods on their own.** For a frontend whose emotion
   buttons are its own face names (the web smiley's `Grinning Face`, `Cold Face`, …), the moods
   move to a third section, so an admin can still preview what the LLM's `Happy` turns into.
   Profiles that send mood labels as their emotion buttons leave `moods` empty.

<!-- -------------------------------------------------------------------------------- -->
<!-- The two kinds                                                                    -->
<!-- -------------------------------------------------------------------------------- -->
## `emotion` vs `animation`

Every action carries a `kind`, and the difference is about *who owns the vocabulary*:

| `kind` | Vocabulary owner | Frontend behavior |
|---|---|---|
| `emotion` | The backend/LLM | Frontend maps the label onto whatever it has |
| `animation` | The frontend | Label is a literal clip/behavior name, played directly |

`emotion` is the only kind the LLM ever sends automatically. `animation` exists so an admin can
drive a specific named behavior that has no emotional meaning (`Nodding Yes`, `Rolling Forward
Backward`), which is only possible for interfaces whose clip names we actually know.

<!-- -------------------------------------------------------------------------------- -->
<!-- What to collect                                                                  -->
<!-- -------------------------------------------------------------------------------- -->
## What you need to collect for a new robot

Before writing a profile, gather:

1. **The `source` string** the robot connects with. Must be one of the values in
   `ALLOWED_SOURCES` (`backend/chat_app/services/middleware.py`); adding a new interface means
   adding it there first, or the socket closes with code `4002`.
2. **Any additional admin-triggerable emotions** beyond the LLM's standard moods, expressed in
   the vocabulary the client accepts in an `emotion` action.
3. **Its animation/behavior set** — named movements it can play on command, again using its own
   names. Leave this empty if the robot has no addressable named behaviors.
4. **Its mapping from the LLM's 10 moods** onto that set. Every mood needs a destination, even
   if several collapse onto one behavior. The 10 are:

   ```text
   Neutral  Grumpy  Happy  Love  Sad  Scared  Sick  Surprised  Thinking  Tired
   ```

   This is `ResponseMood` in `backend/chat_app/services/llm/live_chat/cognibot_api.py` and is
   the authoritative list. **This mapping lives on the robot, not here.** The admin panel sends
   the abstract mood label; the robot chooses the corresponding face or behavior.
5. **Anything runtime-variable.** See the warning below.

<!-- -------------------------------------------------------------------------------- -->
<!-- Runtime-variable capability                                                      -->
<!-- -------------------------------------------------------------------------------- -->
## Warning: `source` is not always enough

The webapp is the worked example. `source: "webapp"` does not tell you what the interface can
do, because the avatar model is a **per-user setting** (`UserSettings.modelChoice`, chosen in
the settings page and read at `pages/chat/Chat.tsx`). The models share no animation names at
all:

| Model | Animations |
|---|---|
| `buddy` | `DANCE`, `SHAKE NO`, `EMBARRASSED`, `HEAD TILT`, `NOD YES` (5 clips) |
| `qt` | `Celebration`, `Dancing`, `Nodding Yes`, `Thinking`, … (17 clips) |
| `smiley`, `smiley-brows` | `Nod`, `Shake No`, `Look Left`, `Look Right`, `Look Around`, `Sway`, `Bounce`, `Head Tilt` (8 code-drawn motions) |

The web avatars and the shared `performAction()` contract they follow live in
`pages/common/avatar/` (`avatarRegistry.tsx`). The public `/avatar-demo` page shows each web
avatar beside the same buttons this panel would show for it.

So the backend sends `avatarModel` alongside `source` in the `session_info` frame, and
`getCapabilityProfile()` takes both. If a future interface has any capability that varies at
runtime — a hardware revision, an accessory, a user setting — it has to reach the admin page
the same way, through `session_info` in
`backend/chat_app/websocket/consumers/utils/db_data.py`.

Emotions are safe across every model because each avatar maps them itself:
`getAnimationFromEmotion()` (`pages/common/avatar/AvatarUtils.tsx`) for QT and Buddy, and the
expression catalog in `pages/common/avatar/smiley/faceState.ts` for the smiley (each mood picks
one of a few iOS-emoji-style expressions at random). Only raw `animation` buttons, and the
smiley's named-expression emotion buttons, need the model to be known.

<!-- -------------------------------------------------------------------------------- -->
<!-- Adding a profile                                                                 -->
<!-- -------------------------------------------------------------------------------- -->
## Adding a profile

Everything lives in `capabilities/profiles.ts`.

1. Build the `CapabilityProfile`. Each entry is `{label, kind, value}` — `label` is what the
   admin reads, `value` is what goes on the wire:

   ```ts
   const MYROBOT_PROFILE: CapabilityProfile = {
       name       : "My Robot",
       emotions   : asEmotions([...LLM_MOODS, "Angry"]),
       animations : asAnimations(["Wave", "Nod"]),
       moods      : [],
   };
   ```

   `asEmotions` / `asAnimations` are for the common case where the label and the wire value are
   the same string. Write the objects out longhand when they differ.

2. Register it in `getCapabilityProfile()`:

   ```ts
   if (source === "myrobot") return MYROBOT_PROFILE;
   ```

3. Leave it out entirely and it falls back to `DEFAULT_PROFILE` — the 10 LLM moods and no
   direct animations. A protocol-compliant client maps supported moods and uses its neutral
   fallback for the rest. Do not add literal animation buttons until those names are confirmed.

### Current registry

| `source` | Profile | Notes |
|---|---|---|
| `webapp` + `qt` | Web Avatar (QT) | 10 moods + 17 real clip names |
| `webapp` + `buddy` | Web Avatar (Buddy) | 10 moods + 5 real clip names |
| `webapp` + `smiley` | Web Avatar (Smiley) | Every named expression (`Grinning Face`, `Fearful Face`, …) as emotions, 8 motion names, and the 10 moods + `Angry` in the mood section. Not yet a `UserSettings.modelChoice` option, so it only appears on `/avatar-demo` |
| `webapp` + `smiley-brows` | Web Avatar (Smiley + eyebrows) | Same buttons as `smiley`; the face always shows its eyebrows. Also demo-only for now |
| `buddyrobot` | Buddy Robot | 10 moods + `Angry`; animations TBD |
| `qtrobot` | *(default)* | Not yet characterized |
| anything else | *(default)* | 10 moods, no animations |
