"""
Shared channel group methods.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.consumers.utils.groups`

Broadcast rooms:
"room_group"
  - From `ChatConsumer` to `ChatListener`
  - Gets incoming messages from the chat (user & robot)

"monitor_group"
  - From `ChatConsumer` to `ChatListener`
  - Gets all biomarker scores upon calculation

"control_group"
  - From `ChatListener` to `ChatConsumer`
  - Relays commands sent to the ChatListener (e.g. "reply_now")

"primary_group"
  - Between `ChatConsumer` connections belonging to the same account
  - Lets a newly initialized primary connection replace an older one

"""
from __future__ import annotations

import logging, time
logger = logging.getLogger(__name__)

# From this project
from ....services.logging_utils import CC_MAIN, CC_H, CC_R, RESET

# Import the class for type checking
from typing import TYPE_CHECKING
if TYPE_CHECKING: from ..consumers import ChatConsumer

PRIMARY_REPLACED_CLOSE_CODE = 4004


# --------------------------------------------------------------------------------
# [ChatConsumer] Ensure one primary WebSocket owns a user's live chat
# --------------------------------------------------------------------------------
async def claim_primary_connection(consumer: ChatConsumer) -> None:
    """
    Notify any older primary connection for this account before registering the new
    channel as the owner. The replacement channel is deliberately added after the
    broadcast so it never receives its own takeover event.
    """
    consumer.primary_group = f"chat_user_{consumer.user.id}_primary"
    await consumer.channel_layer.group_send(
        consumer.primary_group,
        {"type": "ws.session_replaced", "replacement_channel": consumer.channel_name},
    )
    await consumer.channel_layer.group_add(consumer.primary_group, consumer.channel_name)


# --------------------------------------------------------------------------------
# [ChatConsumer] Channel group connect helper
# --------------------------------------------------------------------------------
# Use given consumer object and session_id to add the names as attributes, then add the channel layers.
async def join_chat_consumer_groups(consumer):
    session_id = consumer.session.id
    consumer.room_group    = f"chat_{session_id}"
    consumer.monitor_group = f"chat_{session_id}_mon"   # Gets all biomarker scores
    consumer.control_group = f"chat_{session_id}_ctl"   # Relays commands sent to the ChatListener (ChatListener -> ChatConsumer)

    # Join base room & control room (send updates to listeners, receive commands from listeners)
    await consumer.channel_layer.group_add(consumer.   room_group, consumer.channel_name)
    await consumer.channel_layer.group_add(consumer.control_group, consumer.channel_name)


# --------------------------------------------------------------------------------
# Helper for when a consumer disconnects and needs to leave groups
# --------------------------------------------------------------------------------
# TODO: Add to consumers... not sure if there needs to be more keys here? 
async def leave_all_groups(consumer, log_util):
    consumer_groups = [
        getattr(consumer,    "room_group", None), 
        getattr(consumer, "monitor_group", None),
        getattr(consumer, "control_group", None),
        getattr(consumer, "primary_group", None),
    ]
    for group in consumer_groups:
        if group: 
            await consumer.channel_layer.group_discard(group, consumer.channel_name)
            log_util.log_group_left(consumer.user , consumer.channel_name)


# ================================================================================
# [ChatListener] Help format the relay broadcasts
# ================================================================================
# NOTE: Chat messages no longer need a formatter here. `processing.messages` broadcasts the
#       final client-facing frame, so the primary and the listeners both relay it unchanged.

# TODO: Somehow include the timestamp with these a more official way?
# TODO: That would be in the `biomarkers/biomarker_scores.py` file (i think)
def format_biomarker_broadcast(event):
    return {
        "type": "biomarker_scores", 
        "data": {
            "ts"     : time.time(),
            "scores" : event["payload"].get("data") ,
        } 
    }


# ================================================================================
# [ChatConsumer] Help format the relay broadcasts
# ================================================================================
# Canonical robot action vocabulary (the only two shapes any frontend ever receives)
ROBOT_ACTION_KINDS         = ("emotion", "animation")
DEFAULT_ACTION_DURATION_MS = 3_000

async def format_send_actions_command(consumer: ChatConsumer, payload: dict) -> None:
    """
    Relay one robot action to the primary frontend client.

    Two ways of getting an action command here: (1) we get it from structured generation
    of the LLM, or (2) we get it from the admin page using a command button. Both arrive
    in the same form, and both leave in the same form:

        payload  {'id': '..', 'name': 'robot_action', 'data': {'kind': 'emotion', 'value': 'Happy'}}
        relayed  {'type': 'robot_action', 'data': {'kind': 'emotion', 'value': 'Happy', 'duration_ms': 3000}}

    NOTE: We deliberately do NOT branch on `consumer.source` here. The backend sends every
          interface the same action vocabulary, and it is each frontend's job to map that
          onto whatever it can actually do (see `frontend/src/pages/admin/FRONTEND_CAPABILITIES.md`).
          A robot with no "Sick" face decides for itself what to show instead.
    """
    # Get the command data
    value = payload.get("data", {})
    if not isinstance(value, dict): value = {}

    kind  = value.get("kind" )
    label = value.get("value")

    # Never relay an action the client has no way to act on
    if (kind not in ROBOT_ACTION_KINDS) or (not isinstance(label, str)) or (not label.strip()):
        logger.info(f"{CC_MAIN} {CC_H}WARNING{CC_R} Unusable robot action payload: {payload}. {RESET}")
        return

    # Duration is only ever a hint; frontends are free to ignore it
    duration = value.get("duration_ms", DEFAULT_ACTION_DURATION_MS)
    if (not isinstance(duration, int)) or (isinstance(duration, bool)): duration = DEFAULT_ACTION_DURATION_MS

    # Build & send the payload to the frontend client
    relay_payload = {"type": "robot_action", "data": {"kind": kind, "value": label.strip(), "duration_ms": duration}}
    logger.info(f"{CC_MAIN} Robot action relayed: {CC_H}{relay_payload['data']}{CC_R}. {RESET}")
    await consumer.send_json(relay_payload)
