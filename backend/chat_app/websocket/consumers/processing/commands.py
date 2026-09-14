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
from  ..utils.groups        import format_send_actions_command, ROBOT_ACTION_KINDS
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
# Canonical control vocabularies (the only values any client ever sends or receives)
LISTENING_STATES     = ("active", "paused")
RESPONSE_MODES       = ("automatic", "manual")
MAX_COMMAND_ID_CHARS = 128

# Return the complete frontend-facing state after every command
# NOTE: `streaming_active` stays an internal bool (the STT provider and recorder both want a
#       boolean); it is mapped to its "active"/"paused" string only here, at the wire boundary.
def get_control_state(consumer: ChatConsumer) -> dict[str, object]:
    return {
        "listening"         : "active" if getattr(consumer, "streaming_active", False) else "paused",
        "response_mode"     : getattr(consumer, "response_mode", "automatic"),
        "recording_enabled" : getattr(consumer, "save_audio", False),
    }

# Pull one required value out of a command body and check it against its vocabulary
# There is deliberately no "omit to toggle" fallback; callers always state what they want
def _required_choice(payload: dict[str, object], key: str, allowed: tuple[str, ...]) -> str:
    value = payload.get("data")
    if not isinstance(value, dict): raise CommandRejected(f"A '{key}' value is required")

    choice = value.get(key)
    if choice not in allowed: raise CommandRejected(f"'{key}' must be one of: {', '.join(allowed)}")
    return choice

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
# Return current state to a new listener without changing the chat
async def _get_control_state(consumer: ChatConsumer, payload: dict[str, object]) -> None:
    return None

# --------------------------------------------------------------------------------
# Assistant response controls
# --------------------------------------------------------------------------------
# Request a response at the audio queue boundary that exists right now
async def _reply_now(consumer: ChatConsumer, payload: dict[str, object]) -> None:
    consumer.reply_now()

# Repeat the latest assistant response through the serialized speech path
async def _repeat_last(consumer: ChatConsumer, payload: dict[str, object]) -> None:
    if not consumer.last_response: raise CommandRejected("There is no prior response to repeat")
    consumer.speak_response(consumer.last_response)

# Speak an admin-supplied response through the serialized speech path
async def _send_custom(consumer: ChatConsumer, payload: dict[str, object]) -> None:
    value   = payload.get("data")
    message = value.get("message") if isinstance(value, dict) else None
    if (not isinstance(message, str)) or (not message.strip()): raise CommandRejected("Custom response text is required")
    consumer.speak_response(message.strip())

# --------------------------------------------------------------------------------
# High level controls (i.e., simple pause, resume)
# --------------------------------------------------------------------------------
# Apply the caller's requested listening state
async def _set_listening(consumer: ChatConsumer, payload: dict[str, object]) -> None:
    state = _required_choice(payload, "state", LISTENING_STATES)
    await set_streaming_active(consumer, active=(state == "active"))

# Apply the caller's requested automatic-response mode
async def _set_response_mode(consumer: ChatConsumer, payload: dict[str, object]) -> None:
    mode = _required_choice(payload, "mode", RESPONSE_MODES)
    consumer.response_mode = mode
    if mode == "manual": _cancel_response_tasks(consumer)

# Enter manual response mode and cancel any response already in progress
async def _pause_and_listen(consumer: ChatConsumer, payload: dict[str, object]) -> None:
    consumer.response_mode = "manual"
    _cancel_response_tasks(consumer, include_forced=True)

# Respond to staged speech and restore automatic response mode
async def _resume_and_respond(consumer: ChatConsumer, payload: dict[str, object]) -> None:
    consumer.response_mode = "automatic"
    consumer.reply_now()

# --------------------------------------------------------------------------------
# Misc. command types
# --------------------------------------------------------------------------------
# Forward an avatar action without blocking later audio or commands
async def _robot_action(consumer: ChatConsumer, payload: dict[str, object]) -> None:
    value = payload.get("data")
    if not isinstance(value, dict): raise CommandRejected("Robot action data is required")

    kind  = value.get("kind" )
    label = value.get("value")

    if  kind not in ROBOT_ACTION_KINDS:                    raise CommandRejected(f"Robot action kind must be one of: {', '.join(ROBOT_ACTION_KINDS)}")
    if (not isinstance(label, str)) or (not label.strip()): raise CommandRejected("A robot action value is required")

    fire_and_log(format_send_actions_command(consumer, payload), name="command::robot_action")

# Change whether the completed session recording is persisted
async def _set_recording(consumer: ChatConsumer, payload: dict[str, object]) -> None:
    value = payload.get("data")
    if not isinstance(value, dict):            raise CommandRejected("An 'enabled' value is required")
    if not isinstance(value.get("enabled"), bool): raise CommandRejected("'enabled' must be true or false")

    consumer.save_audio = value["enabled"]
    await consumer._broadcast_recording_state(consumer.save_audio)

    try: await consumer.send_json({"type": "recording_status", "data": {"enabled": consumer.save_audio}})
    except Exception: pass

# --------------------------------------------------------------------------------
# Map the given command name to it's designated "handler" function defined above
# --------------------------------------------------------------------------------
# Canonical vocabulary shared by both WebSocket transports
COMMAND_HANDLERS: dict[str, CommandHandler] = {

    # Assistant response controls
    "reply_now"          : _reply_now,
    "repeat_last"        : _repeat_last,
    "send_custom"        : _send_custom,

    # High level controls (i.e., simple pause, resume)
    "set_listening"      : _set_listening,
    "set_response_mode"  : _set_response_mode,
    "pause_and_listen"   : _pause_and_listen,
    "resume_and_respond" : _resume_and_respond,

    # Misc. command types
    "robot_action"       : _robot_action,
    "set_recording"      : _set_recording,
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
    raw_command_id = payload.get("id")
    raw_command    = payload.get("name")

    # Keep acknowledgement envelopes inside the documented schema even when the caller
    # supplies malformed JSON. Invalid caller IDs cannot safely be echoed as correlation
    # IDs, so give the rejection a fresh server-generated ID instead.
    if raw_command_id is None:
        command_id = str(uuid4())
    elif (
        (not isinstance(raw_command_id, str))
        or (not raw_command_id.strip())
        or (len(raw_command_id) > MAX_COMMAND_ID_CHARS)
    ):
        return {
            "id"      : str(uuid4()),
            "name"    : raw_command if isinstance(raw_command, str) else None,
            "ok"      : False,
            "message" : f"Command id must be a non-empty string no longer than {MAX_COMMAND_ID_CHARS} characters",
            "state"   : get_control_state(consumer),
        }
    else:
        command_id = raw_command_id

    if not isinstance(raw_command, str):
        return {
            "id"      : command_id,
            "name"    : None,
            "ok"      : False,
            "message" : "Command name must be a string",
            "state"   : get_control_state(consumer),
        }

    command = raw_command
    handler = COMMAND_HANDLERS.get(command)

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
