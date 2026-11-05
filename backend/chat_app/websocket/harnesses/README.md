# Speech System // Chat Types <br> `backend/chat_app/websocket/harnesses/..`

A **harness** holds everything one chat type does differently from the others: how
it replies, the dialogue state it keeps, its own prompts and LLM calls, and its
**cues** (the behaviors a condition switches on or off). The chat consumer builds
one harness per connection, and the shared pipeline (`consumers/`,
`services/chatHelpers.py`, the STT provider) tells it about each stage of a turn,
without ever checking which chat type it is running.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Choosing a Chat Type                                                             -->
<!-- -------------------------------------------------------------------------------- -->
## Choosing a chat type

A client picks the chat type with optional query parameters on the chat socket
(`CLIENT_PROTOCOL.md` §1):

```text
wss://<host>/ws/chat/?token=<access token>&source=webapp&chat_type=active_listening
```

| Parameter | What it picks | When left out |
|---|---|---|
| `chat_type` | The harness (`registry.py`) | `unguided` |
| `condition` | Which behavioral cues are switched on: the experimental condition | The chat type's first condition |
| `variant` | The task content, such as which map or which scenario | The chat type's first variant |

Each chat type hardcodes its own conditions and variants in its folder. The two
are independent, so a participant could run one map with cues and another without.
A chat type that has none takes neither parameter, and its sessions store `""`.

An unknown name refuses the connection with close code `4005`. The chat type,
condition, and variant are saved on the `ChatSession`.

`ws/chat/activity/` is an older route that always runs the `activity` chat type
(the chat page still uses it).

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- The Chat Types                                                                   -->
<!-- -------------------------------------------------------------------------------- -->
## The chat types

| `chat_type` | What it does | Conditions | Variants |
|---|---|---|---|
| `unguided` | Open conversation (the default). Spoken end-chat and pause requests get scripted replies; everything else goes to the single-stage LLM | none | none |
| `active_listening` | An LLM assessment of each turn shapes the reply (experimental; see its README) | none | none |
| `activity` | The memory activity: structured response plans, goal evidence, and controlled closing (see its README) | none | none |
| `map_task` | The Map Task: the user gives directions, and the avatar follows them on its own map (see its README) | none yet | `demo` |

None of these uses cues yet.

```diff
+harnesses/
 ├── base.py                      # ChatHarness, Cue, the turn events, TurnAttempt, ResponseOutcome
 ├── cues.py                      # Shared cues to build on: KeywordCue, SilenceWatcher
 ├── registry.py                  # chat_type names -> harnesses, the default, and the condition/variant checks
 ├── avatar.py                    # The robot mood vocabulary (ResponseMood) and the mood frame
 │
+├── unguided/
 │   ├── harness.py               # Scripted end-chat and pause replies, otherwise the LLM
 │   ├── intents.py               # The end-chat and pause phrases
 │   └── cognibot_api.py          # The single-stage structured LLM client and its prompt
 │
+├── active_listening/            # Assessment, then reply (see its README)
 │   ├── harness.py               # Keeps one connection's dialogue state; the engine does the rest
 │   └── ...
 │
+├── activity/
 │   ├── harness.py               # Generates against a state copy; adopts it after saving
 │   ├── pipeline.py              # Sequential planner/responder coordination
 │   ├── runtime.py               # Goal-evidence and transition validation
 │   ├── state_specs.py           # Temporary manually authored goals and turn limits
 │   ├── repository.py            # Reads ordered instructions from the main database
 │   ├── closing.py               # Controlled summary and final-question workflow
 │   └── history.py               # Relocated conversation-history utilities
 │
+└── map_task/                    # The avatar as instruction follower (see its README)
     ├── harness.py               # Reads each turn, replies through its route's pipeline, and moves the avatar
     ├── maps/                    # One map file per variant
     └── ...
```

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- The Harness Contract                                                             -->
<!-- -------------------------------------------------------------------------------- -->
## The harness contract

A harness subclasses `ChatHarness` (`base.py`):

| Member | What it is |
|---|---|
| `NAME` | The `chat_type` value, saved on the session |
| `CONDITIONS`, `VARIANTS` | The names a client may send. The first is the default; `()` means none |
| `state` | The chat type's dialogue state. The class value is where every chat starts |
| `cues` | This connection's cues, built in the subclass's `__init__` from its condition |
| `generate(attempt)` | Required. Returns one `ResponseOutcome` for the staged user turn |
| `on_reply_saved(outcome)` | Called once that reply's exchange is saved. Enters `outcome.state`, unless it is `None`, then tells the cues |
| `start()`, `stop()` | The connection is ready, or closing (`stop` stops every cue) |
| `on_interim`, `on_final`, `on_reply_started`, `on_reply_cancelled`, `on_playback` | Turn events (next section), passed on to each cue |

`generate` runs inside the reply attempt. When newer speech arrives, any reply but
a `reply_now` one is cancelled at whatever `await` it has reached, and the staged
turn waits for the next attempt along with the new speech. So `generate` changes
nothing itself. It returns its effects in the outcome, and `ChatHandler` applies
them once the exchange is saved, so a cancelled reply leaves no trace.

`TurnAttempt` carries `context` (the conversation, ending with the staged user turn),
`user_text`, `trigger` (`"automatic"`, `"reply_now"`, or `"harness"`), and
`publish_mood`, which sends a `robot_action` emotion right away unless newer speech
has already cancelled the reply.

`ResponseOutcome` carries `message`, `state` (entered in `on_reply_saved`),
`pause_listening`, and `close_after` (send `chat_ended` and close once the reply has
gone out).

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Turn Events and Cues                                                             -->
<!-- -------------------------------------------------------------------------------- -->
## Turn events and cues

The pipeline tells the harness about each stage of a turn, and the harness passes
every event on to each of its cues:

| Event | When | From |
|---|---|---|
| `on_interim(speech)` | Every interim STT result: the whole utterance so far, while the user speaks | `consumers/processing/speech.py` |
| `on_final(utterance)` | An utterance is finished (STT, or a text client's `transcription`), just before it is staged | `consumers/processing/speech.py` |
| `on_reply_started(attempt)` | A reply attempt begins: the avatar is preparing to speak | `ChatHandler._execute_response_locked` |
| `on_reply_cancelled(attempt, saved)` | Newer speech or a command cancelled it. `saved`: its text had already gone out, so its audio was cut short | `ChatHandler._execute_response_locked` |
| `on_reply_saved(outcome)` | Its exchange was saved, and its text goes out now | `ChatHandler._commit_response` |
| `on_playback(response_id, state)` | The client heard the reply's audio `"started"` or `"finished"` | `consumers/processing/playback.py` (`tts_playback`) |

Interims and finals arrive in the order Google returned them. `InterimSpeech` has
`text`, `new_speech` (recognition moved past the previous interim: what cancels an
automatic reply), `stability`, and `ended_at` (when the recognized audio ends, on
the word timestamps' clock). `FinalUtterance` has `text` and `words`.

Only the web app sends `tts_playback`, and never `"finished"` for a reply whose
audio was cancelled. The reply events cover replies the harness generates;
replies an admin sends (`send_custom`, `repeat_last`) show up only through playback.

**Cues** subclass `Cue` and override just the events they need. A cue reacts with
side effects only (avatar frames, or a turn of its own), never by changing the
dialogue state. Every hook runs on the chat's event loop and must not block, so
async work starts with `fire_and_log`. A cue that raises is logged once and
skipped; the chat and the other cues carry on.

`cues.py` has two to build on:

- **`KeywordCue`** fires `on_match(name, text)` once for each new occurrence of a
  pattern in `PATTERNS`. Every interim repeats and revises the whole utterance so
  far, so it counts occurrences per utterance rather than firing on every interim,
  and a revision that drops a word and brings it back doesn't fire it twice. Set
  `ON = "final"` to react only to finals.
- **`SilenceWatcher`** calls `on_silence(seconds)` as each of `THRESHOLDS_SEC`
  passes without speech on the user's turn. The clock starts when the reply's audio
  finishes and restarts from the end of newer speech. It stops while a reply is
  prepared or playing, and nothing fires while listening is paused.

**Harness turns.** A cue that wants the avatar to speak first (a re-prompt after a
silence, an opening line) calls `ChatHandler.request_harness_turn(consumer)`. That
runs a normal reply attempt with `trigger="harness"`: it answers any staged speech,
or speaks on its own when nothing is staged (`user_text` is `""` and only the reply
is saved). Newer speech cancels it like an automatic reply. It starts nothing while
another reply owns the turn, so the cue can ask again later.

A Map Task cue that looks toward a direction as soon as it is heard might look
like this (the gaze frame itself comes with the avatar plans):

```python
# Look toward a side of the map the moment the user names it
class DirectionGaze(KeywordCue):
    PATTERNS = {
        "left"  : re.compile(r"\b(to the|go|turn|head)\s+left\b",  re.IGNORECASE),
        "right" : re.compile(r"\b(to the|go|turn|head)\s+right\b", re.IGNORECASE),
        "up"    : re.compile(r"\b(go|move|head)\s+up\b",           re.IGNORECASE),
        "down"  : re.compile(r"\b(go|move|head)\s+down\b",         re.IGNORECASE),
    }

    # Send a gaze plan toward that side
    def on_match(self, name: str, text: str) -> None:
        fire_and_log(send_plan(self.harness.consumer, gaze_toward(name)), name="map_task::direction_gaze")
```

The harness then switches it on for one condition only, in its `__init__`:
`if condition == "cues": self.cues = [DirectionGaze(self)]`.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Adding a Chat Type                                                               -->
<!-- -------------------------------------------------------------------------------- -->
## Adding a chat type

1. Make a folder here named after it, with a `harness.py` whose class subclasses `ChatHarness`.
2. Put everything only it uses in that folder: prompts, response models, API clients, cues, and task data such as maps or scenarios.
3. List its conditions and variants in `CONDITIONS` and `VARIANTS`, and build each condition's `cues` in `__init__`.
4. Add it to `CHAT_TYPES` in `registry.py`.
5. Add its name to `CLIENT_PROTOCOL.md` §1 and to the table above.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Activity Pipeline                                                               -->
<!-- -------------------------------------------------------------------------------- -->
## Activity pipeline

The activity harness generates against a deep copy of the connection's
state and returns it in `ResponseOutcome.state`. `on_reply_saved()` adopts the
proposal after the exchange is saved. Cancelled generation therefore discards
scenario changes, goal evidence, histories, counters, and closing flags together.
A saved response can still have its audio interrupted.

The planner and responder currently live in `websocket/agents/`. Each owns an
editable prompt and accepts an injected client and model. The activity pipeline
coordinates them sequentially and imports them from that shared package. The
planner's `ResponsePlan` carries guidance, goal evidence, transition proposals,
and `updated_memory: PlannerMemory`. Working memory is held in `planner_memory`.

`state_specs.py` supplies manually authored required goals and per-state saved-turn
limits. The runtime accepts grounded evidence and records skipped goals when a
user declines or a turn limit is reached. These policies are provisional and need
conversation testing; a matching quote alone does not prove semantic fulfillment.

Closing remains a Python-controlled workflow entered through virtual
`close_session`. It takes explicit context and attempt-local state, and does not
require an `end_conversation` database row. The existing `ws/chat/activity/` route
remains supported. Clients are configured through `services/llm/instructor_client.py`
using `IU_URL`, `IU_KEY`, and `LLM_NAME`.

See [activity/README.md](activity/README.md) for runtime behavior, provisional
testing settings, known limitations, and Docker test commands. The implementation
roadmap and progress history are kept in
[ACTIVITY_PIPELINE_REFACTOR_PLAN.md](../../../../ACTIVITY_PIPELINE_REFACTOR_PLAN.md).

Left as they are for now: the `taskType` and `taskSubtype` fields on `UserSettings`
and `ChatSession`, which the settings page's chat-type form sets. They are separate
from `chat_type`.
