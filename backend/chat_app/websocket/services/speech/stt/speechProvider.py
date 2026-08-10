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
import logging, threading, weakref
logger = logging.getLogger(__name__)

from datetime import datetime, timezone
from queue    import Empty
from time     import monotonic as now_ts
from time     import time      as wall_ts
from typing   import Any, Iterable

# Google imports
from google.cloud import speech

# From this project
from .....services import logging_utils as lu
from .....services.logging_utils import RESET, BOLD, UNBOLD, STT_MAIN

from ...chatHelpers import ChatHandler
from ...bg_helpers  import threadsafe_fire_and_log as thread_FL
from  .audio_queue  import AudioBarrier, AudioChunk, StopSignal, AudioInputQueue
from  .stream_state import InterimProgressTracker

# Constants
SAMPLE_RATE   = 16_000   # Required input sample rate for the Google recognition stream
CHUNK_SIZE    =  2_048   # Bytes in 64 ms of 16-bit mono PCM audio
LANGUAGE_CODE = "en-US"  # Recognition language supplied to Google STT

# Config
KEEP_ALIVE_SEC = 0.100                 # Seconds between silence frames while waiting for audio
SILENCE        = b"\x00" * CHUNK_SIZE  # Silent PCM frame used to keep Google streaming

# ================================================================================
# Streaming STT via audio bytes received from the ChatConsumer client
# ================================================================================
class SpeechToTextProvider:
    def __init__(self, *, consumer, loop):
        self._client              = speech.SpeechClient()
        self._streaming_config    = None
        self._audio_buffer        = AudioInputQueue()   # Custom class that takes "action" objects in addition to audio chunks
        self._accepting_audio     = True                # Desired listening state independent of thread shutdown timing
        self._closed              = False               # Terminal provider state after its consumer disconnects
        self._state_lock          = threading.Lock()    # Protects lifecycle state shared with the Google worker thread
        self._thread              = None                # The thread we use for streaming
        self._pause_barrier       = None                # Boundary after audio accepted before the latest listening pause
        self._stop_signal         = None                # Cancelable end marker for a quick-resume handoff
        self._stream_reached_stop = False               # True when the current generator exits through its stop marker
        self._stream_start_dt     = None                # Wall-clock anchor for word-time offsets

        # Used to avoid processing duplicate STT results
        self._recent_transcript    = ""
        self._recent_transcript_ts = now_ts()
        self._interim_progress     = InterimProgressTracker()

        # From ChatConsumer
        self._consumer_ref = weakref.ref(consumer)   # Keep a weakref to avoid keeping a disconnected consumer alive
        self._loop         = loop                    # Loop from the consumer
    
    # Grab a reference to the consumer that owns this
    def _consumer(self):
        return self._consumer_ref()
    
    # --------------------------------------------------------------------------------
    # Utilities
    # --------------------------------------------------------------------------------
    # Generates StreamingRecognizeRequest objects from the audio Queue
    def _audio_generator(self) -> Iterable[speech.StreamingRecognizeRequest]:
        """
        Previously, we used a simple `Queue` object to store the incoming audio
        audio chunks. Now, our audio buffer is a custom object that can take
        different types of input.

        When in "manual response mode" we insert an `AudioBarrier` at the time
        a response is requested, and we only begin the response process with the
        LLM once all other `AudioChunk` objects in the queue have been pulled 
        already. So if a response is requested immediately after the user
        finishes speaking, we leave time for ASR to finish processing the end
        of their utterance before sending their text to the LLM. 
        """
        while True:
            # Keep streaming alive during short pauses
            try: item = self._audio_buffer.get(timeout=KEEP_ALIVE_SEC)
            except Empty:
                if self._closed: break
                yield speech.StreamingRecognizeRequest(audio_content=SILENCE)
                continue

            # Process the different possible types of queue entries
            if isinstance(item, AudioBarrier): continue  # Pass over the AudioBarriers

            # There are different stages to stopping
            if isinstance(item, StopSignal):
                if item.is_cancelled(): continue
                self._stream_reached_stop = True
                break

            # Only the three defined objects should be in the Queue
            if not isinstance(item, AudioChunk):
                logger.warning(f"{STT_MAIN} Ignoring unknown audio queue item: {type(item).__name__}.{RESET}")
                continue

            # Check if there is a delay in processing audio chunks (this would happen if the queue got backed up somehow)
            delay = now_ts() - item.received_at
            if delay > 0.25: logger.warning(f"{STT_MAIN} audio queue delay={delay:.3f}s qsize≈{self._audio_buffer.qsize()}{RESET}")
            yield speech.StreamingRecognizeRequest(audio_content=item.data)

    # Validate transcripts from the STT results
    def _check_transcript(self, transcript: str) -> tuple[bool, str]:
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
    # Prepare one Google stream while the caller owns the lifecycle lock
    def _prepare_stream(self) -> threading.Thread:
        self._stream_reached_stop = False
        self._stream_start_dt     = datetime.now(timezone.utc)  # Anchors Google's word offsets to wall-clock
        self._interim_progress.reset()

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

        # Reserve the worker before releasing the lock so state changes cannot start a duplicate
        thread       = threading.Thread(target=self._start_streaming_thread, daemon=True)
        self._thread = thread
        return thread

    # Initialize a stream or cancel a graceful stop that has not been reached yet
    def start(self) -> None:
        thread = None
        with self._state_lock:
            if self._closed: return

            # Resume acceptance immediately and cancel a stop marker still waiting in the queue
            self._accepting_audio = True
            if self._stop_signal is not None: self._stop_signal.cancel()
            self._stop_signal   = None
            self._pause_barrier = None

            # A reserved/running worker will either continue or hand off in its finally block
            if self._thread is None: thread = self._prepare_stream()

        if thread is not None: thread.start()
        
    # Main streaming thread
    # The generator yields streaming recognition requests, and we send them to the Google Cloud STT API. 
    def _start_streaming_thread(self) -> None:
        try:
            responses = self._client.streaming_recognize(config=self._streaming_config, requests=self._audio_generator())
            self._listen_responses(responses)
        
        # Retire this worker, then hand queued resume data to one successor if necessary
        except Exception as e: logger.exception(f"{STT_MAIN} STT streaming connection {BOLD}{lu.RED}FAILED{UNBOLD}{lu.BRIGHT_BLUE}: {e} {RESET}")
        finally:
            next_thread = None
            with self._state_lock:
                if self._thread is threading.current_thread():
                    self._thread = None

                    # A crossed stop may have resumed audio or another pause marker after it
                    if self._stream_reached_stop and (not self._closed) and (self._accepting_audio or self._audio_buffer.qsize()):
                        next_thread = self._prepare_stream()

            if next_thread is not None: next_thread.start()

    # --------------------------------------------------------------------------------
    # Pause the stream after draining audio that was already accepted
    # --------------------------------------------------------------------------------
    def stop(self) -> None:
        """
        Reject new audio immediately, but keep the already accepted queue prefix. The
        barrier remains usable by `reply_now`, and the following stop marker ends the
        Google request stream once that prefix has been sent.
        """
        with self._state_lock:
            if (self._closed) or (not self._accepting_audio): return
            self._accepting_audio = False

            # With no worker, there cannot be an accepted prefix still waiting to drain
            if self._thread is None:
                self._pause_barrier = AudioBarrier()
                self._pause_barrier.resolve()
                self._stop_signal = None
                return

            # Keep both markers ordered after every chunk accepted before this pause
            self._pause_barrier = self._audio_buffer.put_barrier()
            self._stop_signal   = self._audio_buffer.request_stop()

    # Permanently stop callbacks when the owning WebSocket disconnects
    def shutdown(self) -> None:
        with self._state_lock:
            if self._closed: return
            self._closed          = True
            self._accepting_audio = False
            self._stop_signal     = None
            self._audio_buffer.abort()

    # --------------------------------------------------------------------------------
    # Sends audio data to the audio buffer
    # --------------------------------------------------------------------------------
    def send_audio(self, audio_bytes: bytes) -> bool:
        thread = None
        with self._state_lock:
            # Paused streams deliberately drop frontend audio instead of silently restarting
            if not self._accepting_audio: return False

            # Reserve a replacement worker before adding the chunk it will consume
            if self._thread is None:
                logger.info(f"{STT_MAIN} Restarting streaming. {RESET}")
                thread = self._prepare_stream()

            self._audio_buffer.put_audio(received_at=now_ts(), data=audio_bytes)

        if thread is not None: thread.start()
        return True

    # Enqueue a boundary after all audio received so far (resolves once the generator reaches it)
    def create_audio_barrier(self) -> AudioBarrier:
        barrier = AudioBarrier()
        thread  = None
        with self._state_lock:
            if self._closed:
                barrier.fail("STT provider is closed")
                return barrier

            # While paused, reuse the boundary already ordered before the stop marker
            if not self._accepting_audio:
                if self._pause_barrier is not None: return self._pause_barrier
                barrier.resolve()
                return barrier

            # Recover queued input after an unexpected stream exit before adding the boundary
            if (self._thread is None) and self._audio_buffer.qsize(): thread = self._prepare_stream()
            if self._thread is None:                                  barrier.resolve()
            else:                                                     self._audio_buffer.put_barrier(barrier)

        if thread is not None: thread.start()
        return barrier
    

    # --------------------------------------------------------------------------------
    # Handle meaningful interim progress on the consumer event loop
    # --------------------------------------------------------------------------------
    def _note_interim_progress(self, consumer: Any) -> None:
        # Invalidates the current response snapshot and logs *only* if there was an actual cancellation
        if ChatHandler.note_stt_progress(consumer):
            logger.info(f"{STT_MAIN} Interim speech progress: cancelling pending response. {RESET}")

    # ================================================================================
    # Handles responses from the Google Cloud STT API
    # ================================================================================
    def _listen_responses(self, responses : Iterable[Any]) -> None:
        """
        Routes genuinely advancing interim results to response cancellation, as well
        as staging final results with their word-level timestamps. Text that was repeated
        do to glitches or same-length reinterpretations of the same audio do not cancel 
        a pending response.
        TODO: Need to double check the logic on the repeated-text thing...
        """
        for response in responses:
            if self._closed: return
            for result in response.results:

                # --------------------------------------------------------------------------------
                # Interim Result: the user is still speaking
                # --------------------------------------------------------------------------------
                # Interim results only cancel when timing + transcript progress show
                # speech beyond the response attempt's current snapshot
                if not result.is_final:
                    # Check if empty; skip if so
                    transcript = result.alternatives[0].transcript.strip()
                    if not transcript: continue

                    # Repeated/revised interims for the same audio do not invalidate a
                    # response; only meaningful timing/transcript progress does
                    consumer = self._consumer()
                    if (consumer is not None) and self._interim_progress.has_new_speech(result, transcript):
                        self._loop.call_soon_threadsafe(self._note_interim_progress, consumer)
                    
                    # Never actually process interim results as a transcription
                    continue  

                # --------------------------------------------------------------------------------
                # Final Result: validate and extract words
                # --------------------------------------------------------------------------------
                # 1) Make sure this isn't a duplicate transcript
                transcript = result.alternatives[0].transcript.strip()
                self._interim_progress.record_final(result)
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

                # 4) Schedule the finalized utterance on the ChatConsumer event loop
                t_sched = now_ts()
                fut = thread_FL(
                    self._loop, ChatHandler.stage_and_schedule(consumer, transcript, wall_ts(), words),
                    name="stt::stage_and_schedule"
                )
                def _done(_, _ts=t_sched): logger.info(f"{STT_MAIN} Handler latency={BOLD}{now_ts()-_ts:.3f}s{UNBOLD}.{RESET}")
                fut.add_done_callback(_done)


    # ================================================================================
    # Format STT results with timestamps
    # ================================================================================
    @staticmethod
    def _get_word_timestamps(stream_start: datetime, words: Iterable[Any]) -> list[dict[str, object]]:
        """
        Stream start allows us to get the real, wall-clock time for each word. 
        """
        return [{
            "word"  : word.word, 
            "start" : stream_start + word.start_time, 
            "end"   : stream_start + word.end_time
        } for word in words]
