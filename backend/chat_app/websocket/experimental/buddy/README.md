# Speech System // Buddy Media (Experimental) <br> `backend/chat_app/websocket/experimental/buddy/..`

Backend support for Buddy's media experiments (the Android contract dated October 31,
2026). There are two parts:

1. **Input mode on the primary chat socket.** Buddy can switch between its own SDK speech
   recognizer (`sdk`) and streaming its microphone to our Google STT (`backend`).
2. **A second "media" socket.** It carries Buddy's camera images and sensor telemetry to
   a new admin page, the **Robot view**.

This is **tentative code, kept apart from the rest of the system**. The shared chat code
only calls into it from a few marked lines (see [Hooks in existing files](#hooks-in-existing-files)),
and a client that never uses it (the web app, QT) behaves exactly as before.

**Buddy is trusted to follow its own contract.** The backend does not check Buddy's
messages field by field; it forwards them as sent. The one check it keeps is about
access: who may see a participant's camera.

Head control (`set_head_pose`, `stop_head`) and remote FPS changes are **not built
yet**. They are Stage 2, after the camera works on the robot.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Trying It                                                                        -->
<!-- -------------------------------------------------------------------------------- -->
## Trying it on Buddy

1. Start a chat on Buddy as usual. Nothing changes until one of Buddy's toggles is pressed.
2. On the admin dashboard, open the live chat. A Buddy session's monitor page has a
   **Robot view** button in its header, which opens `/admin/chat/<id>/robot`.
3. Turn on **Video** on Buddy. The camera area changes from "Camera not connected" to
   images about once a second. The **Robot** tab shows connection, camera, head, and
   error state, and the **Telemetry** tab shows the newest reading from each sensor.
4. Turn on **Audio** on Buddy. The Robot tab's input mode becomes `backend (revision 1)`,
   and the user's speech now comes from our STT. Try this in manual response mode first
   (**Pause Auto**, then **Reply Now**). Buddy keeps streaming while it speaks, so in
   automatic mode it may hear and answer itself.

Each step logs a `[BuddyMedia]` line in `docker logs backend` (connects, refusals with
their close code, start, stop, the first image).

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Files                                                                            -->
<!-- -------------------------------------------------------------------------------- -->
## Files

```diff
+experimental/buddy/
+├── config.py            # Capability names, heartbeat interval, close codes, and the log tag
+├── primary_hooks.py     # Input mode and probe-ack fields on the primary socket; which socket is a chat's media socket
+├── media_consumer.py    # BuddyMediaConsumer: Buddy's media socket
+└── viewer_consumer.py   # MediaViewerConsumer: the admin page's media socket
```

The frontend half is `frontend/src/pages/admin/robot_view/`, and the tests are
`websocket/tests/test_buddy_media.py`.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Primary Socket                                                                   -->
<!-- -------------------------------------------------------------------------------- -->
## Primary chat socket additions

**The probe.** A connection joins the experiment when its client sends `get_control_state`.
From then on, every primary ack's `state` also carries `input_mode` and
`input_mode_revision`. The `get_control_state` ack also carries:

```json
"capabilities": ["buddy_input_mode_v1", "buddy_media_v1"],
"session":      {"chat_session_id": "123", "primary_connection_id": "<opaque hex>"}
```

The starting `input_mode` is `backend` for the web app and `sdk` for every other source.

**`set_input_mode`** (`{"mode": "sdk" | "backend", "expected_revision": <int>}`):

| Request | Result |
|---|---|
| `expected_revision` is not the current revision | `ok: false`, nothing changes; the ack's state has the current revision |
| `mode` is already the current mode | `ok: true`, same revision |
| A different mode | `ok: true`, revision + 1 |

- Switching to `backend` starts our STT and the session recording (when listening is
  active), and turns on `user_utt`.
- Switching to `sdk` pauses the recording and turns off `user_utt`. It also **shuts down
  the STT provider and puts in a fresh, stopped one**, so a sentence the old one had not
  finished is dropped instead of answered. The recording pause is written as silence if
  backend audio comes back, which keeps word timestamps aligned with the WAV.
- Admin listeners cannot send it (their commands go through `dispatch_command`, which
  calls it unknown).

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Media Socket                                                                     -->
<!-- -------------------------------------------------------------------------------- -->
## The media socket

```text
wss://<host>/ws/buddy-media/?token=<access>&source=buddyrobot&primary_connection_id=<id>
```

| Close code | Meaning |
|---|---|
| `4001` | Not authenticated |
| `4004` | The `primary_connection_id` is not this user's open chat connection, or that connection ended or was replaced |

**Handshake.** Buddy sends `media_start`, and the ack's `state` is
`{protocol_version: 1, media_session_id, chat_session_id, primary_connection_id, status: "ready"}`.
`media_stop` acks `status: "stopped"`. The `media_start` body's settings are not used.

**Heartbeat.** Buddy turns media off after 3 s without a command from the backend. So
while media runs, the backend sends `get_media_state` every second (IDs `hb-1`, `hb-2`,
…). The state in each answer goes to viewers.

**Forwarding.** Images go to viewers byte for byte. `media_status` and heartbeat answers
update the newest state, which goes to viewers as `media_status`. Buddy leaves out its
capabilities when they are unchanged, so the last ones are kept. `telemetry` goes to
viewers as sent. Other message types are logged and ignored.

**Ending.** The media socket hears the chat connection's existing
`stream_status: "ended"` broadcast on the monitor group. When it arrives, the socket
closes with `4004`, so `ChatConsumer` needed no change. If a second media socket opens
for the same chat connection, the newer one becomes that chat's media socket.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Viewer Socket                                                                    -->
<!-- -------------------------------------------------------------------------------- -->
## The admin viewer socket

`ws/chat/<session_id>/media/` uses the admin listener's access rule: staff, the
session's owner, and caregivers linked to the participant. Its close codes are `4001`,
`4404`, and `4003`. The Robot view opens it beside the usual listener socket.

| Frame | When |
|---|---|
| Binary `BMV1` | Every image Buddy sent |
| `media_session` | `{status, media_session_id}`; `status` is `none` (no media socket), `connected`, `ready`, `stopped`, or `ended` |
| `media_status` | `{state, capabilities}`, Buddy's newest |
| `telemetry` | Every batch, as Buddy sent it |
| `pong` | Reply to the page's `ping`, which also stops nginx from closing a quiet socket |

On joining, a viewer gets the current media session and Buddy's newest state right away.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- What Buddy Needs                                                                 -->
<!-- -------------------------------------------------------------------------------- -->
## What Buddy's code needs

Nothing has to change on the robot. Buddy already does these four things, and the
backend relies on them:

1. Sends `get_control_state` on the chat socket before opening the media socket. That
   ack carries the `primary_connection_id`.
2. Answers every `get_media_state` heartbeat with an ack that carries `state`.
3. Sends no `transcription` in `backend` mode and no audio in `sdk` mode. The backend does
   not filter either one.
4. Puts an `id` on every command it sends.

Where the backend does less than the contract describes:

- **No `protocol_error`.** The backend never sends one. A malformed message on the media
  socket closes only that socket; the chat keeps going.
- **No refusals except 4001 and 4004.** There is no `4002`, `4009`, or `1009`, and
  `media_start` is never refused.
- **No replay of duplicate command IDs.** A repeated `set_input_mode` fails the revision
  check rather than replaying the first ack.
- **Backend-mode `ok: true` means the backend is accepting audio.** A Google stream
  failure shows up in the backend logs, not in the ack.
- **No head or FPS commands yet (Stage 2).** Any `command_result` is ignored.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Hooks and Removal                                                                -->
<!-- -------------------------------------------------------------------------------- -->
## Hooks in existing files

Each line is marked `Experimental Buddy media`.

| File | Hook |
|---|---|
| `websocket/routing.py` | The two routes, plus their docstring lines |
| `websocket/consumers/handlers/ws_events.py` | `handle_primary_command` before `dispatch_command`; `add_primary_ack_fields` on every primary ack |
| `frontend/src/App.jsx`, `frontend/src/pages/index.ts` | The `/admin/chat/:id/robot` route and its export |
| `frontend/src/pages/admin/AdminChat.tsx` | The **Robot view** button, shown for `buddyrobot` sessions |

**To remove the experiment:**
1. Delete this folder, `websocket/tests/test_buddy_media.py`, and
   `frontend/src/pages/admin/robot_view/`.
2. Delete the marked lines.

**To graduate it:**
1. Move the consumers into `consumers/`, and move the log tag into `logging_utils.py`.
2. Document the frames in `CLIENT_PROTOCOL.md` and the consumers README.
3. Give the robot page and AdminChat one shared listener hook.

## Known limits

- **Single process.** The registry of chat connections (`primary_hooks.py`) is in memory,
  like the `InMemoryChannelLayer`. Running several backend workers would need both moved
  to Redis or similar.
- **Reads `ChatConsumer` attributes** (`user`, `session_id`, `streaming_active`,
  `stt_provider`, `audio_recorder`, `use_backend_STT`, `_close_scheduled`) and listens
  to its monitor-group broadcast. A rename there breaks this code.
- **An idle Google stream when listening is toggled in `sdk` mode.** If an admin toggles
  listening while Buddy is in `sdk` mode, the STT provider opens a Google stream that gets
  no audio and later logs a timeout error. Nothing else is affected.
