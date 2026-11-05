"""
Experimental Buddy input-mode switch and media handshake on the primary socket.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.experimental.buddy.primary_hooks`

`handlers/ws_events.py` calls two hooks from here, and nothing else in the
primary chat path knows the experiment exists. A connection joins the experiment
when its client sends `get_control_state` (Buddy's capability probe). From then on
its acks report the input mode, and the probe ack hands out the opaque
`primary_connection_id` that Buddy's media socket presents when it connects.

Buddy follows its own contract, so nothing here filters its frames: it sends no
`transcription` in backend mode and no audio in sdk mode.

"""
from __future__  import annotations
from dataclasses import dataclass
from typing      import TYPE_CHECKING
from uuid        import uuid4

import asyncio, logging, time, weakref
logger = logging.getLogger(__name__)

# From this project
from ....services                           import logging_utils as lu
from  ...consumers.processing.commands      import CommandRejected, get_control_state
from  ...services.speech.stt.speechProvider import SpeechToTextProvider
from    .config                             import BM_H, BM_R, BUDDY_CAPABILITIES, BUDDY_TAG

if TYPE_CHECKING: from ...consumers.consumers import ChatConsumer


# --------------------------------------------------------------------------------
# Experiment State
# --------------------------------------------------------------------------------
# One primary connection's place in the experiment
@dataclass
class PrimaryExperiment:
    connection_id       : str                 # Opaque `primary_connection_id` the media socket presents
    input_mode          : str                 # "sdk" or "backend"
    input_mode_revision : int        = 0      # Increments on every accepted mode change
    media_channel       : str | None = None   # Channel of the attached media socket

# State per live primary, and the same primaries by connection ID (both forget a closed connection)
_EXPERIMENTS : weakref.WeakKeyDictionary[ChatConsumer, PrimaryExperiment] = weakref.WeakKeyDictionary()
_PRIMARIES   : weakref.WeakValueDictionary[str, ChatConsumer]             = weakref.WeakValueDictionary()

# Join a connection to the experiment, keeping its state if it already joined
def _join_experiment(consumer: ChatConsumer) -> PrimaryExperiment:
    experiment = _EXPERIMENTS.get(consumer)
    if experiment is not None: return experiment

    # The reported starting mode follows the source table (only the web app starts on backend STT)
    experiment = PrimaryExperiment(connection_id=uuid4().hex, input_mode="backend" if consumer.use_backend_STT else "sdk")
    _EXPERIMENTS[consumer]               = experiment
    _PRIMARIES[experiment.connection_id] = consumer
    return experiment


# ================================================================================
# Primary Socket Hooks (called from `handlers/ws_events.py`)
# ================================================================================
# Add the experiment's fields to a primary ack (an accepted probe joins the experiment)
def add_primary_ack_fields(consumer: ChatConsumer, ack: dict[str, object]) -> None:
    is_probe   = (ack["name"] == "get_control_state") and ack["ok"]
    experiment = _join_experiment(consumer) if is_probe else _EXPERIMENTS.get(consumer)
    if experiment is None: return

    # Every ack after the probe reports the input mode
    ack["state"]["input_mode"         ] = experiment.input_mode
    ack["state"]["input_mode_revision"] = experiment.input_mode_revision

    # The probe ack also says what the backend supports and which connection this is
    if is_probe:
        ack["capabilities"] = list(BUDDY_CAPABILITIES)
        ack["session"     ] = {"chat_session_id": str(consumer.session_id), "primary_connection_id": experiment.connection_id}

# --------------------------------------------------------------------------------
# Set Input Mode
# --------------------------------------------------------------------------------
# Answer `set_input_mode`; any other command returns None and goes to `dispatch_command`
def handle_primary_command(consumer: ChatConsumer, payload: dict[str, object]) -> dict[str, object] | None:
    """
    Like `dispatch_command`, an unexpected failure is logged once and acked as
    `Command failed` instead of dropping the chat. Admin listeners never reach this
    hook, so only the robot can switch its own microphone.
    """
    if payload.get("name") != "set_input_mode": return None

    command_id = payload["id"]
    try:                           _set_input_mode(consumer, _join_experiment(consumer), payload["data"])
    except CommandRejected as exc: return _input_mode_ack(consumer, command_id, str(exc))
    except Exception as exc:
        logger.exception(f"{BUDDY_TAG} Command failed: set_input_mode.{lu.RESET}")
        return _input_mode_ack(consumer, command_id, f"Command failed: {type(exc).__name__}")
    return _input_mode_ack(consumer, command_id, None)

# Ack in the shared shape (`add_primary_ack_fields` adds the input mode afterward)
def _input_mode_ack(consumer: ChatConsumer, command_id: str, failure: str | None) -> dict[str, object]:
    return {"id": command_id, "name": "set_input_mode", "ok": (failure is None), "message": failure, "state": get_control_state(consumer)}

# Switch recognizers, unless Buddy's revision is stale (then nothing changes)
def _set_input_mode(consumer: ChatConsumer, experiment: PrimaryExperiment, body: dict[str, object]) -> None:
    mode     = body["mode"]
    expected = body["expected_revision"]
    if expected != experiment.input_mode_revision:
        raise CommandRejected(f"Input mode revision is {experiment.input_mode_revision}, not {expected}")

    # Asking for the current mode is accepted without a new revision
    if mode == experiment.input_mode: return

    # Switch recognizers before recording the change, so a failure keeps the old mode
    if mode == "backend": _start_backend_recognition(consumer)
    else:                 _stop_backend_recognition (consumer)
    experiment.input_mode           = mode
    experiment.input_mode_revision += 1
    logger.info(f"{BUDDY_TAG} Session {BM_H}{consumer.session_id}{BM_R} input mode: {BM_H}{mode}{BM_R} (revision {experiment.input_mode_revision}).{lu.RESET}")

# Recognize Buddy's audio from now on (STT and the recording run only while listening is active)
def _start_backend_recognition(consumer: ChatConsumer) -> None:
    if consumer.streaming_active:
        consumer.stt_provider  .start()
        consumer.audio_recorder.resume()
    consumer.use_backend_STT = True  # Echo recognized speech back as `user_utt`

# Stop recognizing, and drop whatever the old recognizer has not finished
def _stop_backend_recognition(consumer: ChatConsumer) -> None:
    """
    A shut-down provider ignores the rest of its Google results, so swapping in a
    fresh, stopped provider keeps a half-heard sentence from being answered after
    Buddy's own recognizer takes over. The recording pause becomes silence if
    backend audio resumes, which keeps word timestamps aligned.
    """
    replacement = SpeechToTextProvider(consumer=consumer, loop=asyncio.get_running_loop())
    replacement.stop()

    if consumer.streaming_active: consumer.audio_recorder.pause(time.monotonic())
    consumer.stt_provider.shutdown()
    consumer.stt_provider    = replacement
    consumer.use_backend_STT = False


# ================================================================================
# Media Socket Lookups
# ================================================================================
# The primary a media socket names, if it is still this user's open chat connection
def live_primary(connection_id: str, user_id: int) -> ChatConsumer | None:
    consumer = _PRIMARIES.get(connection_id)
    if (consumer is None) or (consumer.user.id != user_id) or consumer._close_scheduled: return None
    return consumer

# The open primary running one chat session (the session an admin viewer is watching)
def primary_for_session(session_id: int) -> ChatConsumer | None:
    for consumer in list(_PRIMARIES.values()):
        if (consumer.session_id == session_id) and (not consumer._close_scheduled): return consumer
    return None

# Opaque connection ID the primary's probe ack handed out
def connection_id_of(consumer: ChatConsumer) -> str:
    return _EXPERIMENTS[consumer].connection_id

# Channel of the media socket attached to a primary (None when there is none)
def media_channel_of(consumer: ChatConsumer) -> str | None:
    return _EXPERIMENTS[consumer].media_channel

# Make one media socket the primary's media socket (the newest one wins)
def attach_media(consumer: ChatConsumer, channel_name: str) -> None:
    _EXPERIMENTS[consumer].media_channel = channel_name

# Free the media slot, but only for the socket that holds it (an older socket closing late changes nothing)
def detach_media(consumer: ChatConsumer, channel_name: str) -> None:
    experiment = _EXPERIMENTS.get(consumer)
    if (experiment is not None) and (experiment.media_channel == channel_name): experiment.media_channel = None
