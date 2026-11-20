"""
Reply timing: the steps timed inside a reply, and the record saved and sent with it.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.tests.test_reply_timing`

A reply attempt collects the steps timed inside it (model calls and holds), from
whichever task they run in, and its record counts every stage from the
attempt's start. The pipeline saves the record with the reply and sends it to
the listeners, and to a client in debug mode. The client's report that the
reply's audio started adds the delay the user heard, timed to when the report
arrived, and the record is saved and sent again.

"""
from datetime      import datetime, timedelta, timezone
from types         import SimpleNamespace
from typing        import Callable
from unittest.mock import AsyncMock, Mock, patch

import asyncio, unittest

from pydantic import BaseModel

# From this project
from chat_app.services.llm.structured_api               import StructuredAPI
from chat_app.services.step_timing                      import TimedStep, collect_steps, timed_step
from chat_app.websocket.consumers.processing.playback   import handle_playback_event
from chat_app.websocket.harnesses.base                  import ChatHarness, ResponseOutcome, TurnAttempt
from chat_app.websocket.services.chatHelpers            import ChatHandler
from chat_app.websocket.services.chat_state             import StagedUtteranceBuffer
from chat_app.websocket.services.reply_timing           import REPLY_TIMING_KEEP, ReplyTiming, finish_reply_timing, track_reply_timing

# Where the pipeline, the playback reports, and the timing look up what these tests replace
HELPERS  = "chat_app.websocket.services.chatHelpers"
PLAYBACK = "chat_app.websocket.consumers.processing.playback"
TIMING   = "chat_app.websocket.services.reply_timing"

# The IDs the stand-in commit gives the user's turn and the reply
USER_ID, REPLY_ID = 1, 2


# A model call's structured answer
class Answer(BaseModel):
    text : str = "Okay."


# --------------------------------------------------------------------------------
# Test Doubles
# --------------------------------------------------------------------------------
# A chat type with one shared feature, whose reply makes one timed model call
class TimedHarness(ChatHarness):
    NAME = "timed"

    # Its signs of listening, switched on
    def __init__(self, consumer: SimpleNamespace) -> None:
        super().__init__(consumer, condition="", variant="")
        self.features = {"backchannels": SimpleNamespace(on=True)}

    # Reply after one model call
    async def generate(self, attempt: TurnAttempt) -> ResponseOutcome:
        with timed_step("reply"): await asyncio.sleep(0)
        return ResponseOutcome(message="Okay, to the left.")

# A web connection with the fields the reply pipeline and the timing read
def make_consumer(*, debug_mode: bool) -> SimpleNamespace:
    consumer = SimpleNamespace(
        session_id                = 9,
        context_buffer            = [],
        use_backend_STT           = True,
        use_backend_TTS           = True,
        response_mode             = "automatic",
        last_response             = None,
        streaming_active          = True,
        run_biomarkers            = False,
        debug_mode                = debug_mode,
        send                      = AsyncMock(),
        send_json                 = AsyncMock(),
        _broadcast_monitor        = AsyncMock(),
        _reply_timings            = {},
        _tts_streaming            = False,
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
    consumer.harness = TimedHarness(consumer)
    return consumer

# Stage the user's turn, whose last word ended a second ago
def stage_turn(consumer: SimpleNamespace) -> None:
    now   = datetime.now(timezone.utc)
    words = [
        {"word": "go",   "start": now - timedelta(seconds=1.6), "end": now - timedelta(seconds=1.4)},
        {"word": "left", "start": now - timedelta(seconds=1.3), "end": now - timedelta(seconds=1.0)},
    ]
    consumer._staged_utterances.append(text="go left", words=words, timestamp=0.0)

# Speech whose first sentence took a quarter of a second
async def quick_tts(text: str, send: AsyncMock, response_id: int, on_first_audio: Callable[[float], None]) -> None:
    on_first_audio(0.25)

# The `reply_timing` frames one sender was handed, in order
def timing_frames(sender: AsyncMock) -> list[dict]:
    return [call.args[0] for call in sender.await_args_list if call.args[0]["type"] == "reply_timing"]

# Let the frames started in the background go out
async def settle() -> None:
    for _ in range(3): await asyncio.sleep(0)


# ================================================================================
# Timed Steps
# ================================================================================
class StepTimingTests(unittest.IsolatedAsyncioTestCase):
    # Steps from the attempt's own task and from a task it starts are both collected; one outside an attempt is not
    async def test_steps_from_the_attempt_and_its_tasks_are_collected(self) -> None:
        async def check() -> None:
            with timed_step("check"): await asyncio.sleep(0)

        with timed_step("before"): pass
        with collect_steps() as steps:
            async with asyncio.TaskGroup() as group:
                group.create_task(check())
                with timed_step("reply"): await asyncio.sleep(0)
            with timed_step("hold", "hold"): await asyncio.sleep(0)
        with timed_step("after"): pass

        self.assertEqual(sorted((step.label, step.kind) for step in steps), [("check", "call"), ("hold", "hold"), ("reply", "call")])
        self.assertTrue(all(step.ended >= step.started for step in steps))

    # A step that fails is timed too (the reply still waited for it)
    def test_a_failed_step_is_still_timed(self) -> None:
        with collect_steps() as steps:
            with self.assertRaises(RuntimeError):
                with timed_step("reply"): raise RuntimeError("no answer")

        self.assertEqual([step.label for step in steps], ["reply"])

    # The LLM client times each call under its label, a failed one included
    async def test_each_model_call_is_a_step_of_the_reply(self) -> None:
        api    = StructuredAPI(timeout_sec=1.0, max_retries=0, retry_delay_sec=0.0)
        create = AsyncMock(side_effect=[Answer(), RuntimeError("the endpoint is down")])

        with patch.object(api, "client", SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))), collect_steps() as steps:
            await api._request(label="reply", response_model=Answer, messages=[], temperature=0.0)
            with self.assertRaises(RuntimeError), self.assertLogs("chat_app.services.llm.structured_api", level="WARNING"):
                await api._request(label="check", response_model=Answer, messages=[], temperature=0.0)

        self.assertEqual([(step.label, step.kind) for step in steps], [("reply", "call"), ("check", "call")])


# ================================================================================
# The Record
# ================================================================================
class ReplyTimingRecordTests(unittest.TestCase):
    # Every stage counts from the attempt's start, the holds add up, and the features stay as they were
    def test_the_record_counts_from_the_attempts_start(self) -> None:
        started_at = datetime(2026, 11, 19, 12, 0, 0, tzinfo=timezone.utc)
        timing     = ReplyTiming(started=100.0, started_at=started_at, speech_end=started_at - timedelta(seconds=0.6), features={"turn_end": True})
        timing.steps       = (TimedStep("check", "call", 100.01, 100.61), TimedStep("reply", "call", 100.01, 101.41), TimedStep("hold", "hold", 100.62, 103.12))
        timing.generate_ms = 3_150
        timing.note_tts(0.42)

        self.assertEqual(timing.record(), {
            "stt_ms"      : 600,
            "generate_ms" : 3_150,
            "calls"       : [{"label": "check", "at_ms": 10, "ms": 600}, {"label": "reply", "at_ms": 10, "ms": 1_400}],
            "hold_ms"     : 2_500,
            "tts_ms"      : 420,
            "delay_ms"    : None,
            "features"    : {"turn_end": True},
        })

    # A turn without word timings (a text client, or a harness turn with nothing staged) has no transcript time
    def test_a_turn_without_word_timings_has_no_transcript_time(self) -> None:
        timing = ReplyTiming(started=0.0, started_at=datetime.now(timezone.utc), speech_end=None, features={})
        self.assertEqual((timing.record()["stt_ms"], timing.record()["hold_ms"], timing.record()["calls"]), (None, None, []))


# ================================================================================
# Saved and Sent
# ================================================================================
class ReplyTimingPipelineTests(unittest.IsolatedAsyncioTestCase):
    # Replace the exchange's database writes (its words' too) and the reply's speech
    def setUp(self) -> None:
        saved   = (SimpleNamespace(id=USER_ID), SimpleNamespace(id=REPLY_ID))
        patches = {
            "exchange" : patch(f"{HELPERS}.commit_chat_exchange",      new=AsyncMock(return_value=saved)),
            "words"    : patch(f"{HELPERS}.db_s2a",                    new=lambda function: AsyncMock()),
            "tts"      : patch(f"{HELPERS}.synthesize_and_stream_tts", new=quick_tts),
        }
        self.mocks = {name: started.start() for name, started in patches.items()}
        for started in patches.values(): self.addCleanup(started.stop)

    # The reply is saved with its timing so far, which goes to the listeners but not to a client outside debug mode
    async def test_a_saved_reply_carries_its_timing(self) -> None:
        consumer = make_consumer(debug_mode=False)
        stage_turn(consumer)

        await ChatHandler._execute_response(consumer)
        await settle()

        saved = self.mocks["exchange"].await_args.kwargs["timing"]
        self.assertEqual([call["label"] for call in saved["calls"]], ["reply"])
        self.assertGreaterEqual(saved["stt_ms"], 1_000)
        self.assertGreaterEqual(saved["generate_ms"], 0)
        self.assertEqual((saved["hold_ms"], saved["tts_ms"], saved["delay_ms"]), (None, None, None))
        self.assertEqual(saved["features"], {"backchannels": True})
        self.assertEqual(timing_frames(consumer._broadcast_monitor), [{"type": "reply_timing", "data": {"response_id": REPLY_ID, **saved}}])
        consumer.send_json.assert_not_awaited()

    # In debug mode the client gets it too, and its report that the audio started adds the delay it heard (once)
    async def test_a_debug_client_gets_the_timing_and_then_the_delay_it_heard(self) -> None:
        consumer = make_consumer(debug_mode=True)
        stage_turn(consumer)
        await ChatHandler._execute_response(consumer)
        await settle()

        save = AsyncMock()
        with patch(f"{TIMING}.db_s2a", new=lambda function: save):
            await finish_reply_timing(consumer, REPLY_ID, datetime.now(timezone.utc))
            await finish_reply_timing(consumer, REPLY_ID, datetime.now(timezone.utc))

        first, done = timing_frames(consumer.send_json)
        self.assertEqual((first["data"]["tts_ms"], first["data"]["delay_ms"]), (None, None))
        self.assertEqual(done["data"]["tts_ms"], 250)
        self.assertGreaterEqual(done["data"]["delay_ms"], 1_000)
        save.assert_awaited_once_with(9, REPLY_ID, {key: value for key, value in done["data"].items() if key != "response_id"})
        self.assertEqual(timing_frames(consumer._broadcast_monitor), [first, done])

    # The client's report is timed when it arrives, so a save that waits for the database
    # makes neither the message's start nor the delay late
    async def test_a_playback_report_is_timed_when_it_arrives(self) -> None:
        consumer = make_consumer(debug_mode=True)
        stage_turn(consumer)
        await ChatHandler._execute_response(consumer)
        await settle()

        # The report arrives three seconds after the user's last word
        arrived = consumer._reply_timings[REPLY_ID].speech_end + timedelta(seconds=3)
        save    = AsyncMock(return_value=True)
        with patch(f"{PLAYBACK}.datetime", new=Mock(now=Mock(return_value=arrived))), patch(f"{PLAYBACK}.db_s2a", new=lambda function: save), patch(f"{TIMING}.db_s2a", new=lambda function: AsyncMock()):
            await handle_playback_event(consumer, {"type": "tts_playback", "data": {"responseId": REPLY_ID, "state": "started"}})
            await settle()

        save.assert_awaited_once_with(9, REPLY_ID, "started", arrived)
        self.assertEqual(timing_frames(consumer.send_json)[-1]["data"]["delay_ms"], 3_000)

    # Only the latest few replies wait for their report (a reply never heard drops out), and a supplied reply has none
    async def test_only_the_latest_replies_wait_for_their_audio(self) -> None:
        consumer = make_consumer(debug_mode=False)
        with patch(f"{TIMING}.fire_and_log", new=lambda coroutine, name: coroutine.close()):
            for response_id in range(REPLY_TIMING_KEEP + 1):
                track_reply_timing(consumer, response_id, ReplyTiming(started=0.0, started_at=datetime.now(timezone.utc), speech_end=None, features={}))

        self.assertEqual(list(consumer._reply_timings), list(range(1, REPLY_TIMING_KEEP + 1)))
        await finish_reply_timing(consumer, 0, datetime.now(timezone.utc))
        consumer._broadcast_monitor.assert_not_awaited()
