# ======================================================================= ===================================
# Gemini Services -- generates transcripts from incoming audio
# ======================================================================= ===================================

# Gemini API
from google import genai
from google.genai import types

# Libraries
import base64
from array import array
import logging
logger = logging.getLogger(__name__)
from ... import config as cf
import asyncio
from collections import deque


# Logging
from time import time
import logging
logger = logging.getLogger(__name__)

# Environment variables
import os

# =======================================================================
# Constants
# =======================================================================
# Gemini API configuration
config = {
    "response_modalities": ["TEXT"],
    "input_audio_transcription": {},
    "maxOutputTokens": 1,
    "speechConfig": { "languageCode": "en-US" },
}
CHUNK_SIZE= 2048

class TranscriptionServices:
    """
    Transcription Services class to handle audio transcription using Google Gemini API (currently).
    """

    def __init__(self):
        # Initialize the Gemini client with the API key from environment variables
        self.client = genai.Client(api_key=os.environ['GOOGLE_API_KEY'])
        self.receive_task = None
        self.model = 'gemini-live-2.5-flash-preview'    
        self.audio_buffer = deque()
        self.streaming = False
        
    async def start(self):
        # 👇 Use async with here to manage session context
        self._session_manager = self.client.aio.live.connect(model=self.model, config=config)
        self._session = await self._session_manager.__aenter__()  # correct way to manually enter async context

        self._receive_task = asyncio.create_task(self._receive_loop())
        self._stream_task = asyncio.create_task(self._stream())
        self.streaming = True
        
    async def stop(self):
        logger.info(f"{cf.RED}[Transcription] stop() called")
        if self._receive_task:
            self._receive_task.cancel()
        if self._session:
            await self._session_manager.__aexit__(None, None, None)  # cleanly exit context
        if self._stream_task:
            self._stream_task.cancel()
        self.streaming = False

    async def send_audio(self, data):
        audio_bytes = base64.b64decode(data["data"])
        self.audio_buffer.append(audio_bytes)

    async def _stream(self):
        logger.info(f"{cf.RED}[Transcription] Started streaming.")
        if not self._session:
            raise RuntimeError(f"{cf.RED}[Transcription] Session not started. Call start() first.")
        while self.streaming:
            if self.audio_buffer:
                chunk = self.audio_buffer.popleft()
                try:
                    await self._session.send_realtime_input(
                        audio=types.Blob(data=chunk, mime_type="audio/pcm;rate=16000")
                    )
                except Exception as e:
                    logger.error(f"{cf.YELLOW}[Transcription] Error sending to Gemini: {e}")
            else:
                await asyncio.sleep(0.05)
    
        
    async def _receive_loop(self):
        receive_gen = self._session.receive()
        while self.streaming:
            message = await anext(receive_gen)
            sc = message.server_content

            if sc.input_transcription:
                # logger.info(f"{cf.RED}[Transcription] Transcribed:", sc.input_transcription.text)
                print("Transcribed: '", sc.input_transcription.text, "'")

            if sc.get("interrupted"):
                logger.info(f"{cf.RED}[Transcription] Model interrupted due to user speaking again.")
    
    # async def transcribe(self, data):
    #     audio_bytes, sample_rate, duration = base64.b64decode(data["data"]), data["sampleRate"], data["duration"]
    #     logger.info(f"{cf.RED}[Transcription] Audio data received: {len(audio_bytes):,} bytes at {sample_rate:,}Hz, duration: {duration}ms")
        
    #     # Send audio data to Gemini for transcription
    #     try:
    #         async with self.client.aio.live.connect(model="gemini-live-2.5-flash-preview", config=config) as session:
    #             logger.info(f"{cf.YELLOW}[Transcription] Connected to Gemini session")
    #             await session.send_realtime_input(
    #                             audio=types.Blob(data=audio_bytes, mime_type=f"audio/pcm;rate={sample_rate}"),
    #                         )
    #             logger.info(f"{cf.YELLOW}[Transcription] Sent audio data to Gemini session")
    #             async for response in session.receive():
    #                 logger.info(f"{cf.YELLOW}[Transcription] Received response from Gemini: {response}")
    #                 transcription = response.server_content.input_transcription
    #                 if transcription:
    #                     logger.info(f"{cf.YELLOW}[Transcription] Transcribed text: {transcription.text}")
    #                     self.current_transcript += transcription.text
    #     except Exception as e:
    #         logger.error(f"Error transcribing audio: {e}")
    #         return None
        
    #     # Check if the current audio segment is silent
    #     audio_array = array('h', audio_bytes)
    #     max_value = max(audio_array)
        

    #     if max_value < self.silence_threshold:
    #         self.silence_timeout += duration
    #         if self.silence_timeout >= self.silence_max:
    #             logger.info(f"{cf.YELLOW}[Transcription] Silence timeout reached: {self.silence_timeout}ms")
    #             # If silence timeout is reached, return the current transcript
    #             transcript = self.current_transcript
    #             self.current_transcript = ""
    #             return transcript
    #     else:
    #         self.silence_timeout = 0
    #     return None
    
from google.cloud import speech_v1


async def sample_streaming_recognize():
    # Create a client
    client = speech_v1.SpeechAsyncClient()

    # Initialize request argument(s)
    streaming_config = speech_v1.StreamingRecognitionConfig()
    streaming_config.config.language_code = "en-US"

    request = speech_v1.StreamingRecognizeRequest(
        streaming_config=streaming_config,
    )

    # This method expects an iterator which contains
    # 'speech_v1.StreamingRecognizeRequest' objects
    # Here we create a generator that yields a single `request` for
    # demonstrative purposes.
    requests = [request]

    def request_generator():
        for request in requests:
            yield request

    # Make the request
    stream = await client.streaming_recognize(requests=request_generator())

    # Handle the response
    async for response in stream:
        print(response)

# [END speech_v1_generated_Speech_StreamingRecognize_async]