"""
Text-to-Speech Provider (using Gemini TTS)
--------------------------------------------------------------------------------
`backend.chat_app.websocket.services.speech.tts_service`

"""
import logging
logger = logging.getLogger(__name__)

# Google imports
from google       import genai
from google.genai import types
from google.cloud import texttospeech

# From this project
from ....services import logging_utils as lu
from ....services.logging_utils import RESET, BOLD, UNBOLD, TTS_MAIN

# Config (Gemini TTS)
VOICE_NAME   = "Kore"
STYLE_PREFIX = "Say: "  # "Say cheerfully: "

# Config (Google Cloud TTS)
LANGUAGE_CODE  = "en-US"
VOICE_NAME     = "en-US-Standard-C"
AUDIO_FMT      = texttospeech.AudioEncoding.PCM  # LINEAR16 | OGG_OPUS | PCM
SAMPLE_RATE_HZ = 24_000


# ================================================================================
# Text-to-Speech Provider (Gemini TTS)
# ================================================================================
class TextToSpeechProvider_Gemini:

    # Initialize client
    def __init__(self):
        self._gemini_client = genai.Client()

    # Synthesize Speech
    def synthesize_speech(self, text) -> bytes:
        # Guard / normalize input
        text = (text or "").strip()
        if not text: return b""

        try:
            # Build prompt
            prompt = f"{STYLE_PREFIX}{text}"

            # Request audio-only output from Gemini TTS
            response = self._gemini_client.models.generate_content(
                model="gemini-2.5-flash-preview-tts",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],  # Only return audio content
                    speech_config=types.SpeechConfig(
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=VOICE_NAME,)
                        )
                    ),
                ),
            )

            # Extract raw audio bytes from response
            data = response.candidates[0].content.parts[0].inline_data.data
            logger.info(f"{TTS_MAIN} Speech synthesized by Gemini TTS ({len(data):,} bytes){RESET}")
            return data

        except Exception as e: 
            logger.exception(f"{lu.RED}[TTS] Error synthesizing speech: {e}{RESET}")
            return b""
          

# ================================================================================
# Text-to-Speech Provider (Google Cloud TTS)
# ================================================================================
class TextToSpeechProvider:
    def __init__(self):
        self._client = texttospeech.TextToSpeechClient()

    def synthesize_speech(self, text) -> bytes:
        # Guard / normalize input
        text = (text or "").strip()
        if not text: return b""
        try:
            response = self._client.synthesize_speech(
                input=texttospeech.SynthesisInput(text=text),
                voice=texttospeech.VoiceSelectionParams(
                    language_code = LANGUAGE_CODE,
                    name          = VOICE_NAME,
                ),
                audio_config=texttospeech.AudioConfig(
                    audio_encoding    = AUDIO_FMT,
                    sample_rate_hertz = SAMPLE_RATE_HZ,
                ),
            )

            # Extract raw audio bytes from response
            data = response.audio_content
            logger.info(f"{TTS_MAIN} Speech synthesized by Google Cloud TTS ({len(data):,} bytes){RESET}")
            return data

        except Exception as e:
            logger.exception(f"{lu.RED}[TTS] Error synthesizing speech: {e}{RESET}")
            return b""
