"""
Define a set of "callbacks" for the consumer to help manage the chat.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.consumers.handlers.cc_callbacks`

These methods get implemented by the consumers via simple passthroughs.
"""
from __future__ import annotations

import logging, base64
logger = logging.getLogger(__name__)

# Django / Channels
from channels.db import database_sync_to_async as db_s2a

# From this project
from ....services import logging_utils as lu
from ....services.logging_utils import RESET, BOLD, UNBOLD, CC_MAIN, CC_H, CC_R, ROBO_MSG, USER_MSG

# Handling messages
from ....services.db_services       import ChatService
from  ...services.chatHelpers       import ChatHandler
from  ...services.bg_helpers        import fire_and_log
from  ...services.audioHelpers      import extract_audio_biomarkers, extract_text_biomarkers

# Import the class for type checking
from typing import TYPE_CHECKING
if TYPE_CHECKING: from ..consumers import ChatConsumer


# --------------------------------------------------------------------------------
# Handle "User" & "Robot" messages (saves to DB & broadcasts)
# --------------------------------------------------------------------------------
async def handle_chat_messages(consumer: ChatConsumer, role, text, ts):
    """
    Add messages to the database & update the local context (role must be "user" or "assistant").
    Returns (context_buffer, message) where message is the created ChatMessage instance.
    """
    # Snapshot ID so we aren't depending on an instance from the consumer
    session_id = getattr(consumer, "session_id", None)

    # Await DB write so we can return the message instance (needed for word-timestamp association)
    message = await db_s2a(ChatService.add_message)(session_id, role, text)

    # Update in memory context (pop one if we are at the limit)
    consumer.context_buffer.append((role, text, ts))
    if len(consumer.context_buffer) > consumer.MAX_CONTEXT: consumer.context_buffer.pop(0)

    # Log update
    message_style = USER_MSG if (role == "user") else ROBO_MSG
    logger.info((
        f"{CC_MAIN} New {CC_H}{role:9}{CC_R} message processed "
        f"({CC_H}context size: {len(consumer.context_buffer)}/{consumer.MAX_CONTEXT}{CC_R}): "
        f"{message_style}\"{text}\"{RESET}"
    ))

    # Broadcast updates to any listeners
    await consumer._broadcast_room({"type": "message", "role": role, "text": text, "ts": ts})

    # Return the updated context & the created ChatMessage instance
    return consumer.context_buffer, message

# --------------------------------------------------------------------------------
# Handle "streamed" audio data from the frontend client
# --------------------------------------------------------------------------------
async def handle_audio_data(consumer: ChatConsumer, data):
    """
    Forward streamed audio data from the client to backend STT and append to the
    session recording buffer. Audio biomarkers no longer fire from here -- they
    fire once per committed user utterance via on_audio_biomarkers().
    """
    # Forward audio to the speech to text provider
    consumer.stt_provider.send_audio(data)

    # Add raw audio bytes to the session recording buffer
    consumer._rec_user.extend(base64.b64decode(data["data"]))


# --------------------------------------------------------------------------------
# [TEXT-BASED] Handle on-utterance biomarkers (saves to DB & broadcasts)
# --------------------------------------------------------------------------------
async def on_utterance_biomarkers(consumer: ChatConsumer):
    """
    Because this uses the entire `context_buffer`, it MUST only be called AFTER
    `add_message_CB` has already updated the buffer.
    """
    # Snapshot ID so we aren't depending on an instance from the consumer
    session_id = getattr(consumer, "session_id", None)

    # Get text-based biomarkers
    text_biomarkers = await extract_text_biomarkers(consumer.context_buffer)

    # Save biomarkers scores to the DB & broadcast them to any listeners
    fire_and_log(db_s2a(ChatService.add_biomarkers_bulk)(session_id, text_biomarkers), name="on_utt_bio::add_biomarkers_bulk")
    await consumer._broadcast_monitor({"type": "biomarker_scores", "data": text_biomarkers})

# --------------------------------------------------------------------------------
# [AUDIO-BASED] Handle on-audio biomarkers (saves to DB & broadcasts)
# --------------------------------------------------------------------------------
async def on_audio_biomarkers(consumer: ChatConsumer):
    """
    Fires once per committed user utterance. The real implementation will scope
    audio to the most recent user-speaking window; the stub ignores audio entirely.
    """
    # Snapshot ID so we aren't depending on an instance from the consumer
    session_id = getattr(consumer, "session_id", None)

    # Get audio-based biomarkers (stub: random values, ignores audio)
    audio_biomarkers = await extract_audio_biomarkers(consumer.overlapped_speech_count)

    # Reset the per-utterance overlap counter
    consumer.overlapped_speech_count = 0.0

    # Save biomarkers scores to the DB & broadcast them to any listeners
    fire_and_log(db_s2a(ChatService.add_biomarkers_bulk)(session_id, audio_biomarkers), name="on_audio_bio::add_biomarkers_bulk")
    await consumer._broadcast_monitor({"type": "biomarker_scores", "data": audio_biomarkers})
