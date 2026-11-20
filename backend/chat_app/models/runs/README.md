# Speech System // Task Chat Runs <br> `backend/chat_app/models/runs/..`

A **task chat** (the Map Task, cooperative planning, or speech elicitation) records how it
was run in a `ChatRun` beside its `ChatSession`: the condition and task version it ran
with, and the setup it started with (the avatar, whether subtitles were on, and the
language). Its `TaskSnapshot` holds the task's own record: its private materials and its
last committed state. Other chats have neither. This folder is also where models about a
run go, such as post-chat questionnaires.

For the models as a whole, how they relate, and how to change them, see
[`../README.md`](../README.md). For the chat types themselves, see
`websocket/harnesses/README.md`.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Files                                                                            -->
<!-- -------------------------------------------------------------------------------- -->
## Files

```diff
backend/chat_app/models/runs/
 ├── README.md      # This file
 ├── __init__.py    # Empty: `models/__init__.py` imports the run models
+└── run.py         # ChatRun and TaskSnapshot
```

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- The Models                                                                       -->
<!-- -------------------------------------------------------------------------------- -->
## The models

**`ChatRun`**: how one task chat was run.

| Field | Type | Meaning |
|---|---|---|
| `session` | One-to-one `ChatSession` (`related_name="run"`), cascade | The chat it belongs to |
| `condition` | `CharField(32)`, default `""` | The cue set it ran (`cues` or `no_cues`); `""` for a chat type with none |
| `variant` | `CharField(32)`, default `""` | Its task content: a map (`demo`, `hcrc_1`, ...), a planning scenario, or an elicitation topic |
| `avatar` | `CharField(32)`, choices `AVATAR_CHOICES`, default `""` | The avatar the client showed (`smiley`, `smiley-brows`, `robot`, `qt`, or `buddy`); `""` when not recorded |
| `subtitles` | `BooleanField(null=True)`, default `None` | Whether subtitles were on when the chat started (a debug-mode switch later on isn't counted); `None` when not recorded |
| `language` | `CharField(16)`, choices `Profile.LANGUAGE_CHOICES`, default `""` | The account's `Profile.language` when the chat started; `""` on runs from before it was recorded |

The client sends the avatar and subtitles when it connects (`CLIENT_PROTOCOL.md` §1, Step 5),
and a client that leaves one out (the robots do) leaves it unrecorded. `AVATAR_CHOICES` is the
avatars the web chat page can show: `AVATARS` in
`frontend/src/pages/common/avatar/avatarRegistry.tsx` copies it, and a new avatar goes in
both, because the consumer refuses a chat that names an avatar off the list.

**`TaskSnapshot`**: the task's own record, in a table of its own so that the chat lists,
which join each chat's run, never load it.

| Field | Type | Meaning |
|---|---|---|
| `run` | One-to-one `ChatRun` (`related_name="task_snapshot"`), cascade | The run it belongs to |
| `data` | `JSONField` | The harness's `history_view()`: the task's materials and its last committed state |

Deleting a chat deletes its run and its snapshot.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Which Chats Have a Run                                                           -->
<!-- -------------------------------------------------------------------------------- -->
## Which chats have a run

`ChatService.get_or_create_active_session` (`services/db_services.py`) creates a run when
the connection's condition or variant is non-empty. Today that is exactly the three task
chat types, whose harnesses define `CONDITIONS` and `VARIANTS`
(`websocket/harnesses/README.md` lists them).

Open conversation (`unguided`), `active_listening`, the memory `activity`, robot chats, and
sessions from before chat types were recorded have no run. For them,
`ChatSession.run_or_none` is `None`, and code must treat that as normal, not as an error.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Lifecycle                                                                        -->
<!-- -------------------------------------------------------------------------------- -->
## Lifecycle

1. **The chat connects.** `ChatConsumer.connect` checks the `avatar` and `subtitles` query
   parameters (refusing a value off their lists with `4005`), then calls
   `get_or_create_active_session(user, source=..., chat_type=harness.NAME,
   condition=harness.condition, variant=harness.variant, avatar=..., subtitles=...)`, which
   creates the session and its run in one transaction, taking the run's `language` from the
   profile. An active session is reused only when it ran the same thing: the lookup goes
   through the run, locking only the session row (`select_for_update(of=("self",))`). A reused
   session keeps the setup it started with.
2. **Before the harness starts**, the consumer saves `harness.history_view()` through
   `ChatService.save_task_snapshot`, which creates the snapshot with the task's materials.
3. **Each saved reply** carries `ResponseOutcome.task_snapshot`, which `add_message` or
   `add_exchange` saves in the same transaction as the reply's messages (an
   `update_or_create` on the run's snapshot). A reply cancelled by newer speech is never
   saved, so the snapshot never records a decision or a move the participant didn't hear.
4. **Planning's `reply_then_track` pipeline** saves the snapshot once more when its tracking
   finishes, after the reply was saved (`_track_after_reply`).
5. **Nothing else writes a run.** Its condition, variant, and setup never change after the
   chat connects, and the snapshot changes only through `save_task_snapshot`.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Reading Runs                                                                     -->
<!-- -------------------------------------------------------------------------------- -->
## Reading runs

* **In Python:** `session.run_or_none`, which is `None` without a run. `select_related("run")`
  wherever sessions are read in bulk (the list views do), and wherever async code will read
  the run (`ChatService.get_session_info` does, for the admin listener's `session_info`).
* **In the REST API:** a session's JSON keeps `condition` and `variant` flat, as `""` for a
  chat without a run (`ChatSessionSummarySerializer.get_condition` and `get_variant`). They
  stay flat to match the frontend's `ChatRun` type
  (`frontend/src/pages/admin/components/chat_lists/chatRunFilter.ts`), which the REST sessions
  share with the admin listener's `session_info` frame, whose fields must not change without
  a protocol decision (`websocket/consumers/CLIENT_PROTOCOL.md`).
* **One chat's setup:** a single chat's JSON (`ChatSessionSerializer`) also carries the run's
  `avatar`, `subtitles`, and `language` (`""`, `null`, and `""` without a run). The lists leave
  them out. The admin chat history and task details pages show them as pills under the
  header's meta line (`SessionHeader`), each one only once recorded.
* **In the list's filters:** `?condition=` and `?variant=` go through the run
  (`SESSION_RUN_FIELDS` in `api/views.py`), and `""` matches chats without one.
* **In the task history:** `GET /api/chatsession/<id>/task-history/` (staff and linked
  caregivers only; `SessionTaskHistoryView` and `services/session_task_history.py`) returns:

  | The chat has | Response |
  |---|---|
  | A run with a snapshot | `{"recorded": true, "view": <the snapshot>}` |
  | A run without a snapshot (an older chat) | `{"recorded": false, "view": <its variant's current materials, with no results>}` |
  | No run | `{"recorded": false, "view": null}` |

* **Never in a session serializer:** the snapshot holds the avatar's private constraints
  and the follower's map, which participants must not see. The task history endpoint is the
  only thing that returns it.
* **In the Django admin:** the chat list shows the run's condition and variant and can filter
  on them, and each chat's page shows its run, with its setup.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- The Task Snapshot                                                                -->
<!-- -------------------------------------------------------------------------------- -->
## The task snapshot

Each chat type's `history_view()` writes it, and its `kind` names the chat type. What each
one holds is described in `websocket/harnesses/README.md` § Completed task history, which is
the authoritative list. In short:

| `kind` | Holds |
|---|---|
| `map_task` | Both maps, the follower's full path, each saved reply (its `route`, `act`, and waypoints), the intro's record, and how the task ended |
| `cooperative_planning` | The scenario, both sides' constraints, agreements, suggestions, and refusals (with who made each), the avatar's mentioned constraints, the stage, and the intro's record |
| `speech_elicitation` | The topic (its opening question and fresh angles), every thread with what each reply on it did, and whether the participant wanted to stop |

It is the final state, not a replayable sequence of events. A field added to a chat type's
snapshot later is absent from the snapshots saved before it.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Migration History                                                                -->
<!-- -------------------------------------------------------------------------------- -->
## Migration history

* **`0006_chat_run`** created both models, then copied `condition`, `variant`, and
  `task_snapshot` off `ChatSession` and dropped those columns. Any session that had recorded
  any of the three got a run. The migration is reversible, and it was checked forward and
  back against a copy of a real database: every session's values matched.
* **`0007_chat_run_setup`** added `avatar`, `subtitles`, and `language`. Runs from before it
  have none of them recorded (`""`, `None`, and `""`); nothing was backfilled, since nothing
  had saved them.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Adding to a Run                                                                  -->
<!-- -------------------------------------------------------------------------------- -->
## Adding to a run

* **Keep `ChatRun` small.** Every chat list joins it, so each new column is loaded for every
  listed chat. Anything large or rarely read gets its own model linked to the run, the way
  `TaskSnapshot` does.
* **A new field on `ChatRun`** needs all of these:
  1. the field, and its migration, with a `default` for the existing rows;
  2. where it is set, in `get_or_create_active_session`;
  3. the serializer that shows it (the summary serializer only if lists show it) and
     `frontend/src/api/models.ts`;
  4. `admin.py`;
  5. tests in `chat_app/tests/test_session_task_history.py` (`ChatRunRecordingTests`).

  Decide what a chat without a run shows: string fields are `""` in the API today.
* **New models about a run** (questionnaires, per-task records) go in this folder. Link them
  to `ChatRun` with a one-to-one or a foreign key, and import them in `models/__init__.py`.

**Planned:**

* Post-chat questionnaire answers, as their own model linked to `ChatRun`.
* Per-chat-type models, if a task's data ever needs querying across chats (the snapshot's
  JSON serves the single-chat views).

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Tests                                                                            -->
<!-- -------------------------------------------------------------------------------- -->
## Tests

| File | Covers |
|---|---|
| `chat_app/tests/test_session_task_history.py` | A run recorded when a task chat connects, with its starting setup and the profile's language (and none for other chats), snapshots saved with each exchange, and the task history's access rules and fallbacks |
| `chat_app/tests/test_chat_session_filters.py` | The list's run fields and filters (`""` matches chats without a run), and one chat's starting setup, which the list leaves out |
| `chat_app/websocket/tests/test_chat_types.py` | An `avatar` or `subtitles` value off its list refused with `4005` before a session exists |
