"""
Handle events delivered to the primary chat consumer through Channels groups.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.consumers.handlers.ch_events`

Listener commands use the same dispatcher as commands received directly from a
robot or web frontend. This module only adapts the Channels transport and targets
its reply.

"""
from __future__ import annotations
from typing     import TYPE_CHECKING 

import logging
logger = logging.getLogger(__name__)

# From this project
from ....services               import logging_utils as lu
from ....services.logging_utils import RESET, CC_MAIN, CC_H, CC_R
from ..processing.commands      import dispatch_command

if TYPE_CHECKING: from ..consumers import ChatConsumer


# ================================================================================
# Listener Commands
# ================================================================================
# Dispatch a listener command and acknowledge only the WebSocket that sent it
async def handle_ws_command(consumer: ChatConsumer, event: dict) -> None:
    payload       = event.get("payload", {}) or {}
    reply_channel = event.get("reply_channel")
    logger.info(f"{CC_MAIN} Listener command received: {lu.YELLOW}{payload}{RESET}")

    # Dispatch the command first
    if not isinstance(payload, dict): payload = {}
    ack = await dispatch_command(consumer, payload)

    # Send the command acknowledgement back after execution is done (or was rejected/failed)
    if reply_channel: await send_command_ack(consumer, ack, reply_channel)
    else:            logger.warning(f"{CC_MAIN} Command has no reply channel: {CC_H}{payload}{CC_R}.{RESET}")

    # Update **ALL** involved parties about the new control state (if it was changed by the command)
    if ack["ok"]: await consumer._broadcast_control_state(ack["state"])


# Send a command acknowledgement to the listener connection that originated it
async def send_command_ack(consumer: ChatConsumer, data: dict[str, object], reply_channel: str) -> None:
    payload = {"type": "ws.command_acks", "payload": {"type": "command_ack", "data": data}}
    await consumer.channel_layer.send(reply_channel, payload)
    logger.info(f"{CC_MAIN} Sent command ack: {lu.YELLOW}{data}{CC_R}.{RESET}")


# --------------------------------------------------------------------------------
# Client Relay
# --------------------------------------------------------------------------------
# Forward one Channels payload to the primary WebSocket client
async def forward_payload_to_client(consumer: ChatConsumer, event: dict) -> None:
    await consumer.send_json(event["payload"])

