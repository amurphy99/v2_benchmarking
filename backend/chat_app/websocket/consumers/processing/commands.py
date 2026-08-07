"""
Dispatch canonical control commands for every chat WebSocket transport.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.consumers.processing.commands`

Primary clients and listener clients share this command vocabulary, its state
transitions, and the correlated acknowledgement body returned to their adapters.

"""
from __future__ import annotations
from typing     import Awaitable, Callable, TYPE_CHECKING
from uuid       import uuid4

import logging
logger = logging.getLogger(__name__)

# From this project
from ....services           import logging_utils as lu
from ...services.bg_helpers import fire_and_log
from  ..utils.groups        import format_send_actions_command
from  .stream              import set_streaming_active

if TYPE_CHECKING: from ..consumers import ChatConsumer

# All "command handler" functions take the same parameter set
CommandHandler = Callable[["ChatConsumer", dict[str, object]], Awaitable[str | None]]

# Reject caller-correctable command input without reporting a server failure
class CommandRejected(ValueError):
    """Identify an invalid command body that should be returned in its acknowledgement."""

# ================================================================================
# Control State
# ================================================================================
# Return the complete frontend-facing state after every command
def get_control_state(consumer: ChatConsumer) -> dict[str, bool]:
    responses_paused = not getattr(consumer, "reply_on_user_utt", True)
    return {
        "listeningPaused"  : not getattr(consumer, "streaming_active", False),
        "responsesPaused"  : responses_paused,
        "manualMode"       : responses_paused,
        "recordingEnabled" : getattr(consumer, "save_audio", False),
    }

# Interpret a boolean body as desired paused state, or toggle when omitted
def _desired_paused(payload: dict[str, object], current: bool) -> bool:
    value = payload.get("data")
    if isinstance(value, bool): return value
    else:                       return not current

# Cancel response work without delaying the command acknowledgement
def _cancel_response_tasks(consumer: ChatConsumer, *, include_forced: bool = False) -> None:
    task_names = ["_pending_response_task", "_manual_response_task"]
    if include_forced: task_names.append("_reply_now_task")

    for task_name in task_names:
        task = getattr(consumer, task_name, None)
        if (task is not None) and (not task.done()): task.cancel()


# ================================================================================
# Command Handlers
# ================================================================================
# Request a response at the audio queue boundary that exists right now
async def _reply_now(consumer: ChatConsumer, payload: dict[str, object]) -> None:
    consumer.reply_now()

# Apply the caller's desired listening state
async def _pause_listening(consumer: ChatConsumer, payload: dict[str, object]) -> None:
    paused = _desired_paused(payload, current=not consumer.streaming_active)
    await set_streaming_active(consumer, active=not paused)

# Apply the caller's desired automatic-response state
async def _pause_responses(consumer: ChatConsumer, payload: dict[str, object]) -> None:
    paused = _desired_paused(payload, current=not consumer.reply_on_user_utt)
    consumer.reply_on_user_utt = not paused
    if paused: _cancel_response_tasks(consumer)

# Forward an avatar action without blocking later audio or commands
async def _robot_action(consumer: ChatConsumer, payload: dict[str, object]) -> None:
    value = payload.get("data")
    if not isinstance(value, dict): raise CommandRejected("Robot action data is required")
    if not any(isinstance(value.get(key), str) and value.get(key) for key in ("emotion", "animation", "action")):
        raise CommandRejected("A robot emotion, animation, or action is required")
    fire_and_log(format_send_actions_command(consumer, payload), name="command::robot_action")

# Enter manual response mode and cancel any response already in progress
async def _pause_and_listen(consumer: ChatConsumer, payload: dict[str, object]) -> None:
    consumer.reply_on_user_utt = False
    _cancel_response_tasks(consumer, include_forced=True)

# Respond to staged speech and restore automatic response mode
async def _resume_and_respond(consumer: ChatConsumer, payload: dict[str, object]) -> None:
    consumer.reply_on_user_utt = True
    consumer.reply_now()

# Repeat the latest assistant response through the serialized speech path
async def _repeat_last(consumer: ChatConsumer, payload: dict[str, object]) -> None:
    if not consumer.last_response: raise CommandRejected("There is no prior response to repeat")
    consumer.speak_response(consumer.last_response)

# Speak an admin-supplied response and return to automatic mode
async def _send_custom(consumer: ChatConsumer, payload: dict[str, object]) -> None:
    value   = payload.get("data")
    message = value.get("message") if isinstance(value, dict) else None
    if (not isinstance(message, str)) or (not message.strip()): raise CommandRejected("Custom response text is required")

    consumer.reply_on_user_utt = True
    consumer.speak_response(message.strip())

# Change whether the completed session recording is persisted
async def _toggle_recording(consumer: ChatConsumer, payload: dict[str, object]) -> None:
    value = payload.get("data")
    if not isinstance(value, dict): raise CommandRejected("Recording command data is required")

    consumer.save_audio = bool(value.get("enabled", False))
    await consumer._broadcast_recording_state(consumer.save_audio)
    try: await consumer.send_json({"type": "recording_status", "data": {"enabled": consumer.save_audio}})
    except Exception: pass

# Return current state to a new listener without changing the chat
async def _get_control_state(consumer: ChatConsumer, payload: dict[str, object]) -> None:
    return None

# --------------------------------------------------------------------------------
# Map the given command name to it's designated "handler" function defined above
# --------------------------------------------------------------------------------
# Canonical vocabulary shared by both WebSocket transports
COMMAND_HANDLERS: dict[str, CommandHandler] = {
    "reply_now"          : _reply_now,
    "pause_listening"    : _pause_listening,
    "pause_responses"    : _pause_responses,
    "robot_action"       : _robot_action,
    "pause_and_listen"   : _pause_and_listen,
    "resume_and_respond" : _resume_and_respond,
    "repeat_last"        : _repeat_last,
    "send_custom"        : _send_custom,
    "toggle_recording"   : _toggle_recording,
    "get_control_state"  : _get_control_state,
}


# ================================================================================
# Dispatch Commands
# ================================================================================
# All commands always return an acknowledgement ("ack") response
async def dispatch_command(consumer: ChatConsumer, payload: dict[str, object]) -> dict[str, object]:
    """
    Execute one canonical command and return its immediate correlated result. The
    transport adapter decides where to deliver this acknowledgement.
    """
    command_id = payload.get("id") or str(uuid4())
    command    = payload.get("name")
    handler    = COMMAND_HANDLERS.get(command) if isinstance(command, str) else None

    # Return a standard ack for unknown commands
    if handler is None:
        return {
            "id"      : command_id,
            "name"    : command,
            "ok"      : False,
            "message" : f"Unknown command: {command}",
            "state"   : get_control_state(consumer),
        }

    # Successful execution
    try:
        message = await handler(consumer, payload)
        return {
            "id"      : command_id,
            "name"    : command,
            "ok"      : True,
            "message" : message,
            "state"   : get_control_state(consumer),
        }

    # Command did not succeed (format was determined to be invalid)
    except CommandRejected as exc:
        return {
            "id"      : command_id,
            "name"    : command,
            "ok"      : False,
            "message" : str(exc),
            "state"   : get_control_state(consumer),
        }

    # Command errored out
    except Exception as exc:
        logger.exception(f"{lu.CC_MAIN} Command failed: {command}.{lu.RESET}")
        return {
            "id"      : command_id,
            "name"    : command,
            "ok"      : False,
            "message" : f"Command failed: {type(exc).__name__}",
            "state"   : get_control_state(consumer),
        }

