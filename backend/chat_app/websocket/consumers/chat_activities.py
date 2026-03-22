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

    ACTIVITY_NAME = "memory_activity"

    async def connect(self):
        await super().connect()

        self.rag_state = {"current_scenario": START_SCENARIO}

    def _rag_kwargs(self):
        return {
            "user"          : self.user,
            "activity_name" : self.ACTIVITY_NAME,
            "rag_state"     : self.rag_state,
        }

    async def receive_json(self, data, **kwargs):
        if data["type"] == "transcription":
            await ChatHandler.handle_transcription(
                data,
                self,
                response_fn=rag_response_fn,
                response_fn_kwargs=self._rag_kwargs(),
            )
            return

        return await super().receive_json(data, **kwargs)

    async def reply_now(self, use_response=None):
        return await ChatHandler.respond_to_user(
            self.context_buffer,
            self,
            use_response=use_response,
            response_fn=None if use_response is not None else rag_response_fn,
            response_fn_kwargs=None if use_response is not None else self._rag_kwargs(),
        )

    async def handle_stt_output(self, data):
        await ChatHandler.handle_transcription(
            data,
            self,
            relay_user_utt=True,
            response_fn=rag_response_fn,
            response_fn_kwargs=self._rag_kwargs(),
        )
