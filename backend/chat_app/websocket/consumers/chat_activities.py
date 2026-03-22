"""
Consumer for chats with built-in "activities"
--------------------------------------------------------------------------------
`backend.chat_app.websocket.consumers.chat_activities`


"""

from django.apps import apps

from datetime import datetime, timezone

import json, asyncio, logging
logger = logging.getLogger(__name__)

# From this project
from  .consumers                   import ChatConsumer
from ..services.chatHelpers        import ChatHandler
from ..services.ragChatHelpersMultiAgent import rag_response_fn, START_SCENARIO

# ================================================================================ 
# ActivityChatConsumer
# ================================================================================ 
class ActivityChatConsumer(ChatConsumer):
    """
    Same session handling + persistence + biomarkers as ChatConsumer (through inheritance),
    but swaps response generation to the scenario-based RAG pipeline.
    """
    # Helps us decide what behavior to use in other areas ("standard" | "activity")
    CHAT_TYPE     = "activity"
    ACTIVITY_NAME = "memory_activity"

    

    async def connect(self):
        await super().connect()

        self.rag_state = {"current_scenario": START_SCENARIO}

        # Define the response generation method to be used in the chat
        self.response_method = lambda x: rag_response_fn(x, **self._rag_kwargs())

    def _rag_kwargs(self):
        return {
            "user"          : self.user,
            "activity_name" : self.ACTIVITY_NAME,
            "rag_state"     : self.rag_state,
        }

    # ================================================================================
    # Text Transcriptions — use new ChatHandler path instead of legacy handle_transcription0
    # ================================================================================
    async def receive_json(self, data, **kwargs):
        if data["type"] == "transcription":
            await ChatHandler.handle_transcription(data, self)
            # reply_now is called inside handle_transcription -> respond_to_user,
            # but respond_to_user doesn't call reply_now directly yet — see note below
            return

        return await super().receive_json(data, **kwargs)
