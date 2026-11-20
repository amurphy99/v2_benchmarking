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

The participant chat page picks the chat type, the variant, and cues on or off
(`cues` / `no_cues`) in its configure-chat modal (`frontend/src/pages/chat/chatModes.ts`,
which copies each chat type's `VARIANTS`). It offers `unguided`, `cooperative_planning`,
`map_task`, and `speech_elicitation`.

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
| `cooperative_planning` | The user and the avatar work out a plan together, each with a brief (who they are) and private constraints; the participant's card fills in as items are agreed | `cues`, `no_cues` | `dinner_party`, `day_trip`, `birthday_party`, `movie_night`, `hotel_room`, `weekend_activity`, `club_event`, `house_party`, `apartment_hunt`, `camping_trip`, `flight_rebooking` |
| `speech_elicitation` | The avatar opens with one light question and keeps the user talking: every reply reacts to what they said, digs into their answer before moving on, and ends with another question. With cues it gives audible signs of listening ("mm-hm") when the user pauses, holds a reply while they seem mid-thought, and asks about a likely misheard word. Nothing to finish; the participant ends the chat | `cues`, `no_cues` | `pet_person`, `mountains_or_beaches`, `retirement_spot` |

`map_task`, `cooperative_planning`, and `speech_elicitation` use cues and drive the
avatar with plans (`consumers/HARNESS_PROTOCOL.md`); the first two also show the
participant their task materials (`task_card`). With cues, all three give signs of
listening at the user's pauses and check each reply before it goes out (Shared
features, below). The others send `robot_action` moods. `map_task` also gives the admin
live chat page a view of its state (Monitoring, below), and all three show the participant
something once the chat ends: the avatar's side of the task, or the threads it followed
(The end of a chat, below).

```diff
+harnesses/
 ├── base.py                      # ChatHarness, Cue, the turn events, TurnAttempt, ResponseOutcome
 ├── cues.py                      # Shared cues: KeywordCue and SilenceWatcher to build on, and BackToListening as is
 ├── registry.py                  # chat_type names -> harnesses, the default, and the condition/variant checks
 ├── avatar.py                    # The robot mood vocabulary (ResponseMood), the mood, setup, and plan frames, a setup's sounds, and the shared listening plan
 │
+├── features/                    # Behaviors several chat types share, each opted into by a chat type (Shared features, below)
 │   ├── config.py                # Each feature's switch: the conditions it runs in
+│   ├── backchannels/            # Signs of listening at the user's pauses, styled by each chat type
 │   │   ├── cue.py               # Backchannels, and the movements and sounds its signs are made of
 │   │   └── config.py            # The pause, word count, gap, and volume a chat type can override
+│   └── reply_gate/              # The check before each reply to finished speech: let it out, hold it, or ask about a word
 │       ├── gate.py              # ReplyGate, and the checks a chat type picks (TurnEndCheck, MisheardCheck)
 │       ├── prompts.py           # What each check looks for, and every field its response fills in
 │       ├── response_models.py   # The verdict (reply, wait, or clarify), built per chat type from the checks switched on
 │       ├── reply_check_api.py   # ReplyCheckAPI: the one check call, on the shared StructuredAPI
 │       └── config.py            # The check call's settings, and how much of the conversation it reads
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
 │   ├── behaviors.py             # The avatar's setup, its map, each reply's plan, and its signs of listening
 │   ├── cues.py                  # LandmarkGlance, DirectionGlance, MapTaskBackchannels
 │   └── ...
 │
+├── cooperative_planning/        # Working out a plan together, each side with a brief and private constraints
 │   ├── harness.py               # Opens the chat, answers each turn through the chosen pipeline, and keeps the card current
 │   ├── scenarios.py             # Loads and checks the scenario files (the format is in its docstring)
+│   ├── scenarios/
 │   │   ├── dinner_party.json    # A made-up test scenario: a starter, a main course, and a dessert
 │   │   ├── day_trip.json        # A destination, transportation, and lunch, when neither side can drive
 │   │   ├── birthday_party.json  # A place, an activity, and a gift for a friend both sides know
 │   │   ├── movie_night.json     # A movie, a snack, and a day that fits both sides' week
 │   │   ├── hotel_room.json      # A guest and the receptionist: a new room, when to move, and compensation
 │   │   ├── weekend_activity.json # An activity, and when and where to meet
 │   │   ├── club_event.json      # Two college students: a theme, volunteer roles, and an invitation
 │   │   ├── house_party.json     # Snacks and drinks, music, and an activity
 │   │   ├── apartment_hunt.json  # Three apartments: each side's favorite is ruled out by what the other knows
 │   │   ├── camping_trip.json    # Three campsites, and the one left changes what dinner can be
 │   │   └── flight_rebooking.json # A traveler and an airline agent who holds the three flights
 │   ├── plan_state.py            # The plan, the rules for changing it, and the participant's card frame
 │   ├── response_models.py       # The proposed changes, each call's response, and the per-scenario schemas
 │   ├── prompts.py               # How to plan together, each call's task, the plan block, the directives, and its notes for the reply check
 │   ├── pipelines.py             # track_then_reply, single_call, reply_then_track
 │   ├── planning_api.py          # PlanningAPI: one method per call, on the shared StructuredAPI
 │   ├── behaviors.py             # The avatar's setup, its card, the plan for each named behavior, and its signs of listening
 │   ├── cues.py                  # ItemGlance, QuietNudge, PlanningBackchannels (with the shared BackToListening)
 │   └── config.py                # Request limits, each call's settings and the reply check's hold, the pipeline, and the cue timings
 │
+└── speech_elicitation/          # One light question, then keep the user talking
     ├── harness.py               # Opens with the topic's question, and answers each turn with one call through the reply gate
     ├── topics.py                # One topic per variant: the opening question and fresh angles for it
     ├── response_models.py       # The reply: its move, its behavior, and words that must end with a question
     ├── prompts.py               # How to keep the user talking, the task, the directives, and its notes for the reply check
     ├── elicitation_api.py       # ElicitationAPI: the one reply call, on the shared StructuredAPI
     ├── behaviors.py             # The avatar's setup and listening sounds, the plan for each named behavior, and the signs of listening
     ├── cues.py                  # ElicitationBackchannels (with cues), QuietPrompt (both conditions)
     └── config.py                # Request limits, the reply call's settings and hold, how deep a thread goes, and the cue timings
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
| `features` | The shared features this chat type uses, by name (`{}` for none); the `set_feature` command switches each one's `on` (Shared features, below) |
| `generate(attempt)` | Required. Returns one `ResponseOutcome` for the staged user turn |
| `on_reply_saved(outcome)` | Called once that reply's exchange is saved. Enters `outcome.state`, unless it is `None` (then sends the listeners the new `monitor_view`), and tells the cues |
| `start()`, `stop()` | The connection is ready, or closing (`stop` stops every cue). A plan-driven harness sends its `avatar_setup` from `start()` |
| `request_turn()` | Asks for a reply of the harness's own (next section); `False` while another reply owns the turn |
| `turn_number` | Reply attempts so far, counted in `on_reply_started` (avatar plans carry it as their `turn`) |
| `history_view()` | Private task materials and current state for the initial session snapshot; `None` for chat types without archived materials |
| `monitor_view()` | What the admin listener's task panel shows about this chat now; `None` (the default) for a chat type without one (Monitoring, below) |
| `reveal_view()` | What the participant's client is shown about the task once the chat ends (`task_reveal`); `None` (the default) for a chat type with nothing to show (The end of a chat, below) |
| `on_interim`, `on_final`, `on_reply_started`, `on_reply_cancelled`, `on_playback` | Turn events (next section), passed on to each cue |

`generate` runs inside the reply attempt. When newer speech arrives, any reply but
a `reply_now` one is cancelled at whatever `await` it has reached, and the staged
turn waits for the next attempt along with the new speech. So `generate` changes
nothing itself. It returns its effects in the outcome, and `ChatHandler` applies
them once the exchange is saved, so a cancelled reply leaves no trace.

`ChatHandler` times every attempt (`services/reply_timing.py`). Each model call made
through the shared LLM clients, and the reply gate's hold, is timed as a step of the
reply wherever it runs (`chat_app/services/step_timing.py`), so a chat type gets its
calls into the reply's timing without doing anything. Code that makes a slow step of
its own can time it the same way, with `timed_step(label)`.

`TurnAttempt` carries `context` (the conversation, ending with the staged user turn),
`user_text`, `trigger` (`"automatic"`, `"reply_now"`, or `"harness"`), and two
publishers that send right away unless newer speech has already cancelled the
reply: `publish_mood` (a `robot_action` emotion) and `publish_plan` (an avatar plan,
for a plan-driven chat type).

`ResponseOutcome` carries `message`, `state` (entered in `on_reply_saved`),
`task_snapshot` (private materials and proposed state, saved in the same transaction as the reply),
`pause_listening`, `close_after` (end the chat once the reply has gone out: The end of
a chat, below), and `avatar_plan`: a plan sent just before the reply's `llm_response`, so
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
`if self.with_cues: self.cues += [BackToListening(self), LandmarkGlance(self), DirectionGlance(self)]`.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Shared Features                                                                  -->
<!-- -------------------------------------------------------------------------------- -->
## Shared features

A **feature** is a behavior several chat types share. Each one has a folder of its
own in `features/`, with its settings in that folder's `config.py`, and each chat
type that wants it opts in with its own sounds, prompt notes, or timings. A
feature runs only in the conditions its switch in `features/config.py` lists
(`cues` for now), so one switch turns it off (or on) for every chat type at once.
Each connection copies its switch into the feature's `on`. A chat type lists the
features it uses by name in `self.features`, and the `set_feature` command (from
the chat page in debug mode, or the admin page) flips one partway through a chat;
the control state reports them all (`CLIENT_PROTOCOL.md` §2.3 and §3.6), and each
reply's timing records which were on.

| Feature | Switch | Used by |
|---|---|---|
| Signs of listening at pauses (`backchannels/`) | `FEATURE_BACKCHANNELS_CONDITIONS` | `map_task`, `cooperative_planning`, `speech_elicitation` |
| Holding a reply while the user seems mid-thought (`reply_gate/`, `TurnEndCheck`) | `FEATURE_TURN_END_CONDITIONS` | `map_task`, `cooperative_planning`, `speech_elicitation` |
| Asking about a likely misheard word instead of replying (`reply_gate/`, `MisheardCheck`) | `FEATURE_MISHEARD_CONDITIONS` | `map_task`, `cooperative_planning`, `speech_elicitation` |

**Signs of listening.** `Backchannels` is a `SilenceWatcher` that gives a sign (a
nod or a tilt of the head, often with a short sound in the avatar's own voice)
when the user pauses partway through an utterance of a few words, at most one
every few seconds. A chat type subclasses it with its `SOUNDS`, which its setup
carries in either condition (`sounds()`, so the signs can be switched on partway
through), its `SIGNS`, which take turns, and the `GESTURES` the reply check may
pair with a sound. `map_task` and `cooperative_planning` keep theirs
neutral (nods, a tilt, and "mm-hm", with no smile), since "yeah", "right", or a
smile there could sound like an answer.

**The reply gate.** A chat type's `generate` hands its reply to `ReplyGate.run`.
For a reply to finished speech (an automatic one), one short LLM call, the reply
check, starts at the same moment as the reply, and its verdict decides what
happens:

| Verdict | What happens |
|---|---|
| `reply` | The reply goes out as usual. When the check read through an obvious slip ("watching the dishes"), it logs the words the user most likely said (`likely_said`) |
| `wait` | The user seems mid-thought. The avatar gives the sign the check picked (one of the chat type's sounds, and a gesture), and the reply is held for the chat type's hold. Newer speech cancels the attempt, as it cancels any automatic reply, and the staged words are answered with the rest of the turn. If the user stays quiet, the reply (worked on meanwhile) goes out when the hold ends |
| `clarify` | A likely misheard word hides what the user meant. The reply is dropped, and the avatar asks the check's question instead ("Sorry, did you say 'tad person'?") |

The reply's own plans (its thinking look) wait for the verdict, so the avatar
keeps listening while the check runs. The verdict is a union told apart by
`next_step`, built per chat type with only the steps of the checks switched on.
`reply_now` replies and harness turns skip the check. A check that fails lets
the reply go out as usual (a specified fallback; the failure is logged once).

Each chat type adds its own notes to a check's prompt (`TurnEndCheck(self, notes)`,
in its `prompts.py`) and sets its own hold (in its `config.py`):

| Chat type | Hold | What its notes add |
|---|---|---|
| `speech_elicitation` | 2.5 s | A pause partway through a story or an explanation is not its end |
| `map_task` | 2.0 s | A direction that breaks off before where it stops isn't finished. The misheard check gets every landmark name on either map, asks about a near-miss name even when it is easy to guess (the turn is read in code, which only knows exact names), and never treats a name the avatar's map lacks as misheard |
| `cooperative_planning` | 2.0 s | A list of options or a proposal that breaks off isn't finished. The misheard check gets what is being planned and its items |

Verdicts are only logged for now; the research event log will record them once
it exists. The check's call and any hold show in the reply's timing
(`ChatMessage.timing`, `services/reply_timing.py`).

A chat type opts in much as it builds its cues:

```python
self.backchannels = ElicitationBackchannels(self)
self.cues         = [QuietPrompt(self), self.backchannels]
self.reply_gate   = ReplyGate(self, checks=(TurnEndCheck(self, ELICITATION_TURN_END_NOTES), MisheardCheck(self)), backchannels=self.backchannels, hold_sec=ELICITATION_HOLD_SEC)
self.features     = {feature.NAME: feature for feature in (self.backchannels, *self.reply_gate.checks)}

# In generate, after any scripted turns (`_reply` is the chat type's own reply, `_clarify` its outcome for a question)
return await self.reply_gate.run(attempt, self._reply, self._clarify)
```

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

The Map Task's view is both maps, where the avatar is, every spot it has
stopped at, and each saved reply (`map_task/harness.py`, and its README).

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- The End of a Chat                                                                -->
<!-- -------------------------------------------------------------------------------- -->
## The end of a chat

A chat ends normally in one of two ways: the client sends `end_chat`, or a reply's
`close_after` ends it once the reply has gone out. Both go through
`ChatConsumer.end_chat`, which sends the harness's `reveal_view()` (when it returns one) as a
`task_reveal` frame, then `chat_ended` after a `close_after` reply, then closes the socket
with code `1000`; `disconnect` does the rest. A failure to build or send those frames is
logged, and the socket still closes.

The reveal is what the participant is shown once the chat is over, so their page can keep the
task on screen and fill in what they couldn't see (`consumers/HARNESS_PROTOCOL.md` §14):

| Chat type | Its reveal |
|---|---|
| `map_task` | The avatar's map, and the path it took |
| `cooperative_planning` | The avatar's brief and constraints, each marked if it mentioned it |
| `speech_elicitation` | Every thread: the question that opened it, and what each reply on it did |

It goes only to the participant's own client, and only as the chat ends. The completed task
history (below) stays private to staff and linked caregivers.

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


<!-- -------------------------------------------------------------------------------- -->
<!-- Completed Task History                                                           -->
<!-- -------------------------------------------------------------------------------- -->
## Completed task history

`ChatSession.task_snapshot` holds the task materials and last committed state. The consumer
stores `history_view()` before the harness starts, and each task reply carries its proposed
snapshot in `ResponseOutcome.task_snapshot`. Saving the exchange also saves that snapshot,
so a failed commit or cancelled generation cannot archive an uncommitted decision or move.
The planning harness also awaits a snapshot write when `reply_then_track` finishes tracking.

Map Task snapshots include both maps, the follower's full path, and each saved reply: the
kind of turn it answered (`route`), what it did (`act`), and the waypoints it added. Planning
snapshots include the scenario, both sides' constraints, agreements (with the side that first
suggested each), pending choices, suggestions, refusals (with who suggested each), every
choice either side put forward, the avatar's constraints it mentioned, and the approval stage.
Speech elicitation snapshots include the topic (its opening question and fresh angles), every
thread with what each reply on it did, how many questions asked about a misheard word, and
whether the participant said they wanted to stop. This is the final state, not a replayable
sequence of task events.

Staff and linked caregivers read `/api/chatsession/<id>/task-history/`; participants cannot
read this private view, and it is not in the ordinary session serializer. The response is
`{recorded, view}`. When `recorded` is false, an older session may identify the current
materials for its registered variant, but its results (path and replies, decisions, or
threads) remain unknown. The admin task details page labels these as current materials, never
as an archived outcome. Fields added to a snapshot later are absent from the ones saved before.

Staff open a task chat's history from its completed-chat page, through a button styled like its
chat type, on the task details page (`frontend/src/pages/admin/AdminTaskDetails.tsx`). Each
chat type has its own view (`frontend/src/pages/admin/components/task_details/`):

| Chat type | What its task details show |
|---|---|
| `map_task` | How far from the finish the avatar stopped, its path's length against the route, the turns by kind and the replies by act, both maps as one, and each map with what differs |
| `cooperative_planning` | The items agreed, each side's ideas and turned-down ones, the avatar's constraints it mentioned, both sides' materials, and each decision with who suggested what |
| `speech_elicitation` | The threads and follow-ups, the participant's average answer, the held replies (from each reply's saved timing), the replies by kind, each thread, and the topic |
