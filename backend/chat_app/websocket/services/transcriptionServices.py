from google.cloud import speech
import queue
import threading
import asyncio
import os
import time
from queue import Queue
import base64
from ... import config as cf
import logging
logger = logging.getLogger(__name__)

# Constants
SAMPLE_RATE = 16000
CHUNK_SIZE = 2048  # 64ms of 16-bit PCM audio = 2048 bytes

class TranscriptionServices:
    def __init__(self):
        self.client = speech.SpeechClient()
        self.audio_buffer = Queue()
        self.streaming = False

    def audio_generator(self):
        while self.streaming:
            if self.audio_buffer:
                data = self.audio_buffer.get()
                if data is None:
                    logger.info(f"{cf.RED}[Transcription] Queue is empty.")
                    break
                logger.info(f"{cf.RED}[Transcription] Sending {len(data)} bytes at {time.time()}.")
                yield speech.StreamingRecognizeRequest(audio_content=data)

    async def start(self):
        logger.info(f"{cf.RED}[Transcription] Started streaming.")
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
            sample_rate_hertz=SAMPLE_RATE,
            language_code="en-US",
        )
        streaming_config = speech.StreamingRecognitionConfig(
            config=config,
            interim_results=True
        )

        self.streaming = True

        # Open a generator stream to Google
        requests = self.audio_generator()
        responses = await self.client.streaming_recognize(config=streaming_config, requests=requests)

        # Handle transcription responses in a thread
        threading.Thread(target=self.listen_responses, args=(responses,), daemon=True).start()

    async def listen_responses(self, responses):
        for response in responses:
            logger.info(f"{cf.RED}[Transcription] Received response: {response}.")
            for result in response.results:
                if result.is_final or result.alternatives:
                    print("Transcript:", result.alternatives[0].transcript)


    async def send_audio(self, data):
        audio_bytes = base64.b64decode(data["data"])
        self.audio_buffer.put(audio_bytes)
        logger.info(f"{cf.RED}[Transcription] Received {len(audio_bytes)} audio bytes.")
        if not self.streaming:
            await self.start()

    def stop(self):
        self.streaming = False
        self.audio_buffer.put(None)
