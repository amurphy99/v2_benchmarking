# Speech System // Chat Types <br> `backend/chat_app/websocket/harnesses/..`

A **harness** holds everything one chat type does differently from the others: how
it replies, the dialogue state it keeps, and its own prompts and LLM calls. The
chat consumer builds one harness per connection, and `ChatHandler` asks it for
every reply, so the shared pipeline (`consumers/`, `services/chatHelpers.py`, the
STT provider) never checks which chat type it is running.

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
| `activity` | The memory activity: its RAG pipeline and closing flow | none | none |

```diff
+harnesses/
 ├── base.py                      # ChatHarness, TurnAttempt, ResponseOutcome, and the reply types
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
+└── activity/
     └── harness.py               # Wraps the RAG pipeline that still lives in `websocket/services/`
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
| `generate(attempt)` | Required. Returns one `ResponseOutcome` for the staged user turn |
| `committed(outcome)` | Called once that reply's exchange is saved. Enters `outcome.state`, unless it is `None` |

`generate` runs inside the reply attempt. When newer speech arrives, an automatic
reply is cancelled at whatever `await` it has reached (a `reply_now` reply is not),
and the staged turn waits for the next attempt along with the new speech. So
`generate` changes nothing itself. It returns its effects in the outcome, and
`ChatHandler` applies them once the exchange is saved, so a cancelled reply leaves
no trace.

`TurnAttempt` carries `context` (the conversation, ending with the staged user turn),
`user_text`, `trigger` (`"automatic"` or `"reply_now"`), and `publish_mood`, which
sends a `robot_action` emotion right away unless newer speech has already cancelled
the reply.

`ResponseOutcome` carries `message`, `state` (entered in `committed`),
`pause_listening`, and `close_after` (send `chat_ended` and close once the reply has
gone out).

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Adding a Chat Type                                                               -->
<!-- -------------------------------------------------------------------------------- -->
## Adding a chat type

1. Make a folder here named after it, with a `harness.py` whose class subclasses `ChatHarness`.
2. Put everything only it uses in that folder: prompts, response models, API clients, and task data such as maps or scenarios.
3. List its conditions and variants in `CONDITIONS` and `VARIANTS`.
4. Add it to `CHAT_TYPES` in `registry.py`.
5. Add its name to `CLIENT_PROTOCOL.md` §1 and to the table above.

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
- The chat page reaches it through `ws/chat/activity/` (`chatMode` in
  `frontend/src/pages/chat/Chat.tsx`). Once the page sends `chat_type`, that route
  can go, if no robot uses it.

Left as they are for now: the `taskType` and `taskSubtype` fields on `UserSettings`
and `ChatSession`, which the settings page's chat-type form sets. They are separate
from `chat_type`.
