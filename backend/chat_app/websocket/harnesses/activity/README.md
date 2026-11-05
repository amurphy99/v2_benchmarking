# Memory activity

The memory activity uses structured response plans, quoted goal evidence, and a
controlled closing workflow. The harness owns conversation state; the planner and
responder generate proposals without modifying the committed state.

The implementation roadmap and progress history are in
[ACTIVITY_PIPELINE_REFACTOR_PLAN.md](../../../../../ACTIVITY_PIPELINE_REFACTOR_PLAN.md).

## Responsibilities

| File | Responsibility |
|---|---|
| `harness.py` | Generate against a deep copy of connection state; adopt accepted state after saving |
| `pipeline.py` | Coordinate planner/responder calls, validate proposals, and prepare history and logs |
| `runtime.py` | Validate goal IDs, message roles, quotes, and transition eligibility |
| `state_specs.py` | Define required goals and minimum/maximum saved-reply counts |
| `repository.py` | Read ordered activity instructions directly from the main database |
| `history.py` | Group history, format conversations for summaries, and clean response text |
| `closing.py` | Handle summary offers, summary choices, final questions, and farewells |
| `../../agents/planner.py` | Define `PlannerMemory`, `ResponsePlan`, and the planner prompt/model call |
| `../../agents/responder.py` | Define the spoken-response prompt/model call |

The harness selects `memory_activity`. Clients use `chat_type=activity` or the
existing `ws/chat/activity/` route. State instructions come from the main database,
not semantic vector retrieval. Both agents receive their client/model through
constructor injection and use the existing configured IU-compatible clients.

## Conversation flow

1. The harness deep-copies `rag_state`, including nested history, goal progress,
   planner memory, counters, and closing flags.
2. On first normal generation, it loads the activity's ordered instructions and
   caches them for the connection. Each database state must have a `StateSpec`.
3. The planner receives the current state, goals, progress, recent context,
   saved-turn counts, current finalized user text, and working memory.
4. Its `ResponsePlan` proposes concrete reply guidance, quoted goal evidence,
   an exit reason/next state, and `updated_memory: PlannerMemory`.
5. The runtime validates evidence and selects an allowed transition or continued
   state. Normal progression follows database instruction order.
6. The responder answers for the current state using its instructions and the
   response plan. Both model calls are awaited sequentially.
7. The pipeline updates only the attempt-local copy. Accepted planner memory is
   stored in `rag_state["planner_memory"]` as a dictionary.
8. The shared chat pipeline saves the exchange, then invokes `on_reply_saved()`.
   The harness adopts the proposed state and schedules the turn log.

Cancellation before saving discards all proposed state changes. A saved reply can
still have its audio interrupted; persistence does not establish that the entire
reply was heard. Request failures are logged. Planner failure falls back to the
current instructions/goals; responder failure produces a clarification reply and
preserves the current state and prior goal progress.

## Goal evidence and transitions

Goals identify an actor: user or assistant. Evidence must reference a supplied
message ID, use the matching speaker, and contain a quote present in that message
when case and whitespace are normalized. Semantic fulfillment is still judged by
the planner; matching a substring alone does not prove a goal was achieved.

Assistant evidence refers to previously saved responses. A proposed response does
not satisfy a goal merely because it intends to perform the required action.
Assistant actions are therefore normally assessed on a later turn. Evidence IDs
such as `3:user` are local turn identifiers, not `ChatMessage` primary keys.

Counters count saved replies rather than generation attempts. A normal transition
requires satisfied goals, the minimum reply count, and a proposal for the allowed
successor. Explicit user exits require a supporting quote from the current user
text. Reaching a state's maximum reply count selects its ordered successor and
records unmet goals as skipped, with the reason `turn_limit`. Skipped goals are
not reported as satisfied.

## Closing

`close_session` is a virtual entry to the Python-controlled closing workflow; no
`end_conversation` database row is required. A transition to closing activates the
workflow for the following user turn. The closing helper receives explicit context
and the same attempt-local state copy used by normal generation.

The workflow offers a summary, handles acceptance/refusal, and optionally answers
a final question. Its flags become current only after the corresponding reply is
saved. The shared chat handler consumes `close_after` to send `chat_ended` and close
the socket after response delivery.

## Provisional testing settings and current limitations

These are current implementation choices and limits. Their presence does not
establish conversational quality or improved response latency.

- Goals and reply limits are manually authored Python data in `state_specs.py`.
  They are not generated from prose or stored as versioned database contracts.
  All declared goals are required; names must match the database.
- Goal wording and minimum/maximum reply counts are provisional testing settings.
  A saved clarification fallback increments the reply counter even though that
  failed response does not itself advance the state or apply planner progress.
- The planner runs before the responder. There is no interim-STT planner,
  shared request scheduler, serving-priority control, or reserved response capacity.
- The planner has a six-second outer deadline and 1,400 output tokens. The
  responder has twelve seconds and 256 tokens. These are provisional model-call
  budgets. Closing helpers retain their own existing client behavior.
- Agents share the configured model and existing Instructor/plain clients. They
  do not subclass `StructuredAPI` or a common agent base class.
- Evidence checks validate textual grounding and roles. They do not independently
  verify semantic quality, optional/conditional goals, or every recurring response
  obligation.
- Goal progress and history live in memory. Accepted turn snapshots are logged
  asynchronously in `LLMTurnLog.agents_data`; that is not a durable state store
  or reliable retry queue. Reconnection does not resume activity progress.
- `_history` and `_chat_state` coexist for closing-summary compatibility. Their
  deep-copy cost grows with the conversation.
- Instructions are cached for the connection. Admin edits do not refresh active
  sessions, and there is no definition revision/publication mechanism.
- Turn-limit progression does not check target-state entry prerequisites. It can
  skip topic selection and reach a topic-discussion state without a chosen topic.
- Closing begins on another user turn. An explicit end request can still receive
  a current-state response before the closing offer. Complete-audio delivery is
  separate from state commitment.

## Run tests in Docker

Start Docker Desktop and run commands from the repository's `backend/` directory.
The Dockerfile uses Python 3.11 and the backend service mounts this source at `/app`.
Build if the image is missing or dependencies changed:

```bash
docker compose -f docker-compose.backend.yaml build backend
```

The test database is built from migration files, so those files must describe the
current models. To inspect pending model changes without writing migrations:

```bash
docker compose -f docker-compose.backend.yaml run --rm \
  -e USE_LLM=false \
  -e POSTGRES_HOST=db -e POSTGRES_PORT=5432 \
  -e VECTOR_DB_HOST=db_vector -e VECTOR_DB_PORT=5432 \
  backend python manage.py makemigrations chat_app --check --dry-run
```

A nonzero exit with a proposed migration means the migration history is behind
models. Generate the missing migration, inspect it, then rerun tests:

```bash
docker compose -f docker-compose.backend.yaml run --rm \
  -e USE_LLM=false \
  -e POSTGRES_HOST=db -e POSTGRES_PORT=5432 \
  -e VECTOR_DB_HOST=db_vector -e VECTOR_DB_PORT=5432 \
  backend python manage.py makemigrations chat_app --name sync_current_models
```

This command writes a migration through the source mount; it does not apply it to
the application database. Migration files need deliberate version control; the
current root `.gitignore` excludes the chat app's migration directory.

Run the focused suite in a disposable backend container:

```bash
docker compose -f docker-compose.backend.yaml run --rm \
  -e USE_LLM=false \
  -e POSTGRES_HOST=db -e POSTGRES_PORT=5432 \
  -e VECTOR_DB_HOST=db_vector -e VECTOR_DB_PORT=5432 \
  backend python manage.py test \
  chat_app.websocket.tests.test_activity_pipeline \
  chat_app.websocket.tests.test_chat_types \
  chat_app.websocket.tests.test_harness_hooks \
  --verbosity 2
```

Compose starts database dependencies. Host overrides select the Compose databases;
other required settings come from the existing `.env`. The database user needs
permission to create Django's `test_...` database. The runner creates and migrates
that test database; applying migrations to the regular application database is not
required merely to run the suite. It may ask to replace an existing test database
left by a failed setup; confirm its test-database name before accepting.

`run` overrides normal backend startup, so it does not execute the startup command
that generates migrations, seeds demo data, and starts Daphne. `--rm` removes the
disposable test container; database services remain running. Code-only changes
are visible through the source mount and do not require rebuilding the image.

A missing-column error during test database creation means schema setup failed
before test assertions ran. If a field exists in models but no migration adds it,
generate the missing migration instead of bypassing serialization or faking it.
A later cursor error in that traceback can be secondary to the failed SQL query.

For only the activity module, omit the other two test labels. Tests mock model
operations; `USE_LLM=false` does not verify real IU model outputs. See
[Docker's run reference](https://docs.docker.com/reference/cli/docker/compose/run/)
and [Django's migration documentation](https://docs.djangoproject.com/en/3.2/topics/migrations/).
