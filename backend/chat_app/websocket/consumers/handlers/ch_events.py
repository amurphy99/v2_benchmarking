"""
Handle events from channels groups.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.consumers.handlers.ch_events`

TODO: Can probably structure the command handling better...

"""
from __future__ import annotations

import logging, json
logger = logging.getLogger(__name__)

# From this project
from ....services import logging_utils as lu 
from ....services.logging_utils import RESET, BOLD, UNBOLD, CC_MAIN, CC_H, CC_R

from ..utils.logging   import ChatConsumerLogging as log
from ..utils.groups    import format_actions_command

# Import the class for type checking
from typing import TYPE_CHECKING
if TYPE_CHECKING: from ..consumers import ChatConsumer


# ================================================================================
# Handle all messages send from consumer-to-consumer
# ================================================================================
async def handle_ws_command(consumer: ChatConsumer, event):
    """
    Handle all commands from ChatListener consumers.

    TODO: Add confirmation "acks" to send to the frontend. 

    """
    # Parse command from payload
    payload = event  .get("payload", {}) or {}
    command = payload.get("name")
    id      = payload.get("id"  )
    logger.info(f"{CC_MAIN} Listener command received: {lu.YELLOW}{payload}{RESET}")

    # Act accordingly
    # --------------------------------------------------------------------------------
    # Pause or resume automatic responses (respond whenever we get a user utterance)
    # --------------------------------------------------------------------------------
    # TODO: Deprecated
    if command == "pause_responses":
        consumer.reply_on_user_utt = False
    
    elif command == "resume_responses":
        consumer.reply_on_user_utt = True

    # Pause the chat (or just STT...)
    elif command == "toggle_listening":
        log_command(command)
        # TODO: Would do `toggle_stream` here
    
    # --------------------------------------------------------------------------------
    # Control system responses
    # --------------------------------------------------------------------------------
    # TODO: Deprecated
    # Respond with the LLM immediately
    elif command == "respond_now":
        await consumer.reply_now()

    # Repeat the last message
    elif command == "repeat_response":
        await consumer.reply_now(use_response=consumer.last_response)

    # Speak custom message
    elif command == "respond_manual":
        await consumer.reply_now(use_response=payload.get("data", None))

    # --------------------------------------------------------------------------------
    # Control the avatar
    # --------------------------------------------------------------------------------
    # TODO: This might need to get acks from the avatar itself, and forward those..?
    elif command == "robot_action":
        await format_actions_command(consumer, payload)
        await send_command_ack(consumer, {"id": id, "ok": True, "state": {}}, command)

    # --------------------------------------------------------------------------------
    # Manual Response Control
    # --------------------------------------------------------------------------------
    # TODO: Right now "paraphrase_last" just repeats the last message, need to change
    # Pause automatic responses and just listen
    elif command == "pause_and_listen":
        consumer.reply_on_user_utt = False
        await send_command_ack(consumer, {"id": id, "ok": True, "state": {"manualMode": True}}, command)

    # Respond immediately and resume automatic responses
    elif command == "resume_and_respond":
        await consumer.reply_now(use_response=payload.get("data", None))
        consumer.reply_on_user_utt = True
        await send_command_ack(consumer, {"id": id, "ok": True, "state": {"manualMode": False}}, command)

    # Repeat the robots last message
    elif command == "paraphrase_last": 
        await consumer.reply_now(use_response=consumer.last_response)
        await send_command_ack(consumer, {"id": id, "ok": True, "state": {"manualMode": True}}, command)

    # Admin has sent a custom message for the robot to say
    elif command == "send_custom": 
        custom_response = payload        .get("value",   {}) or {}
        custom_response = custom_response.get("message", {})
        if custom_response:
            await consumer.reply_now(use_response=custom_response)
            await send_command_ack(consumer, {"id": id, "ok": True, "state": {"manualMode": False}}, command)
            consumer.reply_on_user_utt = True
        else:
            await send_command_ack(consumer, {"id": id, "ok": False, "state": {"manualMode": True}}, command)


    # Unknown/unhandled command
    else: logger.info(f"{CC_MAIN} {lu.RED}WARNING{lu.GREEN} Unknown command: {command}, payload={payload}. {RESET}")


# ================================================================================
# Respond with "ack"
# ================================================================================
async def send_command_ack(consumer: ChatConsumer, data: dict, command: str = "command"):
    payload = {"type": "ws.command_acks", "payload": {"type": "command_ack", "data": data}}
    await consumer.channel_layer.group_send(consumer.ack_group, payload)
    logger.info(f"{CC_MAIN} Sent ack for command:      {lu.YELLOW}{data}{CC_R} ({CC_H}{command}{CC_R}) {RESET}")

# Double logs the commands that aren't set up yet
def log_command(command_type):
    logger.info(f"{CC_MAIN} Command: {CC_H}'{command_type}'{CC_R} received. {RESET}")

# ================================================================================
# Forwards payloads to websocket client (catches our own broadcasts and forwards them)
# ================================================================================
# TODO: No need to separately send things to the client, just forward it from here after broadcasting
async def forward_payload_to_client(consumer: ChatConsumer, event):
    await consumer.send_json(event["payload"])




