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
    def __init__(self, on_transcription_callback=None, loop=None):
        self._client = speech.SpeechClient()
        self._streaming_config = None
        self._audio_buffer = Queue()
        self._streaming = False
        self.on_transcription_callback = on_transcription_callback
        self.loop = loop or asyncio.get_event_loop()

    def _audio_generator(self):
        while self._streaming:
            if self._audio_buffer:
                data = self._audio_buffer.get()
                if data is None:
                    break
                yield speech.StreamingRecognizeRequest(audio_content=data)

    def start(self):
        self._streaming = True
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
            sample_rate_hertz=SAMPLE_RATE,
            language_code="en-US",
        )
        self._streaming_config = speech.StreamingRecognitionConfig(
            config=config,
            interim_results=False,
        )

        threading.Thread(target=self._start_streaming_thread, daemon=True).start()

    def _start_streaming_thread(self):
        requests = self._audio_generator()

        try:
            responses = self._client.streaming_recognize(config=self._streaming_config, requests=requests)
            self._listen_responses(responses)
        except Exception as e:
            print(f"[ERROR] Streaming connection failed: {e}")


    def _listen_responses(self, responses):
        for response in responses:
            for result in response.results:
                if result.is_final:
                    transcript = result.alternatives[0].transcript
                    logger.info(f"{cf.RED}[Transcription] Received final transcription: {transcript}.")
                    if self.on_transcription_callback:
                        data = {"type": "transcript", "data": transcript}
                        if asyncio.iscoroutinefunction(self.on_transcription_callback):
                            asyncio.run_coroutine_threadsafe(
                                self.on_transcription_callback(data),
                                self.loop
                            )
                        else:
                            self.on_transcription_callback(data)

    def send_audio(self, data):
        audio_bytes = base64.b64decode(data["data"])
        self._audio_buffer.put(audio_bytes)
        if not self._streaming:
            self.start()

    def stop(self):
        self._streaming = False
        self._audio_buffer.put(None)
