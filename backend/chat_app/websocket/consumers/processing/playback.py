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
* state      -> Send "started" when playback begins, "finished" only on full
                completion, or "interrupted" when playback is cut short.

NOTE: You don't need to send a timestamp with the message -- all timestamps are
      marked from the backend to keep a single relative timeframe. These events
      fill the assistant ChatMessage's normal `start_ts` and `end_ts` fields.

Each accepted event is also passed to the chat type's harness, whose cues can time
the user's silence from the end of the reply.

"""
from __future__  import annotations
from typing      import TYPE_CHECKING
from channels.db import database_sync_to_async as db_s2a

import logging
logger = logging.getLogger(__name__)

# From this project
from ....services.db_services   import ChatService
from ....services.logging_utils import RESET, CC_MAIN
from ...services.turn_taking import turn_taking
from ...harnesses.base import InterruptedReply

if TYPE_CHECKING: from ..consumers import ChatConsumer

# Accepted assistant playback lifecycle events
PLAYBACK_STATES = {"started", "finished", "interrupted"}


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

    # Update owned delivery state before a database await can race new speech.
    delivery = turn_taking(consumer)
    reply = delivery.replies.get(response_id)

    if reply is not None:
        # Ignore late reports that contradict an already terminal delivery state.
        if reply.finished and state != "finished":
            return

        if reply.interrupted and state in {"started", "finished"}:
            return

        if state == "interrupted" and not reply.interrupted:
            consumer.harness.on_interrupted(InterruptedReply(
                response_id=reply.response_id,
                text=reply.text,
                playback_started=reply.started,
            ))

        delivery.playback(response_id, state)

    # 3) Persist the playback transition in the database for this active session
    updated = await db_s2a(ChatService.mark_assistant_playback)(
        consumer.session_id, response_id, state,
    )

    # 4) Log a warning if the response ID did not match any entry for this session
    if not updated:
        logger.warning(f"{CC_MAIN} Ignoring playback event for an unrelated assistant response.{RESET}")
        return

    # 5) Forward the accepted delivery state to the harness and its optional cues.
    consumer.harness.on_playback(response_id, state)
