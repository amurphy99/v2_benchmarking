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
AUDIO_CHUNKS_RETAIN_SEC  =        90    # Seconds retained for utterance-centered audio biomarker windows
EXPECTED_SAMPLE_RATE     =    16_000    # PCM sample rate accepted by the backend Google STT stream
EXPECTED_CHANNELS        =         1    # Interleaved channel count accepted for user microphone audio
EXPECTED_BITS_PER_SAMPLE =        16    # Signed PCM bit depth accepted for user microphone audio
EXPECTED_ENCODING        = "pcm_s16le"  # Canonical little-endian PCM encoding name
MAX_AUDIO_PAYLOAD_CHARS  = 1_400_000    # Maximum base64 characters accepted in one audio chunk payload


# ================================================================================
# Ingest Audio Payloads
# ================================================================================
async def ingest_audio_payload(consumer: ChatConsumer, data: dict[str, object]) -> None:
    """
    Forward one decoded audio chunk to backend STT and retain the same bytes for
    the incremental session recording and utterance-centered biomarker analysis.

    The first accepted chunk establishes the `SessionAudio.started_at` anchor used
    for frontend transcript seeking.
    """
    # 1) Validate and decode the untrusted payload
    pcm_bytes = _validate_audio_payload(data)
    if not pcm_bytes: return

    # 2) Forward the chunk to STT; paused streams reject it consistently everywhere
    received_mono = time.monotonic()
    received_at   = datetime.now(timezone.utc)
    if not consumer.stt_provider.send_audio(pcm_bytes): return

    # 3) Write the accepted user chunk directly to the temporary session WAV
    consumer.audio_recorder.write_user_audio(pcm_bytes, received_at, received_mono)

    # 4) Retain a timestamped copy for utterance-centered audio biomarkers
    consumer._audio_chunks.append((received_at, pcm_bytes))

    # 5) Prune audio older than the configured rolling window
    cutoff = received_at - timedelta(seconds=AUDIO_CHUNKS_RETAIN_SEC)
    while (consumer._audio_chunks) and (consumer._audio_chunks[0][0] < cutoff):
        consumer._audio_chunks.popleft()

# --------------------------------------------------------------------------------
# Validate and decode one base64 frontend audio payload
# --------------------------------------------------------------------------------
def _validate_audio_payload(data: dict[str, object]) -> bytes | None:
    """
    NOTE: We previously had a bug where we were getting chunks with weird sizes, so
          audio processing would result in 16,128 bits rather than 16,000 for example.
          Not sure if this is fully fixed, or if outright rejecting stuff here is
          better than actually going and fixing it, but this is what we have for now...
    """
    # 1) Validate the advertised PCM sample rate before decoding untrusted data
    sample_rate = data.get("sampleRate", EXPECTED_SAMPLE_RATE)
    if sample_rate != EXPECTED_SAMPLE_RATE:
        logger.warning(f"{CC_MAIN} Ignoring audio with unsupported sample rate: {sample_rate}.{RESET}")
        return None

    # Validate the rest of the PCM format
    channels        = data.get("channels",      EXPECTED_CHANNELS)
    bits_per_sample = data.get("bitsPerSample", EXPECTED_BITS_PER_SAMPLE)
    encoding        = data.get("encoding",      EXPECTED_ENCODING)
    if (channels, bits_per_sample, encoding) != (EXPECTED_CHANNELS, EXPECTED_BITS_PER_SAMPLE, EXPECTED_ENCODING):
        logger.warning(f"{CC_MAIN} Ignoring audio with an unsupported PCM format.{RESET}")
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

    if len(pcm_bytes) % (EXPECTED_BITS_PER_SAMPLE // 8):
        logger.warning(f"{CC_MAIN} Ignoring audio ending in a partial PCM sample.{RESET}")
        return None

    if pcm_bytes: return pcm_bytes
    else:         return None
