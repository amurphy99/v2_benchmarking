"""
Handle events from the ChatConsumer's WebSocket client.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.consumers.handlers.ws_events`

These methods get implemented by the consumers via simple passthroughs.

"""
from __future__ import annotations

import logging, time, json
logger = logging.getLogger(__name__)

# From this project
from ....services import logging_utils as lu 
from ....services.logging_utils import RESET, BOLD, UNBOLD, CC_MAIN, CC_H, CC_R

# Handling messages
from  ...services.chatHelpers import ChatHandler
from    .command_dispatch     import dispatch_command

# Import the class for type checking
from typing import TYPE_CHECKING
if TYPE_CHECKING: from ..consumers import ChatConsumer


# ================================================================================
# Handle all forms of incoming data
# ================================================================================
async def handle_receive_json(consumer: ChatConsumer, data: dict, **kwargs: object) -> None:
    """
    Route decoded client messages, including canonical commands with immediate acks.
    """
    msg_type = data.get("type")

    if   msg_type == "overlapped_speech" : await _handle_overlap(consumer, data=data)
    elif msg_type == "audio_data"        : await consumer.handle_audio_data(data)
    elif msg_type == "transcription"     : await ChatHandler.handle_transcription(data, consumer)
    elif msg_type == "command":
        ack = dispatch_command(consumer, data.get("data", {}) or {})
        await consumer.send_json({"type": "command_ack", "data": ack})
    elif msg_type == "end_chat"          : await consumer.close(code=1000)
    elif msg_type == "toggle_stream"     : await _toggle_stream(consumer, data)

    # Unknown JSON
    else: logger.info(f"{CC_MAIN} {lu.RED}Unknown JSON{CC_R} received: {data} {RESET}")


# --------------------------------------------------------------------------------
# Toggle the stream of audio data (pause and unpause on the frontend)
# --------------------------------------------------------------------------------
# TODO: In the future this is where any TTS controls would also go (e.g., pause TTS playback)
async def _toggle_stream(consumer: ChatConsumer, data: dict):
    """
    NOTE: The audio "zero-time" anchor (_audio_start_mono / _audio_start_dt) is
    set in `cc_callbacks.handle_audio_data()` when the FIRST audio chunk 
    arrives.
    """
    # Parse the input
    cmd = data.get("data", None)

    # Log the command
    stream_status = "active" if (consumer.streaming_active) else "paused"
    new_status    = "active" if (cmd == "start"           ) else "paused"
    logger.info(f"{CC_MAIN} STT toggled: {CC_H}{stream_status} -> {new_status}{CC_R} | {CC_H}{data}{CC_R} {RESET}")

    # Start the stream (start of chat OR unpause)
    # TODO: I think? I don't remember if the start of chats is handled differently from unpausing
    if cmd == "start":
        if getattr(consumer, "streaming_active", False): return   # already active
        consumer.stt_provider.start()
        consumer.streaming_active = True
        status = "active"

    # Stop the STT stream (pause)
    elif cmd == "stop":
        if not getattr(consumer, "streaming_active", True): return   # already stopped
        consumer.stt_provider.stop()
        consumer.streaming_active = False
        status = "paused"

    # Unknown command / new status given
    else: return

    # Notify the frontend chat client directly, then broadcast to ChatListener
    try: await consumer.send(json.dumps({"type": "stream_status", "data": status}))
    except Exception: pass
    await consumer._broadcast_stream_status(status)


# --------------------------------------------------------------------------------
# Overlapped Speech | TODO: Not really used for anything at the moment
# --------------------------------------------------------------------------------
async def _handle_overlap(consumer: ChatConsumer, data=None):
    consumer.overlapped_speech_count += 1
    consumer.overlapped_speech_events.append(time.time())
    logger.info(f"{CC_MAIN} Overlapped speech detected. Count: {CC_H}{consumer.overlapped_speech_count}{CC_R} {RESET}")

