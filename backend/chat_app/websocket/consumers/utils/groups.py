"""
Shared channel group methods.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.consumers.utils.groups`

Broadcast rooms:
* "room_group"
    - From `ChatConsumer` to `ChatListener`
    - Gets incoming messages from the chat (user & robot)

* "monitor_group"
    - From `ChatConsumer` to `ChatListener`
    - Gets all biomarker scores upon calculation

* "control_group"
    - From `ChatListener` to `ChatConsumer`
    - Relays commands sent to the ChatListener (e.g. "respond_now")

"""

import logging, time
logger = logging.getLogger(__name__)


from ....services.logging_utils import CC_MAIN, CC_H, CC_R, RESET


# --------------------------------------------------------------------------------
# [ChatConsumer] Channel group connect helper
# --------------------------------------------------------------------------------
# Use given consumer object and session_id to add the names as attributes, then add the channel layers.
async def join_chat_consumer_groups(consumer):
    session_id = consumer.session.id
    consumer.room_group    = f"chat_{session_id}"
    consumer.monitor_group = f"chat_{session_id}_mon"
    consumer.control_group = f"chat_{session_id}_ctl"
    consumer.ack_group     = f"chat_{session_id}_ack"   # for relaying command acks to frontend

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
# TODO: This isn't just formatting, I'm also just sending it from this function, need to clean up documentation
async def format_send_actions_command(consumer, payload):
    """
    Commands can look like:
        {'id': '..', 'name': 'robot_action', 'data': {'emotion': 'Happy'}}
    or
        {'id': '..', 'name': 'robot_action', 'data': {'animation': 'Idle'}}

    TODO: Fields should be "data" instead of "value" ??
    TODO: This whole thing needs to be clenaed up...
    TODO: After sending to the frontend client, send an "ack" to the listener that issued the command, using the ID from the payload

    TODO: Should we use the "source" attribute of the consumer here? 
    
    """
    value = payload.get("data", {"action": "HAPPY"})

    # Flexible; we can take an "emotion", "animation", or "expression" since different robots take different options
    emotion    : str = value.get("emotion")
    animation  : str = value.get("animation")
    expression : str = value.get("action", "HAPPY").lower()

    if   emotion    : data = {"type": "emotion",   "value": emotion}
    elif animation  : data = {"type": "animation", "value" : animation}
    else            : 
        logger.info(f"{CC_MAIN} {CC_H}WARNING{CC_R} No emotion or animation found in payload: {payload}. {RESET}")
        data = {}
        
        
    # Build & send the payload to the frontend client
    relay_payload = {
        "type": "expression",
        "data": data
    }

    logger.info(f"{CC_MAIN} Command payload built: {CC_H}{relay_payload}{CC_R}, relaying now... {RESET}")
    await consumer.send_json(relay_payload)
