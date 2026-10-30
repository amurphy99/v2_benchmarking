"""
Turn events reaching a chat type's harness, its shared cues, and harness turns.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.tests.test_harness_hooks`

Covers how STT results and playback reports reach the harness, the reply
lifecycle events `ChatHandler` sends, turns a harness starts on its own, and the
keyword and silence cues chat types build on.

"""
from datetime      import datetime, timezone
from types         import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import asyncio, json, re, unittest

# From this project
from chat_app.websocket.consumers.handlers.ws_events  import handle_transcription_message
from chat_app.websocket.consumers.processing.playback import handle_playback_event
from chat_app.websocket.consumers.processing.speech   import handle_final, handle_interim
from chat_app.websocket.harnesses.base                import ChatHarness, Cue, FinalUtterance, InterimSpeech, ResponseOutcome, TurnAttempt
from chat_app.websocket.harnesses.cues                import KeywordCue, SilenceWatcher
from chat_app.websocket.services.chatHelpers          import ChatHandler
from chat_app.websocket.services.chat_state           import StagedUtteranceBuffer

# Silence thresholds short enough for a test, with room for a busy machine
SILENCE_TEST_SEC = (0.1, 0.2)

# Long enough for every silence threshold above to pass
SILENCE_WAIT_SEC = 0.35


# --------------------------------------------------------------------------------
# Test Doubles
# --------------------------------------------------------------------------------
# Record every turn event a harness passes on, in order
class RecordingCue(Cue):
    # Start with nothing heard
    def __init__(self, harness: ChatHarness) -> None:
        super().__init__(harness)
        self.events: list[tuple] = []

    # Note each event and the detail a test checks
    def stop              (self)                                    -> None: self.events.append(("stop",))
    def on_interim        (self, speech: InterimSpeech)             -> None: self.events.append(("interim",   speech.text, speech.new_speech))
    def on_final          (self, utterance: FinalUtterance)         -> None: self.events.append(("final",     utterance.text))
    def on_reply_started  (self, attempt: TurnAttempt)              -> None: self.events.append(("started",   attempt.trigger, attempt.user_text))
    def on_reply_cancelled(self, attempt: TurnAttempt, saved: bool) -> None: self.events.append(("cancelled", saved))
    def on_reply_saved    (self, outcome: ResponseOutcome)          -> None: self.events.append(("saved",     outcome.message))
    def on_playback       (self, response_id: int, state: str)      -> None: self.events.append(("playback",  response_id, state))

# A harness with one recording cue, whose reply can wait until a test lets it go
class ScriptedHarness(ChatHarness):
    NAME = "scripted"

    # Reply with fixed text; hold `generate` while `gate` is set and unopened
    def __init__(self, consumer: SimpleNamespace, gate: asyncio.Event | None = None) -> None:
        super().__init__(consumer, condition="", variant="")
        self.gate     = gate
        self.entered  = asyncio.Event()       # Set once `generate` is running
        self.attempts : list[TurnAttempt] = []
        self.recorder = RecordingCue(self)
        self.cues     = [self.recorder]

    # Record the attempt, then reply once the gate (if any) opens
    async def generate(self, attempt: TurnAttempt) -> ResponseOutcome:
        self.attempts.append(attempt)
        self.entered.set()
        if self.gate is not None: await self.gate.wait()
        return ResponseOutcome(message="Hello there.")

# A text-only connection with the fields the reply pipeline reads
def make_consumer(gate: asyncio.Event | None = None) -> SimpleNamespace:
    consumer = SimpleNamespace(
        context_buffer            = [("assistant", "How can I help you today?", 0.0)],
        use_backend_STT           = False,
        use_backend_TTS           = False,
        response_mode             = "automatic",
        last_response             = None,
        streaming_active          = True,
        send                      = AsyncMock(),
        _close_scheduled          = False,
        _staged_utterances        = StagedUtteranceBuffer(),
        _stt_progress_revision    = 0,
        _pending_response_task    = None,
        _pending_response_trigger = None,
        _manual_response_task     = None,
        _reply_now_task           = None,
        _stage_lock               = asyncio.Lock(),
        _response_lock            = asyncio.Lock(),
    )
    consumer.harness = ScriptedHarness(consumer, gate)
    return consumer

# One interim result whose recognized audio ends now
def make_interim(text: str, new_speech: bool = True) -> InterimSpeech:
    return InterimSpeech(text=text, new_speech=new_speech, stability=0.9, ended_at=datetime.now(timezone.utc))

# A task that is still running, for a reply that already owns the turn
def running_task() -> Mock:
    task = Mock()
    task.done.return_value       = False
    task.cancelling.return_value = 0
    return task


# Replaces the database writes, stream control, and biomarker work around one reply
class PipelineTestCase(unittest.IsolatedAsyncioTestCase):
    # Patch everything outside the reply pipeline that would need a database or models
    def setUp(self) -> None:
        saved   = (SimpleNamespace(id=1), SimpleNamespace(id=2))
        patches = {
            "exchange"  : patch("chat_app.websocket.services.chatHelpers.commit_chat_exchange",     new=AsyncMock(return_value=saved)),
            "message"   : patch("chat_app.websocket.services.chatHelpers.commit_chat_message",      new=AsyncMock(return_value=SimpleNamespace(id=3))),
            "stream"    : patch("chat_app.websocket.services.chatHelpers.set_streaming_active",     new=AsyncMock()),
            "text_bio"  : patch("chat_app.websocket.services.chatHelpers.process_text_biomarkers",  new=AsyncMock()),
            "audio_bio" : patch("chat_app.websocket.services.chatHelpers.process_audio_biomarkers", new=AsyncMock()),
        }
        self.mocks = {name: started.start() for name, started in patches.items()}
        for started in patches.values(): self.addCleanup(started.stop)


# ================================================================================
# Speech and Playback Reach the Harness
# ================================================================================
class SpeechDispatchTests(unittest.IsolatedAsyncioTestCase):
    """
    STT results and a text client's transcription reach the harness, after the reply
    pipeline has done what it needs with them.
    """
    # New speech cancels an automatic reply, and the harness hears the interim
    async def test_new_speech_cancels_an_automatic_reply_then_reaches_the_harness(self) -> None:
        consumer = make_consumer()
        consumer._pending_response_task, consumer._pending_response_trigger = running_task(), "automatic"

        handle_interim(consumer, make_interim("go left"))

        consumer._pending_response_task.cancel.assert_called_once_with()
        self.assertEqual(consumer.harness.recorder.events, [("interim", "go left", True)])

    # A revised interim reaches the harness without cancelling anything
    async def test_revised_interim_reaches_the_harness_without_cancelling(self) -> None:
        consumer = make_consumer()
        consumer._pending_response_task, consumer._pending_response_trigger = running_task(), "automatic"

        handle_interim(consumer, make_interim("go lift", new_speech=False))

        consumer._pending_response_task.cancel.assert_not_called()
        self.assertEqual(consumer.harness.recorder.events, [("interim", "go lift", False)])

    # A text client's transcription reaches the harness first, then the reply pipeline stages it
    async def test_transcription_reaches_the_harness_before_it_is_staged(self) -> None:
        consumer = make_consumer()
        heard_before_staging = []

        # Note how much the harness had heard when staging began
        async def stage(consumer_: SimpleNamespace, text: str, timestamp: float, words: None) -> None:
            heard_before_staging.extend(consumer_.harness.recorder.events)

        with patch.object(ChatHandler, "stage_and_schedule", new=stage):
            await handle_transcription_message(consumer, {"type": "transcription", "data": "  go up  "})

        self.assertEqual(heard_before_staging, [("final", "go up")])

    # A chat that is closing passes nothing on
    async def test_closing_chat_passes_nothing_on(self) -> None:
        consumer = make_consumer()
        consumer._close_scheduled = True

        handle_interim(consumer, make_interim("go left"))
        handle_final  (consumer, FinalUtterance(text="go left", words=()))

        self.assertEqual(consumer.harness.recorder.events, [])

    # An accepted playback report reaches the harness; one for another session's reply does not
    async def test_only_accepted_playback_reaches_the_harness(self) -> None:
        consumer = make_consumer()
        consumer.session_id = 9

        for matched in (True, False):
            with patch("chat_app.websocket.consumers.processing.playback.db_s2a", new=lambda fn, matched=matched: AsyncMock(return_value=matched)):
                await handle_playback_event(consumer, {"type": "tts_playback", "data": {"responseId": 7, "state": "finished"}})

        self.assertEqual(consumer.harness.recorder.events, [("playback", 7, "finished")])


# ================================================================================
# Reply Lifecycle
# ================================================================================
class ReplyLifecycleTests(PipelineTestCase):
    """
    `ChatHandler` tells the harness when a reply starts, and then either that it was
    saved or that it was cancelled (and whether its text had already gone out).
    """
    # A reply that goes through reports that it started, then that it was saved
    async def test_saved_reply_reports_started_then_saved(self) -> None:
        consumer = make_consumer()
        consumer._staged_utterances.append(text="hello", words=None, timestamp=0.0)

        await ChatHandler._execute_response(consumer)

        self.assertEqual(consumer.harness.recorder.events, [("started", "automatic", "hello"), ("saved", "Hello there.")])

    # A reply cancelled while it is generated was never saved
    async def test_reply_cancelled_while_generating_reports_unsaved(self) -> None:
        consumer = make_consumer(gate=asyncio.Event())
        consumer._staged_utterances.append(text="hello", words=None, timestamp=0.0)

        attempt = asyncio.create_task(ChatHandler._execute_response(consumer))
        await consumer.harness.entered.wait()
        attempt.cancel()
        await asyncio.gather(attempt, return_exceptions=True)

        self.assertEqual(consumer.harness.recorder.events[-1], ("cancelled", False))
        self.mocks["exchange"].assert_not_awaited()

    # A reply cancelled during its audio was saved, and its audio is cancelled on the client
    async def test_reply_cancelled_during_its_audio_reports_saved(self) -> None:
        consumer = make_consumer()
        consumer.use_backend_TTS = True
        consumer._staged_utterances.append(text="hello", words=None, timestamp=0.0)
        speaking = asyncio.Event()

        # Stand in for TTS that is still streaming when newer speech arrives
        async def slow_tts(text: str, send: AsyncMock, response_id: int) -> None:
            speaking.set()
            await asyncio.Event().wait()

        with patch("chat_app.websocket.services.chatHelpers.synthesize_and_stream_tts", new=slow_tts):
            attempt = asyncio.create_task(ChatHandler._execute_response(consumer))
            await speaking.wait()
            attempt.cancel()
            await asyncio.gather(attempt, return_exceptions=True)

        self.assertEqual(consumer.harness.recorder.events[-2:], [("saved", "Hello there."), ("cancelled", True)])
        self.assertEqual(json.loads(consumer.send.await_args.args[0]), {"type": "cancel_audio"})


# ================================================================================
# Harness Turns
# ================================================================================
class HarnessTurnTests(PipelineTestCase):
    """
    A harness can start a reply of its own, through the same pipeline as every other
    reply, whenever no other reply owns the turn.
    """
    # With nothing staged, the harness speaks on its own and only its reply is saved
    async def test_turn_with_nothing_staged_saves_only_the_reply(self) -> None:
        consumer = make_consumer()

        await ChatHandler.request_harness_turn(consumer)

        attempt = consumer.harness.attempts[0]
        self.assertEqual((attempt.trigger, attempt.user_text), ("harness", ""))
        self.assertEqual(attempt.context, consumer.context_buffer)
        self.mocks["message"].assert_awaited_once()
        self.mocks["exchange"].assert_not_awaited()
        self.mocks["text_bio"].assert_not_called()

    # Staged speech is answered as a normal exchange
    async def test_turn_answers_staged_speech_as_an_exchange(self) -> None:
        consumer = make_consumer()
        consumer._staged_utterances.append(text="I am thinking", words=None, timestamp=0.0)

        await ChatHandler.request_harness_turn(consumer)

        self.assertEqual(consumer.harness.attempts[0].user_text, "I am thinking")
        self.mocks["exchange"].assert_awaited_once()
        self.mocks["text_bio"].assert_called_once()

    # Nothing starts while another reply owns the turn
    async def test_no_turn_while_another_reply_owns_it(self) -> None:
        consumer = make_consumer()
        consumer._pending_response_task = running_task()

        self.assertIsNone(ChatHandler.request_harness_turn(consumer))
        self.assertEqual(consumer.harness.attempts, [])

    # Newer speech cancels a harness turn, as it does an automatic reply
    async def test_newer_speech_cancels_a_harness_turn(self) -> None:
        consumer = make_consumer(gate=asyncio.Event())

        turn = ChatHandler.request_harness_turn(consumer)
        await consumer.harness.entered.wait()
        self.assertTrue(ChatHandler.note_stt_progress(consumer))
        await asyncio.gather(turn, return_exceptions=True)

        self.assertEqual(consumer.harness.recorder.events[-1], ("cancelled", False))

    # Since newer speech cancels a harness turn, its mood goes stale too
    async def test_harness_turn_mood_is_dropped_after_newer_speech(self) -> None:
        consumer = SimpleNamespace(_stt_progress_revision=5)
        with patch("chat_app.websocket.services.chatHelpers.send_mood", new=AsyncMock()) as send_mood:
            await ChatHandler._publish_response_mood(consumer, "Happy", "harness", 4)
        send_mood.assert_not_awaited()


# ================================================================================
# Keyword Cue
# ================================================================================
# Note each direction it hears
class DirectionCue(KeywordCue):
    PATTERNS = {
        "left" : re.compile(r"\bleft\b", re.IGNORECASE),
        "up"   : re.compile(r"\bup\b",   re.IGNORECASE),
    }

    # Start with nothing heard
    def __init__(self, harness: SimpleNamespace) -> None:
        super().__init__(harness)
        self.matches: list[str] = []

    # Keep the order directions were heard in
    def on_match(self, name: str, text: str) -> None:
        self.matches.append(name)

# The same directions, checked only once each utterance is final
class FinalDirectionCue(DirectionCue):
    ON = "final"


class KeywordCueTests(unittest.TestCase):
    """
    A keyword fires once per occurrence, even though every interim repeats and
    revises the whole utterance so far.
    """
    # Each occurrence fires once as it first appears, and a new utterance counts afresh
    def test_each_occurrence_fires_once(self) -> None:
        cue = DirectionCue(SimpleNamespace())
        for text in ("go", "go left", "go left and", "go left and then left"): cue.on_interim(make_interim(text))
        cue.on_final  (FinalUtterance(text="Go left and then left.", words=()))
        cue.on_interim(make_interim("left again"))

        self.assertEqual(cue.matches, ["left", "left", "left"])

    # A revision that drops a word and brings it back fires it only once
    def test_a_word_revised_away_and_back_fires_once(self) -> None:
        cue = DirectionCue(SimpleNamespace())
        for text in ("turn lift", "turn left", "turn lift", "turn left"): cue.on_interim(make_interim(text, new_speech=False))

        self.assertEqual(cue.matches, ["left"])

    # A final catches a word that never reached an interim
    def test_a_final_catches_a_word_no_interim_had(self) -> None:
        cue = DirectionCue(SimpleNamespace())
        cue.on_interim(make_interim("go"))
        cue.on_final  (FinalUtterance(text="go up", words=()))

        self.assertEqual(cue.matches, ["up"])

    # A final-only cue ignores interims
    def test_a_final_only_cue_ignores_interims(self) -> None:
        cue = FinalDirectionCue(SimpleNamespace())
        cue.on_interim(make_interim("go left"))
        self.assertEqual(cue.matches, [])

        cue.on_final(FinalUtterance(text="go left", words=()))
        self.assertEqual(cue.matches, ["left"])


# ================================================================================
# Silence Watcher
# ================================================================================
# Note each silence threshold reached
class SilenceRecorder(SilenceWatcher):
    THRESHOLDS_SEC = SILENCE_TEST_SEC

    # Start with nothing reached
    def __init__(self, harness: SimpleNamespace) -> None:
        super().__init__(harness)
        self.fired: list[float] = []

    # Keep the order thresholds were reached in
    def on_silence(self, seconds: float) -> None:
        self.fired.append(seconds)


class SilenceWatcherTests(unittest.IsolatedAsyncioTestCase):
    """
    Silence is timed only on the user's turn: from the end of the avatar's reply or
    of the user's latest speech, never while a reply is prepared or playing.
    """
    # A watcher on a chat that is listening
    def setUp(self) -> None:
        self.consumer = SimpleNamespace(streaming_active=True)
        self.watcher  = SilenceRecorder(SimpleNamespace(consumer=self.consumer))

    # Each threshold fires in order once the reply's audio has finished
    async def test_thresholds_fire_in_order_after_the_reply_finishes(self) -> None:
        self.watcher.on_playback(1, "finished")
        await asyncio.sleep(SILENCE_WAIT_SEC)
        self.assertEqual(self.watcher.fired, list(SILENCE_TEST_SEC))

    # Newer speech restarts the clock from where it ended
    async def test_newer_speech_restarts_the_clock(self) -> None:
        self.watcher.on_playback(1, "finished")
        await asyncio.sleep(0.08)
        self.watcher.on_interim(make_interim("um"))
        await asyncio.sleep(0.06)
        self.assertEqual(self.watcher.fired, [])

        await asyncio.sleep(SILENCE_WAIT_SEC)
        self.assertEqual(self.watcher.fired, list(SILENCE_TEST_SEC))

    # A reply starting stops the clock
    async def test_a_reply_starting_stops_the_clock(self) -> None:
        self.watcher.on_playback(1, "finished")
        self.watcher.on_reply_started(Mock())
        await asyncio.sleep(SILENCE_WAIT_SEC)
        self.assertEqual(self.watcher.fired, [])

    # Speech over the avatar's audio doesn't start the clock, until that audio is cut short
    async def test_speech_over_the_reply_waits_for_its_audio_to_end(self) -> None:
        self.watcher.on_playback(1, "started")
        self.watcher.on_interim(make_interim("wait"))
        await asyncio.sleep(SILENCE_WAIT_SEC)
        self.assertEqual(self.watcher.fired, [])

        self.watcher.on_reply_cancelled(Mock(), saved=True)
        self.watcher.on_interim(make_interim("wait, what"))
        await asyncio.sleep(SILENCE_WAIT_SEC)
        self.assertEqual(self.watcher.fired, list(SILENCE_TEST_SEC))

    # Nothing fires while listening is paused
    async def test_nothing_fires_while_paused(self) -> None:
        self.consumer.streaming_active = False
        self.watcher.on_playback(1, "finished")
        await asyncio.sleep(SILENCE_WAIT_SEC)
        self.assertEqual(self.watcher.fired, [])

    # Stopping cancels waiting thresholds, and nothing starts the clock afterward
    async def test_stop_cancels_and_stays_stopped(self) -> None:
        self.watcher.on_playback(1, "finished")
        self.watcher.stop()
        self.watcher.on_playback(2, "finished")
        await asyncio.sleep(SILENCE_WAIT_SEC)
        self.assertEqual(self.watcher.fired, [])


if __name__ == "__main__":
    unittest.main()
