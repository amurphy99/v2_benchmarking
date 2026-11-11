"""Memory activity replies propose their state; saving the exchange commits it."""
from copy import deepcopy
from dataclasses import dataclass

from channels.db import database_sync_to_async as db_s2a

from chat_app import config as cf
from chat_app.services.db_services import ChatService
from chat_app.websocket.harnesses.base import ChatHarness, ResponseOutcome, TurnAttempt, InterruptedReply
from chat_app.websocket.services.bg_helpers import fire_and_log

from chat_app.websocket.agents.planner import PlannerAgent
from chat_app.websocket.agents.responder import ResponseAgent
from .closing import handle_closing_turn
from .pipeline import generate_turn
from .repository import load_definition
from .state_specs import START_SCENARIO, STATE_SPECS

import logging
logger = logging.getLogger(__name__)

@dataclass(frozen=True)
class ActivityTurn:
    """Hold an activity-state proposal or the state adopted after saving.

    Attributes:
        rag_state (dict): Histories, goal ledgers, planner memory, and phase flags.
        llm_log (dict | None): Normal-turn metadata; None for closing replies.
    """

    rag_state: dict              # Proposed/adopted histories, goals, memory, counters, and closing flags.
    llm_log: dict | None = None  # Normal-turn diagnostics; closing replies have no planner log.


class ActivityHarness(ChatHarness):
    """Coordinate memory-activity proposals and adopt them after persistence."""

    NAME = "activity"
    ACTIVITY_NAME = "memory_activity"
    ALLOW_SPEECH_INTERRUPTION = True  # Activity replies yield to new recognized user speech.

    def __init__(self, consumer, *, condition: str, variant: str) -> None:
        """Initialize connection-local state and the planner/responder agents.

        Args:
            consumer (ChatConsumer): Owning connection, account, and session.
            condition (str): Condition selected by the shared harness registry.
            variant (str): Variant selected by the shared harness registry.
        """
        super().__init__(consumer, condition=condition, variant=variant)

        self.state = ActivityTurn({
            "current_scenario": START_SCENARIO,
        })

        self.definition = None
        self.planner = PlannerAgent(
            cf.instructor_client,
            cf.INSTRUCTOR_MODEL_NAME,
        )
        self.responder = ResponseAgent(
            cf.openai_client,
            cf.INSTRUCTOR_MODEL_NAME,
        )

    @property
    def rag_state(self) -> dict:
        """Return the backing dict for committed dialogue state, not a copy.

        Generation must deep-copy this ledger before proposing changes.
        """
        return self.state.rag_state

    async def generate(self, attempt: TurnAttempt) -> ResponseOutcome:
        """Prepare a normal or closing reply without committing dialogue changes.

        Args:
            attempt (TurnAttempt): Finalized user text, shared context, trigger,
                and unhandled interruptions from earlier assistant delivery.

        Returns:
            ResponseOutcome: Reply and attempt-local ActivityTurn to adopt after
            saving; closing replies may also request close_after.

        The account's first_name supplies known_name. Histories, goals, memory,
        and closing flags change only in the deep copy until on_reply_saved.
        """
        # Copy nested histories, goal ledgers and closing flags,
        # not just the top-level dict.
        working_state = deepcopy(self.rag_state)

        if working_state.get("_closing_flow_active"):
            text, close_after = await handle_closing_turn(
                context_buffer=attempt.context,
                user_text=attempt.user_text,
                rag_state=working_state,
            )

            return ResponseOutcome(
                message=text,
                state=ActivityTurn(working_state),
                close_after=close_after,
            )

        if self.definition is None:
            self.definition = await load_definition(self.ACTIVITY_NAME)

            # Log configuration once, rather than repeating instructions every turn.
            logger.info(
                "[Activity] session=%s activity=%s loaded states=%s",
                self.consumer.session_id,
                self.ACTIVITY_NAME,
                " -> ".join(row["name"] for row in self.definition),
            )

        text, llm_log = await generate_turn(
            definition=self.definition,
            rag_state=working_state,
            user_text=attempt.user_text,
            known_name=getattr(self.consumer.user, "first_name", ""),
            planner=self.planner,
            responder=self.responder,
            interruptions=getattr(attempt, "interruptions", ()),
        )

        return ResponseOutcome(
            message=text,
            state=ActivityTurn(working_state, llm_log),
            consume_interruptions=not (
                (llm_log or {})
                .get("agents_data", {})
                .get("responder_error", False)
            ),
        )

    def bind_response_id(self, response_id: int) -> None:
        """Bind response_id (int ChatMessage ID) to the adopted assistant history entry."""
        history = self.rag_state.get("_history", [])

        if self.state.llm_log and history and history[-1]["role"] == "assistant":
            history[-1]["response_id"] = response_id


    def on_interrupted(self, reply: InterruptedReply) -> None:
        """Keep reply (InterruptedReply) text but invalidate goals based on its delivery."""
        super().on_interrupted(reply)
        self._mark_interrupted(self.rag_state, reply)


    @staticmethod
    def _mark_interrupted(rag_state: dict, reply: InterruptedReply) -> None:
        """Mark reply (InterruptedReply) in rag_state (dict) and remove its goal evidence.

        Mutates the supplied ledger; no exact heard-word boundary is inferred.
        """
        for message in rag_state.get("_history", []):
            if message.get("response_id") != reply.response_id:
                continue

            message["delivery"] = "interrupted"

            ledger = (
                rag_state.get("_goal_progress", {})
                .get(message["state"], {})
            )

            for goal_id, evidence in list(ledger.items()):
                if evidence.get("message_id") == message["id"]:
                    del ledger[goal_id]
                    rag_state.get("_completed_states", set()).discard(
                        message["state"],
                    )

    def on_reply_saved(self, outcome: ResponseOutcome) -> None:
        """Adopt saved reply state, report progress, and schedule its turn log.

        Args:
            outcome (ResponseOutcome): Persisted reply's ActivityTurn and effects.

        Called once by the shared commit path. Returns None; normal-turn metadata
        is written asynchronously, so adopting state does not await that log write.
        """
        # Retain the old ledger so we can identify newly satisfied goals.
        previous_progress = self.rag_state.get("_goal_progress", {})

        # An interruption may arrive while this reply's DB commit is shielded.
        # Preserve that observation when adopting the newer state copy.
        if isinstance(outcome.state, ActivityTurn):
            for reply in self.pending_interruptions:
                self._mark_interrupted(outcome.state.rag_state, reply)

        # The shared response lock serializes attempts;
        # its shielded commit calls this once.
        super().on_reply_saved(outcome)

        llm_log = self.state.llm_log

        if llm_log:
            self._log_saved_turn(llm_log, previous_progress)

            fire_and_log(
                db_s2a(ChatService.log_llm_turn)(
                    session_id=self.consumer.session_id,
                    user_id=self.consumer.user.id,
                    activity_name=self.ACTIVITY_NAME,
                    **llm_log,
                ),
                name=f"llm-turn-log-session-{self.consumer.session_id}",
            )


    def _log_saved_turn(self, llm_log: dict, previous_progress: dict) -> None:
        """Summarize committed progress without logging conversation text.

        Args:
            llm_log (dict): Saved turn's counters, transition, and agents_data.
            previous_progress (dict): State-name to goal-ledger mapping from
                before adoption, used to identify newly satisfied goals.

        Returns None. Forced exits and model fallbacks use WARNING; other saved
        turns use INFO. Skipped goals are reported separately from satisfied ones.
        """
        agents_data = llm_log["agents_data"]
        plan = agents_data["planner_output"]
        transition = agents_data["transition"]
        current = llm_log["state_before"]
        spec = STATE_SPECS[current]
        progress = agents_data["goal_progress"]
        previous = previous_progress.get(current, {})

        satisfied = [
            goal.id for goal in spec.goals
            if progress.get(goal.id, {}).get("status") == "satisfied"
        ]
        newly_satisfied = [
            goal_id for goal_id in satisfied
            if previous.get(goal_id, {}).get("status") != "satisfied"
        ]
        unmet = [
            goal.id for goal in spec.goals
            if goal.id not in satisfied
        ]
        errors = [
            name for name in ("planner", "responder")
            if agents_data.get(f"{name}_error")
        ]

        # Forced exits and fallbacks stand out without adding another log line.
        level = (
            logging.WARNING
            if transition["reason"] == "turn_limit" or errors
            else logging.INFO
        )

        logger.log(
            level,
            "[Activity] session=%s turn=%s state=%s->%s "
            "turns=%s min=%s max=%s goals=%s/%s new=%s unmet=%s skipped=%s "
            "planner=%r/%s applied=%s targets=%s errors=%s",
            self.consumer.session_id,
            llm_log["turn_index"],
            current,
            llm_log["state_after"],
            llm_log["same_state_turn_count"],
            spec.min_turns,
            spec.max_turns,
            len(satisfied),
            len(spec.goals),
            ",".join(newly_satisfied) or "-",
            ",".join(unmet) or "-",
            ",".join(transition["skipped_goals"]) or "-",
            plan["next_state"],
            plan["transition_reason"],
            transition["reason"],
            ",".join(plan["target_goal_ids"]) or "-",
            ",".join(errors) or "-",
        )

        # Optional diagnostics: references and timings, never quotes or memory.
        # logger.debug(
        #     "[ActivityDetails] session=%s turn=%s evidence_refs=%r "
        #     "accepted_sources=%r planner_ms=%s responder_ms=%s",
        #     self.consumer.session_id,
        #     llm_log["turn_index"],
        #     [
        #         (item["goal_id"], item["message_id"])
        #         for item in plan["evidence"]
        #     ],
        #     {
        #         goal_id: progress[goal_id].get("message_id")
        #         for goal_id in satisfied
        #     },
        #     agents_data["planner_latency_ms"],
        #     agents_data["responder_latency_ms"],
        # )
