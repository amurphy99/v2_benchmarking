"""
Text-to-Speech Audio Streaming
--------------------------------------------------------------------------------
`bbackend.chat_app.websocket.services.speech.tts_streaming`

"""
import logging, asyncio, base64, json
logger = logging.getLogger(__name__)

from math import ceil
from asgiref.sync import sync_to_async

# From this project
from ....services import logging_utils as lu
from ....services.logging_utils import RESET, BOLD, UNBOLD, TTS_MAIN

from .tts_service import TextToSpeechProvider

# Config 
# Chunk size (bytes) of TTS audio streamed back to frontend client. 
CHUNK_SIZE = 8_192   # 8_192 | 4_800

# ================================================================================
# Stream a TTS audio response to the frontend in base64 chunks
# ================================================================================
async def synthesize_and_stream_tts(system_resp, send_callback):
    """
    1) Synthesize speech bytes (run sync TTS off the event loop)
    2) Chunk + stream to the frontend over websocket
    """
    # Synthesize speech (sync network call -> run in thread)
    tts_provider = TextToSpeechProvider()
    audio_bytes  = await sync_to_async(tts_provider.synthesize_speech)(system_resp)

    # Stream audio chunks to client
    await stream_audio_chunks(audio_bytes, send_callback)

    logger.info(f"{TTS_MAIN} Synthesized speech sent to frontend. {RESET}")

# --------------------------------------------------------------------------------
# Split and send audio bytes in chunks to the frontend
# --------------------------------------------------------------------------------
# TODO: The frontend might be able to use the other data fields here, especially
#       "last", but for now I am just leaving it out.
async def stream_audio_chunks(audio_bytes, send_callback):
    if not audio_bytes: return

    n_chunks = ceil(len(audio_bytes) / CHUNK_SIZE)
    for i in range(n_chunks):
        chunk = audio_bytes[i * CHUNK_SIZE:(i + 1) * CHUNK_SIZE]

        # Build the payload ("audio_chunk" is how the frontend knows to pass this to the audio player).
        # For now hardcoding payload data into the frontend; check `useAudioPlayer.ts` for more info.
        payload = {
            "type": "audio_chunk",
            "data": {
                "b64"  : base64.b64encode(chunk).decode("utf-8"),
                #"sr"   : 24_000,
                #"ch"   : 1,
                #"bps"  : 16,
                #"seq"  : i,
                #"last" : (i == n_chunks - 1),
            }
        }

        # Stream to the frontend
        await send_callback(json.dumps(payload))
