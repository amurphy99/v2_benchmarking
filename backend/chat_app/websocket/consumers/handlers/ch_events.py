"""
Handle events from channels groups.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.consumers.handlers.ch_events`

TODO: Can probably structure the command handling better...

"""
from __future__ import annotations

import logging
logger = logging.getLogger(__name__)

# From this project
from ....services import logging_utils as lu 
from ....services.logging_utils import RESET, BOLD, UNBOLD, CC_MAIN

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
    logger.info(f"{CC_MAIN} Listener command received: {lu.YELLOW} {payload} {RESET}")

    # Act accordingly
    # --------------------------------------------------------------------------------
    # Pause or resume automatic responses (respond whenever we get a user utterance)
    # --------------------------------------------------------------------------------
    if command == "pause_responses":
        logger.info(f"{CC_MAIN} Command: {BOLD}'pause_auto'{UNBOLD} received. {RESET}")
        consumer.reply_on_user_utt = False
    
    elif command == "resume_responses":
        logger.info(f"{CC_MAIN} Command: {BOLD}'resume_auto'{UNBOLD} received. {RESET}")
        consumer.reply_on_user_utt = True

    # Pause the chat (or just STT...)
    elif command == "toggle_listening":
        logger.info(f"{CC_MAIN} Command: {BOLD}'toggle_listening'{UNBOLD} received. {RESET}")
        # TODO: Would do `toggle_stream` here
    
    # --------------------------------------------------------------------------------
    # Control system responses
    # --------------------------------------------------------------------------------
    # Respond with the LLM immediately
    elif command == "respond_now":
        logger.info(f"{CC_MAIN} Command: {BOLD}'respond_now'{UNBOLD} received. {RESET}")
        system_resp = await consumer.reply_now()

    # Repeat the last message
    elif command == "repeat_response":
        logger.info(f"{CC_MAIN} Command: {BOLD}'repeat_response'{UNBOLD}received. {RESET}")
        system_resp = await consumer.reply_now(use_response=consumer.last_response)

    # Speak custom message
    elif command == "respond_manual":
        logger.info(f"{CC_MAIN} Command: {BOLD}'respond_now'{UNBOLD} received. {RESET}")
        system_resp = await consumer.reply_now(use_response=payload.get("data", None))

    # --------------------------------------------------------------------------------
    # Control the avatar
    # --------------------------------------------------------------------------------
    elif command == "robot_action":
        logger.info(f"{CC_MAIN} Command: {BOLD}'robot_action'{UNBOLD} received. {RESET}")
        await format_actions_command(consumer, payload)


    # Unknown/unhandled command
    else: logger.info(f"{CC_MAIN} {lu.RED}WARNING{lu.GREEN} Unknown command: {command}, payload={payload}. {RESET}")



# ================================================================================
# Forwards payloads to websocket client (catches our own broadcasts and forwards them)
# ================================================================================
# TODO: No need to separately send things to the client, just forward it from here after broadcasting
async def forward_payload_to_client(consumer, event):
    await consumer.send_json(event["payload"])




