from google.cloud import speech, texttospeech
from google import genai
from google.genai import types

from datetime import datetime, timedelta

import threading, asyncio, base64, logging, os
from queue import Queue

from ... import config as cf


logger = logging.getLogger(__name__)

# Constants
SAMPLE_RATE = 16_000
CHUNK_SIZE = 2_048  # 64ms of 16-bit PCM audio = 2048 bytes

class SpeechToTextProvider:
    '''Speech-to-Text provider that uses Google Cloud's Speech-to-Text API'''
    def __init__(self, transcript_callback=None, msg_callback=None, send_callback=None, bio_callback=None, on_timestamps_callback=None, loop=None):
        self._client = speech.SpeechClient()
        self._streaming_config = None
        self._audio_buffer = Queue()
        self._streaming = False
        self._transcript_callback = transcript_callback # The function to call when a complete transcription is received
        self._msg_callback = msg_callback
        self._send_callback = send_callback
        self._bio_callback = bio_callback
        self.ts_callback = on_timestamps_callback # The function to call when word-level timestamps are received
        self._loop = loop or asyncio.get_event_loop()
        self._recent_transcript = None

    def _audio_generator(self):
        '''Generates audio requests from the audio buffer.'''
        while self._streaming:
            if self._audio_buffer:
                data = self._audio_buffer.get()
                if data is None:
                    break
                yield speech.StreamingRecognizeRequest(audio_content=data)

    def start(self):
        '''Starts the streaming process. Initializes the configs and starts a new thread to handle the streaming without blocking.'''
        self._streaming = True
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
            sample_rate_hertz=SAMPLE_RATE,
            language_code="en-US",
            enable_automatic_punctuation=True,
            enable_spoken_punctuation=True,
            model="latest_long",
            use_enhanced=True,
            enable_word_time_offsets=True,
        )
        self._streaming_config = speech.StreamingRecognitionConfig(
            config=config,
            interim_results=False,
        )

        threading.Thread(target=self._start_streaming_thread, daemon=True).start()
        
    def stop(self):
        '''Stops the streaming process.'''
        self._streaming = False
        self._audio_buffer.put(None)
        
    def send_audio(self, data):
        '''Sends audio data to the audio buffer. If streaming is not active, starts the streaming process.'''
        audio_bytes = base64.b64decode(data["data"])
        self._audio_buffer.put(audio_bytes)
        if not self._streaming:
            self.start()
            
    def _start_streaming_thread(self):
        '''Main streaming thread. Upon the generator yielding streaming recognition requests, will send them to the Google Cloud STT API. '''
        requests = self._audio_generator()

        try:
            responses = self._client.streaming_recognize(config=self._streaming_config, requests=requests)
            self._listen_responses(responses)
        except Exception as e:
            print(f"[ERROR] Streaming connection failed: {e}")


    def _listen_responses(self, responses):
        '''Listens to the responses from the Google Cloud STT API. If the received response is final, it calls the
        transcription callback defined in the constructor, as well as the word timestamps callback from the constructor.'''
        for response in responses:
            for result in response.results:
                if result.is_final:
                    transcript = result.alternatives[0].transcript
                    if transcript == self._recent_transcript: # in case of duplicate final transcripts
                        continue
                    self._recent_transcript = transcript
                    logger.info(f"{cf.RED}[Transcription] Received final transcription: {transcript}")
                    word_timestamps = self._get_word_timestamps(datetime.now(), result.alternatives[0].words)
                    if self._transcript_callback:
                        data = {"type": "user_utt", "data": transcript}
                        if asyncio.iscoroutinefunction(self._transcript_callback):
                            asyncio.run_coroutine_threadsafe(
                                self._transcript_callback(data, self._msg_callback, self._send_callback, self._bio_callback),
                                self._loop
                            )
                        else:
                            self._transcript_callback(data)
                    if self.ts_callback:
                        if asyncio.iscoroutinefunction(self.ts_callback):
                            asyncio.run_coroutine_threadsafe(
                                self.ts_callback,
                                self._loop
                            )
                        else:
                            self.ts_callback(word_timestamps)
                            
    def _get_word_timestamps(self, now, words):
        ''' Gets word-level timestamps of an array of WordInfo objects. Will return an array of dictionaries
        with the word, word start timestamp, and word end timestamp (as a datetime.datetime object).'''
        timestamps = [{
            "word": word.word, 
            "start": now + word.start_time, 
            "end": now + word.end_time
        } for word in words]
        return timestamps
            

class TextToSpeechProvider:
    '''TTS provider class. Uses Google's TTS API.'''
    def __init__(self):
        self._client = texttospeech.TextToSpeechClient()
        self._voice = texttospeech.VoiceSelectionParams(
            language_code="en-US", ssml_gender=texttospeech.SsmlVoiceGender.NEUTRAL
        )
        # self._gemini_client = genai.Client()
        self._audio_config = None
                        
    def synthesize_speech(self, text: str, encoding: str) -> bytes:
        '''Synthesizes speech synchronously using the Google Cloud TTS API. Returns the 
        audio content as bytes encoded in the specified format.'''
        if encoding == "mp3":
            self._audio_config = texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.MP3,
            )
        elif encoding == "pcm":
            self._audio_config = texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.PCM,
            )
        elif encoding == "wav":
            self._audio_config = texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.LINEAR16,
            )
        else:
            logger.error(f"{cf.RED}[TTS] Unsupported audio encoding: {encoding}")
            return None
        try:
            synthesis_input = texttospeech.SynthesisInput(text=text)
            response = self._client.synthesize_speech(
                input=synthesis_input, voice=self._voice, audio_config=self._audio_config,
            )
            logger.info(f"{cf.YELLOW}[TTS] Speech synthesized")
            return response.audio_content
        except Exception as e:
            logger.error(f"{cf.RED}[TTS] Error synthesizing speech: {e}")
    
    # May not need if we decide to use the Google Cloud TTS instead
    # def synthesize_speech_gemini(self, text: str) -> bytes:
    #     '''Synthesizes speech using Google's Gemini TTS API. Returns the audio content as bytes.'''
    #     try:
    #         response = self._gemini_client.models.generate_content(
    #             model="gemini-2.5-flash-preview-tts",
    #             contents="Say cheerfully: " + text,
    #             config=types.GenerateContentConfig(
    #                 response_modalities=["AUDIO"], # The model will return audio content
    #                 speech_config=types.SpeechConfig(
    #                     voice_config=types.VoiceConfig(
    #                         prebuilt_voice_config=types.PrebuiltVoiceConfig(
    #                         voice_name='Kore',
    #                         )
    #                     )
    #                 ),
    #                 thinking_config=types.ThinkingConfig(thinking_budget=0), # Disables thinking
    #             )
    #         )
    #         data = response.candidates[0].content.parts[0].inline_data.data
    #         logger.info(f"{cf.YELLOW}[TTS] Speech synthesized")
    #         return data
    #     except Exception as e:
    #         logger.error(f"{cf.RED}[TTS] Error synthesizing speech: {e}")