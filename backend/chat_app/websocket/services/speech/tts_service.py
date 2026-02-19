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

# From this project
from ....services import logging_utils as lu
from ....services.logging_utils import RESET, BOLD, UNBOLD, TTS_MAIN

# Config
VOICE_NAME   = "Kore"
STYLE_PREFIX = "Say: "  # "Say cheerfully: "


# ================================================================================
# Text-to-Speech Provider (Gemini TTS)
# ================================================================================
class TextToSpeechProvider:

    # Initialize client
    def __init__(self):
        self._gemini_client = genai.Client()

    # Synthesize Speech
    def synthesize_speech(self, text: str) -> bytes:
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
            logger.info(f"{TTS_MAIN} Speech synthesized ({len(data):,} bytes){RESET}")
            return data

        except Exception as e: 
            logger.exception(f"{lu.RED}[TTS] Error synthesizing speech: {e}{RESET}")
            return b""
          
