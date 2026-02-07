"""
Consumer for chats with built-in "activities"
--------------------------------------------------------------------------------
backend.chat_app.websocket.consumers.chat_activities


"""

from django.apps import apps

from datetime import datetime, timezone

import json, asyncio, logging
logger = logging.getLogger(__name__)

# From this project
from  .consumers                   import ChatConsumer
from ..services.chatHelpers        import handle_transcription
from ..services.speechProvider     import SpeechToTextProvider
from ..services.activityChatHelper import rag_response_fn, START_SCENARIO

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

        # Override the STT provider callback so backend-ASR uses RAG
        loop_stt = asyncio.get_event_loop()
        self.stt_provider = SpeechToTextProvider(
            self._handle_stt_output_activity,
            self._add_message_CB,
            self.send,
            self._utt_bio,
            None,
            loop_stt,
        )

    async def _handle_stt_output_activity(self, data, msg_callback, send_callback, bio_callback):
        # mirror handle_stt_output(), but pass response_fn
        user_utt = data["data"]
        await send_callback(json.dumps({
            "type": "user_utt",
            "data": user_utt,
            "time": datetime.now(timezone.utc).strftime("%H:%M:%S"),
        }))

        await handle_transcription(
            data,
            msg_callback=msg_callback,
            send_callback=send_callback,
            bio_callback=bio_callback,
            response_fn=rag_response_fn,
            response_fn_kwargs={
                "user": self.user,
                "activity_name": self.ACTIVITY_NAME,
                "rag_state": self.rag_state,
            },
        )

    async def receive_json(self, data, **kwargs):
        if data["type"] == "transcription":
            await handle_transcription(
                data,
                msg_callback=self._add_message_CB,
                send_callback=self.send,
                bio_callback=self._utt_bio,
                response_fn=rag_response_fn,
                response_fn_kwargs={
                    "user": self.user,
                    "activity_name": self.ACTIVITY_NAME,
                    "rag_state": self.rag_state,
                },
            )
            return

        # Everything else is identical to normal chat
        return await super().receive_json(data, **kwargs)
