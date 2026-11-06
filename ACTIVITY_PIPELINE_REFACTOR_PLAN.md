# Activity Pipeline Refactor Plan

Last updated: November 5, 2026.

## Status and next priorities

Stages 1–2 are implemented. The repository owner reports that the focused Docker
suite completed with OK results; the final summary has not been independently
reviewed. Real-model conversation quality and latency remain to be evaluated.

| Stage | Feature | Status |
|---|---|---|
| 1 | Safe state commits and controlled closing | Implemented |
| 2 | Structured goals, evidence, plans, and reply limits | Implemented; conversation tuning remains |
| 3 | Response-priority scheduling and background planning | Next development stage |
| 4 | Reusable, versioned activity definitions | Planned |
| 5 | State-specification compiler and admin tools | Planned |
| 6 | Persistent participant memories and embedding migration | Planned |
| 7 | Activity switching within a session | Planned |

Next priorities:

1. Try representative memory conversations and review goal completion, repeated
   questions, timeout exits, and closing behavior using the real model.
2. Capture a baseline for response latency and planner cost.
3. Design the shared request scheduler and finalized-turn background planner.

Detailed test meanings belong in
[test_activity_pipeline.py](backend/chat_app/websocket/tests/test_activity_pipeline.py).
Runtime behavior, provisional settings, limitations, and Docker commands belong in
[the activity README](backend/chat_app/websocket/harnesses/activity/README.md).

## Stage 1 — Safe state commits and closing

**Implemented:** Activity generation runs against a deep copy of state. Histories,
planner memory, goals, counters, and closing flags become current only after the
exchange is saved. Closing receives explicit context/state, and the old RAG helpers
and inactive activity consumer have been removed or relocated.

**Follow-up:** Evaluate interruption and closing in actual conversations,
particularly a final reply interrupted during audio playback. Closing currently
starts on the next user turn after the closing decision.

## Stage 2 — Structured conversation control

**Implemented:** Separate planner/responder classes and prompts; typed
`ResponsePlan` and `PlannerMemory`; actor-specific goals with quoted evidence;
minimum/maximum saved-reply counts; explicit transition and skipped-goal reasons;
and role-based planner/responder metrics.

**Follow-up:** Tune goal wording and reply limits. Review repeated questions,
complete topic-option presentation, service-error replies consuming turn budgets,
and timeout exits that enter a discussion without a selected topic. Quote matching
establishes textual grounding; semantic goal fulfillment still depends on the model.

## Stage 3 — Response-priority scheduling and background planning

**Goal:** Start live responses without waiting for a fresh planner call.

- Add shared request admission: live responses first, speculative planning next,
  offline processing last. Bound background work and preserve fairness.
- Introduce background planning from finalized observations before using interim
  STT. Responses consume the latest compatible completed plan, with a current-state
  fallback when no suitable plan exists.
- Add debounced interim planning with one replaceable observation per session.
  Version results against transcript/state/activity revisions and reject stale work.
- Keep interim conclusions provisional; they cannot advance committed state.
- Verify IU serving priorities and cancellation support. Deferring queued work
  does not pause running inference; assess reserved capacity or separate deployments.
- Evaluate latency, quality, cost, and concurrency against the sequential baseline.

## Stage 4 — Reusable, versioned activity definitions

**Goal:** Compose activities from shared state definitions with independent progress.

- Add state revisions, activity versions/bindings, explicit transition graphs,
  and entry prerequisites. Pin definitions for running activities.
- Persist activity runs, state visits, and goal evidence. Separate required,
  optional, conditional, and recurring obligations.
- Remove hardcoded activity selection from instruction editing. Use known profile/
  session information to avoid repeated introductions or name requests.
- Compose persona, activity, state, and agent-role behavior policies with clear
  precedence. Retain specialized Python engines such as the map task.

## Stage 5 — State-specification compiler and admin tools

**Goal:** Convert authored instructions into reviewable declarative contracts.

- Add a compiler agent producing validated goals, evidence rules, actions, and
  transitions. Generate data rather than executable Python.
- Recompile through a shared write service when instructions change. Use durable,
  idempotent jobs tied to source revisions; stale jobs cannot overwrite newer work.
- Validate output before publication and retain the last valid published version.
- Provide admin inspection of source, generated contracts, errors, and revisions.

## Stage 6 — Participant memories and embeddings

**Goal:** Extract grounded memories after chats and retrieve relevant context later.

- Reuse the persisted transcript and existing post-chat summary. Store canonical
  memories in the main database with participant ownership and source evidence.
- Separate profile facts, preferences, dated events, and summaries from topic
  categories such as sports, hobbies, relationships, work, food, travel, and daily life.
- Preserve observation/event dates, uncertainty, corrections, and source/content
  modalities. A planned event must not become confirmed attendance.
- Use reliable extraction/indexing jobs, deduplication, and ownership filters.
- Introduce an embedding-provider interface. Verify the exact IU model and modality
  support before adopting Gemma embeddings; route availability alone is insufficient.
- Backfill a separate versioned index from source content, evaluate retrieval, and
  switch with rollback support. Never mix MiniLM and new-model vector spaces.
- Treat the separate vector database as a derived projection, not the canonical
  memory store. This work can overlap Stages 4–5 once durable jobs exist.

## Stage 7 — Activity switching

**Goal:** Change activities within a session while preserving context.

- Support explicit requests and accepted activity offers through a validated handoff.
- Suspend/finish the source run, stop its tasks/cues, and reject late planner results.
- Start the target at an eligible state using known participant information.
- Record activity segments and define resume behavior, including specialized-task
  frontend requirements. A single session-level chat type cannot represent this history.

## Architecture and implementation notes

- Agents propose changes; trusted runtime code validates and commits them.
- Keep Python harnesses, declarative state specifications, and behavior policies
  distinct. A shared agent base class is not currently necessary.
- Use role-based names: `PlannerAgent`, `PlannerMemory`, `ResponseAgent`,
  `planner_memory`, and planner/responder metric prefixes.
- The live activity is fixed to `memory_activity`; instructions come directly from
  the main database. The existing vector store contains instruction embeddings.
- Preserve the controlled closing workflow. The live database has no
  `end_conversation` state; historical sample instructions are not authoritative.
- A local migration now includes the missing language/session fields. Chat-app
  migrations are excluded by `.gitignore`; their reproducible distribution remains
  an infrastructure concern.

Source locations:

| Area | Location |
|---|---|
| Activity state, coordination, goals, history, closing | [harnesses/activity/](backend/chat_app/websocket/harnesses/activity) |
| Agent prompts and output contracts | [agents/](backend/chat_app/websocket/agents) |
| Shared reply/cancellation coordination | [chatHelpers.py](backend/chat_app/websocket/services/chatHelpers.py) |
| Database definitions | [models.py](backend/chat_app/models.py) |
| Post-chat processing | [db_services.py](backend/chat_app/services/db_services.py) |

Working convention: provide implementation changes in chat for the repository
owner to apply unless direct edits are explicitly authorized. Keep runtime READMEs
focused on current code; keep numbered stages and feature progress in this plan.
