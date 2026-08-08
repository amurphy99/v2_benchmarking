"""
Text-to-Speech Provider (using Gemini TTS)
--------------------------------------------------------------------------------
`backend.chat_app.websocket.services.speech.tts.tts_google`

Google-sourced text-to-speech. This

"""
import logging, io, wave
logger = logging.getLogger(__name__)

# Google imports
from google       import genai
from google.genai import types
from google.cloud import texttospeech as g_tts

# From this project
from .....services import logging_utils as lu
from .....services.logging_utils import RESET, BOLD, UNBOLD, TTS_MAIN

# Config (Gemini TTS)
GEMINI_VOICE_NAME = "Kore"
STYLE_PREFIX      = "Say: "  # "Say cheerfully: "

# Config (Google Cloud TTS)
LANGUAGE_CODE    = "en-US"
CLOUD_VOICE_NAME = "en-US-Chirp-HD-F"            # "en-US-Standard-C" | en-US-Chirp-HD-F
VOICE_GENDER     = g_tts.SsmlVoiceGender.NEUTRAL # Not needed for Chirp voices
AUDIO_FMT        = g_tts.AudioEncoding.LINEAR16  # LINEAR16 | OGG_OPUS | PCM
SAMPLE_RATE_HZ   = 24_000

# Aoede | en-US-Chirp-HD-F |  en-US-Chirp3-HD-Aoede | en-US-Neural2-F | en-US-Neural2-F

# ================================================================================
# Text-to-Speech Provider (Gemini TTS)
# ================================================================================
class TextToSpeechProvider_Gemini:

    # Initialize client
    def __init__(self):
        self._gemini_client = genai.Client()
        self._speech_config = types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                    voice_name=GEMINI_VOICE_NAME,
                )
            )
        )

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
                model    = "gemini-2.5-flash-preview-tts",
                contents = prompt,
                config   = types.GenerateContentConfig(
                    response_modalities = ["AUDIO"],  # Only returns audio content
                    speech_config       = self._speech_config,
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
        self._client = g_tts.TextToSpeechClient()
        self._voice  = g_tts.VoiceSelectionParams(
            language_code = LANGUAGE_CODE,
            name          = CLOUD_VOICE_NAME,
        )
        self._audio_config = g_tts.AudioConfig(
            audio_encoding    = AUDIO_FMT,
            sample_rate_hertz = SAMPLE_RATE_HZ,
        )

    # Get speech bytes from Google Cloud TTS and stream them to the client
    def synthesize_speech(self, text) -> tuple[bytes, int, int, int]:
        """
        Returns (pcm_bytes, sample_rate, num_channels, bits_per_sample). 
        Stripping the WAV header here so the frontend receives raw PCM, while
        preserving the actual format metadata so the frontend can decode it
        correctly regardless of what the voice/API returns.

        TODO: I don't think we are TRULY streaming yet... We wait until we have 
              the full audio from Google, and then we send it to the client in
              chunks. True streaming would need a different setup. 
        """
        # Guard / normalize input
        text = (text or "").strip()
        if not text: return b"", SAMPLE_RATE_HZ, 1, 16

        try:
            response = self._client.synthesize_speech(
                input        = g_tts.SynthesisInput(text=text),
                voice        = self._voice,
                audio_config = self._audio_config,
            )

            # Extract raw audio bytes from response
            data_wav         = response.audio_content
            pcm, sr, ch, bps = TextToSpeechProvider.wav_to_pcm_bytes(data_wav)

            #logger.info(f"{TTS_MAIN} WAV->PCM: sr={sr} ch={ch} bps={bps} pcm={len(pcm):,}B{RESET}")
            return pcm, sr, ch, bps

        # Return default/empty audio on errors
        except Exception as e:
            logger.exception(f"{lu.RED}[TTS] Error synthesizing speech: {e}{RESET}")
            return b"", SAMPLE_RATE_HZ, 1, 16

    # --------------------------------------------------------------------------------
    # Convert wav bytes from Google Cloud TTS to PCM before sending to the frontend
    # --------------------------------------------------------------------------------
    @staticmethod
    def wav_to_pcm_bytes(wav_bytes: bytes) -> tuple[bytes, int, int, int]:
        with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
            sr  = wf.getframerate()
            ch  = wf.getnchannels()
            bps = wf.getsampwidth() * 8
            pcm = wf.readframes(wf.getnframes())
        return pcm, sr, ch, bps
