"""
Handle events from channels groups.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.consumers.handlers.ch_events`

These methods get implemented by the consumers.


TODO: Might change to something like this later....

    async def cmd_pause_auto(consumer, payload):
        consumer.responses_paused = True

    async def cmd_resume_auto(consumer, payload):
        consumer.responses_paused = False

    async def cmd_respond_now(consumer, payload):
        ...

    async def cmd_robot_action(consumer, payload):
        await format_actions_command(payload, consumer)

    COMMANDS = {
        "pause_auto": cmd_pause_auto,
        "resume_auto": cmd_resume_auto,
        "respond_now": cmd_respond_now,
        "robot_action": cmd_robot_action,
    }

    async def handle_ws_command(consumer, event):
        payload = event.get("payload", {}) or {}
        name = payload.get("name")

        fn = COMMANDS.get(name)
        if not fn:
            logger.warning("Unknown command: %r", name)
            return
        await fn(consumer, payload)

"""
import logging
logger = logging.getLogger(__name__)

# From this project
from ....services import logging_utils as lu 
from ....services.logging_utils import RESET, BOLD, UNBOLD, CC_MAIN

from ..utils.logging   import ChatConsumerLogging as log
from ..utils.groups    import format_actions_command


# ================================================================================
# Handle all messages send from consumer-to-consumer
# ================================================================================
# Receives commands from listener consumers 
# TODO: Actually make this do something
async def handle_ws_command(consumer, event):
    # Parse command from payload
    payload = event  .get("payload", {}) or {}
    command = payload.get("name")
    logger.info(f"{CC_MAIN} Listener command received: {lu.YELLOW} {payload} {RESET}")

    # Act accordingly
    if command == "pause_responses":
        logger.info(f"{CC_MAIN} Command: {BOLD}'pause_auto'{RESET}{lu.GREEN} received. {RESET}")
        consumer.reply_on_STT = False
    
    elif command == "resume_responses":
        logger.info(f"{CC_MAIN} Command: {BOLD}'resume_auto'{RESET}{lu.GREEN} received. {RESET}")
        consumer.reply_on_STT = True
    
    elif command == "respond_now":
        logger.info(f"{CC_MAIN} Command: {BOLD}'respond_now'{RESET}{lu.GREEN} received. {RESET}")
        system_resp = await consumer.reply_now()

    elif command == "robot_action":
        logger.info(f"{CC_MAIN} Command: {BOLD}'robot_action'{RESET}{lu.GREEN} received. {RESET}")
        await format_actions_command(consumer, payload)

    # Unknown/unhandled command
    else: logger.info(f"{CC_MAIN} {lu.RED}WARNING{lu.GREEN} Unknown command: {command}, payload={payload}. {RESET}")


# Forwards payloads to websocket client (catches our own broadcasts and forwards them)
# TODO: No need to separately send things to the client, just forward it from here after broadcasting
async def forward_payload_to_client(consumer, event):
    await consumer.send_json(event["payload"])







