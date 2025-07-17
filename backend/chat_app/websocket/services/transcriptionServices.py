# ======================================================================= ===================================
# Gemini Services -- generates transcripts from incoming audio
# ======================================================================= ===================================

# Gemini API
from google import genai
from google.genai import types

# Libraries
import base64
from array import array

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
        self.client = genai.Client(api_key=os.environ['GEMINI_API_KEY'])
        self.session = None
        self.current_transcript = ""
        self.silence_threshold = 10
        self.silence_max = 2_000
        self.silence_timeout = 0
        
    @classmethod
    async def init(self):
        # Initialize the Gemini session
        try:
            self.session = await self.client.aio.live.connect(
                        model="gemini-live-2.5-flash-preview",
                        config=config,
                        audioConfig={ "targetSampleRate": 16000},
                    )
            return self
        except Exception as e:
            logger.error(f"Error initializing Gemini session: {e}")
            return None
    
    async def transcribe(self, data):
        audio_bytes, sample_rate, duration = base64.b64decode(data["data"]), data["sampleRate"], data["duration"]
        
        # Send audio data to Gemini for transcription
        try:
            await self.session.send_realtime_input(
                            audio=types.Blob(data=audio_bytes, mime_type=f"audio/pcm;rate={sample_rate}"),
                            turn_complete=True
                        )
            async for response in self.session.receive():
                if response.text is not None:
                    self.current_transcript += response.text
        except Exception as e:
            logger.error(f"Error transcribing audio: {e}")
            return None
        
        # Check if the current audio segment is silent
        audio_array = array('h', audio_bytes)
        max_value = max(audio_array)

        if max_value < self.silence_threshold:
            self.silence_timeout += duration
            if self.silence_timeout >= self.silence_max:
                # If silence timeout is reached, return the current transcript
                transcript = self.current_transcript
                self.current_transcript = ""
                return transcript
        else:
            self.silence_timeout = 0

