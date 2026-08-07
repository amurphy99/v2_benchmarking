"""
Validate and ingest audio chunks received from a primary WebSocket client.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.consumers.processing.audio`

Each payload contains one small base64-encoded PCM chunk. Valid chunks are passed
to three different objects:
  1. STT queue (to be passed along to ASR for text-extraction)
  2. Optional session recording (store all bytes of audio and save to disk after chat ends)
  3. Rolling audio biomarker buffer (audio biomarkers use the last ~3-5 seconds of rolling audio)

"""
from __future__ import annotations
from datetime   import datetime, timedelta, timezone
from typing     import TYPE_CHECKING

import base64, binascii, logging, time
logger = logging.getLogger(__name__)

# From this project
from ....services.logging_utils import RESET, CC_MAIN

if TYPE_CHECKING: from ..consumers import ChatConsumer

# Constants (TODO: Maybe these should be defined in a config file somewhere...)
AUDIO_CHUNKS_RETAIN_SEC =        90  # Seconds retained for utterance-centered audio biomarker windows
EXPECTED_SAMPLE_RATE    =    16_000  # PCM sample rate accepted by the backend Google STT stream
MAX_AUDIO_PAYLOAD_CHARS = 1_400_000  # Maximum base64 characters accepted in one audio chunk payload


# ================================================================================
# Ingest Audio Payloads
# ================================================================================
async def ingest_audio_payload(consumer: ChatConsumer, data: dict[str, object]) -> None:
    """
    Forward one decoded audio chunk to backend STT and retain the same bytes for
    full-session recording and utterance-centered audio biomarker analysis.

    The first accepted chunk establishes the session audio time anchor used by TTS
    recording alignment, database metadata, and frontend recording playback.
    """
    # 1) Validate and decode the untrusted payload
    pcm_bytes = _validate_audio_payload(data)
    if not pcm_bytes: return

    # 2) Forward the chunk to the ordered STT audio queue
    consumer.stt_provider.send_audio(pcm_bytes)

    # 3) Establish recording time zero on the first chunk actually received
    # TODO: Should we technically subtract the chunk duration because receipt happens after the
    #       first chunk has already been recorded by the frontend?
    if consumer._audio_start_mono is None:
        consumer._audio_start_mono = time.monotonic()
        consumer._audio_start_dt   = datetime.now(timezone.utc)

    # 4) Extend the complete user-audio recording saved during disconnect
    consumer._rec_user.extend(pcm_bytes)

    # 5) Retain a timestamped copy for utterance-centered audio biomarkers
    received_at = datetime.now(timezone.utc)
    consumer._audio_chunks.append((received_at, pcm_bytes))

    # 6) Prune audio older than the configured rolling window
    cutoff = received_at - timedelta(seconds=AUDIO_CHUNKS_RETAIN_SEC)
    while (consumer._audio_chunks) and (consumer._audio_chunks[0][0] < cutoff):
        consumer._audio_chunks.popleft()

# --------------------------------------------------------------------------------
# Validate and decode one base64 frontend audio payload
# --------------------------------------------------------------------------------
def _validate_audio_payload(data: dict[str, object]) -> bytes | None:
    # 1) Validate the advertised PCM sample rate before decoding untrusted data
    sample_rate = data.get("sampleRate", EXPECTED_SAMPLE_RATE)
    if sample_rate != EXPECTED_SAMPLE_RATE:
        logger.warning(f"{CC_MAIN} Ignoring audio with unsupported sample rate: {sample_rate}.{RESET}")
        return None

    # 2) Reject non-string and oversized encoded chunks
    encoded_audio = data.get("data", "")
    if (not isinstance(encoded_audio, str)) or (len(encoded_audio) > MAX_AUDIO_PAYLOAD_CHARS):
        logger.warning(f"{CC_MAIN} Ignoring oversized or non-string audio payload.{RESET}")
        return None

    # 3) Decode strict base64 so malformed payloads never enter recording or STT state
    try: pcm_bytes = base64.b64decode(encoded_audio, validate=True)
    except (binascii.Error, ValueError, TypeError):
        logger.warning(f"{CC_MAIN} Ignoring malformed base64 audio payload.{RESET}")
        return None

    if pcm_bytes: return pcm_bytes
    else:         return None
