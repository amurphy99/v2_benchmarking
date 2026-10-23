"""
Run and persist biomarker pipelines after a user message is committed.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.callbacks`

Text and audio biomarker processing remain asynchronous follow-up work so response
delivery does not wait for model inference or score persistence.

"""
from __future__ import annotations

from channels.db import database_sync_to_async as db_s2a
from typing      import TYPE_CHECKING

# From this project
from ...services.db_services import ChatService
from  .biomarker_extraction  import extract_audio_biomarkers, extract_text_biomarkers

if TYPE_CHECKING:
    from ...models             import ChatMessage
    from ..consumers.consumers import ChatConsumer


# Serialize score spans for WebSocket transport
def _serialize_spans(spans: list[dict[str, object]]) -> list[dict[str, object]]:
    return [{
        "score_type" : span["score_type"],
        "score"      : span["score"     ],
        "start_ts"   : span["start_ts"  ].isoformat() if span.get("start_ts") else None,
        "end_ts"     : span[  "end_ts"  ].isoformat() if span.get(  "end_ts") else None,
    } for span in spans]


# ================================================================================
# Text Biomarkers
# ================================================================================
async def process_text_biomarkers(
    consumer    : ChatConsumer,               # Active chat that owns context and monitor groups
    message     : ChatMessage,                # Committed user message associated with the scores
    recent_text : str,                        # Finalized user text used by the extraction pipeline
    words       : list[dict[str, object]],    # Google STT word timestamps for the message
) -> None:
    """
    Run text biomarker extraction for one committed user utterance. Directly
    submitted transcripts have no Google word timestamps and are intentionally skipped
    because their scores cannot be mapped back to specific words.
    """
    if not words: return

    # Retain the session ID in case this background callback outlives disconnect
    session_id = consumer.session_id
    spans      = await extract_text_biomarkers(recent_text, words, consumer.context_buffer)
    if not spans: return

    await db_s2a(ChatService.add_biomarker_spans_bulk)(session_id, message.id, spans)
    await consumer._broadcast_monitor({"type": "biomarker_scores", "data": _serialize_spans(spans)})


# ================================================================================
# Audio Biomarkers
# ================================================================================
async def process_audio_biomarkers(consumer: ChatConsumer, message: ChatMessage, words: list[dict[str, object]]) -> None:
    """
    Slice the rolling audio buffer around one committed user utterance, run the audio
    biomarker pipeline, and persist and broadcast the resulting score spans.
    """
    if not words: return

    # Snapshot state in case this background callback races with incoming audio or
    # disconnect
    session_id   = consumer.session_id
    audio_chunks = list(consumer._audio_chunks)
    spans        = await extract_audio_biomarkers(audio_chunks, consumer.overlapped_speech_count, words)

    # Reset the per-utterance overlap counter even when no scores were produced
    consumer.overlapped_speech_count = 0.0
    if not spans: return

    await db_s2a(ChatService.add_biomarker_spans_bulk)(session_id, message.id, spans)
    await consumer._broadcast_monitor({"type": "biomarker_scores", "data": _serialize_spans(spans)})
