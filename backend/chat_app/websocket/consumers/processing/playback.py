"""
Validate optional assistant playback events received from a primary frontend.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.consumers.processing.playback`

Any of the "frontend" clients (web app, robots, etc.) can report back when an
assistant message (audio from TTS) actually begins and/or finishes playing. This
is fully optional though -- clients don't have to send these messages at all.

Example format for the JSON:
{
  "type": "tts_playback",
  "data": {
    "responseId" : 123,
    "state"      : "started"
  }
}

* responseId -> The database ID of the assistant ChatMessage (the backend 
                includes it in both llm_response and audio_chunk messages).
* state      -> Send a message with "started" when you begin TTS playback, and
                a message with "finished" when TTS playback completes.

NOTE: You don't need to send a timestamp with the message -- all timestamps are
      marked from the backend to keep a single relative timeframe.

"""
from __future__  import annotations
from typing      import TYPE_CHECKING
from channels.db import database_sync_to_async as db_s2a

import logging
logger = logging.getLogger(__name__)

# From this project
from ....services.db_services   import ChatService
from ....services.logging_utils import RESET, CC_MAIN

if TYPE_CHECKING: from ..consumers import ChatConsumer

# Accepted assistant playback lifecycle events
PLAYBACK_STATES = {"started", "finished"}


# ================================================================================
# Validate one best-effort playback timestamp update from a frontend
# ================================================================================
async def handle_playback_event(consumer: ChatConsumer, data: dict[str, object]) -> None:
    # 1) Extract the inner event dictionary from the incoming payload
    payload = data.get("data", {})
    if not isinstance(payload, dict): return

    # 2) Validate that the response ID is a valid integer and the state is recognized
    response_id = payload.get("responseId")
    state       = payload.get("state"     )
    if (isinstance(response_id, bool)) or (not isinstance(response_id, int)) or (state not in PLAYBACK_STATES):
        logger.warning(f"{CC_MAIN} Ignoring invalid assistant playback event.{RESET}")
        return

    # 3) Persist the playback transition in the database for this active session
    updated = await db_s2a(ChatService.mark_assistant_playback)(
        consumer.session_id, response_id, state,
    )

    # 4) Log a warning if the response ID did not match any entry for this session
    if not updated:
        logger.warning(f"{CC_MAIN} Ignoring playback event for an unrelated assistant response.{RESET}")
