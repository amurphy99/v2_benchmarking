"""
Handle events from the WebSocket client.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.consumers.handlers.ws_events`

These methods get implemented by the consumers.

"""
import logging, time
logger = logging.getLogger(__name__)


# From this project
from ....services import logging_utils as lu 
from ....services.logging_utils import RESET, BOLD, UNBOLD, CC_MAIN

# Handling messages
from  ...services.chatHelpers       import ChatHandler


# ================================================================================
# Handle Incoming Data
# ================================================================================
async def handle_receive_json(consumer, data, **kwargs):
    if   data["type"] == "overlapped_speech" : await _handle_overlap(consumer, data=data)
    elif data["type"] == "audio_data"        : await consumer._handle_audio_data(data)
    elif data["type"] == "transcription"     : await ChatHandler.handle_transcription(data, msg_callback=consumer._add_message_CB, send_callback=consumer.send, bio_callback=consumer._utt_bio)
    elif data["type"] == "end_chat"          : consumer.stt_provider.stop(); await consumer.disconnect(code=1_000)      
    elif data["type"] == "toggle_stream"     : consumer._toggle_stream(data)

# Overlapped Speech
async def _handle_overlap(consumer, data=None):
    consumer.overlapped_speech_count += 1
    consumer.overlapped_speech_events.append(time.time())
    logger.info(f"{lu.YELLOW}Overlapped speech detected. Count: {consumer.overlapped_speech_count} {lu.RESET}")


