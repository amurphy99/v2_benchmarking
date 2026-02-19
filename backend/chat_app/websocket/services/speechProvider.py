"""
Live user chat controller.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.services.speechProvider`

"""
import logging, threading, asyncio, base64, os
logger = logging.getLogger(__name__)

from datetime import datetime, timedelta
from queue    import Queue

# Google imports
from google.cloud import speech, texttospeech
from google import genai
from google.genai import types

# From this project
from ...services import logging_utils as lu
from ...services.logging_utils import RESET, BOLD, UNBOLD, STT_MAIN

# Constants
SAMPLE_RATE = 16_000
CHUNK_SIZE  =  2_048  # 64ms of 16-bit PCM audio = 2048 bytes


# ================================================================================
# Streaming STT via audio bytes received from the ChatConsumer client
# ================================================================================
class SpeechToTextProvider:
    '''Speech-to-Text provider that uses Google Cloud's Speech-to-Text API'''
    def __init__(self, loop, transcript_callback, *, msg_callback=None, send_callback=None, bio_callback=None, on_timestamps_callback=None):
        self._client              = speech.SpeechClient()
        self._streaming_config    = None
        self._audio_buffer        = Queue()
        self._streaming           = False
        self._thread              = None    # The thread we use for streaming
        self._recent_transcript   = None    # Used to avoid processing duplicate STT results

        # From ChatConsumer
        self._loop                = loop                    # Loop from the consumer
        self._transcript_callback = transcript_callback     # The function to call when a complete transcription is received
        self._msg_callback        = msg_callback            # Callback to add new messages to the database & update local chat context
        self._bio_callback        = bio_callback            # On utterance received, calculate audio-biomarkers (we know the user was just speaking)
        self._ts_callback         = on_timestamps_callback  # The function to call when word-level timestamps are received
        self._send_callback       = send_callback           # Callback to send data to the chat WebSocket client

        # Re-used for every transcript result
        self._transcript_args = dict(
            msg_callback  = self._msg_callback, 
            send_callback = self._send_callback, 
            bio_callback  = self._bio_callback
        )
        

    def _audio_generator(self):
        '''Generates audio requests from the audio buffer.'''
        while self._streaming:
            data = self._audio_buffer.get()
            if data is None: break
            if self._audio_buffer:
                data = self._audio_buffer.get()
                if data is None: break
                yield speech.StreamingRecognizeRequest(audio_content=data)

    # --------------------------------------------------------------------------------
    # Start the stream
    # --------------------------------------------------------------------------------
    # Initializes the configs and starts a new thread to handle the streaming without blocking.
    def start(self):
        # Guard to make sure we aren't already streaming
        if getattr(self, "_thread", None) and self._thread.is_alive(): return    
        self._streaming = True

        # Configure the stream
        config = speech.RecognitionConfig(
            encoding                     = speech.RecognitionConfig.AudioEncoding.LINEAR16,
            sample_rate_hertz            = SAMPLE_RATE,
            language_code                = "en-US",
            enable_automatic_punctuation = True,
            enable_spoken_punctuation    = True,
            model                        = "latest_long",
            use_enhanced                 = True,
            enable_word_time_offsets     = True,
        )
        self._streaming_config = speech.StreamingRecognitionConfig(
            config          = config, 
            interim_results = False,
        )

        # Track the thread
        self._thread = threading.Thread(target=self._start_streaming_thread, daemon=True)
        self._thread.start()
        
    # Main streaming thread
    # The generator yields streaming recognition requests, and we send them to the Google Cloud STT API. 
    def _start_streaming_thread(self):
        try:
            responses = self._client.streaming_recognize(config=self._streaming_config, requests=self._audio_generator())
            self._listen_responses(responses)
        
        # Make sure the streaming attribute gets reset when the thread exits
        except Exception as e: logger.info(f"{STT_MAIN} STT streaming connection {BOLD}{lu.RED}FAILED{UNBOLD}{lu.BRIGHT_BLUE}: {e} {RESET}")
        finally: self._streaming = False  

    # --------------------------------------------------------------------------------
    # Stop the stream | TODO: Maybe change to keep recognizing the drained content?
    # --------------------------------------------------------------------------------
    def stop(self):
        self._streaming = False
        self._audio_buffer.put(None)

        # Drain the queue so we don't replay old audio later 
        while not self._audio_buffer.empty():
            try: self._audio_buffer.get_nowait()
            except: break

    # --------------------------------------------------------------------------------
    # Sends audio data to the audio buffer
    # --------------------------------------------------------------------------------
    def send_audio(self, data):
        audio_bytes = base64.b64decode(data["data"])
        self._audio_buffer.put(audio_bytes)

        # Restart if not streaming OR thread is dead
        if (not self._streaming) or (not getattr(self, "_thread", None)) or (not self._thread.is_alive()): 
            self.start()
    

    # ================================================================================
    # Handles responses from the Google Cloud STT API
    # ================================================================================
    def _listen_responses(self, responses):
        """
        If the received response is final, it calls the transcription callback defined 
        in the constructor, as well as the word timestamps callback from the constructor.
        """
        for response in responses:
            for result in response.results:
                # Ignore interim results
                if not result.is_final: continue

                # Make sure this isn't a duplicate transcript
                transcript = result.alternatives[0].transcript
                if (transcript == self._recent_transcript) or (len(transcript) < 1): continue

                # Log the resulting transcription
                self._recent_transcript = transcript
                logger.info(f"{lu.RED}[Transcription] Received final transcription: {transcript} {lu.RESET}")
                
                # Send the transcript results to the ChatConsumer
                data = {"type": "user_utt", "data": transcript}
                asyncio.run_coroutine_threadsafe(self._transcript_callback(data, **self._transcript_args), self._loop)
                    
                # TODO: We don't currently handle STT results with word-level timestamps
                if self._ts_callback: 
                    word_timestamps = SpeechToTextProvider._get_word_timestamps(datetime.now(), result.alternatives[0].words)
                    asyncio.run_coroutine_threadsafe(self._ts_callback(word_timestamps), self._loop)
          
    
    # TODO: Doesn't work for transcript highlighting
    # TODO: These timestamps need to be related to either the start of the ChatMessage, or real time
    @staticmethod
    def _get_word_timestamps(now, words):
        return [{"word"  : word.word, 
                 "start" : now + word.start_time, 
                 "end"   : now + word.end_time
            } for word in words]






class TextToSpeechProvider:
    '''TTS provider class. Uses Google's TTS API.'''
    def __init__(self):
        self._gemini_client = genai.Client()
        self._audio_config = None
    
    # May not need if we decide to use the Google Cloud TTS instead
    def synthesize_speech(self, text: str) -> bytes:
        '''Synthesizes speech using Google's Gemini TTS API. Returns the audio content as bytes.'''
        try:
            response = self._gemini_client.models.generate_content(
                model="gemini-2.5-flash-preview-tts",
                contents="Say cheerfully: " + text,
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"], # The model will return audio content
                    speech_config=types.SpeechConfig(
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name='Kore',
                            )
                        )
                    ),
                )
            )
            data = response.candidates[0].content.parts[0].inline_data.data
            logger.info(f"{lu.YELLOW}[TTS] Speech synthesized {lu.RESET}")
            return data
        except Exception as e:
            logger.error(f"{lu.RED}[TTS] Error synthesizing speech: {e} {lu.RESET}")