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
CHUNK_SIZE = 8_192  # Chunk size (bytes) of TTS audio streamed back to frontend client


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
async def stream_audio_chunks(audio_bytes, send_callback):
    if not audio_bytes: return

    n_chunks = ceil(len(audio_bytes) / CHUNK_SIZE)
    for i in range(n_chunks):
        chunk = audio_bytes[i * CHUNK_SIZE:(i + 1) * CHUNK_SIZE]

        await send_callback(json.dumps({
            "type": "audio_chunk",
            "data": {"data": base64.b64encode(chunk).decode("utf-8")}
        }))

