"""
The memory activity chat type: its RAG pipeline and closing flow.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.activity.harness`

Wraps the existing activity pipeline
(`websocket/services/ragChatHelpersMultiAgent.py`) and its closing flow
(`websocket/services/behavior/activity_chat_close.py`) without changing them.
Clients reach it with `chat_type=activity`, or through the older
`ws/chat/activity/` route. Activity replies send no mood.

NOTE: Unlike the active-listening engine, this pipeline is not free of side
      effects. It updates its own state while it generates, before the exchange is
      committed, so a cancelled attempt can advance that state by a turn the user
      never heard.

TODO: The rest of the activity chat's move to harnesses is listed in
      `websocket/harnesses/README.md`.

"""
from __future__ import annotations
from typing     import TYPE_CHECKING

import logging
logger = logging.getLogger(__name__)

from channels.db import database_sync_to_async as db_s2a

# From this project
from ....services                              import logging_utils as lu
from ....services.db_services                  import ChatService
from  ...services.behavior.activity_chat_close import handle_closing_turn
from  ...services.bg_helpers                   import fire_and_log
from  ...services.ragChatHelpersMultiAgent     import START_SCENARIO, rag_response_fn
from   ..base                                  import ChatContext, ChatHarness, ResponseOutcome, TurnAttempt

if TYPE_CHECKING: from ...consumers.consumers import ChatConsumer


# ================================================================================
# Activity Harness
# ================================================================================
# Run each turn through the activity pipeline, then its closing flow at the end
class ActivityHarness(ChatHarness):
    NAME          = "activity"
    ACTIVITY_NAME = "memory_activity"

    # Start every connection at the activity's first scenario
    def __init__(self, consumer: ChatConsumer, *, condition: str, variant: str) -> None:
        super().__init__(consumer, condition=condition, variant=variant)
        self.rag_state = {"current_scenario": START_SCENARIO}

    # Translate one pipeline turn into the outcome every chat type returns
    async def generate(self, attempt: TurnAttempt) -> ResponseOutcome:
        result = await self._run_activity_turn(attempt.context)
        return ResponseOutcome(
            message     = str(result.get("text") or ""),
            close_after = bool(result.get("close_after")),
        )

    # Run the pipeline (or the closing flow) for one turn
    async def _run_activity_turn(self, context_buffer: ChatContext) -> dict:
        """
        Wraps rag_response_fn with the closing flow.

        Returns a dict that always has at minimum:
          {"text": str, "close_after": bool}
        """
        # Closing Phase: closing flow is active (close_session was already predicted)
        if self.rag_state.get("_closing_flow_active"):
            # Retrieve the user's most recent staged text directly
            user_text = context_buffer[-1][1] if context_buffer else ""
            logger.info(f"{lu.ORANGE}[ActivityChat] Closing flow active — routing to handle_closing_turn.{lu.RESET}")
            response_text, close_after = await handle_closing_turn(
                consumer=self.consumer,
                user_text=user_text,
                rag_state=self.rag_state,
            )
            return {"text": response_text, "close_after": close_after}

        # Normal phase: run the multi-agent pipeline
        user_text = context_buffer[-1][1] if context_buffer else ""
        result = await rag_response_fn(
            context_buffer,
            user_text=user_text,
            user=self.consumer.user,
            activity_name=self.ACTIVITY_NAME,
            rag_state=self.rag_state,
        )

        llm_log = result.pop("_llm_log", None)

        if llm_log:
            fire_and_log(
                db_s2a(ChatService.log_llm_turn)(
                    session_id              = self.consumer.session_id,
                    user_id                 = self.consumer.user.id,
                    activity_name           = self.ACTIVITY_NAME,
                    **llm_log,
                ),
                name=f"llm-turn-log-session-{self.consumer.session_id}",
            )
        # If close_session was just predicted, activate closing flow for the next turn
        if result.get("close_session"):
            self.rag_state["_closing_flow_active"] = True
            logger.info(f"{lu.ORANGE}[ActivityChat] close_session predicted — closing flow will activate next turn.{lu.RESET}")

        return result  # includes "text", which `generate` reads
