# Primary Chat Client Protocol

This document is the **client-facing** contract for the primary chat WebSocket (`ws/chat/`).
It describes exactly what a "frontend" (the web app, the Buddy robot, the QT robot, or any
future interface) must send and what it will receive back, in the JSON shapes the backend
actually produces today.

The companion `README.md` in this directory explains the *internal* backend architecture.
This file covers the primary-client wire format and the command/acknowledgement contract shared
with the admin listener. Listener-only initialization, history, biomarker, and ping/pong frames
are intentionally outside its scope. If the documentation and implementation ever disagree,
the implementation is authoritative.

> **Scope note for the Buddy robot:** Buddy is a *text-only* client right now. It sends
> `transcription` messages and receives `llm_response` + `robot_action` messages. The audio
> sections (`audio_data`, `audio_chunk`, `tts_playback`) are documented for completeness but
> Buddy does not need them.

<!-- -------------------------------------------------------------------------------- -->
<!-- Connecting                                                                       -->
<!-- -------------------------------------------------------------------------------- -->
## 1. Connecting

### Step 1: Get a JWT

Authentication is JWT (SimpleJWT), obtained through the HTTPS API before opening the socket.
Unencrypted HTTP is suitable only for local development.

```text
POST https://<host>/api/token/
Content-Type: application/json

{"username": "<username>", "password": "<password>"}
```

Response:

```json
{
  "access" : "<JWT access token>",
  "refresh": "<JWT refresh token>",
  "user"   : {"id": 7, "username": "buddy_user", "first_name": "", "last_name": "", "is_staff": false}
}
```

Token lifetimes (`backend/settings.py`, `SIMPLE_JWT`):

| Token | Lifetime | Notes |
|---|---|---|
| `access`  | 5 days  | This is the one sent on the WebSocket URL |
| `refresh` | 30 days | `POST /api/token/refresh/` with `{"refresh": "..."}`; refresh tokens rotate |

Because the access token lasts 5 days, a robot that is powered on for a long time should
store the refresh token and re-mint an access token before opening each new chat, rather
than caching one access token forever.

### Step 2: Open the WebSocket

```text
wss://<host>/ws/chat/?token=<access token>&source=buddyrobot
```

Use `ws://localhost:...` only during local development. Production clients must use `wss://`.
Because the access token is carried in the query string, reverse proxies and application logs
must redact the `token` parameter. Non-browser robot clients should avoid logging the full URL.

Both query parameters are parsed by `chat_app/services/middleware.py`. The trailing slash
on `ws/chat/` is required by the route regex in `websocket/routing.py`.

`source` **must** be one of these exact (lowercased) values -- anything else is coerced to
`"unknown"` and the connection is rejected:

```text
webapp | mobile | qtrobot | buddyrobot
```

### Step 3: Behavior selected by `source`

The `source` string is the single switch that decides how the backend treats your client
(`consumers.py`, in `connect()`):

| `source` | `use_backend_STT` | `use_backend_TTS` | starting `response_mode` |
|---|---|---|---|
| `webapp`     | true  | true  | `automatic` |
| `mobile`     | false | false | `automatic` |
| `qtrobot`    | false | false | `manual`    |
| `buddyrobot` | false | false | `automatic` |

What each setting means for you:

- **`use_backend_STT`** -- when true the backend echoes finalized user speech back to you as
  a `user_utt` message so the UI can display it. Buddy will **not** receive `user_utt`.
- **`use_backend_TTS`** -- when true the backend synthesizes speech and streams `audio_chunk`
  messages. Buddy will **not** receive `audio_chunk`; it must speak the text from
  `llm_response` with its own on-board TTS.
- **`response_mode`** -- in `automatic`, every `transcription` you send triggers an assistant
  response on its own. Buddy starts `automatic`, so Buddy does **not** need to send
  `reply_now`. (QT is the odd one out: it starts `manual` and must explicitly ask for a
  reply.) This is only the *starting* value -- either side can change it later with
  `set_response_mode`.

### Close codes

| Code | Meaning |
|---|---|
| `1000` | Normal close (you sent `end_chat`, or the chat ended by intent) |
| `4001` | Not authenticated -- token missing, expired, or invalid |
| `4002` | Unrecognized `source` query parameter |
| `4004` | This primary connection was replaced by a newer connection for the same user |

`4003` / `4404` only apply to the admin listener endpoint, not to the primary chat socket.

<!-- -------------------------------------------------------------------------------- -->
<!-- Messages you send                                                                -->
<!-- -------------------------------------------------------------------------------- -->
## 2. Messages the client SENDS (client -> backend)

Every message is a JSON object with a top-level `"type"`. Routing lives in
`handlers/ws_events.py:47-55`. Unknown types are logged and ignored -- no error is returned.

| `type` | Buddy uses it? | Purpose |
|---|---|---|
| `transcription`     | **Yes** | Send finalized user text |
| `command`           | **Yes** | Run a control command (`robot_action`, `repeat_last`, ...) |
| `end_chat`          | **Yes** | Ask the backend to close the session |
| `tts_playback`      | Optional | Report when your TTS actually started/finished |
| `audio_data`        | No      | Stream raw PCM for backend STT |
| `overlapped_speech` | No      | Notify that the user talked over the assistant |

### 2.1 `transcription` -- the main one

This is how a client with its own ASR hands the user's words to the backend.

```json
{
  "type": "transcription",
  "data": "I went to the garden this morning.",
  "time": 1757433512.481
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `data` | string | **yes** | The finalized utterance. Must be non-empty after trimming, and <= 20,000 characters, or the whole message is silently dropped (`ws_events.py:71-73`). |
| `time` | number | no | Unix epoch **seconds** as a float. If missing or non-numeric the backend substitutes its own `time.time()`. |

Notes:

- `data` is a **plain string**, not an object. This is a common mistake -- `audio_data` and
  `command` both put an object under `data`, but `transcription` does not.
- Send only *finalized* text. There is no interim/partial transcription message type for
  direct-text clients; every `transcription` you send is treated as a complete utterance.
- Consecutive utterances **accumulate**. If you send two `transcription` messages in quick
  succession, the in-flight response for the first is cancelled and both are combined into
  one user turn. This is intentional -- it lets a user pause mid-thought and continue.
- Because Buddy starts in `response_mode: "automatic"`, sending this automatically starts a
  response. You do not need to follow it with `reply_now`.

### 2.2 `command` -- control envelope

All commands share one envelope. The inner `data` object is the command itself
(`ws_events.py:83-91` -> `processing/commands.py:155`).

```json
{
  "type": "command",
  "data": {
    "id"  : "optional-correlation-id",
    "name": "repeat_last",
    "data": null
  }
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `data.id`   | string | no  | Your non-empty correlation ID, at most 128 characters. Echoed in the ack. If omitted, the backend generates a UUID4. A malformed ID rejects the command and the rejection receives a new server-generated ID. **Send a valid ID if you want to match acks to requests.** |
| `data.name` | string | **yes** | One of the canonical names in section 2.3. |
| `data.data` | object | depends | Per-command body. See below. |

Every command -- valid, invalid, or unknown -- produces exactly one `command_ack` back on
the same socket. See section 3.6.

### 2.3 Command vocabulary

The full table is `COMMAND_HANDLERS` in `processing/commands.py`. All ten names are accepted
from a primary client (the robot), not just from the admin page.

| `name` | `data` body | Effect |
|---|---|---|
| `robot_action` | `{"kind": "emotion"\|"animation", "value": "Happy", "duration_ms": 3000}` | Round-trips an avatar action back out as a `robot_action` message. `duration_ms` is optional. See the caveat below. |
| `repeat_last` | *(none)* | Re-speaks the last assistant response. Rejected with `ok: false` if there is no prior response. |
| `send_custom` | `{"message": "text to say"}` | Speaks supplied text as the assistant. Rejected if `message` is missing/blank. |
| `reply_now` | *(none)* | Forces a response from whatever has been heard so far. Buddy does not need this (auto-reply is on). |
| `set_listening` | `{"state": "active"\|"paused"}` | Starts or stops the backend STT stream. Only meaningful for audio clients. |
| `set_response_mode` | `{"mode": "automatic"\|"manual"}` | Turns automatic replies on or off. |
| `pause_and_listen` | *(none)* | Shortcut: enters manual mode **and** cancels any response in progress. |
| `resume_and_respond` | *(none)* | Shortcut: restores automatic mode **and** immediately replies. |
| `set_recording` | `{"enabled": true}` | Sets whether the session audio recording is kept at the end of the chat. |
| `get_control_state` | *(none)* | No-op that just returns current state in the ack. Useful as a "where am I?" probe after reconnecting. |

**Every state-setting command requires an explicit value.** There is no "omit the body to
toggle" behavior -- a missing, malformed, or out-of-vocabulary body is rejected with
`ok: false` and a message naming the values it accepts. If you want to toggle, read the
current value from `state` (section 3.6) and send the opposite:

```json
{"type": "command", "data": {"id": "c-12", "name": "set_response_mode", "data": {"mode": "manual"}}}
```

> **`robot_action` caveat:** sending this command does not make the robot do anything by
> itself. It validates the body, then relays a `robot_action` message back out to the
> primary client -- i.e. back to you. It is really an admin-page affordance (the admin
> clicks a button, the listener relays it through the control group, the robot receives it).
> A robot generally has no reason to send this to itself.

### 2.4 `end_chat`

```json
{"type": "end_chat"}
```

Closes the socket with code `1000` and runs the full session teardown (flush staged text,
finalize/discard the recording, close the `ChatSession` row, run post-chat analysis). There
is no body and no response -- the socket simply closes. Simply dropping the TCP connection
also works and runs the same teardown, but sending `end_chat` is cleaner.

### 2.5 `tts_playback` (optional)

If your client speaks the response with its own TTS, you can report the real playback
boundaries so the assistant message gets accurate `start_ts` / `end_ts` in the database.

```json
{"type": "tts_playback", "data": {"responseId": 123, "state": "started"}}
{"type": "tts_playback", "data": {"responseId": 123, "state": "finished"}}
```

| Field | Type | Notes |
|---|---|---|
| `responseId` | integer | Must be the exact integer from the `llm_response` message. Booleans are explicitly rejected; strings are rejected. |
| `state` | string | Only `"started"` or `"finished"`. |

Do **not** send a timestamp -- all timing is stamped on the backend so everything shares one
clock. Skipping these messages entirely is fine and fully supported; it just means the
assistant messages have no audible-interval timing.

This is worth wiring up on Buddy eventually, since it is the only way the backend learns how
long the robot actually spent speaking.

### 2.6 `audio_data` and `overlapped_speech` (not used by Buddy)

`audio_data` carries one small base64 PCM chunk for backend STT. The format is strictly
validated in `processing/audio.py:68-106` and rejected outright on mismatch: 16,000 Hz, 1
channel, 16 bits per sample, `"pcm_s16le"`, and at most 1,400,000 base64 characters per
chunk.

```json
{
  "type"         : "audio_data",
  "data"         : "<base64 PCM>",
  "sampleRate"   : 16000,
  "channels"     : 1,
  "bitsPerSample": 16,
  "encoding"     : "pcm_s16le"
}
```

The four format fields default to the expected values if omitted, so a client that only
sends `data` still works -- but only if it really is 16 kHz mono s16le.

`overlapped_speech` (`{"type": "overlapped_speech"}`) just increments a counter and is not
currently used for anything.

<!-- -------------------------------------------------------------------------------- -->
<!-- Messages you receive                                                             -->
<!-- -------------------------------------------------------------------------------- -->
## 3. Messages the client RECEIVES (backend -> client)

| `type` | Buddy receives it? | Meaning |
|---|---|---|
| `robot_action`     | **Yes** | Emotion / animation to perform |
| `message`          | **Yes** | Echo of every committed message (user and assistant) |
| `llm_response`     | **Yes** | The assistant's spoken text + its `responseId` |
| `command_ack`      | **Yes** | Result of a command, plus full control state |
| `stream_status`    | **Yes** | STT stream went `"active"` / `"paused"` |
| `recording_status` | **Yes** | Recording toggle changed |
| `chat_ended`       | **Yes** | Sent right before the backend closes the socket |
| `user_utt`         | No (webapp only) | Backend STT transcript of the user |
| `audio_chunk`      | No (webapp only) | Streamed TTS audio |
| `cancel_audio`     | No (webapp only) | Discard buffered TTS audio |

### 3.1 `robot_action` -- emotions and animations

`utils/groups.py`. There is exactly **one** shape, whether the action came from the LLM's own
mood or from an admin pressing a button:

```json
{
  "type": "robot_action",
  "data": {"kind": "emotion", "value": "Happy", "duration_ms": 3000}
}
```

| Field | Type | Notes |
|---|---|---|
| `kind` | string | `"emotion"` or `"animation"` -- always one of these two |
| `value` | string | The action label, trimmed at both ends but never re-cased |
| `duration_ms` | integer | Hint only; defaults to `3000`. Ignore it if your robot's behaviors have their own natural length |

**The difference between the two kinds is who owns the vocabulary:**

- **`emotion`** -- the label comes from the backend's vocabulary (below). **You map it onto
  whatever your robot can do.** This is the only kind the LLM sends automatically.
- **`animation`** -- the label is one of *your own* behavior names, sent by an admin who is
  driving your robot directly. Play it as-is.

**Emotion values.** The LLM is constrained to exactly this set
(`services/llm/live_chat/cognibot_api.py`, `ResponseMood`):

```text
Neutral | Grumpy | Happy | Love | Sad | Scared | Sick | Surprised | Thinking | Tired
```

An admin can send emotion labels **outside** this list if their control panel is configured
for your robot specifically -- e.g. Buddy has a good `Angry` face that we deliberately do not
let the LLM trigger on its own. So treat the list above as what arrives *automatically*, not
as an exhaustive set.

**Mapping is your responsibility.** The backend sends every interface the same vocabulary and
does not know what your robot can do. If you receive `Sick` and have no sick face, pick
something reasonable. **Never crash or go silent on an unrecognized value** -- fall back to a
neutral idle. Matching case-insensitively is a good idea.

To have the admin panel show buttons for your robot's real capabilities, see
`frontend/src/pages/admin/FRONTEND_CAPABILITIES.md`.

### 3.2 `message` -- committed message echo

The primary client is a member of its own session's broadcast room, so it receives an echo
of every message committed to the database -- both the user's and the assistant's
(`consumers.py` `_broadcast_room` -> `ch_events.forward_payload_to_client`). The admin
listener receives this identical frame.

```json
{"type": "message", "data": {"role": "user",      "content": "I went to the garden.", "ts": 1757433512.481}}
{"type": "message", "data": {"role": "assistant", "content": "That sounds lovely!",   "ts": 1757433514.902}}
```

| Field | Type | Notes |
|---|---|---|
| `role` | string | `"user"` or `"assistant"` |
| `content` | string | The persisted text |
| `ts`   | number | Unix epoch seconds (float) |

This is a **transcript feed**, useful if your client wants to display the conversation on a
screen. It is entirely optional to handle -- the webapp ignores it completely.

> **Important:** the assistant's response arrives **twice** -- once here as
> `message`/`role: "assistant"` and once as `llm_response`. **Speak on `llm_response`** and
> treat `message` as transcript/display only, or the robot will say everything twice. This
> is the single easiest mistake to make when writing a new client.

### 3.3 `llm_response` -- speak this

```json
{
  "type"      : "llm_response",
  "data"      : "That sounds lovely! What did you plant?",
  "time"      : 1757433514.902,
  "responseId": 4471
}
```

| Field | Type | Notes |
|---|---|---|
| `data` | string | The text to speak. A **plain string**, same as outbound `transcription`. |
| `time` | number | Backend timestamp, epoch seconds |
| `responseId` | integer | Database ID of the assistant `ChatMessage`. Quote this back in `tts_playback`. |

This message is only sent after the exchange is durably written to the database, so a
`responseId` you receive here is always valid.

### 3.4 Ordering of a single turn

For one user utterance, a Buddy-style client sees this sequence:

```text
1. robot_action    -> {"kind": "emotion", "value": "Happy", ...}   (mood, arrives FIRST)
2. message         -> {"role": "user",      "content": "..."}
3. message         -> {"role": "assistant", "content": "..."}
4. llm_response    -> {"data": "...", "responseId": 4471}
```

The mood arrives *before* the text because it is published as soon as the LLM returns,
while the text waits on the database commit. That ordering is deliberate: start the facial
expression / animation immediately, then speak when `llm_response` lands. The gap is small
but real.

Note that this ordering is not contractual in the sense of being enforced anywhere -- if a
future change reorders the commit, a robot that *requires* the mood first would break. Key
off `responseId` where you can, and treat `robot_action` as fire-and-forget.

### 3.5 `stream_status` and `recording_status`

```json
{"type": "stream_status", "data": {"status": "paused"}}
```

`status` is `"active"` or `"paused"`. Both the primary socket and the admin listener socket
receive this identical frame, so parsing code can be shared between a robot client and an
admin client.

`stream_status` only concerns backend STT, so it is informational for Buddy. It does fire
when the user says something like "let's take a break", which trips the pause intent -- so
it is a reasonable cue for an idle/sleeping animation.

```json
{"type": "recording_status", "data": {"enabled": true}}
```

Sent whenever a `set_recording` command is accepted, from either transport -- so the
robot will see this when an admin flips the toggle on the monitoring page.

### 3.6 `command_ack`

Every command you send produces exactly one of these, on the same socket
(`ws_events.py`). The ack body is built in `dispatch_command()`.

```json
{
  "type": "command_ack",
  "data": {
    "id"     : "c-12",
    "name"   : "repeat_last",
    "ok"     : true,
    "message": null,
    "state"  : {
      "listening"        : "active",
      "response_mode"    : "automatic",
      "recording_enabled": false
    }
  }
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | Your `id` if you sent one, otherwise a server-generated UUID4 |
| `name` | string or null | Echo of a string command name; `null` if the name was missing or not a string |
| `ok` | boolean | `false` for unknown names, rejected bodies, and handler exceptions alike |
| `message` | string or null | `null` on success; a human-readable reason on failure |
| `state` | object | The **complete** control state after the command, always present -- even on failure |

The `state` object is the authoritative source for control state, and it is the only place a
primary client can read it -- `control_state` broadcasts go to admin listeners only. Its three
fields:

| Field | Values | Meaning |
|---|---|---|
| `listening` | `"active"` \| `"paused"` | Whether backend STT is consuming audio. Always matches the most recent `stream_status`. |
| `response_mode` | `"automatic"` \| `"manual"` | Whether a finalized utterance triggers a reply on its own |
| `recording_enabled` | boolean | Whether the session recording will be kept at the end of the chat |

Since there is no toggle-on-omit, this is what you read before sending a state-setting command
if you want to flip something. Send `get_control_state` to resynchronize after a reconnect.

Five distinct failure modes all come back as `ok: false`, distinguishable by the
`message` text:

- Invalid correlation ID -> `"Command id must be a non-empty string no longer than 128 characters"`
- Missing/non-string name -> `"Command name must be a string"`
- Unknown command name -> `"Unknown command: <name>"`
- Rejected body (`CommandRejected`) -> e.g. `"'mode' must be one of: automatic, manual"`
- Handler raised -> `"Command failed: <ExceptionType>"`

Acks are **not** ordered relative to the work they describe. `reply_now` in particular acks
immediately while the actual response is still being coordinated in the background, so an
`ok: true` means "accepted", not "finished".

### 3.7 `chat_ended`

```json
{"type": "chat_ended"}
```

Sent when the *user* ended the chat conversationally -- they said something like "goodbye"
and then confirmed. The backend sends the goodbye line as a normal `llm_response` first,
then sends `chat_ended` and closes the socket with code `1000`.

The intent phrases live in `services/behavior/intent_detection.py`. The flow is a two-step
confirmation: the first trigger gets `"Okay, are you sure that's all for our chat?"`, and
only an affirmative reply produces the goodbye plus close.

A robot should let the goodbye finish speaking before tearing down its UI, and should not
treat the subsequent close as an error.

### 3.8 Web-app-only messages

Buddy will never receive these, but for future interfaces:

```json
{"type": "user_utt", "data": "text the backend heard", "time": 1757433512.481}
```

```json
{
  "type": "audio_chunk",
  "data": {
    "b64"          : "<base64 PCM>",
    "responseId"   : 4471,
    "sampleRate"   : 24000,
    "channels"     : 1,
    "bitsPerSample": 16,
    "sequence"     : 0,
    "last"         : false
  }
}
```

```json
{"type": "cancel_audio"}
```

`cancel_audio` means a TTS stream was interrupted mid-flight; the client should drop any
audio it has buffered but not yet played. Note that `audio_chunk` carries its PCM format on
every chunk -- do not assume it matches the 16 kHz used for *inbound* microphone audio, since
TTS is synthesized at a different rate.

<!-- -------------------------------------------------------------------------------- -->
<!-- Minimal client                                                                   -->
<!-- -------------------------------------------------------------------------------- -->
## 4. Minimal client outline

The complete set of behaviors a text-only robot client needs:

```text
# ---- setup ----------------------------------------------------------------
POST https://<host>/api/token/ with username + password -> access token
open wss://<host>/ws/chat/?token=<access>&source=buddyrobot

# ---- when the user finishes speaking --------------------------------------
send {"type": "transcription", "data": <asr text>, "time": <epoch seconds>}
     (no reply_now needed -- buddyrobot has auto-reply enabled)

# ---- on every inbound message ---------------------------------------------
switch on msg["type"]:

    "robot_action"     -> if msg.data.kind == "emotion":
                              map msg.data.value onto your own faces
                              (unknown value -> neutral idle, never a crash)
                          if msg.data.kind == "animation":
                              play msg.data.value directly -- it is your own name

    "llm_response"     -> speak msg.data with on-board TTS
                          remember msg.responseId
                          optionally: send tts_playback started / finished

    "message"          -> transcript/display only -- do NOT speak this

    "chat_ended"       -> finish speaking, then let the socket close

    "command_ack"      -> match msg.data.id to your request
                          read msg.data.state for the current control state

    "stream_status"    -> msg.data.status is "active" | "paused"
    "recording_status" -> msg.data.enabled is a bool

    anything else      -> ignore safely

# ---- shutdown -------------------------------------------------------------
send {"type": "end_chat"}   (or just close the socket)
```

<!-- -------------------------------------------------------------------------------- -->
<!-- Gotchas                                                                          -->
<!-- -------------------------------------------------------------------------------- -->
## 5. Gotchas checklist

Things most likely to trip up a new client:

1. **The assistant's text arrives twice** -- as `message` and as `llm_response`. Speak only
   on `llm_response`, or the robot says everything twice. (Section 3.2)
2. **`transcription.data` is a string, `command.data` is an object.** Easy to mix up.
3. **There is no toggle-on-omit.** Every state-setting command needs an explicit body; a
   missing or out-of-vocabulary value is rejected with `ok: false`. Read `state` from an ack
   and send the opposite value if you want to flip something. (Sections 2.3, 3.6)
4. **You map emotions, the backend does not.** An unrecognized `value` must fall back to a
   neutral idle rather than crashing or going silent. Admins can also send emotion labels
   outside the LLM's 10. (Section 3.1)
5. **Invalid messages are dropped silently.** A too-long, empty, or wrongly-typed
   `transcription` produces a backend log line and nothing else -- no error comes back over
   the socket. If the robot seems ignored, check the backend logs first. (Commands are the
   exception: those always ack.)
6. **`source` must be exactly `buddyrobot`.** Any other spelling closes the socket with
   `4002`.
7. **A user can have only one primary chat connection.** Once a new primary connection is
   fully initialized, the server closes any older one with code `4004`. The replaced client
   must stop recording/speaking and treat that close as a session takeover, not a network retry.
8. **Consecutive `transcription` messages merge into one turn** and cancel the in-flight
   response. That is by design, not a dropped reply.
9. **`control_state` never reaches a primary client.** It broadcasts to admin listeners only.
   Read control state from the `state` field of your own `command_ack`s. (Section 3.6)
10. **Only the primary chat socket is described here.** `ws/chat/activity/` uses this exact
    same protocol with a different response engine behind it, so a client written to this
    document works against both.

<!-- -------------------------------------------------------------------------------- -->
<!-- Source map                                                                       -->
<!-- -------------------------------------------------------------------------------- -->
## 6. Where each shape is defined

| What | File |
|---|---|
| Auth + `source` parsing, allowed sources | `chat_app/services/middleware.py` |
| JWT endpoints and lifetimes | `chat_app/api/router.py`, `backend/settings.py` |
| WebSocket routes | `chat_app/websocket/routing.py` |
| Connect/disconnect, source config, mood send | `websocket/consumers/consumers.py` |
| Inbound type routing, `transcription`, command envelope | `consumers/handlers/ws_events.py` |
| Listener-originated commands and acks | `consumers/handlers/ch_events.py` |
| Command vocabulary, ack body, control state | `consumers/processing/commands.py` |
| `robot_action` payload construction | `consumers/utils/groups.py` |
| `message` broadcast shape | `consumers/processing/messages.py` |
| `llm_response`, `cancel_audio`, `chat_ended`, `user_utt` | `websocket/services/chatHelpers.py` |
| `stream_status` | `consumers/processing/stream.py` |
| `tts_playback` validation | `consumers/processing/playback.py` |
| `audio_data` validation | `consumers/processing/audio.py` |
| `audio_chunk` | `websocket/services/speech/tts/tts_streaming.py` |
| Mood vocabulary (`ResponseMood`) | `chat_app/services/llm/live_chat/cognibot_api.py` |
| End/pause intent phrases | `websocket/services/behavior/intent_detection.py` |
| Admin action buttons per frontend | `frontend/src/pages/admin/FRONTEND_CAPABILITIES.md` |
