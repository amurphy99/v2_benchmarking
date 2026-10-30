# Chat WebSocket Consumers

Code in the `consumers/` directory handles all live WebSocket connections used by a chat. Here we connect frontend transports to shared audio, transcription, command, response, persistence, and biomarker behavior while keeping frontend-specific (webapp vs. robot vs. other) decisions out of those pipelines.

This `README` covers the primary chat consumer and the admin listener. What differs between chat types (unguided, active listening, the activity) lives in each chat type's harness instead, in `../harnesses/` (see its `README.md`); the consumer only builds the harness and asks it for each reply.

> **Looking for the primary-client wire format?** [`CLIENT_PROTOCOL.md`](./CLIENT_PROTOCOL.md)
> is the contract used by the web chat, mobile clients, and physical robots. It also defines
> the command and acknowledgement shapes shared with the admin listener. Listener-only
> initialization, history, biomarker, and ping/pong frames remain an internal admin-UI API.

<!-- -------------------------------------------------------------------------------- -->
<!-- WebSocket Endpoints                                                              -->
<!-- -------------------------------------------------------------------------------- -->
## WebSocket Endpoints

The routes are defined in `backend/chat_app/websocket/routing.py`:

| Endpoint | Consumer | Purpose |
|---|---|---|
| `ws/chat/`                     | `ChatConsumer`         | Primary web app or robot chat connection (`chat_type` picks the chat type) |
| `ws/chat/activity/`            | `ChatConsumer`         | Older route that always runs the `activity` chat type |
| `ws/chat/<session_id>/listen/` | `ChatListenerConsumer` | Admin monitoring and control connection |

The primary consumer owns the live chat session. Listener consumers observe that
session through Channels groups and can relay canonical commands to the primary.

<!-- -------------------------------------------------------------------------------- -->
<!-- Directory Responsibilities                                                       -->
<!-- -------------------------------------------------------------------------------- -->
## Directory Responsibilities

```diff
+consumers/
+├── consumers.py
 │   Primary connection lifecycle, per-session state, Channels event methods,
 │   group broadcasts, and response-task entry points.
 │
+├── chat_listener.py
 │   Listener connection lifecycle, initial database state, live monitoring, and
 │   command relay into the primary consumer's control group.
 │
+├── handlers/
+│   ├── ws_events.py
 │   │   Validates and routes JSON received from the primary frontend WebSocket.
+│   └── ch_events.py
 │       Adapts internal Channels events, including listener commands and targeted acks.
 │
+├── processing/
+│   ├── audio.py
 │   │   Validates and ingests small audio chunk payloads.
+│   ├── messages.py
 │   │   Commits messages to the database, updates LLM context, and broadcasts them.
+│   ├── playback.py
 │   │   Validates optional assistant playback timestamps from primary frontends.
+│   ├── commands.py
 │   │   Defines canonical commands, applies their behavior, and builds ack bodies.
+│   └── stream.py
 │       Starts/stops backend STT and publishes the confirmed listening state.
 │
+└── utils/
     Group membership, listener payload formatting, connection logging, and initial
     listener database data.
```

Related code outside this directory:

- `harnesses/` holds what differs between chat types: each one's replies, prompts, LLM
  clients, and dialogue state.
- `services/chatHelpers.py` coordinates staged utterances, cancellation, LLM responses,
  response commits, and TTS.
- `services/chat_state.py` keeps staged transcript text and word timestamps together.
- `services/speech/stt/` owns the ordered audio queue, Google stream, audio barriers,
  and interim-progress tracking.
- `services/speech/tts/` synthesizes and streams assistant speech.
- `services/session_audio_storage.py` owns local/GCS persistence and playback URLs.
- `biomarkers/callbacks.py` runs biomarker follow-up work after a user message commits.
- `services/db_services.py` contains synchronous transactional database operations and
  asynchronous session-closing analysis.

<!-- -------------------------------------------------------------------------------- -->
<!-- Primary Connection Lifecycle                                                     -->
<!-- -------------------------------------------------------------------------------- -->
## Primary Connection Lifecycle

`ChatConsumer.connect()` performs the following sequence:

1. Initialize response, task, and connection state before accepting the socket.
2. Authenticate the user and identify the frontend source.
3. Build the harness for the requested `chat_type`, `condition`, and `variant`, refusing an
   unknown name with `4005`.
4. Select source-dependent STT, TTS, and automatic-response settings.
5. Close stale active sessions, then create the new active `ChatSession`, recording its chat
   type, condition, and variant.
6. Build the bounded in-memory `context_buffer` used for LLM calls.
7. Join the session room and control Channels groups.
8. Create the `SpeechToTextProvider`, incremental recorder, and rolling biomarker buffer.

The consumer instance is the owner of per-connection mutable state. Processing modules
operate on that state but do not create a parallel session object.

<!-- -------------------------------------------------------------------------------- -->
<!-- Primary WebSocket Message Routing                                                -->
<!-- -------------------------------------------------------------------------------- -->
## Primary WebSocket Message Routing

Every decoded primary-client message follows this entry path:

```text
Frontend JSON
    -> ChatConsumer.receive_json()
    -> handlers.ws_events.handle_receive_json()
```

`ws_events.py` routes by the top-level `type` field:

| Type | Destination | Purpose |
|---|---|---|
| `audio_data` | `processing.audio.ingest_audio_payload` | Ingest one small PCM audio chunk |
| `transcription` | `ChatHandler.stage_and_schedule` | Stage direct frontend text |
| `command` | `processing.commands.dispatch_command` | Execute a canonical control command |
| `tts_playback` | `processing.playback.handle_playback_event` | Store optional assistant playback timing |
| `overlapped_speech` | `ws_events.handle_overlap` | Track a frontend overlap notification |
| `end_chat` | `ChatConsumer.close` | Close the primary socket and session |

The router handles transport validation. Downstream processing functions receive
normalized values or a validated payload rather than owning WebSocket dispatch.

<!-- -------------------------------------------------------------------------------- -->
<!-- Audio and STT Flow                                                               -->
<!-- -------------------------------------------------------------------------------- -->
## Audio and STT Flow

An `audio_data` payload represents one small chunk, not a complete spoken message:

```text
Primary frontend
    -> ws_events
    -> processing.audio.ingest_audio_payload()
       ├── validate sample rate and base64 data
       ├── append bytes to the ordered STT audio queue
       ├── write accepted user bytes to the incremental temporary WAV
       └── append a timestamped copy to the rolling biomarker buffer
    -> SpeechToTextProvider
    -> Google streaming STT
```

Google results have two paths:

- Interim results are never staged as user text. The progress tracker compares transcript
  and timing progress; only genuinely advancing speech cancels a pending response.
- Final results include finalized text and, when available, word timestamps. They are
  scheduled onto the main event loop through `ChatHandler.stage_and_schedule()`.

A direct frontend `transcription` reaches the same staging method without Google word
timestamps. Both paths therefore share accumulation and trigger-aware cancellation behavior:
continued speech cancels automatic responses, but not an accepted `reply_now` response.

<!-- -------------------------------------------------------------------------------- -->
<!-- Session Recording                                                                -->
<!-- -------------------------------------------------------------------------------- -->
## Session Recording

`SessionAudioRecorder` writes every accepted user PCM chunk directly to a temporary
16 kHz, signed 16-bit little-endian mono WAV file. The web frontend advertises this 
format on every chunk; older robot payloads that omit format fields should still use
those defaults. It does this even while the final save state is disabled, so an admin
user can enable recording partway through a chat and still retain the whole session. 
Explicit listening pauses are represented as silence when audio resumes (e.g., when a
user pauses the chat and we stop streaming audio from them while we wait).

On disconnect, the final recording toggle determines the outcome:
- Disabled: close and delete the temporary WAV file.
- Enabled: finalize the WAV file, move it to local storage or upload it to GCS, then 
           attach a one-to-one `SessionAudio` metadata row to the `ChatSession`.

Assistant TTS bytes are not added to this WAV. Instead, each outbound `llm_response`
and `audio_chunk` includes the persisted assistant message's `responseId`, and a frontend may
optionally report actual playback boundaries back with a `tts_playback` message (see
[`CLIENT_PROTOCOL.md`](./CLIENT_PROTOCOL.md) for its shape).

Missing playback events are valid, which keeps text-only robot frontends compatible. Accepted
events fill the assistant message's normal `start_ts` and `end_ts` audible interval. For
messages with word timing, those same fields are derived from the earliest and latest
associated `ChatWord` rows.

<!-- -------------------------------------------------------------------------------- -->
<!-- Staged Text and Automatic Responses                                              -->
<!-- -------------------------------------------------------------------------------- -->
## Staged Text and Automatic Responses

`ChatHandler.stage_and_schedule()` appends each finalized utterance to the consumer's
`StagedUtteranceBuffer`. Text and Google word timestamps stay together in one staged
record.

When automatic responses are enabled, ChatHandler starts a cancellable response attempt:

```text
Finalized utterance
    -> staged snapshot
    -> the chat type's harness (`harness.generate`)
    -> atomic message exchange commit
    -> primary and listener text delivery
    -> optional TTS
```

New meaningful speech cancels an outdated attempt. Its staged snapshot is not consumed,
so a later retry includes both the earlier text and the continuation. Once response
generation succeeds, the commit is shielded from cancellation so database and in-memory
state cannot be left half-updated.

<!-- -------------------------------------------------------------------------------- -->
<!-- Chat Types and Intent Detection                                                  -->
<!-- -------------------------------------------------------------------------------- -->
## Chat Types and Intent Detection

`ChatHandler` asks the connection's harness for every reply (`harness.generate`) and
applies the `ResponseOutcome` it returns the same way for every chat type. A reply's
state change, listening pause, and close happen only once its exchange is saved
(`harness.committed` takes the state), so a reply cancelled by newer speech changes
nothing. See `../harnesses/README.md` for the chat types and how to add one.

The `unguided` chat type (the default) checks each user turn for spoken end-chat and
pause requests with regular expressions (`harnesses/unguided/intents.py`) before calling
the LLM. A match returns a scripted reply instead. Its pause goes through the shared
`processing.stream.set_streaming_active()` operation, like every other pause.

The `active_listening` chat type responds with two calls: the first performs a
structured turn assessment, which is where we check for "user intent" regarding things
such as pausing or ending the chat. After the first stage model finishes, we use it to
add additional context for a second model call which generates the actual spoken
response to the user. See `harnesses/active_listening/README.md` for more information.
The `activity` chat type skips these intents and ends through its own closing flow.

<!-- -------------------------------------------------------------------------------- -->
<!-- `reply_now` Audio Barrier                                                        -->
<!-- -------------------------------------------------------------------------------- -->
## `reply_now` Audio Barrier

The `reply_now` command is accepted immediately, but response generation is coordinated
in the background (`ChatHandler._coordinate_reply_now`):

1. `ChatConsumer.accept_reply_now()` (or `reply_now()`) calls
   `SpeechToTextProvider.create_audio_barrier()`, which queues an `AudioBarrier` after every
   chunk received so far. This happens before the `ReplyNowEvent` row is written, so Google
   is already finishing while the database write runs.
2. The command adapter sends its correlated acknowledgement without waiting for Google.
3. When the request generator reaches the barrier it ends the Google request stream, which
   makes Google return final results for all buffered audio immediately instead of
   waiting for its endpointer to hear silence.
4. The barrier resolves only after that stream's responses have ended **and** every
   `stage_and_schedule` task they scheduled has finished, so the waiter is guaranteed to
   see the last utterance in `_staged_utterances`.
5. The stream worker's handoff starts a successor stream for audio that arrived after the
   barrier; nothing the client sends is dropped.
6. ChatHandler runs a forced response attempt from the staged utterances right away. If
   nothing is staged, the reply completes silently.
7. Continued speech does not cancel that LLM/TTS attempt. It remains staged for a later
   response (scheduled automatically when automatic mode is active).

If the flush times out (`REPLY_BARRIER_TIMEOUT_SEC`) or fails (the stream errored), the
reply uses whatever is staged at that point. With no live stream (text-only clients), the
barrier resolves immediately.

Why the flush exists: "STT stopped making progress" is not the same as "STT finalized".
Once the user stops talking, interim results stop growing, but the last utterance stays
interim until Google hears enough trailing silence (often 0.5-1.5 s). A client that replies
the moment the user stops (QT's Enter key) previously got a reply built without that
utterance, which was then staged for the following turn.

Every accepted `reply_now` has a `ReplyNowEvent` row. It records transport receipt and
database creation times, origin and authenticated requester, command ID, response mode, and
chat session. Automatic responses do not create these rows.

Because each flush ends a Google stream, word-time offsets are anchored to the arrival of
each stream's first chunk (not to when the stream was prepared), so audio queued during a
handoff keeps accurate timestamps.

Pausing listening rejects new audio chunks immediately but does not discard chunks that
the backend already accepted. The provider queues a pause barrier after them, which ends
the Google stream once they have been sent, and `reply_now` can still wait on it while
listening is paused. If listening resumes before that stream has finished, its worker
hands the newer audio to one successor stream. Disconnect shutdown remains intentionally
destructive: it aborts queued audio and fails boundaries that can no longer be reached.

<!-- -------------------------------------------------------------------------------- -->
<!-- Canonical Commands and Acknowledgements                                          -->
<!-- -------------------------------------------------------------------------------- -->
## Canonical Commands and Acknowledgements

Both primary and listener clients use the same command envelope, and
`processing.commands.dispatch_command()` owns the vocabulary, the state transitions, and the
acknowledgement body returned to both transports.

**The shared command wire format lives in [`CLIENT_PROTOCOL.md`](./CLIENT_PROTOCOL.md)** --
command names, payload shapes, the ack body, and the control-state fields are documented there.
This README covers how the primary and listener transports carry that shared contract, along
with the listener-only backend architecture.

<!-- -------------------------------------------------------------------------------- -->
<!-- Direct and Listener Command Paths                                                -->
<!-- -------------------------------------------------------------------------------- -->
## Direct and Listener Command Paths

A primary client command stays on its own socket:

```text
Primary frontend
    -> ws_events.handle_client_command()
    -> processing.commands.dispatch_command()
    -> command_ack sent directly to primary frontend
    -> confirmed control state broadcast to listeners
```

A listener command crosses the Channels control group:

```text
Listener frontend
    -> ChatListenerConsumer.receive_json()
    -> control_group: "ws.command"
    -> ChatConsumer.ws_command()
    -> ch_events.handle_ws_command()
    -> processing.commands.dispatch_command()
    -> targeted "ws.command_acks" event to the originating listener
    -> confirmed control state broadcast to all listeners
```

`ws_events.py` and `ch_events.py` deliberately remain separate because their transports
return acknowledgements differently. They share all command behavior through the same
dispatcher.

<!-- -------------------------------------------------------------------------------- -->
<!-- Channels Groups and Event Methods                                                -->
<!-- -------------------------------------------------------------------------------- -->
## Channels Groups and Event Methods

Groups are scoped by `ChatSession.id`:

| Group | Members | Direction and contents |
|---|---|---|
| `chat_<sid>` | Primary and listeners | Committed user/assistant message broadcasts |
| `chat_<sid>_mon` | Listeners | Biomarkers, stream state, recording state, and control state |
| `chat_<sid>_ctl` | Primary | Commands sent from listener connections |

Channels converts dots in an event `type` into underscores when selecting a consumer
method. For example:

```text
{"type": "ws.command",   ...} -> consumer.ws_command  (event)
{"type": "ws.broadcast", ...} -> consumer.ws_broadcast(event)
```

These `ws_*` methods must remain methods on the consumer classes even when their bodies
delegate to handler modules. Ordinary processing functions do not need consumer-method
passthroughs.

<!-- -------------------------------------------------------------------------------- -->
<!-- Message Persistence and Database State                                           -->
<!-- -------------------------------------------------------------------------------- -->
## Message Persistence and Database State

`processing.messages` keeps database, context, and listener publication ordered:

- `commit_chat_message()` persists one standalone message. Disconnect flushing and
  manual assistant responses use this path.
- `commit_chat_exchange()` calls transactional `ChatService.add_exchange()` for the
  matched user/assistant pair produced by a successful response.
- `_publish_chat_message()` updates the bounded `context_buffer` and broadcasts a message
  only after its database write succeeds.

Word timestamps and biomarker work run after the associated user message commits.
Biomarker callbacks await their own database write before broadcasting scores, while the
whole callback task remains background work relative to response delivery.

<!-- -------------------------------------------------------------------------------- -->
<!-- Disconnect and Session Closing                                                   -->
<!-- -------------------------------------------------------------------------------- -->
## Disconnect and Session Closing

`ChatConsumer.disconnect()` performs shutdown in dependency order:

1. Mark the connection as closing and shut down the STT provider.
2. Broadcast the ended stream state.
3. Cancel and await connection-owned response coordinator tasks.
4. Flush any staged user text that never received a response.
5. Finalize or discard the temporary user-only WAV according to the recording toggle.
6. Attach `SessionAudio` metadata, mark the session inactive, then schedule slower analysis.
7. Leave every Channels group.
8. Clear model/session references and reset per-session response state.

`ChatListenerConsumer.disconnect()` only leaves its groups. A listener never owns or
closes the underlying chat session.


<!-- -------------------------------------------------------------------------------- -->
<!-- How to Add New Functionality                                                     -->
<!-- -------------------------------------------------------------------------------- -->
## How to Add New Functionality

- Add a new primary-client JSON type to `handlers/ws_events.py`.
- Add a new listener/Channels event adapter to `handlers/ch_events.py` and expose its
  required `ws_*` method on the relevant consumer.
- Add a canonical command and state transition to `processing/commands.py`; both
  transports will then use it automatically.
- Put operations on live consumer state in a focused `processing/` module instead of
  adding a pass-through method to `ChatConsumer`.
- Put STT/TTS provider internals under `services/speech/`.
- Keep database transactions in `ChatService`, with consumer-side commit/publication
  coordination in `processing/messages.py`.
- Put behavior that differs between chat types in that chat type's harness
  (`../harnesses/`), never in the consumer, `ChatHandler`, or the frame routers.
