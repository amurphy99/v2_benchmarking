"""
Control the backend STT stream for an active primary chat connection.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.consumers.processing.stream`

This operation is shared by explicit control commands and speech-intent handling.
It is independent of the transport that requested the state change.

NOTE: It has "active" in the name, but this is the same function we use to start,
      re-start, or pause/stop the stream. Whichever one happens is based on the
      given `active` boolean parameter.

"""
from __future__ import annotations
from typing     import TYPE_CHECKING

import json, logging
logger = logging.getLogger(__name__)

# From this project
from ....services.logging_utils import RESET, CC_MAIN, CC_H, CC_R

if TYPE_CHECKING: from ..consumers import ChatConsumer


# ================================================================================
# Set Streaming State
# ================================================================================
async def set_streaming_active(consumer: ChatConsumer, active: bool) -> None:
    """
    Apply one explicit STT streaming state and notify the primary frontend and all
    listener clients after the provider accepts the transition.
    """
    current_status = "active" if consumer.streaming_active else "paused"
    next_status    = "active" if active                    else "paused"
    logger.info(f"{CC_MAIN} STT toggled: {CC_H}{current_status} -> {next_status}{CC_R}.{RESET}")

    # Ignore repeated requests that already match the active provider state
    if active == consumer.streaming_active: return

    # Apply the provider transition before publishing the resulting state
    if active: consumer.stt_provider.start()
    else:      consumer.stt_provider.stop()
    consumer.streaming_active = active

    # Notify the primary client directly, then broadcast to every listener
    try: await consumer.send(json.dumps({"type": "stream_status", "data": next_status}))
    except Exception: pass
    await consumer._broadcast_stream_status(next_status)
