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
  - Relays commands sent to the ChatListener (e.g. "respond_now")

"ack_group"
  - TODO: IDK I forgot...
  - I think something like consumer gets a command, executes it, then sends an ack
    to the listener confirming if it was done

"""
from __future__ import annotations

import logging, time
logger = logging.getLogger(__name__)

# From this project
from ....services.logging_utils import CC_MAIN, CC_H, CC_R, RESET

# Import the class for type checking
from typing import TYPE_CHECKING
if TYPE_CHECKING: from ..consumers import ChatConsumer


# --------------------------------------------------------------------------------
# [ChatConsumer] Channel group connect helper
# --------------------------------------------------------------------------------
# Use given consumer object and session_id to add the names as attributes, then add the channel layers.
async def join_chat_consumer_groups(consumer):
    session_id = consumer.session.id
    consumer.room_group    = f"chat_{session_id}"
    consumer.monitor_group = f"chat_{session_id}_mon"   # Gets all biomarker scores
    consumer.control_group = f"chat_{session_id}_ctl"   # Relays commands sent to the ChatListener (ChatListener -> ChatConsumer)
    consumer.ack_group     = f"chat_{session_id}_ack"   # Relays command acks to frontend (ChatConsumer -> ChatListener)

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
        getattr(consumer,     "ack_group", None),
    ]
    for group in consumer_groups:
        if group: 
            await consumer.channel_layer.group_discard(group, consumer.channel_name)
            log_util.log_group_left(consumer.user , consumer.channel_name)


# ================================================================================
# [ChatListener] Help format the relay broadcasts
# ================================================================================
def format_message_broadcast(event):
    return {
        "type": "message", 
        "data": {
            "ts"      : event["payload"].get("ts"  ),
            "role"    : event["payload"].get("role"),
            "content" : event["payload"].get("text"),
        }
    }

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
async def format_send_actions_command(consumer: ChatConsumer, payload: dict):
    """
    Commands can look like:
        {'id': '..', 'name': 'robot_action', 'data': {'emotion': 'Happy'}}
    or
        {'id': '..', 'name': 'robot_action', 'data': {'animation': 'Idle'}}

    TODO: This whole thing needs to be cleaned up...
    TODO: After sending to the frontend client, send an "ack" to the listener that issued the command, using the ID from the payload
    
    Two ways of getting an action command here: (1) we get it from structured generation
    of the LLM, or (2) we get it from the admin page using a command button. In both
    cases, we need to make sure the command we have selected matches the current chat's
    "interface", so the web UI or the physical robots. Each one takes different options
    for behaviors. 

    """
    # Check what source we are chatting with; this will tell us 
    # TODO: Use this to handle the command formatting stuff
    chat_source = consumer.source

    # Get the command data
    value = payload.get("data", {})

    # Flexible; we can take an "emotion", "animation", or "expression" since different robots take different options
    emotion    : str = value.get("emotion")
    animation  : str = value.get("animation")
    expression : str = value.get("action")

    data = {}
    if   emotion    : data = {"type":      "emotion",   "value": emotion  }
    elif animation  : data = {"type":      "animation", "value": animation}
    elif expression : data = {"expression": expression.upper(),  "duration_ms": 3_000}
    else            : logger.info(f"{CC_MAIN} {CC_H}WARNING{CC_R} No emotion or animation found in payload: {payload}. {RESET}")
        
    # Build & send the payload to the frontend client
    relay_payload = {"type": "expression", "data": data}
    logger.info(f"{CC_MAIN} Command payload built: {CC_H}{relay_payload}{CC_R}, relaying now... {RESET}")
    await consumer.send_json(relay_payload)

# TODO: Temporary helper; should be replaced by something that handles all UIs
def map_action_to_webapp():
    pass



