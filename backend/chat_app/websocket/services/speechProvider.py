"""
Live user chat controller.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.services.speechProvider`

TODO: Really need to test it out without KEEP_ALIVE_SEC

"""
import logging, threading, asyncio, base64, weakref
logger = logging.getLogger(__name__)

from datetime import datetime, timedelta
from queue    import Queue, Empty
from time     import monotonic as now_ts

# Google imports
from google.cloud import speech

# From this project
from ...services import logging_utils as lu
from ...services.logging_utils import RESET, BOLD, UNBOLD, STT_MAIN

from .chatHelpers import ChatHandler
from .bg_helpers  import threadsafe_fire_and_log as thread_fl

# Constants
SAMPLE_RATE   = 16_000
CHUNK_SIZE    =  2_048  # 64ms of 16-bit PCM audio = 2048 bytes
LANGUAGE_CODE = "en-US"

# Config
KEEP_ALIVE_SEC = 0.1     # Keep streaming alive during short pauses
SILENCE        = b"\x00" * CHUNK_SIZE

# ================================================================================
# Streaming STT via audio bytes received from the ChatConsumer client
# ================================================================================
class SpeechToTextProvider:
    def __init__(self, *, consumer, loop, on_timestamps_callback=None):
        self._client              = speech.SpeechClient()
        self._streaming_config    = None
        self._audio_buffer        = Queue()
        self._streaming           = False
        self._thread              = None    # The thread we use for streaming

        # Used to avoid processing duplicate STT results
        self._recent_transcript    = ""
        self._recent_transcript_ts = now_ts()

        # From ChatConsumer
        self._consumer_ref = weakref.ref(consumer)   # Keep a weakref to avoid keeping a disconnected consumer alive
        self._loop         = loop                    # Loop from the consumer
        self._ts_callback  = on_timestamps_callback  # The function to call when word-level timestamps are received
    

    # --------------------------------------------------------------------------------
    # Utilities
    # --------------------------------------------------------------------------------
    def _consumer(self):
        return self._consumer_ref()

    # Generates StreamingRecognizeRequest objects from the audio Queue
    def _audio_generator(self):
        while self._streaming:
            # Keep streaming alive during short pauses
            try:          ts_in, data = self._audio_buffer.get(timeout=KEEP_ALIVE_SEC)
            except Empty: yield speech.StreamingRecognizeRequest(audio_content=SILENCE); continue

            delay = now_ts() - ts_in
            if delay > 0.25: logger.warning(f"{STT_MAIN} audio queue delay={delay:.3f}s qsize≈{self._audio_buffer.qsize()}{RESET}")

            # Break the loop if there is still no data
            if data is None: break
            yield speech.StreamingRecognizeRequest(audio_content=data)

    # Validate transcripts from the STT results
    def _check_transcript(self, transcript):
        # Check length
        if len(transcript) < 1: return False, ""

        # Check for duplicate results
        if (transcript == self._recent_transcript) and ((now_ts()-self._recent_transcript_ts) < 0.5):
            return False, ""
        
        # Valid
        self._recent_transcript    = transcript
        self._recent_transcript_ts = now_ts()
        return True, transcript

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
            language_code                = LANGUAGE_CODE,
            enable_automatic_punctuation = True,
            enable_spoken_punctuation    = True,
            model                        = "latest_long",
            use_enhanced                 = True,
            enable_word_time_offsets     = bool(self._ts_callback),
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
        except Exception as e: logger.exception(f"{STT_MAIN} STT streaming connection {BOLD}{lu.RED}FAILED{UNBOLD}{lu.BRIGHT_BLUE}: {e} {RESET}")
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
        self._audio_buffer.put((now_ts(), audio_bytes))

        # Restart if not streaming OR thread is dead
        # TODO: This might make pausing not work
        if (not self._streaming) or (not getattr(self, "_thread", None)) or (not self._thread.is_alive()): 
            logger.info(f"{STT_MAIN} Restarting streaming. {RESET}")
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
                transcript = result.alternatives[0].transcript.strip()
                valid, transcript = self._check_transcript(transcript)
                if not valid: continue
                
                # Log the resulting transcription
                logger.info(f"{STT_MAIN} Received final transcription: \"{transcript}\" {RESET}")
                
                # Prepare references to the ChatConsumer's methods
                consumer = self._consumer()
                if consumer is None: return  # consumer gone

                # Send the transcript results to the ChatConsumer
                data = {"type": "user_utt", "data": transcript}

                t_sched = now_ts()
                fut = thread_fl(
                    self._loop, consumer.handle_stt_output(data), 
                    name="stt::handle_stt_output"
                )
                def _done(f): logger.info(f"{STT_MAIN} Handler latency={BOLD}{now_ts()-t_sched:.3f}s{UNBOLD}.{RESET}")
                fut.add_done_callback(_done)
                
                # TODO: We don't currently handle STT results with word-level timestamps
                if self._ts_callback: 
                    word_timestamps = SpeechToTextProvider._get_word_timestamps(datetime.now(), result.alternatives[0].words)
                    thread_fl(self._loop, self._ts_callback(word_timestamps), name="stt:timestamps")
          
    
    # TODO: Doesn't work for transcript highlighting
    # TODO: These timestamps need to be related to either the start of the ChatMessage, or real time
    @staticmethod
    def _get_word_timestamps(now, words):
        return [{
            "word"  : word.word, 
            "start" : now + word.start_time, 
            "end"   : now + word.end_time
        } for word in words]

