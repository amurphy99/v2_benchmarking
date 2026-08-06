"""
Shared command handling for primary-client and ChatListener transports.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.consumers.handlers.command_dispatch`

This can be used to return 'acks' (acknowledgements) for any of the different
commands, not just `reply_now`.

"""
from __future__ import annotations
from uuid       import uuid4
from typing     import TYPE_CHECKING
if TYPE_CHECKING: from ..consumers import ChatConsumer


# --------------------------------------------------------------------------------
# Accept a canonical control command and return its immediate acknowledgement
# --------------------------------------------------------------------------------
def dispatch_command(
    consumer : ChatConsumer,       # Primary consumer that executes the requested command
    payload  : dict[str, object],  # Canonical command payload with optional ID
) -> dict[str, object]:
    """
    Only ``reply_now`` is shared here for now. Other commands are still in
    ``ch_events.py`` until I do a more comprehensive command cleanup.
    """
    command_id = payload.get("id") or str(uuid4())
    command    = payload.get("name")

    # Forward it to the consumer before returning the ack
    if command == "reply_now":
        consumer.reply_now()
        return {
            "id"    : command_id,
            "name"  : command,
            "ok"    : True,
            "state" : {"manualMode": not consumer.reply_on_user_utt},
        }

    # Return a standard ack for unknown commands
    else:
        return {
            "id"      : command_id,
            "name"    : command,
            "ok"      : False,
            "message" : f"Unknown command: {command}",
            "state"   : {},
        }
