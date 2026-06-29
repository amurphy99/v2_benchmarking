"""
Define a set of "callbacks" for the ChatConsumer (cc) to help manage the chat.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.consumers.handlers.cc_callbacks`

Handles incoming chat messages (text data) as well as incoming audio data from
an active chat. Saves things to the database, passes information to any other
consumers that are listening in, and generates biomarker scores.

These methods get implemented by the consumers via simple passthroughs.
"""
from __future__ import annotations
from datetime   import datetime, timedelta, timezone

import logging, base64, time
logger = logging.getLogger(__name__)

# Django / Channels
from channels.db import database_sync_to_async as db_s2a

# From this project
from ....services import logging_utils as lu
from ....services.logging_utils import RESET, BOLD, UNBOLD, CC_MAIN, CC_H, CC_R, ROBO_MSG, USER_MSG

# Handling messages
from ....services.db_services            import ChatService
from  ...services.chatHelpers            import ChatHandler
from  ...services.bg_helpers             import fire_and_log
from  ...biomarkers.biomarker_extraction import extract_audio_biomarkers, extract_text_biomarkers

# Import the class for type checking
from typing import TYPE_CHECKING
if TYPE_CHECKING: from ..consumers import ChatConsumer

# How much rolling audio to keep in `consumer._audio_chunks` -- needs to cover any
# realistic utterance plus the 15s pre-roll and 1s post-roll used by the audio
# biomarker slicing. TODO: Should this be from a config file?
AUDIO_CHUNKS_RETAIN_SEC = 90


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
    Forward streamed audio data to backend STT, append to the full-session
    recording buffer, and append a timestamped copy to the rolling chunk deque
    used by the audio biomarker pipeline. Audio biomarkers fire once per
    committed user utterance via on_audio_biomarkers().

    Additionally, here we set up an anchor timestamp (where time = 0.0) for the
    beginning of the audio stream/recording. The anchor is set on the first
    chunk of audio we actually receive (not based on when the user hits buttons).
    Anchor timestamp gets used by:
      - accumulate_tts() to position TTS in the right channel of the recording
      - close_session() to persist as ChatSession.audio_start_ts
      - frontend TranscriptPlayback to setup proper audio file seeking offsets
    """
    # (1) Forward audio to the speech to text provider
    consumer.stt_provider.send_audio(data)

    # Decode audio bytes once (reused for both buffers)
    pcm_bytes = base64.b64decode(data["data"])

    # Set the anchor timestamp (time = 0.0) on the first chunk 
    # TODO: It should actually technically be this timestamp **minus the chunk size in seconds**
    #       because we receive the first chunk X seconds into the recording...
    if consumer._audio_start_mono is None:
        consumer._audio_start_mono = time.monotonic()
        consumer._audio_start_dt   = datetime.now(timezone.utc)

    # (2) Full-session recording (saved as WAV on disconnect)
    consumer._rec_user.extend(pcm_bytes)

    # (3) Rolling timestamped buffer for audio biomarker slicing
    received_at = datetime.now()
    consumer._audio_chunks.append((received_at, pcm_bytes))

    # Prune anything older than the retain window
    cutoff = received_at - timedelta(seconds=AUDIO_CHUNKS_RETAIN_SEC)
    while (consumer._audio_chunks) and (consumer._audio_chunks[0][0] < cutoff):
        consumer._audio_chunks.popleft()


# ================================================================================
# Biomarker-related Actions
# ================================================================================
# Serialize ScoreSpans for the WebSocket broadcast (datetimes -> ISO strings)
def _serialize_spans(spans):
    return [{
        "score_type" : s["score_type"],
        "score"      : s["score"     ],
        "start_ts"   : s["start_ts"  ].isoformat() if s.get("start_ts") else None,
        "end_ts"     : s[  "end_ts"  ].isoformat() if s.get(  "end_ts") else None,
    } for s in spans]


# --------------------------------------------------------------------------------
# [TEXT-BASED] Handle on-utterance biomarkers (saves to DB & broadcasts)
# --------------------------------------------------------------------------------
async def on_utterance_biomarkers(consumer: ChatConsumer, message, recent_text, words):
    """
    Fires once per committed user utterance. Skipped when there are no STT word
    timestamps (admin-injected utterances), since text-based scores must be
    mappable back to specific words.
    """
    if not words: return

    # Snapshot ID so we aren't depending on an instance from the consumer
    session_id = getattr(consumer, "session_id", None)

    # Run the text biomarker pipeline -> returns a list of biomarker ScoreSpan dicts
    spans = await extract_text_biomarkers(recent_text, words, consumer.context_buffer)
    if not spans: return

    # Save biomarkers spans to the DB (linked to this message) & broadcast the list to any monitors
    fire_and_log(db_s2a(ChatService.add_biomarker_spans_bulk)(session_id, message.id, spans),
                 name="on_utt_bio::add_biomarker_spans_bulk",)
    await consumer._broadcast_monitor({"type": "biomarker_scores", "data": _serialize_spans(spans)})


# --------------------------------------------------------------------------------
# [AUDIO-BASED] Handle on-audio biomarkers (saves to DB & broadcasts)
# --------------------------------------------------------------------------------
async def on_audio_biomarkers(consumer: ChatConsumer, message, words):
    """
    Fires once per committed user utterance. The pipeline (in
    biomarker_extraction) slices ~15s pre-roll + utterance + 1s post-roll out of
    consumer._audio_chunks, runs OpenSMILE, and windows the features inside the
    utterance bounds before scoring. Skipped if `words` is empty.
    """
    if not words: return

    # Snapshot ID so we aren't depending on an instance from the consumer
    session_id = getattr(consumer, "session_id", None)

    # Snapshot the rolling chunk deque so the pipeline thread doesn't race with handle_audio_data
    audio_chunks_snapshot = list(consumer._audio_chunks)

    # Run the audio biomarker pipeline -> returns a list of biomarker ScoreSpan dicts
    spans = await extract_audio_biomarkers(audio_chunks_snapshot, consumer.overlapped_speech_count, words)

    # Reset the per-utterance overlap counter regardless of whether spans were produced
    consumer.overlapped_speech_count = 0.0

    if not spans: return

    # Save biomarkers spans to the DB (linked to this message) & broadcast the list to any monitors
    fire_and_log(db_s2a(ChatService.add_biomarker_spans_bulk)(session_id, message.id, spans),
                 name="on_audio_bio::add_biomarker_spans_bulk",)
    await consumer._broadcast_monitor({"type": "biomarker_scores", "data": _serialize_spans(spans)})

