"""Memory activity replies propose their state; saving the exchange commits it."""
from copy import deepcopy
from dataclasses import dataclass

from channels.db import database_sync_to_async as db_s2a

from chat_app import config as cf
from chat_app.services.db_services import ChatService
from chat_app.websocket.harnesses.base import (
    ChatHarness,
    ResponseOutcome,
    TurnAttempt,
)
from chat_app.websocket.services.bg_helpers import fire_and_log

from chat_app.websocket.agents.planner import PlannerAgent
from chat_app.websocket.agents.responder import ResponseAgent
from .closing import handle_closing_turn
from .pipeline import generate_turn
from .repository import load_definition
from .state_specs import START_SCENARIO


@dataclass(frozen=True)
class ActivityTurn:
    rag_state: dict
    llm_log: dict | None = None


class ActivityHarness(ChatHarness):
    NAME = "activity"
    ACTIVITY_NAME = "memory_activity"

    def __init__(self, consumer, *, condition: str, variant: str) -> None:
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
        return self.state.rag_state

    async def generate(self, attempt: TurnAttempt) -> ResponseOutcome:
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

        text, llm_log = await generate_turn(
            definition=self.definition,
            rag_state=working_state,
            user_text=attempt.user_text,
            known_name=getattr(self.consumer.user, "first_name", ""),
            planner=self.planner,
            responder=self.responder,
        )

        return ResponseOutcome(
            message=text,
            state=ActivityTurn(working_state, llm_log),
        )

    def on_reply_saved(self, outcome: ResponseOutcome) -> None:
        # The shared response lock serializes attempts;
        # its shielded commit calls this once.
        super().on_reply_saved(outcome)

        llm_log = self.state.llm_log

        if llm_log:
            fire_and_log(
                db_s2a(ChatService.log_llm_turn)(
                    session_id=self.consumer.session_id,
                    user_id=self.consumer.user.id,
                    activity_name=self.ACTIVITY_NAME,
                    **llm_log,
                ),
                name=f"llm-turn-log-session-{self.consumer.session_id}",
            )