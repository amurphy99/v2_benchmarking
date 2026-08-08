"""
Text-to-speech (TTS) synthesized audio streaming.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.services.speech.tts.tts_streaming`

We use TTS to synthesize audio for the assistant messages here, and then we
stream it to the frontend for playback to the user.

NOTE: Not all of our "frontend" interfaces use this -- some just need to get the
      assistant's text response back from us and they will handle TTS on their
      own (QT Robot, Buddy Robot).

TODO: Last I remembered, while we do stream the TTS result that we get back to
      the frontend, the actual TTS *generation* is NOT streamed. So, rather than
      making a request to the TTS provider and then passing audio chunks that we
      receive through to the frontend (like the reverse of how we handle STT
      streaming), we wait ~1-2 seconds for the full TTS response, and THEN send
      the resulting chunks of audio to the frontend. This should be fixed...

------

NOTE: Additionally, we used to attempt to combine the actual raw TTS output that
      was generated for the assistant's messages here and merge it into the
      audio that we track and save for the user's session. There were multiple
      issues with that including formatting, correctly aligning the timestamps,
      and more, so that function has been cut.

"""
import logging, asyncio, base64, json
logger = logging.getLogger(__name__)

from asgiref.sync import sync_to_async
from math         import ceil
from time         import monotonic as now_ts
from typing       import Awaitable, Callable

# From this project
from .....services               import logging_utils as lu
from .....services.logging_utils import RESET, BOLD, UNBOLD, TTS_MAIN
from     .tts_google             import TextToSpeechProvider

# Chunk size (bytes) of TTS audio streamed back to frontend client. 
CHUNK_SIZE = 8_192  # Maximum PCM bytes included in one outbound TTS WebSocket chunk


# ================================================================================
# Stream a TTS audio response to the frontend in base64 chunks
# ================================================================================
async def synthesize_and_stream_tts(system_resp: str, send_callback: Callable[[str], Awaitable[object]], response_id: int) -> None:
    """
    1) Synthesize speech bytes (run sync TTS off the event loop)
    2) Chunk + stream it to the frontend with format and response metadata

    NOTE: We include the `response_id` here when we send the data to the frontend
          so that they have the option to respond with control messages letting
          us know when they actually start and finish with audio playback. This
          let's us recover utterance-level start and end timestamps that we
          could not otherwise track.
    """
    t0 = now_ts()

    # Synthesize speech 
    # NOTE: This is a synchronous network call, so we run it in a thread
    tts_provider             = TextToSpeechProvider()
    audio_bytes, sr, ch, bps = await sync_to_async(tts_provider.synthesize_speech)(system_resp)

    # Stream audio chunks to client
    await _stream_audio_chunks(audio_bytes, send_callback, response_id, sr, ch, bps)

    # Log upon completion
    total_time = now_ts() - t0
    logger.info(f"{TTS_MAIN} Synthesized speech sent to frontend ({lu.CYAN}{BOLD}{total_time:.4f}s{UNBOLD}{TTS_MAIN}). {RESET}")


# --------------------------------------------------------------------------------
# Split and send audio bytes in chunks to the frontend
# --------------------------------------------------------------------------------
async def _stream_audio_chunks(
    audio_bytes     : bytes,                               # Complete PCM returned by Google TTS
    send_callback   : Callable[[str], Awaitable[object]],  # Active frontend WebSocket sender
    response_id     : int,                                 # Persisted assistant ChatMessage ID
    sample_rate     : int,                                 # PCM samples per second
    channels        : int,                                 # Interleaved PCM channel count
    bits_per_sample : int,                                 # PCM sample bit depth
) -> None:
    """
    NOTE: The synthesizer returns (pcm_bytes, sample_rate, num_channels, 
          bits_per_sample) so the audio recorder can resample both channels with
          proper WAV parameters instead of guessing. This should help prevent
          the static we hear in the playback (the user sends us audio in a 
          different format than TTS generates it in; we can't just combine them
          blindly).
    """
    if not audio_bytes: return

    # Chunk the audio and send each one individually
    n_chunks = ceil(len(audio_bytes) / CHUNK_SIZE)
    for i in range(n_chunks):
        chunk = audio_bytes[i * CHUNK_SIZE:(i + 1) * CHUNK_SIZE]

        # Include everything the browser needs to schedule and identify this response
        payload = {
            "type": "audio_chunk",
            "data": {
                "b64"           : base64.b64encode(chunk).decode("utf-8"),
                "responseId"    : response_id,
                "sampleRate"    : sample_rate,
                "channels"      : channels,
                "bitsPerSample" : bits_per_sample,
                "sequence"      : i,
                "last"          : (i == n_chunks - 1),
            }
        }

        # Stream to the frontend
        await send_callback(json.dumps(payload))
