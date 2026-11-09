"""
Validate and log what a capable avatar's client reports about each plan.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.consumers.processing.avatar_feedback`

A client that runs avatar plans sends `avatar_feedback` (`HARNESS_PROTOCOL.md`
§6): always when it rejects a plan or a setup, and the other events when the plan
asks for them. Nothing waits on feedback. Each event is logged once, and a
rejection, which means a bug or a name out of sync with the avatar's catalog, is
logged as a warning.

TODO: Store these with the session once the research event log exists.

"""
from __future__ import annotations
from typing     import TYPE_CHECKING

import logging
logger = logging.getLogger(__name__)

# From this project
from ....services.logging_utils import RESET, CC_MAIN, CC_H, CC_R

if TYPE_CHECKING: from ..consumers import ChatConsumer

# Events a client reports about a plan (or a rejected setup)
AVATAR_FEEDBACK_EVENTS = frozenset({"rejected", "started", "step", "dropped", "ended"})

# Longest plan id a client echoes back (`HARNESS_PROTOCOL.md` §3.1)
AVATAR_FEEDBACK_MAX_ID_CHARS = 128

# Longest piece of a client's text (a rejection's reason) written to the log
AVATAR_FEEDBACK_MAX_TEXT_CHARS = 300

# Fields an event may carry beyond its id and name, and the type each must have to be logged
AVATAR_FEEDBACK_DETAILS = {"turn": int, "step": int, "late_ms": int, "reply_ms": int, "reason": str, "how": str}


# ================================================================================
# Handle Avatar Feedback
# ================================================================================
# Log one feedback event (a malformed one is dropped with a warning, and nothing is sent back)
async def handle_avatar_feedback(consumer: ChatConsumer, data: dict[str, object]) -> None:
    # 1) The event name, and the plan it is about (a rejected setup has no id)
    payload = data.get("data")
    if not isinstance(payload, dict):
        logger.warning(f"{CC_MAIN} Ignoring avatar feedback with no data object.{RESET}")
        return
    event   = payload.get("event")
    plan_id = payload.get("id")
    valid_id = (plan_id is None) or (isinstance(plan_id, str) and (len(plan_id) <= AVATAR_FEEDBACK_MAX_ID_CHARS))
    if (event not in AVATAR_FEEDBACK_EVENTS) or (not valid_id):
        logger.warning(f"{CC_MAIN} Ignoring malformed avatar feedback.{RESET}")
        return

    # 2) The details worth logging, each only when it has its expected type (`bool` is an `int`, so it never counts)
    details = [
        f"{name}={_shown(payload[name])}"
        for name, kind in AVATAR_FEEDBACK_DETAILS.items()
        if (name in payload) and isinstance(payload[name], kind) and (not isinstance(payload[name], bool))
    ]

    # 3) One line per event (a rejection is a warning: the plan never ran)
    line = f"{CC_MAIN} Avatar feedback for session {CC_H}{consumer.session_id}{CC_R}: plan {CC_H}{plan_id}{CC_R} {event} {' '.join(details)}{RESET}"
    if event == "rejected": logger.warning(line)
    else:                   logger.info   (line)

# A detail as logged: numbers as they are, a client's text on one line and cut short
def _shown(value: int | str) -> str:
    if isinstance(value, int): return str(value)
    return repr(" ".join(value.split())[:AVATAR_FEEDBACK_MAX_TEXT_CHARS])
