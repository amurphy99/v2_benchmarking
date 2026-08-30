"""
Consumer for chats with built-in "activities"
--------------------------------------------------------------------------------
`backend.chat_app.websocket.consumers.chat_activities`

"""

import logging
logger = logging.getLogger(__name__)

# From this project
from  .consumers                   import ChatConsumer
from ..services.ragChatHelpersMultiAgent import rag_response_fn, START_SCENARIO
from ..services.behavior.activity_chat_close            import handle_closing_turn
from chat_app.services import logging_utils as lu

from channels.db import database_sync_to_async as db_s2a
from chat_app.services.db_services import ChatService
from ..services.bg_helpers import fire_and_log

# ================================================================================ 
# ActivityChatConsumer
# ================================================================================ 
class ActivityChatConsumer(ChatConsumer):
    """
    Extends ChatConsumer with a scenario-based RAG response pipeline.

    The RAG function is injected by setting `self.response_method` in connect().
    All utterance paths (text, STT, admin reply) automatically use it via
    `ChatHandler._execute_response` → `consumer.response_method`.
    """
    CHAT_TYPE     = "activity"
    ACTIVITY_NAME = "memory_activity"


    # set up RAG state and swap in the response method
    async def connect(self):
        await super().connect()

        self.rag_state = {"current_scenario": START_SCENARIO}

    # ================================================================================
    # Modified response method
    # ================================================================================
    async def response_method(self, context_buffer) -> dict:
        """
        Wraps rag_response_fn with the closing flow.

        Returns a dict that always has at minimum:
          {"text": str, "close_after": bool}
        chatHelpers._execute_response reads "close_after" before calling _extract_text.
        """
        # Closing Phase: closing flow is active (close_session was already predicted)
        if self.rag_state.get("_closing_flow_active"):
            # Retrieve the user's most recent staged text directly
            user_text = context_buffer[-1][1] if context_buffer else ""
            logger.info(f"{lu.ORANGE}[ActivityChat] Closing flow active — routing to handle_closing_turn.{lu.RESET}")
            response_text, close_after = await handle_closing_turn(
                consumer=self,
                user_text=user_text,
                rag_state=self.rag_state,
            )
            return {"text": response_text, "close_after": close_after}

        # Normal phase: run the multi-agent pipeline
        user_text = context_buffer[-1][1] if context_buffer else ""
        result = await rag_response_fn(
            context_buffer,
            user_text=user_text,
            user=self.user,
            activity_name=self.ACTIVITY_NAME,
            rag_state=self.rag_state,
        )

        llm_log = result.pop("_llm_log", None)

        if llm_log:
            fire_and_log(
                db_s2a(ChatService.log_llm_turn)(
                    session_id              = self.session_id,
                    user_id                 = self.user.id,
                    activity_name           = self.ACTIVITY_NAME,
                    **llm_log,
                ),
                name=f"llm-turn-log-session-{self.session_id}",
            )
        # If close_session was just predicted, activate closing flow for the next turn
        if result.get("close_session"):
            self.rag_state["_closing_flow_active"] = True
            logger.info(f"{lu.ORANGE}[ActivityChat] close_session predicted — closing flow will activate next turn.{lu.RESET}")

        return result  # includes "text", chatHelpers will strip it via _extract_text

    # RAG kwargs helper
    def _rag_kwargs(self):
        return {
            "user"          : self.user,
            "activity_name" : self.ACTIVITY_NAME,
            "rag_state"     : self.rag_state,
        }

