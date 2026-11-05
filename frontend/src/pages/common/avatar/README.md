# Frontend // Avatar Control <br> `frontend/src/pages/common/avatar/..`

How the web app's avatars are driven: by the page itself, by the backend's
`robot_action` frames, and, for the Smiley, by backend **plans**: timed,
multi-step commands that line up with the reply the avatar speaks. This is the
overview of all of it, written for whoever designs the backend side. It walks
through every piece of frontend code involved, so the backend can be built
against what the client actually does.

| Read with | What it covers |
|---|---|
| `AVATAR_PLANS.md` (beside this file) | The plan frames' exact contract (a draft): every field, default, range, and limit, plus the Smiley's names |
| `smiley/README.md` | How the Smiley builds and draws each frame |
| `backend/chat_app/websocket/consumers/CLIENT_PROTOCOL.md` | Today's chat protocol: `robot_action`, `llm_response`, `audio_chunk`, `cancel_audio`, `tts_playback` |

> **Status:** the plan pathway runs end to end on the avatar demo page
> (`/avatar-demo`), which plays the backend's part with example plans. The chat
> page doesn't read plan frames yet, and the backend sends none (§8).
> `robot_action` and `CLIENT_PROTOCOL.md` are unchanged.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- The Avatars                                                                      -->
<!-- -------------------------------------------------------------------------------- -->
## 1. The avatars

`avatarRegistry.tsx` lists them. A page renders `<Avatar model zoom ref />`
(`Avatar.tsx`) and drives the avatar through its `AvatarHandle`. The chat page
shows the participant's `UserSettings.modelChoice`; an id with no entry shows
the Smiley.

| id | What it is | `robot_action` | Plans | Page-driven features |
|---|---|---|---|---|
| `smiley` | A code-drawn 2D emoji face, redrawn every animation frame | yes | yes | gaze, conversation state, speech level, speech gaze, sleep |
| `smiley-brows` | The same face, with its eyebrows always showing | yes | yes | the same |
| `qt`, `buddy` | Clip-based 3D models of the two robots, shown in the web app | yes (their own clip names) | no | none |

* `AvatarEntry.plans` is the avatar's **plan catalog**: the names a plan may
  use with it. `null` means it can't run plans, and a plan sent to it is
  rejected.
* `AvatarEntry.features` lists the optional handle methods it implements. An
  avatar without one simply doesn't have it, so pages call them freely.
* The physical QT and Buddy robots are separate clients with their own code.
  They only get `robot_action`.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Who Drives the Avatar                                                            -->
<!-- -------------------------------------------------------------------------------- -->
## 2. Three ways the avatar is driven

| Source | What it controls | Code |
|---|---|---|
| The page | Sleep, the conversation look, the mouth, and the automatic behaviors | `pages/chat/useChatAvatar.ts`, `useSpeakingAvatar.ts` |
| `robot_action` (today) | One named emotion or animation, with an optional hold | `performAction()` on every avatar |
| Plans (new, Smiley only) | Sequences of face, head, gaze, map, breath, blink, and state changes, timed to each other and to the reply | `avatar_setup` and `avatar_plan` in, `avatar_feedback` out (§3, §4) |

### 2.1 The page's part

* **Sleep:** asleep whenever the chat isn't running and no reply is playing;
  waking plays the Yawn (`useChatAvatar`).
* **Conversation look:** listening while the microphone is on, thinking from
  the participant's finished utterance until the reply starts, speaking while
  the reply plays, and idle while the chat is stopped (`useChatAvatar`).
* **Mouth:** follows the reply's loudness at the moment the speakers play it
  (`useSpeakingAvatar`). The speech phases (looking away at pauses, aside over
  the last few words) are only sent on the demo page for now.
* **Breath before speaking** (`prepareToSpeak`): only the demo's simulated turn
  calls it.

### 2.2 `robot_action`

`{kind, value, duration_ms}` (`CLIENT_PROTOCOL.md` §3.1). The backend sends the
LLM's mood as an `emotion` as soon as the LLM returns, before the reply's
`llm_response`. The mood and the admin panel's buttons go out through the same
relay, which fills in `duration_ms: 3000` when one is missing
(`format_send_actions_command` in
`backend/chat_app/websocket/consumers/utils/groups.py`). The Smiley matches the
value by name in its three categories, or picks a random name for a mood
(`smiley/actions/smileyActions.ts`); an unknown value goes back to the resting
face. A `robot_action` also counts as a newer plan: it drops the running plan's
waiting steps.

### 2.3 Plans

A **setup** (`avatar_setup`) sets the session's resting face and which automatic
behaviors run, and hands the conversation state to the backend. A **plan**
(`avatar_plan`) is a list of steps that run in order on the client's clock.
Each step does one or more actions at a moment: when the step before ends, or a
moment in a reply. The client reports back (`avatar_feedback`) when a plan asks,
and always when it rejects one. The backend picks this pathway by chat type;
there is no handshake.

### 2.4 When the sources overlap

* **Conversation state:** the face shows the page's "speaking" while reply audio
  plays. Otherwise it shows the backend's state once a setup or a plan's `state`
  has set one, and otherwise the page's (`shownState` in
  `smiley/useFaceController.ts`).
* **Gaze**, highest first: the demo's gaze pad, a plan's look, the speech
  phase's look (when speech gaze is on), the conversation state's look, then
  idle glances (`smiley/behavior/gaze.ts`).
* **Face:** a plan's `face` and a `robot_action` emotion use the same expression
  layer, and the newest wins. A new movement replaces the one playing.
* **Holds outlive their plan:** a held face, look, or pose, or the raised map,
  stays until replaced, released, or reset.

### 2.5 What runs on its own

| Behavior | Switch (`avatar_setup.auto`) |
|---|---|
| Blinks at random gaps (a plan can add one) | always on |
| Breathing (a plan can take a deliberate breath) | always on |
| Lip sync, and easing between targets | always on |
| Small idle glances around the user | `idle_glances` |
| Eyes drifting up and aside while thinking | `thinking_look` |
| Speech gaze: away at pauses, aside over the last words, back at the end | `speech_gaze` (the page must also send speech phases) |
| A slight sway, and now and then a head cock, while listening | `listening_motions` |

Without a setup, every switch is on. A setup sets each one, and a switch it
leaves out takes the protocol's default: on, except `speech_gaze`.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- What a Plan Can Do                                                               -->
<!-- -------------------------------------------------------------------------------- -->
## 3. What a plan can do

A summary; every field, default, and limit is in `AVATAR_PLANS.md` §2-§3.

### 3.1 Frames

| Frame | Direction | What it carries |
|---|---|---|
| `avatar_setup` | backend → client | `rest` (the resting face) and `auto` (the switches in §2.5). Each setup replaces the last, and plans never cancel it |
| `avatar_plan` | backend → client | `{id, turn?, feedback?, expire_ms?, steps}`: up to 64 steps that run in order. No steps is a pure cancel |
| `avatar_feedback` | client → backend | `rejected` always; `started`, `step`, `dropped`, `ended` when the plan asks (§4.6) |

### 3.2 Steps

Each step has a moment, a length, and its actions.

* **When it starts:** `start_on` plus `wait_ms`. `start_on` is `previous` (the
  default: when the step before ends), `reply_text` (the reply's `llm_response`
  arrived), `reply_audio` (its first audio is heard), `reply_end` (its last
  audio ends), or `{"sentence": n}` (sentence n's first audio is heard).
* **Starting early:** `wait_ms` may be negative on the audio moments.
  `hold_audio_ms` lets the client delay that reply's audio so such a step gets
  its full lead (§5.3).
* **How long it lasts:** `ms`, or by default its actions' natural length (the
  longest one). `ms` never cuts an action short: a short `ms` (even 0) lets the
  next step start while this one's actions keep playing. That is how two things
  overlap in one plan.

### 3.3 Actions

| Action | What it does on the Smiley |
|---|---|
| `face` | Shows an expression at a strength (0 to 1, partway from the resting face), for a hold, with its own in and out times. `"rest"` goes back |
| `move` | Plays a movement (Nod, Shake No, …), scaled by `strength`, faster or slower by `speed` |
| `animation` | Plays an animation: a held one (Ponder) acts like a face, a timed one (Yawn, the Glances) runs its length |
| `pose` | Holds the head turned and leaning, on top of the face's own pose, for a hold. `"rest"` eases out |
| `gaze` | Looks at a point, scans around one, or traces a path, in the `user`, `screen`, or `map` frame, for a hold. `head` turns the head along by a share. `"release"` goes back to the automatic look |
| `prop` | Picks up or puts away the map (`hold`), and raises it from 0 to 1 (`raise`) |
| `breath` | One deliberate breath: in, held (a null hold lasts until "speaking" starts, at most 2.5 s), and out |
| `blink` | One blink now |
| `state` | Sets the conversation state: `idle`, `listening`, or `thinking` (the client owns `speaking`) |
| `reset` | Face back to rest, the movement stopped, the look and pose released, and breathing back to its rhythm (the map and the state stay) |

### 3.4 Coordinates

* **Gaze and head:** -1 to 1 each way, left and right always the viewer's,
  positive y down. The user is at (0, 0).
* **The map:** 0 to 1 across and down the map **as the avatar reads it**, from
  its top-left. We see the map's back, so its top-left looks up and to the
  viewer's right. A spot's look follows how far the map is raised.

### 3.5 Names

A plan uses the avatar's own names, exactly as `AVATAR_PLANS.md` §9 lists them
(matched ignoring case), never mood labels: `"Happy"` is rejected in a plan.
The names are checked against the catalog before anything runs, and one unknown
name rejects the whole plan.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- How a Plan Runs                                                                  -->
<!-- -------------------------------------------------------------------------------- -->
## 4. How a plan runs

```text
avatar_setup / avatar_plan (from the backend)
 │
 ├─ hooks/live-chat/avatarPlanChecks.ts ......... the frame's shape, types, ranges, limits (bad: "rejected")
 │
 ├─ plans/useAvatarPlans.ts ...................... its names against the avatar's catalog (bad: "rejected")
 │   ├─ a setup goes straight to the avatar (applySetup)
 │   └─ a plan goes to the scheduler, ticked every animation frame with the replies' moments
 │
 ├─ plans/planScheduler.ts ....................... when each step runs; cancelling, expiry, feedback events
 │
 └─ AvatarHandle.runPlanStep (the Smiley)
     └─ smiley/plans/smileyStepRunner.ts ......... each action through a lever of smiley/useFaceController.ts
         └─ the layers: expression, movement, map, gaze and pose, breath, blink, state
             └─ one FaceState per frame, drawn by smiley/render_2d/

audio_chunk ──► hooks/live-chat/useAudioPlayer.ts ──► replyMoments.ts: each reply's start, sentences, end
llm_response ─► useAvatarPlans.noteReplyText: when each reply's text arrived
                 (both are read by the scheduler every frame; it can ask the player to hold the next reply)
```

### 4.1 Checks on arrival (`hooks/live-chat/avatarPlanChecks.ts`)

`parseAvatarPlan` and `parseAvatarSetup` check every field: types, ranges,
limits, unknown keys, and the rules between fields (a negative `wait_ms` only
on the audio moments, `hold_audio_ms` only on `reply_audio` with a negative
wait, at most one of `at` / `offset` / `scan` / `trace` in a look, an animation
never sharing a step with a face or a movement). They fill in the protocol's
defaults and return the typed frame (`avatarPlanFrames.ts`), or the rejection to
send back, naming the field. A plan runs whole or not at all.

### 4.2 The plans hook (`plans/useAvatarPlans.ts`)

One hook for every page that runs plans: the demo page now, the chat page next.
The page gives it the avatar, an `onFeedback` callback, and the audio player's
view of the replies (`ReplyFeed`: the reply timeline, the audio lead, and the
hold). It gives back:

| Method | What it does |
|---|---|
| `runPlan(plan)` | Checks the plan's names against the shown avatar's catalog, then starts it (steps due now run at once) |
| `applySetup(setup)` | Checks the resting face's name, applies the setup to the avatar at once, and keeps it for the session (a newly picked avatar gets it as it mounts) |
| `clearSetup()` | Forgets the setup: every automatic behavior back on, and the page's conversation state counts again |
| `noteRobotAction()` | A `robot_action` arrived: drops the running plan's waiting steps |
| `noteReplyText(responseId)` | A reply's `llm_response` arrived (the `reply_text` moment) |
| `setup` | The session's setup, or null |

Every animation frame it ticks the scheduler with the time and the replies'
moments, and passes the scheduler's audio hold to the player.

### 4.3 The scheduler (`plans/planScheduler.ts`)

Pure timing: no timers of its own, ticked by the hook. One plan runs at a time.

* **Steps run in order.** A step starts at its moment plus its wait, does its
  actions at once, and lasts its `ms` (or the natural length the avatar reports).
  The next step's `previous` moment is that end, and frame-to-frame jitter is not
  allowed to build up along a chain.
* **Reply moments** (§5.4) all belong to one reply per plan, unless a step names
  its own `response_id`.
* **Cancelling:** a newer plan, or a `robot_action`, drops the running plan's
  waiting steps, and that plan ends `cancelled`. Actions already started keep
  playing on the avatar.
* **Late and missing moments:** a step whose moment has passed by the time it
  comes up runs at once and reports how late it was. A step waiting for a sentence
  its reply doesn't have is dropped, and so is every step still waiting
  `expire_ms` (15 s by default) after its plan arrived.
* **Ending:** a plan ends `finished` once its last step's length has passed.

### 4.4 Running a step on the Smiley

`runPlanStep(actions)` hands the step to `smiley/plans/smileyStepRunner.ts`,
which runs `reset` first, then pulls each action's lever on the face controller
(`smiley/useFaceController.ts`). Each lever starts its action and returns how
long it takes, and the step's natural length is the longest of them. The levers
only change the layers' state; the frame loop builds the next frame from them.

| Action | Layer | Where |
|---|---|---|
| `face` | The expression: blends from the resting face by the strength, holds, eases back | `useFaceController.ts`, `actions/faceExpressions.ts` |
| `move` | The movement playing (one at a time), resized and sped up | `actions/faceMotions.ts` |
| `animation` | Held: like a face. Timed: its face, motion, and breath over its length | `actions/faceAnimations.ts` |
| `pose`, `gaze` | Where the eyes and head point | `behavior/gaze.ts` |
| `prop` | The map: how far into view and how far raised | `behavior/mapTask.ts`, `render_2d/SmileyMap2D.tsx` |
| `breath` | A deliberate breath over the breathing rhythm | `behavior/breathing.ts` |
| `blink`, `state` | A blink request, and the backend's conversation state | `useFaceController.ts` |

Every name was checked against the catalog before the plan ran, so a name the
runner can't find is a bug and fails loudly.

### 4.5 Setups on the Smiley

`applySetup(setup)` sets the automatic-behavior switches, makes the backend the
owner of the conversation state (starting at `idle`, unless a plan already set
one), and sets the resting face (`rest`, by default Slightly Smiling Face). Each
setup replaces the last one completely. `applySetup(null)` turns every switch
back on and gives the conversation state back to the page. The resting face
stays as the setup left it (the demo page puts its own back).

### 4.6 Feedback

| Event | Sent when the plan's `feedback` is | Meaning |
|---|---|---|
| `rejected` | always | The plan (or a setup, with `id: null`) never ran; `reason` says why, naming the field at fault |
| `started` | `"end"`, `"steps"` | Its first step ran |
| `step` | `"steps"` | A step ran: `late_ms` (how much later than asked) and, for a step timed to a reply, `reply_ms` (when it ran, against the reply's first audio) |
| `dropped` | `"end"`, `"steps"` | A step that will never run (`expired`, or `no such sentence`) |
| `ended` | `"end"`, `"steps"` | `finished` or `cancelled` |

Feedback echoes the plan's `id` and `turn`. Like `tts_playback`, it carries no
timestamps, only durations measured on the client; the backend stamps each
event as it arrives.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Timing Against the Reply                                                         -->
<!-- -------------------------------------------------------------------------------- -->
## 5. Timing against the reply audio

### 5.1 How reply audio plays

`hooks/live-chat/useAudioPlayer.ts` schedules each `audio_chunk` on one Web
Audio timeline, right after the audio already queued. A new reply's first chunk
is scheduled `bufferAhead` (0.2 s) ahead, so it is heard about 0.2-0.26 s after
it arrives, counting the speakers' latency. The player's `systemSpeaking` turns
on as that chunk is scheduled (so "speaking" starts about that much before the
voice) and off once the queued audio runs out. That is normally the reply's
end, but it also happens in a gap between sentences if synthesis falls behind
playback. The web app already reports each reply's `tts_playback` start and
finish to the backend (`hooks/useLiveChat.ts`).

### 5.2 Reply moments

`hooks/live-chat/replyMoments.ts` keeps each recent reply's moments by
`responseId`: its first audio, each numbered sentence's first audio (from
`audio_chunk.sentence`), and its end (from the chunk marked `last`). They are
kept in the timeline's own seconds and turned into page time as they are read,
from the speakers' output timestamps, so they track what is actually heard.

| Moment | Known this far ahead |
|---|---|
| `reply_text` | Not ahead: it is when the page receives `llm_response` |
| `reply_audio` | About 0.2 s: once the first chunk is scheduled |
| `{"sentence": n}` | Once that sentence's first chunk is scheduled: usually well ahead, since the backend synthesizes a sentence while the one before it plays |
| `reply_end` | Once the last chunk is scheduled: at least the last sentence's length ahead |

### 5.3 Starting before the voice

A step with a negative `wait_ms` runs as soon as its time is known. When it
asks for more lead than that, it runs late and reports `late_ms`. A step's
`hold_audio_ms` opts into delaying its reply instead: each frame the scheduler
works out how long the next reply's first audio should wait (within each
step's cap), and the player holds that reply's first chunk, and so the whole
reply, by that much. "Speaking" waits out the hold too. Nothing is delayed unless
a step asks.

### 5.4 Which reply a plan's moments mean

All of a plan's reply moments belong to one reply, picked by its first reply
moment:

| First reply moment | The plan's reply |
|---|---|
| `reply_text` | The next reply whose `llm_response` arrives after the plan |
| `reply_audio` | The next reply whose audio starts after the plan arrived (so a plan sent just after a reply's text still means that reply) |
| `reply_end`, `{"sentence": n}` | The reply playing when the plan arrived, if any, otherwise the next |

### 5.5 Cancelled replies

On `cancel_audio` the player drops its queued audio and opens a fresh timeline.
Each reply's moments are frozen first: a reply already heard ends at the cancel
(its later sentences never start), and one not heard yet never started. Plans
are not touched; the backend sends a fresh plan for what the avatar should do
now.

### 5.6 Caveats

* A timeline that was just opened (when the chat starts, or after a
  `cancel_audio`) can take about 0.5 s to start its clock, and until it runs,
  its reply's moments read as unknown.
* `{"sentence": n}` counts the pieces the backend synthesizes, which are not
  always single sentences (§7, item 5).

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- The Demo Page                                                                    -->
<!-- -------------------------------------------------------------------------------- -->
## 6. Trying it without a backend: the demo page

`/avatar-demo` (`pages/avatar_demo/`) needs no backend. Next to the action
buttons (the `robot_action` path) it has two groups of example plans for
avatars that can run plans:

* **Example Plans:** chains on the face alone. Look Away and Back, Puzzle It
  Out, Z Look, Lean In, and two timed to the sample reply: Turn-Yielding Reply
  (away 0.4 s into it, aside at sentence 2, back 0.4 s before the end) and
  Breath Before Speaking (a breath 0.6 s before the voice, the audio held for
  it).
* **Map Task:** a picture of the avatar's made-up map (`utils/sampleMap.ts`),
  the map by hand (hold, put away, raise, lower), and six examples: finding the
  bridge, tracing the way to the bus, the missing castle, a barge-in, a Z across
  the map, and a glance at it while listening.

`utils/usePlanExamples.ts` plays the backend's part. Each example
(`utils/planExamples.ts`) is a list of frames in wire format, sent at set times
after the click through the same checks, hook, and scheduler a chat uses. Each
plan carries the run's number as its `turn` and asks for `"end"` feedback, so the
log can show how each run ended: finished, cancelled, or rejected with the
reason. An example with a reply sends the reply's text at a set time, then plays
the saved sample clip (`frontend/public/audio/sample_reply.wav`) 0.5 s later as
a new reply, its two sentences numbered the way the backend will number them
(`utils/useSampleReply.ts`).

* Starting an example stops the one running. An action button or Reset cancels
  it like a newer command, but a reply already playing plays on.
* Every map example turns on the Map Task setup, so plans own the conversation
  state, and the face controls' state buttons have no effect. "Put it away"
  clears the setup.
* Adding an example is one entry in `utils/planExamples.ts`; its button appears
  on its own. The examples are realistic sequences a backend can copy.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- What the Backend Needs                                                           -->
<!-- -------------------------------------------------------------------------------- -->
## 7. What the backend needs

Paths are under `backend/chat_app/`.

1. **A chat type that uses plans.** Each chat type is a harness
   (`websocket/harnesses/`, see its README), picked per connection with the
   `chat_type` query parameter, and its `generate` returns a `ResponseOutcome`
   for every reply. The chat page still picks only the socket path from its chat
   mode (`chatMode` in `frontend/src/pages/chat/Chat.tsx`; `ws/chat/activity/` is
   the older route for `chat_type=activity`), so a new chat type needs a mode
   there that sends `chat_type`.
2. **Setup, then only plans.** Send `avatar_setup` when the client connects,
   then drive the avatar only with plans. No `robot_action` in that chat: an LLM
   mood or an admin button would cut the running plan short.
3. **One send function for avatar frames** that drops anything made for a
   superseded turn, a general version of `ChatHandler._publish_response_mood`
   (`websocket/services/chatHelpers.py`), which drops an automatic reply's mood
   once `consumer._stt_progress_revision` has moved on (newer speech never cancels
   a `reply_now` reply, so its mood always goes out).
4. **Reply timing as it is today.** `llm_response` goes out when the exchange
   commits (`ChatHandler._commit_response`), with `responseId` set to the
   assistant message's id. TTS starts after that
   (`synthesize_and_stream_tts` in `websocket/services/speech/tts/tts_streaming.py`),
   and every `audio_chunk` carries the same `responseId`. So `reply_text` always
   comes before `reply_audio`, by at least the first sentence's synthesis time.
5. **Sentence numbers.** Add an optional 1-based `sentence` to every
   `audio_chunk`. TTS already works one piece at a time: `_speech_pieces` splits
   the reply at sentence ends, a sentence shorter than 24 characters joins the
   next, and a short tail joins the last piece; `_AudioChunkSender.add()` runs
   once per piece. The number is the piece's index, and the chunk the sender holds
   back keeps its own piece's number. A plan's `{"sentence": n}` has to count the
   same pieces.
6. **Handle `avatar_feedback`**: a new branch in
   `websocket/consumers/handlers/ws_events.py` (an unknown type is only logged
   today). Log it, or store it with the session; never wait on it.
7. **Long waits:** a plan waiting on the end of a long reply needs `expire_ms`
   above the 15 s default.
8. **Protocol doc:** once the design settles, the three frames and
   `audio_chunk.sentence` move from `AVATAR_PLANS.md` into `CLIENT_PROTOCOL.md`.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Not Built Yet                                                                    -->
<!-- -------------------------------------------------------------------------------- -->
## 8. Not built yet, and known issues

**Not built yet:**

* **The chat page's wiring** (the next frontend step):
  * `useChatSocket` routing `avatar_setup` and `avatar_plan` through the checks
    (a malformed frame gets one warning and a rejection sent back).
  * The chat page running `useAvatarPlans` with its audio player. `useLiveChat`
    doesn't pass the player's reply timeline, lead, and hold through yet.
  * Sending `avatar_feedback`.
  * Calling `noteReplyText` on `llm_response` and `noteRobotAction` on
    `robot_action`.
  * Clearing the setup when the session ends.

  Until then a live chat ignores the plan frames.
* **The backend:** nothing sends setups or plans, and no chunk carries
  `sentence`.
* **Other avatars:** only the Smiley has a plan catalog. The 3D QT and Buddy
  avatars reject plans, and the physical robots don't know about them.
* **Strength on `robot_action`:** not on the wire (plans have it).

**Known issues:**

* `tts_playback` "started" can be reported early for a reply on a timeline that
  was just opened: its timer is set before the new timeline's clock runs. The
  chat page opens its timeline when the chat starts, so this mostly shows on the
  demo page, and right after a `cancel_audio`.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Decisions and Open Questions                                                     -->
<!-- -------------------------------------------------------------------------------- -->
## 9. Decisions so far, and open questions

**Decided** (with the plan design):

* New frames for capable avatars; `robot_action` stays as it is.
* A plan is a flat list of steps, and one step can drive several parts at once.
* A newer plan, or a `robot_action`, drops older plans' waiting steps. What
  already started keeps playing, holds stay, and a plan with no steps is a pure
  cancel. `cancel_audio` doesn't touch plans.
* A step may start before the reply's audio (a negative wait). It runs as early
  as the client can manage, and `hold_audio_ms` (opt-in) can delay the audio for
  it.
* Sentence moments are designed now; the backend turns them on with
  `audio_chunk.sentence`.
* All of a plan's reply moments mean one reply, picked by its first reply moment.
* Feedback is opt-in per plan, except rejections. It carries durations only, no
  timestamps.
* No handshake: the chat type picks the pathway. The client rejects anything it
  can't run, and a bad plan is rejected whole.
* The backend owns the conversation state and every decision about what the
  avatar does. The client keeps blinks, breathing, idle glances (when on), lip
  sync, and timing steps to its own audio.
* In the Map Task, the thinking look, the speech-pause look-aways, the listening
  sway and head cock, and raising the map are the backend's job (the Map Task
  setup turns the automatic ones off).

**Open** (raised in discussion, not designed yet):

* What decides the avatar's moves in the Map Task: a programmatic harness, the
  LLM, or both.
* Reacting to interim speech (direction words, silences) within a few hundred
  milliseconds, before any reply exists.
* Barge-in: when the participant talks over the avatar's thinking or reply
  (back to listening, map down). The demo's Barge-In example shows the client
  side.
* How often to send plans: every plan cuts the one before short, so each new
  plan has to carry everything still wanted.
* Whether the admin panel should see plans and feedback, and whether its action
  buttons should be blocked in a plan-driven chat.
* Whether the robots get plan catalogs, or plan-driven chats stay web-only.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- File Map                                                                         -->
<!-- -------------------------------------------------------------------------------- -->
## 10. File map

```diff
 frontend/src/
 ├── hooks/
 │   ├── useLiveChat.ts                    # The chat page's socket, microphone, and TTS player (reports `tts_playback`)
 │   └── live-chat/
 │       ├── useChatSocket.ts              # Routes the chat socket's frames (plan frames not routed yet)
 │       ├── avatarPlanFrames.ts           # The plan frames' types and vocabularies, as the client runs them
 │       ├── avatarPlanChecks.ts           # Checks a setup or plan on arrival: the frame, or its rejection
 │       ├── useAudioPlayer.ts             # Schedules TTS chunks: loudness for the mouth, reply timeline and hold for plans
 │       └── replyMoments.ts               # Each reply's start, sentence starts, and end, on the speakers' clock
 │
 └── pages/
     ├── common/avatar/
     │   ├── README.md                     # This overview
     │   ├── AVATAR_PLANS.md               # The plan frames' contract (draft)
     │   ├── avatarRegistry.tsx            # The avatar contract (`AvatarHandle`, `RobotAction`) and the avatar list
     │   ├── Avatar.tsx                    # Shows the avatar for a model id
     │   ├── useSpeakingAvatar.ts          # The mouth (and speech phases) from the reply's audio
     │   ├── plans/
     │   │   ├── useAvatarPlans.ts         # Runs plans and setups on the page's avatar, and sends feedback
     │   │   └── planScheduler.ts          # Step timing, reply moments, cancelling, expiry, feedback events
     │   ├── smiley/                       # The Smiley (see its README for the rest)
     │   │   ├── useFaceController.ts      # The frame loop, the handle, the plan levers, and setups
     │   │   ├── plans/smileyStepRunner.ts # One plan step, through the levers
     │   │   ├── actions/smileyActions.ts  # Name lookup, the moods, and the plan catalog
     │   │   └── behavior/                 # Gaze and poses, the map, breathing, listening motions
     │   └── GltfRobotAvatar.tsx           # The 3D QT and Buddy avatars (with GltfRobotScene, QTModel, BuddyModel)
     │
     ├── chat/
     │   ├── Chat.tsx                      # The participant chat page (passes `robot_action` to the avatar)
     │   └── useChatAvatar.ts              # Sleep, the conversation look, and the mouth on the chat page
     │
     ├── avatar_demo/
     │   ├── AvatarDemo.tsx                # The demo page
     │   ├── utils/planExamples.ts         # The example plans (frames in wire format)
     │   ├── utils/usePlanExamples.ts      # Sends them like a backend, plays their replies, reports how each ended
     │   ├── utils/sampleMap.ts            # The made-up map's landmarks and start
     │   ├── utils/useSampleReply.ts       # Plays the sample reply through the chat's audio player, sentences numbered
     │   ├── utils/useSimulatedTurn.ts     # "Think, then reply" on the `robot_action` path
     │   ├── utils/useActionLog.ts         # The log of everything sent
     │   └── components/                   # The groups (Map Task, Example Plans, the map picture, the log, …)
     │
     └── admin/
         ├── capabilities/profiles.ts      # Each avatar's admin and demo buttons
         └── FRONTEND_CAPABILITIES.md      # How every frontend's action names work
```

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Gotchas                                                                          -->
<!-- -------------------------------------------------------------------------------- -->
## 11. Gotchas

The protocol's own list is `AVATAR_PLANS.md` §12. From the client's side:

* **Every plan cuts the one before short**, and so does every `robot_action`,
  including an admin's button press. Put everything still wanted into the new
  plan.
* **Holds outlive their plan.** Clear them with `"rest"`, `"release"`, or
  `reset`.
* **The client owns "speaking"** and shows it from about 0.2 s before the voice
  until the queued audio runs out, then returns to the last state the backend
  set.
* **About 0.2 s is all the lead `reply_audio` has**, unless a step holds the
  audio.
* **Map coordinates are the avatar's own**, so they are mirrored on screen.
* **A setup's `rest` replaces the page's resting face** for the session, and a
  setup that leaves out `speech_gaze` turns speech gaze off.
* **Plans use exact names, not moods**, and one bad name or field rejects the
  whole plan, with feedback off or not.
