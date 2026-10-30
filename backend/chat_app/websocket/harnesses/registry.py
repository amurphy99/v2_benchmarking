"""
Build the harness for the chat type a client asks for.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.registry`

A client picks the chat type with the optional `chat_type` query parameter, and
within it a cue set (`condition`) and task content (`variant`). Anything left out
takes its default; a name the chat type doesn't have refuses the connection.

"""
from __future__ import annotations
from typing     import TYPE_CHECKING

# From this project
from .active_listening.harness import ActiveListeningHarness
from .activity.harness         import ActivityHarness
from .base                     import ChatHarness
from .unguided.harness         import UnguidedHarness

if TYPE_CHECKING: from ..consumers.consumers import ChatConsumer

# Chat types a client can pick with `chat_type`, keyed by the name saved on each session
CHAT_TYPES: dict[str, type[ChatHarness]] = {
    UnguidedHarness       .NAME : UnguidedHarness,
    ActiveListeningHarness.NAME : ActiveListeningHarness,
    ActivityHarness       .NAME : ActivityHarness,
}

# Chat type a client gets when it sends no `chat_type`
DEFAULT_CHAT_TYPE = UnguidedHarness.NAME


# Caller-correctable chat selection, refused with a close code instead of logged
class ChatTypeRejected(ValueError):
    pass


# --------------------------------------------------------------------------------
# Build the Harness
# --------------------------------------------------------------------------------
# Build the harness for a client's requested chat type, condition, and variant
def build_harness(
    consumer  : ChatConsumer,  # Connection the harness will serve
    chat_type : str | None,    # Requested `chat_type` (None for the default chat type)
    condition : str | None,    # Requested `condition` (None for the chat type's default)
    variant   : str | None,    # Requested `variant` (None for the chat type's default)
) -> ChatHarness:
    harness_class = CHAT_TYPES.get(chat_type or DEFAULT_CHAT_TYPE)
    if harness_class is None: raise ChatTypeRejected(f"unknown chat_type {chat_type!r}")

    # An option the client left out takes the chat type's first one ("" when it has none)
    chosen_condition = _choose(condition, harness_class.CONDITIONS)
    chosen_variant   = _choose(variant,   harness_class.VARIANTS  )
    if chosen_condition is None: raise ChatTypeRejected(f"chat_type {harness_class.NAME!r} has no condition {condition!r}")
    if chosen_variant   is None: raise ChatTypeRejected(f"chat_type {harness_class.NAME!r} has no variant {variant!r}")
    return harness_class(consumer, condition=chosen_condition, variant=chosen_variant)

# The requested option, else the chat type's default (None for a name it doesn't have)
def _choose(requested: str | None, options: tuple[str, ...]) -> str | None:
    if requested is None: return options[0] if options else ""
    return requested if (requested in options) else None
