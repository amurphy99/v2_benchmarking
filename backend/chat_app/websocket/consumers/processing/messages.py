"""
Commit chat messages and publish them to the active WebSocket session.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.consumers.processing.messages`

Keep database writes, the in-memory LLM context, and listener broadcasts in the
same operation so every committed message is reflected consistently.

Chat messages are generally always paired with a response (user says something,
assistant responds). We save those together because the LLM response can be
cancelled if the user says something again before it is ready. In this case, we
put the user's speech back into our storage and append the new speech on top of
it. We don't want to commit user utterances to the DB until we are sure that
this won't happen. Once we know that the assistant's response went through, then
we can go ahead and save both together.

"""
from __future__  import annotations
from channels.db import database_sync_to_async as db_s2a
from typing      import TYPE_CHECKING

import logging
logger = logging.getLogger(__name__)

# From this project
from ....services.db_services   import ChatService
from ....services.logging_utils import RESET, CC_MAIN, CC_H, CC_R, ROBO_MSG, USER_MSG

if TYPE_CHECKING:
    from ....models  import ChatMessage
    from ..consumers import ChatConsumer


# ================================================================================
# Commit ChatMessage objects
# ================================================================================
async def commit_chat_message(
    consumer  : ChatConsumer,  # Active chat connection that owns the session state
    role      : str,           # Message author (currently "user" or "assistant")
    text      : str,           # Final message text to persist and publish
    timestamp : float,         # Timestamp used by the context and listener broadcast
) -> ChatMessage:
    """
    Persist one standalone message before adding it to the local context and
    publishing it. This path is used for unanswered user speech flushed during
    disconnect and for manually supplied assistant responses.
    """
    message = await db_s2a(ChatService.add_message)(consumer.session_id, role, text)
    await _publish_chat_message(consumer, role, text, timestamp)
    return message

# --------------------------------------------------------------------------------
# Commit a matched response turn without allowing a partial database write
# --------------------------------------------------------------------------------
async def commit_chat_exchange(
    consumer            : ChatConsumer,  # Active chat connection that owns the session state
    user_text           : str,           # Finalized user text used for response generation
    user_timestamp      : float,         # User timestamp used by context and listeners
    assistant_text      : str,           # Completed assistant response
    assistant_timestamp : float,         # Assistant timestamp used by context and listeners
) -> tuple[ChatMessage, ChatMessage]:
    """
    Persist a matching user/assistant exchange in one database transaction, then
    publish both messages in their original order. Normal cancellable responses use
    this path only after response generation succeeds.
    """
    user_message, assistant_message = await db_s2a(ChatService.add_exchange)(consumer.session_id, user_text, assistant_text)
    await _publish_chat_message(consumer, "user",           user_text,      user_timestamp)
    await _publish_chat_message(consumer, "assistant", assistant_text, assistant_timestamp)
    return user_message, assistant_message

# --------------------------------------------------------------------------------
# Update local context & listeners for a message already saved to the database
# --------------------------------------------------------------------------------
async def _publish_chat_message(
    consumer  : ChatConsumer,  # Active chat connection that owns the context and groups
    role      : str,           # Message author used by the context and client payload
    text      : str,           # Persisted message text
    timestamp : float,         # Timestamp included with the published message
) -> None:
    # Update the fixed-size in-memory context used for later responses
    consumer.context_buffer.append((role, text, timestamp))
    if len(consumer.context_buffer) > consumer.MAX_CONTEXT: consumer.context_buffer.pop(0)

    # Log the completed update
    message_style = USER_MSG if (role == "user") else ROBO_MSG
    logger.info((
        f"{CC_MAIN} New {CC_H}{role:9}{CC_R} message processed "
        f"({CC_H}context size: {len(consumer.context_buffer)}/{consumer.MAX_CONTEXT}{CC_R}): "
        f"{message_style}\"{text}\"{RESET}"
    ))

    # A listener failure must not invalidate a message already saved to the database
    try: await consumer._broadcast_room({"type": "message", "role": role, "text": text, "ts": timestamp})
    except Exception: logger.exception(f"{CC_MAIN} Failed to broadcast saved {role} message.{RESET}")

