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

        # The lambda is evaluated at call-time so rag_state mutations are captured.
        self.response_method = lambda context: rag_response_fn(
            context,
            user_text=context[-1][1],  # Get the text of the latest user message from the context
            **self._rag_kwargs()
            )

    # RAG kwargs helper
    def _rag_kwargs(self):
        return {
            "user"          : self.user,
            "activity_name" : self.ACTIVITY_NAME,
            "rag_state"     : self.rag_state,
        }

