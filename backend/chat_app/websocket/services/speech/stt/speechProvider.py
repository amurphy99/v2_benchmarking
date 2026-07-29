"""
Google Cloud Speech-to-Text (STT) utility class
--------------------------------------------------------------------------------
`backend.chat_app.websocket.services.speech.stt.speechProvider`

New chat-response flow:
- Responses are async tasks that get queued up whenever we determine the user MIGHT be finished speaking
- Because preparing a response can take ~1.5 seconds, we do so a bit greedily... (just using google's cues)
- If they start speaking again before our response is ready however, then we cancel the response task
- Then we go back to our "listening" state again

TODO: Really need to test it out without KEEP_ALIVE_SEC

"""
import json
import logging, threading, asyncio, base64, weakref
logger = logging.getLogger(__name__)

from datetime import datetime, timedelta
from queue    import Queue, Empty
from time     import monotonic as now_ts

# Google imports
from google.cloud import speech

# From this project
from .....services import logging_utils as lu
from .....services.logging_utils import RESET, BOLD, UNBOLD, STT_MAIN

from ...chatHelpers import ChatHandler
from ...bg_helpers  import threadsafe_fire_and_log as thread_FL

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
    def __init__(self, *, consumer, loop):
        self._client              = speech.SpeechClient()
        self._streaming_config    = None
        self._audio_buffer        = Queue()
        self._streaming           = False
        self._thread              = None    # The thread we use for streaming
        self._stream_start_dt     = None    # Wall-clock anchor for word-time offsets

        # Used to avoid processing duplicate STT results
        self._recent_transcript    = ""
        self._recent_transcript_ts = now_ts()

        self._has_pending_audio = False  # True when audio is queued but no final result yet

        # From ChatConsumer
        self._consumer_ref = weakref.ref(consumer)   # Keep a weakref to avoid keeping a disconnected consumer alive
        self._loop         = loop                    # Loop from the consumer
    

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
        self._streaming       = True
        self._stream_start_dt = datetime.now()  # Anchors Google's stream-relative word offsets to wall-clock

        # Configure the stream
        config = speech.RecognitionConfig(
            encoding                     = speech.RecognitionConfig.AudioEncoding.LINEAR16,
            sample_rate_hertz            = SAMPLE_RATE,
            language_code                = LANGUAGE_CODE,
            enable_automatic_punctuation = True,
            enable_spoken_punctuation    = True,            # TODO: Maybe should be false? ("how are you question mark" -> "how are you?")
            model                        = "latest_long",   # Model selection
            use_enhanced                 = True,            # IDK it's supposed to be better
            enable_word_time_offsets     = True,            # Word-level timestamps
        )
        self._streaming_config = speech.StreamingRecognitionConfig(
            config          = config,
            interim_results = True,
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
        self._has_pending_audio = True  # audio queued, awaiting STT result (used in the _done callback for qtrobot in _listen_responses)

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
        Routes interim results to cancel any pending response task, and final results to
        `ChatHandler.stage_and_schedule` along with word-level timestamps.
        """
        for response in responses:
            for result in response.results:

                # --------------------------------------------------------------------------------
                # Interim Result: the user is still speaking
                # --------------------------------------------------------------------------------
                # Non-empty interim means the user is still speaking -> cancel any pending response
                if not result.is_final:
                    # Check if empty; skip if so
                    transcript = result.alternatives[0].transcript.strip()
                    if not transcript: continue

                    # If there is a result; cancel any pending response task
                    consumer = self._consumer()
                    if consumer:
                        task = getattr(consumer, "_pending_response_task", None)
                        if task and not task.done():
                            self._loop.call_soon_threadsafe(task.cancel)
                            logger.info(f"{STT_MAIN} Interim result: cancelling pending response. {RESET}")
                    
                    # Never actually process interim results as a transcription
                    continue  

                # --------------------------------------------------------------------------------
                # Final Result: validate and extract words
                # --------------------------------------------------------------------------------
                # 1) Make sure this isn't a duplicate transcript
                transcript = result.alternatives[0].transcript.strip()
                valid, transcript = self._check_transcript(transcript)
                if not valid: continue

                # 2) Format the word-level timestamps how we want them
                # Anchor to stream-start so absolute times reflect when each word was actually spoken
                words = (
                    SpeechToTextProvider._get_word_timestamps(self._stream_start_dt, result.alternatives[0].words)
                    if result.alternatives[0].words else []
                )

                # 3) Prepare references to the ChatConsumer's methods
                consumer = self._consumer()
                if consumer is None: return  # consumer gone; abandon the task

                # Log the resulting transcription
                logger.info(f"{STT_MAIN} Final transcription: \"{transcript}\" ({BOLD}{len(words)} words{UNBOLD}) {RESET}")

                # 4) Send the transcript results to the ChatConsumer
                data    = {"type": "user_utt", "data": transcript, "time": now_ts()}
                t_sched = now_ts()
                fut = thread_FL(
                    self._loop, ChatHandler.stage_and_schedule(data, consumer, words),
                    name="stt::stage_and_schedule"
                )

                def _done(_, _ts=t_sched, _consumer=consumer):
                    logger.info(f"{STT_MAIN} Handler latency={BOLD}{now_ts()-_ts:.3f}s{UNBOLD}.{RESET}")
                    # the final result for the last audio chunk has been processed - mark STT as idle
                    _consumer.stt_provider._has_pending_audio = False
                    # Only notify qtrobot once robot_audio_done is confirmed.
                    if getattr(_consumer, "source", None) == "qtrobot":
                        if getattr(_consumer, "_robot_audio_done", False):
                            asyncio.run_coroutine_threadsafe(
                                _consumer.send(json.dumps({"type": "stt_staged"})),
                                self._loop,
                            )
                            # reset _robot_audio_done flag
                            _consumer._robot_audio_done = False

                fut.add_done_callback(_done)


    # ================================================================================
    # Format STT results with timestamps
    # ================================================================================
    @staticmethod
    def _get_word_timestamps(stream_start: datetime, words):
        """
        Stream start allows us to get the real, wall-clock time for each word. 
        """
        return [{
            "word"  : word.word, 
            "start" : stream_start + word.start_time, 
            "end"   : stream_start + word.end_time
        } for word in words]

