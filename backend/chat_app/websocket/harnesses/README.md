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
condition, and variant are saved on the `ChatSession`. The session API returns
them, and filters on them with query parameters
(`/api/chatsessions/0/0/?chat_type=map_task&variant=demo`; `""` matches sessions
without one). The Django admin lists and filters them, the admin listener gets
them in `session_info`, and the Monitor page shows them on each chat and filters
its lists by them.

The participant chat page picks the chat type and condition from its dropdown,
and the variant from a second one (`frontend/src/pages/chat/chatModes.ts`, which
copies each chat type's `VARIANTS`).

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
| `activity` | The memory activity: its RAG pipeline and closing flow | none | none |
| `map_task` | The Map Task: the user gives directions from their map, and the avatar follows them on its own (see its README) | `cues`, `no_cues` | `demo`, `hcrc_1` to `hcrc_4` |
| `cooperative_planning` | The user and the avatar plan an event together, each with private constraints; the participant's card fills in as items are agreed | `cues`, `no_cues` | `dinner_party` |

`map_task` and `cooperative_planning` use cues, drive the avatar with plans
(`consumers/HARNESS_PROTOCOL.md`), and show the participant their task materials
(`task_card`); the others send `robot_action` moods. `map_task` also gives the admin
live chat page a view of its state (Monitoring, below).

```diff
+harnesses/
 ├── base.py                      # ChatHarness, Cue, the turn events, TurnAttempt, ResponseOutcome
 ├── cues.py                      # Shared cues: KeywordCue and SilenceWatcher to build on, and BackToListening as is
 ├── registry.py                  # chat_type names -> harnesses, the default, and the condition/variant checks
 ├── avatar.py                    # The robot mood vocabulary (ResponseMood), the mood, setup, and plan frames, and the shared listening plan
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
 │   └── harness.py               # Wraps the RAG pipeline that still lives in `websocket/services/`
 │
+├── map_task/                    # The avatar as instruction follower (see its README)
 │   ├── harness.py               # Sends both maps out, reads each turn, replies through its route's pipeline, and moves the avatar
 │   ├── maps/                    # One map file per variant (both maps, drawn from data)
 │   ├── behaviors.py             # The avatar's setup, its map, and each reply's plan
 │   ├── cues.py                  # LandmarkGlance, DirectionGlance
 │   └── ...
 │
+└── cooperative_planning/        # Planning an event together, each side with private constraints
     ├── harness.py               # Opens the chat, answers each turn through the chosen pipeline, and keeps the card current
     ├── scenarios.py             # Loads and checks the scenario files (the format is in its docstring)
+    ├── scenarios/
     │   └── dinner_party.json    # A made-up test scenario: a starter, a main course, and a dessert
     ├── plan_state.py            # The plan, the rules for changing it, and the participant's card frame
     ├── response_models.py       # The proposed changes, each call's response, and the per-scenario schemas
     ├── prompts.py               # How to plan together, each call's task, the plan block, and the directives
     ├── pipelines.py             # track_then_reply, single_call, reply_then_track
     ├── planning_api.py          # PlanningAPI: one method per call, on the shared StructuredAPI
     ├── behaviors.py             # The avatar's setup, its card, and the plan for each named behavior
     ├── cues.py                  # ItemGlance, QuietNudge (with the shared BackToListening)
     └── config.py                # Request limits, each call's settings, the pipeline, and the cue timings
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
| `on_reply_saved(outcome)` | Called once that reply's exchange is saved. Enters `outcome.state`, unless it is `None` (then sends the listeners the new `monitor_view`), and tells the cues |
| `start()`, `stop()` | The connection is ready, or closing (`stop` stops every cue). A plan-driven harness sends its `avatar_setup` from `start()` |
| `request_turn()` | Asks for a reply of the harness's own (next section); `False` while another reply owns the turn |
| `turn_number` | Reply attempts so far, counted in `on_reply_started` (avatar plans carry it as their `turn`) |
| `monitor_view()` | What the admin listener's task panel shows about this chat now; `None` (the default) for a chat type without one (Monitoring, below) |
| `on_interim`, `on_final`, `on_reply_started`, `on_reply_cancelled`, `on_playback` | Turn events (next section), passed on to each cue |

`generate` runs inside the reply attempt. When newer speech arrives, any reply but
a `reply_now` one is cancelled at whatever `await` it has reached, and the staged
turn waits for the next attempt along with the new speech. So `generate` changes
nothing itself. It returns its effects in the outcome, and `ChatHandler` applies
them once the exchange is saved, so a cancelled reply leaves no trace.

`TurnAttempt` carries `context` (the conversation, ending with the staged user turn),
`user_text`, `trigger` (`"automatic"`, `"reply_now"`, or `"harness"`), and two
publishers that send right away unless newer speech has already cancelled the
reply: `publish_mood` (a `robot_action` emotion) and `publish_plan` (an avatar plan,
for a plan-driven chat type).

`ResponseOutcome` carries `message`, `state` (entered in `on_reply_saved`),
`pause_listening`, `close_after` (send `chat_ended` and close once the reply has
gone out), and `avatar_plan`: a plan sent just before the reply's `llm_response`, so
its reply moments mean this reply (`consumers/HARNESS_PROTOCOL.md` §4.1). A harness
may return a subclass of `ResponseOutcome` that carries more for its own
`on_reply_saved` (the planning harness's `PlanningOutcome`).

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

`cues.py` has two to build on, and one to use as is:

- **`KeywordCue`** fires `on_match(name, match)` once for each new occurrence of a
  pattern in `PATTERNS` (the `re.Match` holds what was said). Every interim repeats
  and revises the whole utterance so far, so it counts occurrences per utterance
  rather than firing on every interim, and a revision that drops a word and brings
  it back doesn't fire it twice. Set `ON = "final"` to react only to finals. Set
  `QUIET_WHILE_REPLYING` for a cue that sends plans: it then ignores words heard
  while a reply is prepared or played, and words first heard in a final (the reply
  starts right after one), because its plan would cut the reply's plan short.
- **`SilenceWatcher`** calls `on_silence(seconds)` as each of `THRESHOLDS_SEC`
  passes without speech on the user's turn. The clock starts when the reply's audio
  finishes and restarts from the end of newer speech. It stops while a reply is
  prepared or playing, and nothing fires while listening is paused.
- **`BackToListening`** lowers the held prop and frees the eyes when newer speech
  cancels a reply, for any chat type that sends plans.

**Harness turns.** A harness or cue that wants the avatar to speak first (a
re-prompt after a silence, an opening line) calls `self.harness.request_turn()` (the
consumer passes it to `ChatHandler.request_harness_turn`). That runs a normal reply
attempt with `trigger="harness"`: it answers any staged speech,
or speaks on its own when nothing is staged (`user_text` is `""` and only the reply
is saved). Newer speech cancels it like an automatic reply. It starts nothing while
another reply owns the turn, so the cue can ask again later.

The Map Task's `DirectionGlance` (`map_task/cues.py`) is a complete cue. It looks
from the avatar's spot toward a direction as soon as the user says it:

```python
# Look from the avatar's spot toward a direction as the user says it
class DirectionGlance(KeywordCue):
    harness              : MapTaskHarness
    PATTERNS             = MAP_TASK_SPOKEN_DIRECTIONS
    QUIET_WHILE_REPLYING = True

    # Look toward the direction just said, from where the avatar is now
    def on_match(self, name: str, match: re.Match[str]) -> None:
        self._looks += 1
        _send_plan(self.harness, direction_plan(self.harness.state.position, name, self._looks), "direction_glance")
```

The harness switches its cues on for one condition only, in its `__init__`:
`if self.with_cues: self.cues = [BackToListening(self), LandmarkGlance(self), DirectionGlance(self)]`.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Monitoring                                                                       -->
<!-- -------------------------------------------------------------------------------- -->
## Monitoring

A chat type with state worth watching returns it from `monitor_view()` as a JSON
object with a `kind` (its own chat type name). The admin listener gets it as a
`task_monitor` frame twice over: from `on_reply_saved` whenever a saved reply
changes the state (`ChatConsumer.broadcast_task_monitor`, to every listener), and
as each listener joins (the listener sends the primary connection a
`ws.listener_joined` event, and `ChatConsumer.ws_listener_joined` answers that
listener alone). The admin live chat page shows each kind it knows in its own tab
(`frontend/src/pages/admin/components/LiveSidePanel.tsx`). Only the listeners get
it: the participant's client never sees it.

The Map Task's view is both maps, where the avatar is, and every spot it has
stopped at (`map_task/harness.py`, and its README).

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
6. Add its modes, with its variants, to `frontend/src/pages/chat/chatModes.ts`, so the chat page can open it.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Still to Move                                                                    -->
<!-- -------------------------------------------------------------------------------- -->
## Still to move into this structure

The `activity` chat type wraps code written before harnesses existed. To finish
moving it:

- Move its modules here from `websocket/services/`: `ragChatHelpers.py`,
  `ragChatHelpersMultiAgent.py`, `utils/chatUtils.py`, `utils/jsonParsingUtils.py`,
  and `behavior/activity_chat_close.py`.
- `rag_state` advances while the pipeline generates, before the exchange is saved,
  so a cancelled reply can move the activity on by a turn the user never heard. The
  next state should come back in `ResponseOutcome.state` instead.
- The pipeline returns dicts (`text`, `close_after`, `close_session`, `_llm_log`)
  that `ActivityHarness` translates. It could return a `ResponseOutcome` itself.
- `handle_closing_turn` takes the whole consumer only to read `context_buffer`.
- It reaches the LLM through `services/llm/instructor_client.py` (`LLM_BASE_URL`,
  `LLM_GATEWAY_TOKEN`), while the other chat types use `services/llm/endpoint.py`
  (`IU_URL`, `IU_KEY`).
- The chat page reaches it through `ws/chat/activity/` (its "Memory activity"
  mode in `frontend/src/pages/chat/chatModes.ts`). Once that mode sends
  `chat_type` instead, the route can go, if no robot uses it.

Left as they are for now: the `taskType` and `taskSubtype` fields on `UserSettings`
and `ChatSession`, which the settings page's chat-type form sets. They are separate
from `chat_type`.
