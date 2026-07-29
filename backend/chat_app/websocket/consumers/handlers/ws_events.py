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

# Import the class for type checking
from typing import TYPE_CHECKING
if TYPE_CHECKING: from ..consumers import ChatConsumer


# ================================================================================
# Handle all forms of incoming data | TODO: are we supposed to guard here more?
# ================================================================================
async def handle_receive_json(consumer: ChatConsumer, data, **kwargs):
    if   data["type"] == "overlapped_speech" : await _handle_overlap(consumer, data=data)
    elif data["type"] == "audio_data"        : await consumer.handle_audio_data(data)
    elif data["type"] == "transcription"     : await ChatHandler.handle_transcription(data, consumer)
    elif data["type"] == "robot_send_staged" : await consumer.reply_now() # flush the staged utterance and reply immediately
    elif data["type"] == "robot_user_audio_complete"        : await _handle_robot_audio_done(consumer) # handle when the user has finished sending audio
    elif data["type"] == "end_chat"          : await consumer.close(code=1000)   
    elif data["type"] == "toggle_stream"     : await _toggle_stream(consumer, data)

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

async def _handle_robot_audio_done(consumer: ChatConsumer):
    """
    Called when the robot signals that all audio for this turn has been fully sent.
    Marks the consumer as ready to send stt_staged once a final STT result arrives.
    If STT is already idle and results are staged, send stt_staged now.
    If STT still has pending audio in-flight, the _done callback in speechProvider
    will send stt_staged once the final result arrives.
    """
    consumer._robot_audio_done = True
    logger.info(f"{CC_MAIN} robot_audio_done received. staged_count={len(consumer._staged_utterances)} {RESET}")

    # Check if STT still has unprocessed audio in-flight
    stt_is_idle = not getattr(consumer.stt_provider, "_has_pending_audio", False)

    if stt_is_idle and consumer._staged_utterances:
        # STT is done and results are already staged — send the signal now
        await consumer.send(json.dumps({"type": "stt_staged"}))
        # reset _robot_audio_done flag
        consumer._robot_audio_done = False
