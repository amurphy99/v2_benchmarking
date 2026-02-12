"""
Shared channel group methods.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.consumers.utils.groups`

TODO: Need to move more of this shared stuff into here 

"""

import time


# --------------------------------------------------------------------------------
# Channel group connect helper
# --------------------------------------------------------------------------------
# TODO: Use given consumer object and session_id to add the names as attributes
# TODO: Then add the channel layers like in chat_listener...


# --------------------------------------------------------------------------------
# Helper for when a consumer disconnects and needs to leave groups
# --------------------------------------------------------------------------------
# TODO: Add to consumers... not sure if there needs to be more keys here? 
async def leave_all_groups(consumer, log_util):
    for group in [getattr(consumer, "room_group", None), getattr(consumer, "monitor_group", None)]:
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
