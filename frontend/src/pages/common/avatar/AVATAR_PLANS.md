# Frontend // Avatar Plan Protocol (Draft) <br> `frontend/src/pages/common/avatar/..`

This is the **draft** contract for driving a capable avatar from the backend with timed,
multi-step commands: where it looks, what its face does, when it raises its map, and how
each of those lines up with the reply it speaks. It was designed from what the web app's
Smiley avatar can do and what the client can observe, so the backend can be built against
it. Once the backend side is settled it moves into
`backend/chat_app/websocket/consumers/CLIENT_PROTOCOL.md`.

> **Status:** nothing sends or reads these frames yet; the frontend is being built to this
> draft. The existing pathway (`robot_action`, `CLIENT_PROTOCOL.md` §3.1) is unchanged, and
> every client and chat type that doesn't use plans keeps working exactly as it does today.

<!-- -------------------------------------------------------------------------------- -->
<!-- Overview                                                                         -->
<!-- -------------------------------------------------------------------------------- -->
## 1. Overview

**Who uses it:** chat types that drive the avatar from the backend (the Map Task first). The
backend picks the pathway by chat type; there is no handshake. A plan uses the avatar's own
names (§9), kept in sync with this document by hand, and the client rejects any plan it can't
run completely (§7).

| `type` | Direction | Purpose |
|---|---|---|
| `avatar_setup`    | backend → client | Session settings: the resting face and which automatic behaviors run (§2) |
| `avatar_plan`     | backend → client | Steps that run in order on the client's clock (§3) |
| `avatar_feedback` | client → backend | What happened to a plan, when the plan asks; rejections always (§6) |

**Who decides what:** the backend decides everything that *means* something; the client keeps
what keeps the face alive, plus anything timed to its own audio.

| The backend decides | The client keeps |
|---|---|
| The conversation state (`idle`, `listening`, `thinking`), including after a cancelled reply | Showing `speaking` while reply audio plays |
| Where the avatar looks, and when | Blinks, breathing, easing between targets, idle glances (if on) |
| Faces, movements, the head's pose, the map | Lip sync |
| Every sequence and its timing relative to the reply | Timing steps to the moment the audio is actually heard |

**Ordering:** the backend sends every avatar frame on the client's own socket, through one
send function that drops anything made for a turn that has since been cancelled (the check
`_publish_response_mood` already does for moods). Frames are handled in the order they
arrive.

<!-- -------------------------------------------------------------------------------- -->
<!-- Setup                                                                            -->
<!-- -------------------------------------------------------------------------------- -->
## 2. `avatar_setup` -- session settings

```json
{"type": "avatar_setup", "data": {
  "rest": "Slightly Smiling Face",
  "auto": {"idle_glances": true, "thinking_look": false, "speech_gaze": false, "listening_motions": false}
}}
```

Send it when the chat connects, and again whenever a test condition changes. Each setup
replaces the last one completely, and plans never cancel it. **Receiving a setup also hands
the conversation state to the backend for the rest of the session:** the client stops
guessing `listening` and `thinking` itself and waits for `state` actions (§3.3).

| Field | Type | Default | Meaning |
|---|---|---|---|
| `rest` | string | `"Slightly Smiling Face"` | The expression Neutral means (any Expression, §9.1) |
| `auto.idle_glances` | boolean | `true` | Small glances around the user while nothing holds the gaze |
| `auto.thinking_look` | boolean | `true` | Eyes drift up and to the side while `thinking` (off: it looks at the user) |
| `auto.speech_gaze` | boolean | `false` | Looks away at pauses in its own reply, aside over the last few words, back at the end |
| `auto.listening_motions` | boolean | `true` | A slight sway, and now and then a head cock, while `listening` |

Blinks, breathing, lip sync, and easing always run.

<!-- -------------------------------------------------------------------------------- -->
<!-- Plans                                                                            -->
<!-- -------------------------------------------------------------------------------- -->
## 3. `avatar_plan` -- steps on the client's clock

```json
{"type": "avatar_plan", "data": {
  "id": "t14-found", "turn": 14, "feedback": "end",
  "steps": [
    {"gaze": {"on": "map", "at": [0.12, 0.08], "head": 0.3}, "ms": 400},
    {"face": {"name": "Wide-Eyed", "strength": 0.7, "hold_ms": 500}},
    {"start_on": "reply_audio", "wait_ms": 300, "prop": {"raise": 0}, "gaze": {"on": "user", "hold_ms": 1500}}
  ]
}}
```

Eyes to a map spot for 0.4 s, widen for 0.5 s, then 0.3 s after the reply's voice is heard,
lower the map and look at the user.

### 3.1 Plan fields

| Field | Type | Default | Meaning |
|---|---|---|---|
| `id` | string, 1-128 chars | required | Echoed in feedback |
| `turn` | integer | none | The backend's turn or revision, echoed in feedback for logs |
| `feedback` | `"none"` \| `"end"` \| `"steps"` | `"none"` | Which events come back (§6) |
| `expire_ms` | integer, 0-60000 | `15000` | Steps still waiting this long after the plan arrived are dropped |
| `steps` | array, 0-64 | required | The steps, in order. An empty list is a pure cancel (§5) |

### 3.2 Steps and timing

Steps run one after another. A step starts at a moment (`start_on`, plus `wait_ms`), does its
actions at once, and lasts `ms`; then the next step's moment is measured from its end.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `start_on` | see below | `"previous"` | The moment the step is measured from |
| `wait_ms` | integer, -60000-60000 | `0` | Delay after that moment. Negative only with `reply_audio`, `reply_end`, and `sentence` (§4) |
| `hold_audio_ms` | integer, 0-1000 | `0` | Only with `reply_audio` and a negative wait: the most the client may delay that reply's audio so the step gets its full lead (§4.2) |
| `response_id` | integer | none | Ties the step's moment to one reply (§4.1). Only with a reply moment |
| `ms` | integer, 0-60000 | its actions' natural length (§3.4) | How long the step lasts before the next one is measured |

| `start_on` | The moment |
|---|---|
| `"previous"` | The end of the step before (for the first step, when the plan arrives) |
| `"reply_text"` | The reply's `llm_response` arrives |
| `"reply_audio"` | The reply's first audio is heard |
| `"reply_end"` | The reply's last audio finishes |
| `{"sentence": n}` | Sentence `n`'s (1-based) first audio is heard (needs `sentence` on `audio_chunk`, §10) |

A step with no actions is a pure wait. **`ms` never cuts an action short:** a step with a
short `ms` (even `0`) lets the next step wait or start while its own actions keep playing.
That is how two things overlap in one plan.

### 3.3 Actions

A step holds any of these, at most one of each. `reset` (if present) runs first, then the
rest at the same moment. `animation` can't share a step with `face` or `move` (they use the
same parts of the face).

| Action | Shape | What it does |
|---|---|---|
| `face` | `{"name", "strength"?, "hold_ms"?, "in_ms"?, "out_ms"?}` or `"rest"` | Shows an Expression (§9.1) |
| `move` | `{"name", "strength"?, "speed"?}` | Plays a Movement (§9.2) once |
| `animation` | `{"name", "strength"?, "hold_ms"?}` | Plays an Animation (§9.3) |
| `pose` | `{"turn"?, "tilt"?, "move_ms"?, "hold_ms"?}` or `"rest"` | Holds the head in a pose, on top of the face's own |
| `gaze` | a look, a scan, a trace, or `"release"` | Where the eyes go (§3.3.1) |
| `prop` | `{"hold"?, "raise"?, "move_ms"?}` | Picks up, raises, lowers, or puts away the held prop |
| `breath` | `{"in_ms", "depth"?, "hold_ms"?, "out_ms"?}` | One deliberate breath |
| `blink` | `true` or `{"ms"}` | One blink now |
| `state` | `"idle"` \| `"listening"` \| `"thinking"` | The conversation state (the client owns `"speaking"`) |
| `reset` | `true` | Face back to rest, the movement stops, pose and gaze released, breathing back to its rhythm (the prop and state stay) |

| Field | Type | Default | Meaning |
|---|---|---|---|
| `face.name`, `move.name`, `animation.name` | string | required | A name from §9, matched ignoring case |
| `face.strength`, `animation.strength` | number, 0-1 | `1` | Shows the face only that far from the resting face (brows, eye styles, the tear, and hands still show fully) |
| `face.hold_ms`, `animation.hold_ms` | integer or `null` | `null` | Once fully shown, how long it holds before going back to rest (`null`: until replaced). Held Animations only |
| `face.in_ms`, `face.out_ms` | integer, 0-5000 | `180`, `400` | How long it takes to show, and to go back to rest |
| `move.strength` | number, 0-1 | `1` | Size of the movement |
| `move.speed` | number, 0.25-4 | `1` | Faster (above 1) or slower (below 1) |
| `pose.turn` | `[x, y]`, each -1-1 | `[0, 0]` | Head turn (§8) |
| `pose.tilt` | number, -30-30 | `0` | Head lean in degrees (positive leans to the viewer's right) |
| `pose.move_ms` | integer, 0-5000 | `400` | Time to move into the pose (and out of it on `"rest"`) |
| `pose.hold_ms`, `gaze.hold_ms` | integer or `null` | `null` | How long it holds, then releases (`null`: until replaced or released) |
| `prop.hold` | `"map"` or `null` | unchanged | Picks the map up (it slides into view) or puts it away |
| `prop.raise` | number, 0-1 | unchanged | 0 is lowered (top edge at the chin), 1 is raised (the eyes peek over it). Without a held prop it does nothing |
| `prop.move_ms` | integer, 0-5000 | `450` raising, `550` lowering, `600` picking up | Time to get there |
| `breath.in_ms` | integer, 100-5000 | required | Time to the top of the breath |
| `breath.depth` | number, 0.005-0.06 | `0.022` | Size change at the top, as a fraction (a resting breath is 0.012) |
| `breath.hold_ms` | integer or `null` | `null` | Held at the top (`null`: until the reply's audio starts, at most 2.5 s) |
| `breath.out_ms` | integer, 100-8000 | `2500` | Time to breathe out |
| `blink.ms` | integer, 80-1000 | `160` | One close-and-open |

#### 3.3.1 Gaze

| Form | Meaning |
|---|---|
| `{"on": "user", "offset"?: [dx, dy]}` | At the user, or offset from them (looking away) |
| `{"on": "screen", "at": [x, y]}` | A fixed direction |
| `{"on": "map", "at": [x, y]}` | A spot on the held map, in map coordinates (§8.2) |
| `{"on": ..., "scan": {"around": [x, y], "radius": r, "fix_ms"?: [min, max]}}` | Short fixations at random points in that circle, in the frame's units, until `hold_ms` runs out or something replaces it. `fix_ms` defaults to `[250, 450]` |
| `{"on": ..., "trace": [[x, y], ...], "speed"?: s}` | Follows the path (2-64 points) at `s` frame units per second (default 0.5 on the map, 1 elsewhere), ending on its last point, then holds there for `hold_ms` |
| `"release"` | Back to the automatic look (the user while listening, etc.) |

`head` (0-1, any form) is the share of the eye shift the head turns along with the eyes:
0.3 on the map by default, 0 elsewhere. `at`, `offset`, `scan`, and `trace` are mutually
exclusive.

### 3.4 Natural lengths (when `ms` is left out)

A step lasts as long as its longest action takes to do its part. A hold with no end
doesn't count; only its move-in time does.

| Action | Natural length |
|---|---|
| `face`, held `animation` | `in_ms` + `hold_ms` |
| `move` | The movement's length (§9.2) ÷ `speed` |
| Timed `animation` | Its length (§9.3) |
| `pose` | `move_ms` + `hold_ms` |
| `gaze` look | ~200 ms (the eyes getting there) + `hold_ms` |
| `gaze` scan | `hold_ms` (0 when open-ended) |
| `gaze` trace | The path's length ÷ `speed` + `hold_ms` |
| `prop` | `move_ms` |
| `breath` | `in_ms` + `hold_ms` |
| `blink` | `ms` |
| `state`, `reset`, `"rest"`, `"release"` | 0 |

<!-- -------------------------------------------------------------------------------- -->
<!-- Timing                                                                           -->
<!-- -------------------------------------------------------------------------------- -->
## 4. Reply moments and early steps

### 4.1 Which reply

All of a plan's reply moments belong to **one reply** (a step's `response_id` pins its own
instead), so a plan that waits for a reply's start, a sentence, and its end means the same
reply throughout. The plan's first reply moment picks it:

| First reply moment | The plan's reply |
|---|---|
| `reply_text` | The next reply whose `llm_response` arrives after the plan |
| `reply_audio` | The next reply whose audio starts after the plan arrived (so a plan sent just after a reply's text still belongs to that reply) |
| `reply_end`, `{"sentence": n}` | The reply playing when the plan arrived, if there was one; otherwise the next |

A step whose moment has already passed by the time it comes up runs right away and reports
how late it was (`late_ms`, §6).

### 4.2 How early the client knows

The client learns when audio will be heard only when it schedules it:

| Moment | Known this far ahead |
|---|---|
| `reply_audio` | About 200 ms (the player schedules the first chunk `bufferAhead` ahead), plus the speakers' output latency |
| `reply_end` | From when the reply's last chunk is scheduled: usually seconds ahead, since speech is synthesized faster than it plays |
| `{"sentence": n}` | From when that sentence's first chunk is scheduled: usually well ahead after the first sentence |

A negative `wait_ms` that asks for more lead than the client has runs the moment the client
learns the time, and reports `late_ms`. **`hold_audio_ms` trades latency for lead:** the client
delays the reply's first audio (and so the whole reply) by just enough to give the step its
full lead, up to that cap. When several waiting steps ask, the reply waits for the largest
need within each step's own cap. It defaults to 0, so a reply is never delayed unless a step
asks.

A step waiting for a sentence that never comes (the reply ends first, or its chunks carry no
sentence numbers) is dropped and reported (`dropped`, §6).

<!-- -------------------------------------------------------------------------------- -->
<!-- Cancelling                                                                       -->
<!-- -------------------------------------------------------------------------------- -->
## 5. Cancelling

1. **A newer plan drops every older plan's waiting steps.** Those plans end as `cancelled`.
   A plan with no steps does only this. A `robot_action` counts as a newer plan too.
2. **What already started keeps playing** until it ends or a newer step takes the same part
   of the face. A new face, movement, pose, gaze, prop, or breath always replaces the one
   there, easing from wherever it is.
3. **Holds stay** (a held face, a gaze spot, a pose, the raised map) until their `hold_ms`
   runs out or something replaces them. Clear them with `"rest"`, `"release"`, or `reset`.
4. **`cancel_audio` doesn't touch plans.** When the backend cancels a reply it sends a fresh
   plan for what the avatar should do now; `expire_ms` is only a safety net.

Because a new plan drops older waiting steps, put everything that should still happen into
the new plan.

<!-- -------------------------------------------------------------------------------- -->
<!-- Feedback                                                                         -->
<!-- -------------------------------------------------------------------------------- -->
## 6. `avatar_feedback` -- what happened

```json
{"type": "avatar_feedback", "data": {"id": "t14-found", "turn": 14, "event": "started"}}
{"type": "avatar_feedback", "data": {"id": "t18-breath", "event": "step", "step": 0, "late_ms": 0, "reply_ms": -600}}
{"type": "avatar_feedback", "data": {"id": "t14-found", "turn": 14, "event": "ended", "how": "finished"}}
{"type": "avatar_feedback", "data": {"id": "bad-1", "event": "rejected", "reason": "steps[1].face.name: unknown expression \"Furowed Brow\""}}
```

| `event` | Sent when `feedback` is | Meaning and extra fields |
|---|---|---|
| `rejected` | always | The plan (or a setup, with `"id": null`) never ran. `reason` says why |
| `started` | `"end"`, `"steps"` | Its first step started |
| `step` | `"steps"` | A step started. `step` is its index (0-based); `late_ms` is how much later than asked; `reply_ms` is when it started relative to its reply's first audio (negative is before), for steps timed to a reply |
| `dropped` | `"end"`, `"steps"` | A step that will never run. `step`, and `reason`: `"expired"` or `"no such sentence"` |
| `ended` | `"end"`, `"steps"` | The plan is over. `how`: `"finished"` (its last step's length has passed) or `"cancelled"` |

`turn` is echoed when the plan had one. Like `tts_playback`, feedback carries **no
timestamps**: the backend stamps each event when it arrives, so everything shares one
clock. The durations (`late_ms`, `reply_ms`) are measured on the client. Never block a
decision on feedback; a client may be slow to send it, and an old client never will.

<!-- -------------------------------------------------------------------------------- -->
<!-- Checks                                                                           -->
<!-- -------------------------------------------------------------------------------- -->
## 7. Checks and limits

A plan runs completely or not at all. The client checks the whole plan before running any
of it, and rejects it (always sending `rejected` with the reason) for:

* an unknown key, or a missing required one
* a wrong type, or a value outside its range
* a name not in the avatar's catalog (§9)
* a negative `wait_ms` on `previous` or `reply_text`
* `hold_audio_ms` anywhere but on `reply_audio` with a negative wait
* `response_id` on a step with no reply moment
* `animation` with `face` or `move` in one step, or `strength`/`hold_ms` on a timed Animation
* more than one of `at`, `offset`, `scan`, `trace` in one gaze
* an avatar that can't run plans (the QT and Buddy models)

| Limit | Value |
|---|---|
| Steps per plan | 64 |
| Points in a trace | 64 |
| `id` length | 128 characters |
| Any duration | 60 s (`hold_audio_ms`: 1 s; transition times: 5 s) |

An `avatar_setup` with an unknown key, a bad type, or an unknown `rest` name is rejected the
same way, and the previous setup stays.

<!-- -------------------------------------------------------------------------------- -->
<!-- Coordinates                                                                      -->
<!-- -------------------------------------------------------------------------------- -->
## 8. Coordinates

### 8.1 Gaze and head

Gaze and head turns run from -1 to 1 on each axis. **Left and right are always the
viewer's**, and **positive y is down**. The user sits at `(0, 0)`: `{"on": "user"}` looks
straight out, and its `offset` is measured from there. `pose.tilt` is in degrees, positive
leaning to the viewer's right. The eyes' reach is the full -1-1 range; offsets and points
past it stop at the edge.

### 8.2 The map

The avatar holds its map facing itself, so we see its back. Map coordinates run from 0 to 1
across and down **the map as the avatar reads it, from its top-left corner**. Its left is the
viewer's right, so `[0, 0]` (its top-left) sends the eyes up and to the viewer's right. The
eyes follow the map's current raise: a spot on the lowered map is a lower look than the same
spot on the raised map. Raised, the eyes stay just above the map's top edge even at their
lowest look.

<!-- -------------------------------------------------------------------------------- -->
<!-- Catalog                                                                          -->
<!-- -------------------------------------------------------------------------------- -->
## 9. The Smiley's catalog

The names a plan can use with the Smiley (both `smiley` and `smiley-brows`, which always
shows its eyebrows). The code is the source (`smiley/actions/`); this list is updated with
it. Names match ignoring case.

### 9.1 Expressions (`face`, `avatar_setup.rest`)

| Family | Names |
|---|---|
| Calm | Slightly Smiling Face, Neutral Face |
| Happy | Grinning Face, Grinning Face with Big Eyes, Grinning Face with Smiling Eyes, Beaming Face with Smiling Eyes, Smiling Face, Smiling Face with Smiling Eyes, Face with Hand Over Mouth |
| Love | Smiling Face with Hearts, Smiling Face with Heart-Eyes |
| Sad | Crying Face, Pensive Face, Frowning Face |
| Grumpy | Unamused Face, Face with Rolling Eyes |
| Scared | Anguished Face, Fearful Face, Grimacing Face |
| Sick | Face with Spiral Eyes, Sick Face with Spiral Eyes, Cold Face |
| Surprised | Face with Open Mouth, Astonished Face, Face with Open Eyes and Hand Over Mouth, Wide-Eyed |
| Thinking and focusing | Face with Raised Eyebrow, Furrowed Brow, Squinting Face |
| Tired | Sleeping Face |
| Angry | Angry Face, Red Angry Face |

While the map is held, the face's own hands (Face with Hand Over Mouth, Face with Open Eyes
and Hand Over Mouth) fade out.

### 9.2 Movements (`move`)

| Name | Length | What it does |
|---|---|---|
| Nod | 900 ms | Head dips down and back up twice |
| Shake No | 1,100 ms | Head turns side to side twice, eyes following |
| Look Left | 1,800 ms | Turns and looks to the viewer's left, holds, comes back |
| Look Right | 1,800 ms | The same to the viewer's right |
| Look Around | 3,200 ms | Left, then right, then back to the middle |
| Sway | 1,800 ms | Whole face rocks side to side |
| Bounce | 900 ms | Hops up twice |
| Head Tilt | 1,600 ms | Leans to one side, holds, comes back |

### 9.3 Animations (`animation`)

| Name | Kind | Length | What it does |
|---|---|---|---|
| Ponder | held | like a face | Hand on the chin, eyes up and aside, drifting while held |
| Yawn | timed | 4,400 ms | Eyes closed, mouth wide, hand over the mouth, with a deep breath |
| Glance Up Right | timed | 2,400 ms | Leans left while the eyes and head turn up and to the viewer's right |
| Glance Up Left | timed | 2,400 ms | The mirror image |

### 9.4 Props and gaze frames

| What | Values |
|---|---|
| `prop.hold` | `"map"` |
| `gaze.on` | `"user"`, `"screen"`, `"map"` |

<!-- -------------------------------------------------------------------------------- -->
<!-- Backend                                                                          -->
<!-- -------------------------------------------------------------------------------- -->
## 10. What the backend needs

* **Pick the pathway by chat type.** A plan-driven chat sends `avatar_setup` when the client
  connects, then drives the avatar only with plans (no `robot_action` moods).
* **One send function** for every avatar frame, on the client's own socket, that checks the
  turn revision at send time, so nothing made for a cancelled turn goes out.
* **`audio_chunk` gets an optional `sentence`** (1-based) on every chunk, to turn on sentence
  moments.
* **Handle `avatar_feedback`:** log it (or store it with the session as research data).
  `rejected` always means a bug or a name out of sync.

Planned changes to `CLIENT_PROTOCOL.md`: the three frames above, and the optional
`audio_chunk.sentence` field.

<!-- -------------------------------------------------------------------------------- -->
<!-- Examples                                                                         -->
<!-- -------------------------------------------------------------------------------- -->
## 11. Examples

**Start of a Map Task chat:** settings, then pick up the map.

```json
{"type": "avatar_setup", "data": {"rest": "Slightly Smiling Face", "auto": {"idle_glances": true, "thinking_look": false, "speech_gaze": false, "listening_motions": false}}}
{"type": "avatar_plan",  "data": {"id": "start", "steps": [{"prop": {"hold": "map"}, "state": "listening"}]}}
```

**A Z across the raised map.**

```json
{"type": "avatar_plan", "data": {"id": "z", "steps": [
  {"prop": {"raise": 1}},
  {"gaze": {"on": "map", "at": [0.1, 0.1]}, "ms": 300},
  {"gaze": {"on": "map", "at": [0.9, 0.1]}, "ms": 300},
  {"gaze": {"on": "map", "at": [0.1, 0.9]}, "ms": 300},
  {"gaze": {"on": "map", "at": [0.9, 0.9], "hold_ms": 500}}
]}}
```

**"Do you have a bridge?"** While thinking: raise the map and search with a slight furrow.
When the answer is ready: lock on, widen, and lower the map into the reply.

```json
{"type": "avatar_plan", "data": {"id": "t14-search", "turn": 14, "steps": [
  {"state": "thinking", "prop": {"raise": 1}, "face": {"name": "Furrowed Brow", "strength": 0.5},
   "gaze": {"on": "map", "scan": {"around": [0.5, 0.5], "radius": 0.45}}}
]}}
{"type": "avatar_plan", "data": {"id": "t14-found", "turn": 14, "feedback": "end", "steps": [
  {"gaze": {"on": "map", "at": [0.12, 0.08]}, "ms": 350},
  {"face": {"name": "Wide-Eyed", "strength": 0.7, "hold_ms": 500}},
  {"start_on": "reply_audio", "wait_ms": 300, "prop": {"raise": 0}, "gaze": {"on": "user", "hold_ms": 1500}}
]}}
```

**"Go right until you see the bus."** Trace from its spot to where it ends up, then lower the
map 0.2 s into the reply (if the reply starts sooner, the lowering follows the trace and
reports how late it was).

```json
{"type": "avatar_plan", "data": {"id": "t15-move", "turn": 15, "steps": [
  {"gaze": {"on": "map", "trace": [[0.40, 0.60], [0.55, 0.60], [0.70, 0.55]], "speed": 0.4, "hold_ms": 400}},
  {"start_on": "reply_audio", "wait_ms": 200, "prop": {"raise": 0}, "gaze": {"on": "user", "hold_ms": 1500}}
]}}
```

**Not on its map:** a quicker, wider search, a small head shake, and down with the reply.

```json
{"type": "avatar_plan", "data": {"id": "t16-none", "turn": 16, "steps": [
  {"gaze": {"on": "map", "scan": {"around": [0.5, 0.5], "radius": 0.5, "fix_ms": [200, 300]}, "hold_ms": 900}},
  {"move": {"name": "Shake No", "strength": 0.6}},
  {"start_on": "reply_audio", "prop": {"raise": 0}, "gaze": "release"}
]}}
```

**The user starts talking again mid-search:** back to listening at once.

```json
{"type": "avatar_plan", "data": {"id": "t17-barge", "turn": 17, "steps": [
  {"reset": true, "prop": {"raise": 0}, "state": "listening"}
]}}
```

**A breath 0.6 s before the voice**, allowing the reply's audio to wait up to 0.4 s for it.

```json
{"type": "avatar_plan", "data": {"id": "t18-breath", "steps": [
  {"start_on": "reply_audio", "wait_ms": -600, "hold_audio_ms": 400, "breath": {"in_ms": 550, "hold_ms": null}}
]}}
```

**Talking:** look away early in the reply, glance at the map as sentence 2 starts, and look
back at the user 0.4 s before the end (a turn-yielding cue).

```json
{"type": "avatar_plan", "data": {"id": "t19-talk", "steps": [
  {"start_on": "reply_audio", "wait_ms": 400, "gaze": {"on": "user", "offset": [0.5, -0.4], "hold_ms": 900}, "ms": 0},
  {"start_on": {"sentence": 2}, "gaze": {"on": "map", "at": [0.8, 0.3], "hold_ms": 700}, "ms": 0},
  {"start_on": "reply_end", "wait_ms": -400, "gaze": {"on": "user", "hold_ms": 1500}}
]}}
```

<!-- -------------------------------------------------------------------------------- -->
<!-- Gotchas                                                                          -->
<!-- -------------------------------------------------------------------------------- -->
## 12. Gotchas

1. **A new plan drops older waiting steps.** Anything still wanted goes into the new plan.
   This includes a `robot_action` sent to the same client.
2. **Steps run in order.** A step can't start before the one above it has lasted its `ms`;
   give a step a short `ms` (even 0) to let later steps go while its actions keep playing.
3. **Holds outlive their plan.** A held face, gaze, or pose stays until replaced, released,
   or reset.
4. **The client owns `speaking`.** Send `listening`/`thinking`/`idle`; the client shows
   `speaking` while the reply's audio plays, then returns to the last state you sent.
5. **About 200 ms is all the lead `reply_audio` has** unless a step sets `hold_audio_ms`,
   which delays the reply.
6. **Map coordinates are the avatar's own.** Its top-left looks up and to the viewer's right.
7. **One bad field rejects the whole plan,** and `rejected` comes back even with `feedback`
   off. Watch for it while developing.
8. **Waiting steps expire after `expire_ms` (15 s by default).** Raise it for a plan that waits
   on the end of a long reply.
