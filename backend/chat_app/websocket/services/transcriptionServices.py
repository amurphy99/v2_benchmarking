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

class TranscriptionServices:
    """
    Transcription Services class to handle audio transcription using Google Gemini API (currently).
    """

    def __init__(self):
        # Initialize the Gemini client with the API key from environment variables
        self.session = None
        self.client = genai.Client(api_key=os.environ['GOOGLE_API_KEY'])
        self.current_transcript = ""
        self.silence_threshold = 10
        self.silence_max = 2_000
        self.silence_timeout = 0
    
    async def transcribe(self, data):
        audio_bytes, sample_rate, duration = base64.b64decode(data["data"]), data["sampleRate"], data["duration"]
        logger.info(f"{cf.YELLOW}[Transcription] Audio data received: {len(audio_bytes):,} bytes at {sample_rate:,}Hz, duration: {duration}ms")
        
        # Send audio data to Gemini for transcription
        try:
            async with self.client.aio.live.connect(model="gemini-live-2.5-flash-preview", config=config) as session:
                logger.info(f"{cf.YELLOW}[Transcription] Connected to Gemini session")
                await session.send_realtime_input(
                                audio=types.Blob(data=audio_bytes, mime_type=f"audio/pcm;rate={sample_rate}"),
                            )
                logger.info(f"{cf.YELLOW}[Transcription] Sent audio data to Gemini session")
                async for response in session.receive():
                    logger.info(f"{cf.YELLOW}[Transcription] Received response from Gemini: {response}")
                    transcription = response.server_content.input_transcription
                    if transcription:
                        logger.info(f"{cf.YELLOW}[Transcription] Transcribed text: {transcription.text}")
                        self.current_transcript += transcription.text
        except Exception as e:
            logger.error(f"Error transcribing audio: {e}")
            return None
        
        # Check if the current audio segment is silent
        audio_array = array('h', audio_bytes)
        max_value = max(audio_array)
        

        if max_value < self.silence_threshold:
            self.silence_timeout += duration
            if self.silence_timeout >= self.silence_max:
                logger.info(f"{cf.YELLOW}[Transcription] Silence timeout reached: {self.silence_timeout}ms")
                # If silence timeout is reached, return the current transcript
                transcript = self.current_transcript
                self.current_transcript = ""
                return transcript
        else:
            self.silence_timeout = 0
        return None

