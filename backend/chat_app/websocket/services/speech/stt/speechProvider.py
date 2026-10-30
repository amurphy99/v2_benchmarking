"""
Google Cloud Speech-to-Text (STT) utility class
--------------------------------------------------------------------------------
`backend.chat_app.websocket.services.speech.stt.speechProvider`

New chat-response flow:
- Responses are async tasks that get queued up whenever we determine the user MIGHT be finished speaking
- Because preparing a response can take ~1.5 seconds, we do so a bit greedily... (just using google's cues)
- If they start speaking again before our response is ready however, then we cancel the response task
- Then we go back to our "listening" state again

Every interim and final result goes to `consumers/processing/speech.py` on the
chat's event loop, in the order Google returned them, so the chat type's harness
hears the same speech the reply pipeline does.

"""
import logging, asyncio, threading, weakref
logger = logging.getLogger(__name__)

from concurrent.futures import Future
from datetime           import datetime, timedelta, timezone
from queue              import Empty
from time               import monotonic as now_ts
from time               import time      as wall_ts
from typing             import Any, Iterable

# Google imports
from google.cloud import speech

# From this project
from .....services import logging_utils as lu
from .....services.logging_utils import RESET, BOLD, UNBOLD, STT_MAIN

from ....consumers.processing.speech import handle_final, handle_interim
from ....harnesses.base              import FinalUtterance, InterimSpeech
from  ...bg_helpers                  import threadsafe_fire_and_log as thread_FL
from  ...chatHelpers                 import ChatHandler
from    .audio_queue                 import AudioBarrier, AudioChunk, AudioInputQueue
from    .stream_state                import InterimProgressTracker

# Constants
SAMPLE_RATE   = 16_000   # Required input sample rate for the Google recognition stream
LANGUAGE_CODE = "en-US"  # Recognition language supplied to Google STT

# Config
KEEP_ALIVE_SEC = 0.100                 # Seconds between silence frames while waiting for audio
CHUNK_SIZE     =  2_048                # Bytes in 64 ms of 16-bit mono PCM audio
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
        self._stream_start_dt     = None                # Wall-clock anchor for word-time offsets (set from each stream's first chunk)

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
    def _audio_generator(self, ended_on: list[AudioBarrier]) -> Iterable[speech.StreamingRecognizeRequest]:
        """
        Previously, we used a simple `Queue` object to store the incoming audio
        audio chunks. Now, our audio buffer is a custom object that can take
        different types of input.

        An `AudioBarrier` (queued by `reply_now` or a listening pause) ends the request
        stream. Google then returns final results for everything it has heard right away,
        instead of waiting for its endpointer to hear enough silence. The barrier is handed
        back through `ended_on`, and the worker resolves it once those results are staged.

        NOTE: Previously, we added artificial "silence" periods just to keep the stram alive,
              but that ended up misaligning the word-timestamps because Google's timeline was
              continuously adding 64ms chunks for the silence periods. **We could still make
              this work if we also kept track of how many of these chunks we have added and
              then subtract that from the timestamps we got from STT.**
        """
        started = now_ts()
        while True:
            # Keep streaming alive during short pauses
            #try: item = self._audio_buffer.get(timeout=KEEP_ALIVE_SEC)
            #except Empty:
            #    if self._closed: break
            #    yield speech.StreamingRecognizeRequest(audio_content=SILENCE)
            #    continue

            # Wait for actual frontend audio or an ordered lifecycle marker
            item = self._audio_buffer.get()

            # A barrier ends this request stream
            if isinstance(item, AudioBarrier):
                ended_on.append(item)
                return

            # Only the two defined objects should be in the Queue
            if not isinstance(item, AudioChunk):
                logger.warning(f"{STT_MAIN} Ignoring unknown audio queue item: {type(item).__name__}.{RESET}")
                continue

            # Warn if the queue backs up mid-stream (audio queued before this stream began is a handoff, not a backlog)
            lag = now_ts() - max(item.received_at, started)
            if lag > 0.25: logger.warning(f"{STT_MAIN} audio queue delay={lag:.3f}s qsize≈{self._audio_buffer.qsize()}{RESET}")

            # Google's word offsets count from this stream's first chunk, so anchor them to when it arrived
            if self._stream_start_dt is None: self._stream_start_dt = datetime.now(timezone.utc) - timedelta(seconds=now_ts() - item.received_at)
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
        self._stream_start_dt = None  # The request generator anchors it to the stream's first chunk
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

    # Initialize a stream, or resume accepting audio while a paused stream is still finishing
    def start(self) -> None:
        thread = None
        with self._state_lock:
            if self._closed: return

            # Resume acceptance immediately (a pause barrier still in the queue keeps ending its stream)
            self._accepting_audio = True
            self._pause_barrier   = None

            # A reserved/running worker will either continue or hand off in its finally block
            if self._thread is None: thread = self._prepare_stream()

        if thread is not None: thread.start()

    # Main streaming thread
    # The generator yields streaming recognition requests, and we send them to the Google Cloud STT API.
    def _start_streaming_thread(self) -> None:
        ended_on : list[AudioBarrier] = []  # The barrier this stream ended on (local, so a dead generator cannot touch a live stream)
        staged   : list[Future]       = []  # Staging work scheduled for this stream's final results
        failed   = False
        try:
            responses = self._client.streaming_recognize(config=self._streaming_config, requests=self._audio_generator(ended_on))
            self._listen_responses(responses, staged)

        # Retire this worker, then hand queued resume data to one successor if necessary
        except Exception as e:
            failed = True
            logger.exception(f"{STT_MAIN} STT streaming connection {BOLD}{lu.RED}FAILED{UNBOLD}{lu.BRIGHT_BLUE}: {e} {RESET}")
        finally:
            # Release the barrier that ended this stream once its final results are staged
            barrier = ended_on[0] if (ended_on) else None
            if barrier is not None:
                if (failed) or (self._closed): barrier.fail("STT stream ended before returning its final results")
                else:                          thread_FL(self._loop, SpeechToTextProvider._resolve_after_staging(barrier, staged), name="stt::release_barrier")

            next_thread = None
            with self._state_lock:
                if self._thread is threading.current_thread():
                    self._thread = None

                    # Audio queued behind the barrier (or a resume) continues on one successor stream
                    if (barrier is not None) and (not self._closed) and (self._accepting_audio or self._audio_buffer.qsize()):
                        next_thread = self._prepare_stream()

            if next_thread is not None: next_thread.start()

    # Resolve a stream's barrier on the consumer loop after that stream's staging tasks finish
    @staticmethod
    async def _resolve_after_staging(barrier: AudioBarrier, staged: list[Future]) -> None:
        await asyncio.gather(*(asyncio.wrap_future(fut) for fut in staged), return_exceptions=True)
        barrier.resolve()

    # --------------------------------------------------------------------------------
    # Pause the stream after draining audio that was already accepted
    # --------------------------------------------------------------------------------
    def stop(self) -> None:
        """
        Reject new audio immediately, but keep the already accepted queue prefix. The
        pause barrier ends the Google request stream once that prefix has been sent, and
        `reply_now` can still wait on it while listening is paused.
        """
        with self._state_lock:
            if (self._closed) or (not self._accepting_audio): return
            self._accepting_audio = False

            # With no worker, there cannot be an accepted prefix still waiting to drain
            if self._thread is None:
                self._pause_barrier = AudioBarrier()
                self._pause_barrier.resolve()
                return

            # Keep the barrier ordered after every chunk accepted before this pause
            self._pause_barrier = self._audio_buffer.put_barrier()

    # Permanently stop callbacks when the owning WebSocket disconnects
    def shutdown(self) -> None:
        with self._state_lock:
            if self._closed: return
            self._closed          = True
            self._accepting_audio = False
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

    # Enqueue a boundary after all audio received so far (ends the stream there; resolves once its finals are staged)
    def create_audio_barrier(self) -> AudioBarrier:
        barrier = AudioBarrier()
        thread  = None
        with self._state_lock:
            if self._closed:
                barrier.fail("STT provider is closed")
                return barrier

            # While paused, reuse the pause barrier (it already ends the stream after the accepted audio)
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


    # ================================================================================
    # Handles responses from the Google Cloud STT API
    # ================================================================================
    def _listen_responses(self, responses: Iterable[Any], staged: list[Future]) -> None:
        """
        Hands every interim and final result to the chat's event loop, and stages
        final results with their word-level timestamps. Only genuinely advancing
        interims count as new speech (which cancels a pending automatic response);
        text that was repeated due to glitches or same-length reinterpretations of the
        same audio does not.
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

                    consumer = self._consumer()
                    if consumer is None: continue

                    # Repeated/revised interims for the same audio are not new speech
                    speech = InterimSpeech(
                        text       = transcript,
                        new_speech = self._interim_progress.has_new_speech(result, transcript),
                        stability  = result.stability,
                        ended_at   = self._stream_start_dt + result.result_end_time,
                    )
                    self._loop.call_soon_threadsafe(handle_interim, consumer, speech)

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

                # 4) Let the harness hear the utterance, then stage it on the ChatConsumer event loop
                #    (both are queued from here, so the harness hears it in order with the interims)
                self._loop.call_soon_threadsafe(handle_final, consumer, FinalUtterance(text=transcript, words=tuple(words)))
                t_sched = now_ts()
                fut = thread_FL(
                    self._loop, ChatHandler.stage_and_schedule(consumer, transcript, wall_ts(), words),
                    name="stt::stage_and_schedule"
                )
                def _done(_, _ts=t_sched): logger.info(f"{STT_MAIN} Handler latency={BOLD}{now_ts()-_ts:.3f}s{UNBOLD}.{RESET}")
                fut.add_done_callback(_done)
                staged.append(fut)  # This stream's barrier waits for it (see `_resolve_after_staging`)


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
