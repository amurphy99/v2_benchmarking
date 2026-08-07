"""
Route messages received from the primary chat WebSocket client.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.consumers.handlers.ws_events`

This is the transport boundary for audio payloads, direct transcriptions,
canonical commands, overlap notifications, and end-chat requests.

NOTE: Serves as a passthrough routing all incoming message types that the main
      consumer receives to the proper handling endpoints. 

"""
from __future__ import annotations
from typing     import TYPE_CHECKING

import logging, time
logger = logging.getLogger(__name__)

# From this project
from ....services import logging_utils as lu 
from ....services.logging_utils import RESET, CC_MAIN, CC_H, CC_R

# Handling incoming payloads
from ...services.chatHelpers import ChatHandler
from  ..processing.audio     import ingest_audio_payload
from  ..processing.commands  import dispatch_command

if TYPE_CHECKING: from ..consumers import ChatConsumer

MAX_TRANSCRIPT_CHARS = 20_000  # Maximum direct transcription length accepted from a frontend


# ================================================================================
# Handle all forms of incoming data
# ================================================================================
async def handle_receive_json(consumer: ChatConsumer, data: object) -> None:
    """
    Route decoded client messages, including canonical commands with immediate acks.
    """
    if not isinstance(data, dict):
        logger.info(f"{CC_MAIN} {lu.RED}Non-object JSON{CC_R} received: {type(data).__name__}.{RESET}")
        return

    msg_type = data.get("type")

    if   msg_type == "overlapped_speech" : await handle_overlap              (consumer, data)
    elif msg_type == "audio_data"        : await ingest_audio_payload        (consumer, data)
    elif msg_type == "transcription"     : await handle_transcription_message(consumer, data)
    elif msg_type == "command"           : await handle_client_command       (consumer, data)
    elif msg_type == "end_chat"          : await consumer.close(code=1000)

    # Unknown JSON
    else: logger.info(f"{CC_MAIN} {lu.RED}Unknown JSON{CC_R} received: {data} {RESET}")

# --------------------------------------------------------------------------------
# Overlapped Speech | TODO: Not really used for anything at the moment
# --------------------------------------------------------------------------------
async def handle_overlap(consumer: ChatConsumer, data: dict[str, object]) -> None:
    consumer.overlapped_speech_count += 1
    consumer.overlapped_speech_events.append(time.time())
    logger.info(f"{CC_MAIN} Overlapped speech detected. Count: {CC_H}{consumer.overlapped_speech_count}{CC_R} {RESET}")

# --------------------------------------------------------------------------------
# [TEXT] Validate and normalize the payload before passing it off to ChatHandler
# --------------------------------------------------------------------------------
async def handle_transcription_message(consumer: ChatConsumer, data: dict[str, object]) -> None:
    # Validate the transport payload (text transcript)
    transcript = data.get("data")
    if (not isinstance(transcript, str)) or (not transcript.strip()) or (len(transcript) > MAX_TRANSCRIPT_CHARS):
        logger.warning(f"{CC_MAIN} Ignoring invalid direct transcription payload.{RESET}")
        return

    # Normalize transport data before passing an explicit utterance into ChatHandler
    timestamp = data.get("time", time.time())
    if not isinstance(timestamp, (int, float)): timestamp = time.time()
    await ChatHandler.stage_and_schedule(consumer, transcript.strip(), float(timestamp), words=None)

# --------------------------------------------------------------------------------
# [CONTROL] Validate & handle incoming client commands (e.g., `reply_now`)
# --------------------------------------------------------------------------------
async def handle_client_command(consumer: ChatConsumer, data: dict[str, object]) -> None:
    # Validate the command envelope & dispatch the command
    payload = data.get("data", {}) or {}
    if not isinstance(payload, dict): payload = {}
    ack = await dispatch_command(consumer, payload)

    # Send an acknowledgement back through the same socket & broadcast the confirmed control state
    await consumer.send_json({"type": "command_ack", "data": ack})
    if ack["ok"]: await consumer._broadcast_control_state(ack["state"])
