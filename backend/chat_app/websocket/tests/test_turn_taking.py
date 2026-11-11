"""Shared audio routing, automatic timing, interruption context, and command semantics."""
import asyncio
import base64
import collections
import json
import math
import unittest
from dataclasses import asdict
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from chat_app.models import ChatSession
from chat_app.services.middleware import ALLOWED_SOURCES
from chat_app.websocket.consumers.processing.audio import ingest_audio_payload
from chat_app.websocket.consumers.processing.commands import dispatch_command
from chat_app.websocket.consumers.processing.speech import handle_interim
from chat_app.websocket.harnesses.base import (
    ChatHarness, InterruptedReply, InterimSpeech, ResponseOutcome, TurnAttempt,
)
from chat_app.websocket.harnesses.activity.harness import ActivityHarness, ActivityTurn
from chat_app.websocket.harnesses.activity.pipeline import generate_turn
from chat_app.websocket.services.chatHelpers import ChatHandler
from chat_app.websocket.services.chat_state import StagedUtteranceBuffer
from chat_app.websocket.services.turn_taking import (
    TurnTakingState, turn_taking, validate_reply_delay,
)

CHAT_MODULE = "chat_app.websocket.services.chatHelpers"


class FixtureHarness(ChatHarness):
    NAME = "test"
    ALLOW_SPEECH_INTERRUPTION = True  # This test double exercises activity-style interruption behavior.

    async def generate(self, attempt: TurnAttempt) -> ResponseOutcome:
        return ResponseOutcome(message="Hello")


def make_consumer(source: str = "webapp") -> SimpleNamespace:
    """Create a connection double with explicit timing and no external I/O."""
    value = SimpleNamespace(
        source=source,
        response_mode="automatic",
        use_backend_STT=True,
        use_backend_TTS=True,
        reply_delay_seconds=0.0,  # Tests choose their own delay rather than server defaults.
        _stt_progress_revision=0,
        _pending_response_task=None,
        _pending_response_trigger="automatic",
        _manual_response_task=None,
        _reply_now_task=None,
        _close_scheduled=False,
        _stage_lock=asyncio.Lock(),
        _response_lock=asyncio.Lock(),
        _staged_utterances=StagedUtteranceBuffer(),
        context_buffer=[],
        last_response=None,
        send=AsyncMock(),
        send_json=AsyncMock(),
        close=AsyncMock(),
        reply_now=Mock(),
        streaming_active=True,
        save_audio=False,
        stt_provider=SimpleNamespace(start=Mock(), stop=Mock()),
        audio_recorder=SimpleNamespace(resume=Mock(), pause=Mock()),
        _broadcast_stream_status=AsyncMock(),
        user=SimpleNamespace(id=1, first_name="Test"),
        session_id=1,
    )
    value.harness = FixtureHarness(value, condition="", variant="")
    return value


def make_attempt(harness: ChatHarness) -> TurnAttempt:
    return TurnAttempt(
        context=[], user_text="A new question", trigger="automatic",
        publish_mood=AsyncMock(), interruptions=harness.pending_interruptions,
    )


class SourceAndDelayTests(unittest.TestCase):
    def test_only_activity_opts_in_to_speech_interruption_by_default(self):
        self.assertFalse(ChatHarness.ALLOW_SPEECH_INTERRUPTION)
        self.assertTrue(ActivityHarness.ALLOW_SPEECH_INTERRUPTION)

    def test_reachy_is_an_accepted_source_and_model_choice(self):
        self.assertIn("reachyrobot", ALLOWED_SOURCES)
        self.assertIn("reachyrobot", dict(ChatSession.SOURCE_CHOICES))

    def test_delay_rejects_booleans_non_numeric_non_finite_and_out_of_range(self):
        for value in [None, True, "1.0", -1, 6, 10**1000, math.nan, math.inf]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_reply_delay(value)
        for value in [0, 1, 1.5, 5]:
            self.assertEqual(validate_reply_delay(value), float(value))


class AudioRoutingTests(unittest.IsolatedAsyncioTestCase):
    async def test_qt_audio_reaches_backend_stt_even_when_transcript_echo_is_false(self):
        """The legacy use_backend_STT flag must not disable the audio provider."""
        pcm = b"\x00\x00"
        value = SimpleNamespace(
            source="qtrobot", use_backend_STT=False,
            stt_provider=SimpleNamespace(send_audio=Mock(return_value=True)),
            audio_recorder=SimpleNamespace(write_user_audio=Mock()),
            _audio_chunks=collections.deque(),
        )
        await ingest_audio_payload(value, {
            "type": "audio_data", "data": base64.b64encode(pcm).decode(),
            "sampleRate": 16_000, "channels": 1, "bitsPerSample": 16,
            "encoding": "pcm_s16le",
        })
        value.stt_provider.send_audio.assert_called_once_with(pcm)
        value.audio_recorder.write_user_audio.assert_called_once()
        self.assertEqual(len(value._audio_chunks), 1)


class SilenceTests(unittest.IsolatedAsyncioTestCase):
    async def test_connection_reuses_timing_and_delivery_state(self):
        """Speech callbacks and playback tracking must share one connection state."""
        value = make_consumer()
        value._turn_taking = None  # Match a newly initialized real consumer.
        state = turn_taking(value)
        state.set_delay(1.5)
        state.set_listening(False)
        state.queue_reply(42, "Still speaking.", "automatic")

        reused = turn_taking(value)
        self.assertIs(reused, state)
        self.assertEqual(reused.delay, 1.5)
        self.assertFalse(reused.listening)
        self.assertIn(42, reused.replies)

        # A separate connection must not inherit the first one's audio or listening state.
        other = turn_taking(make_consumer())
        self.assertIsNot(other, state)
        self.assertTrue(other.listening)
        self.assertEqual(other.replies, {})

    async def test_live_setting_change_releases_the_reply_wait(self):
        state = TurnTakingState(1.5)
        state.recognized_progress()
        task = asyncio.create_task(state.wait_for_silence())
        await asyncio.sleep(0)
        self.assertFalse(task.done())
        state.set_delay(0)
        await asyncio.wait_for(task, 2)

    async def test_new_recognized_text_restarts_the_reply_delay(self):
        # Replace only this module's clock; keep asyncio's own clock running normally.
        clock = SimpleNamespace(monotonic=Mock(return_value=0.0))
        with patch("chat_app.websocket.services.turn_taking.time", new=clock):
            state = TurnTakingState(1.5)
            state.recognized_progress()
            clock.monotonic.return_value = 1.0
            state.recognized_progress()

            # The old deadline has passed, but newer text moved it to 2.5 seconds.
            clock.monotonic.return_value = 1.6
            task = asyncio.create_task(state.wait_for_silence())
            try:
                await asyncio.sleep(0)
                self.assertFalse(task.done())
                clock.monotonic.return_value = 2.5
                state.changed.set()
                await asyncio.wait_for(task, 2)
            finally:
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)

    async def test_recognition_pause_blocks_only_the_automatic_wait(self):
        state = TurnTakingState(0)
        state.set_listening(False)
        task = asyncio.create_task(state.wait_for_silence())
        await asyncio.sleep(0)
        self.assertFalse(task.done())
        state.set_listening(True)
        await asyncio.wait_for(task, 2)

    async def test_same_session_delay_works_for_different_sources(self):
        for source in ("webapp", "reachyrobot", "qtrobot", "buddyrobot"):
            with self.subTest(source=source):
                value = make_consumer(source)
                value.reply_delay_seconds = 1.5
                self.assertEqual(turn_taking(value).delay, 1.5)

    async def test_automatic_wrapper_waits_before_entering_common_execution(self):
        value = make_consumer()
        entered = asyncio.Event()
        release = asyncio.Event()

        async def wait():
            entered.set()
            await release.wait()

        with patch.object(turn_taking(value), "wait_for_silence", new=wait), \
             patch.object(ChatHandler, "_execute_response", new=AsyncMock(return_value="next")) as execute:
            task = asyncio.create_task(ChatHandler._automatic_response(value))
            await asyncio.wait_for(entered.wait(), 2)
            execute.assert_not_awaited()
            release.set()
            self.assertEqual(await asyncio.wait_for(task, 2), "next")

    async def test_direct_execution_does_not_apply_automatic_silence_delay(self):
        value = make_consumer()
        with patch.object(turn_taking(value), "wait_for_silence", new=AsyncMock()) as wait, \
             patch.object(ChatHandler, "_execute_response_locked", new=AsyncMock(return_value="forced")):
            self.assertEqual(
                await ChatHandler._execute_response(value, trigger="reply_now"),
                "forced",
            )
            wait.assert_not_awaited()

    async def test_speech_staged_during_forced_reply_uses_automatic_wait_for_follow_up(self):
        value = make_consumer()
        value._reply_now_generation = 1
        value._staged_utterances.append(text="first", words=None, timestamp=0)

        async def forced_reply(consumer, trigger="automatic"):
            self.assertEqual(trigger, "reply_now")
            consumer._staged_utterances.consume(consumer._staged_utterances.snapshot())
            consumer._staged_utterances.append(text="continued", words=None, timestamp=1)
            return "forced"

        with patch.object(ChatHandler, "_execute_response", new=forced_reply), \
             patch.object(ChatHandler, "_automatic_response", new=AsyncMock(return_value="follow-up")) as automatic:
            await ChatHandler._coordinate_reply_now(
                value, SimpleNamespace(wait=AsyncMock()), generation=1,
            )
            await asyncio.wait_for(value._pending_response_task, 2)
            automatic.assert_awaited_once_with(value)


class CommandTests(unittest.IsolatedAsyncioTestCase):
    async def test_delay_ack_is_correlated_and_invalid_setting_does_not_mutate(self):
        value = make_consumer()
        ack = await dispatch_command(value, {
            "id": "delay-1", "name": "set_reply_delay", "data": {"seconds": 1.5},
        })
        self.assertTrue(ack["ok"])
        self.assertEqual(ack["id"], "delay-1")
        self.assertEqual(ack["state"]["reply_delay_seconds"], 1.5)
        rejected = await dispatch_command(value, {
            "id": "delay-2", "name": "set_reply_delay", "data": {"seconds": True},
        })
        self.assertFalse(rejected["ok"])
        self.assertEqual(turn_taking(value).delay, 1.5)

    async def test_listening_pause_resume_do_not_wait_for_reply_delay(self):
        value = make_consumer()
        state = turn_taking(value)
        state.set_delay(5)
        with patch.object(state, "wait_for_silence", new=AsyncMock()) as wait:
            paused = await dispatch_command(value, {
                "name": "set_listening", "data": {"state": "paused"},
            })
            resumed = await dispatch_command(value, {
                "name": "set_listening", "data": {"state": "active"},
            })
            self.assertTrue(paused["ok"])
            self.assertTrue(resumed["ok"])
            wait.assert_not_awaited()
            value.stt_provider.stop.assert_called_once()
            value.stt_provider.start.assert_called_once()

    async def test_resume_and_respond_uses_explicit_reply_now(self):
        value = make_consumer()
        state = turn_taking(value)
        state.set_delay(5)
        paused = await dispatch_command(value, {"name": "pause_and_listen"})
        self.assertTrue(paused["ok"])
        self.assertEqual(value.response_mode, "manual")
        with patch.object(state, "wait_for_silence", new=AsyncMock()) as wait:
            resumed = await dispatch_command(value, {"name": "resume_and_respond"})
            self.assertTrue(resumed["ok"])
            self.assertEqual(value.response_mode, "automatic")
            value.reply_now.assert_called_once()
            wait.assert_not_awaited()


class SpeechEventTests(unittest.IsolatedAsyncioTestCase):
    async def test_only_advancing_interim_text_uses_the_cancellation_path(self):
        value = make_consumer()
        with patch.object(ChatHandler, "note_stt_progress", return_value=False) as progress:
            for new_speech in (False, True):
                handle_interim(value, InterimSpeech(
                    text="hello", new_speech=new_speech, stability=0.9,
                    ended_at=datetime.now(timezone.utc),
                ))
            progress.assert_called_once_with(value)

    async def test_advancing_interim_interrupts_generation_and_buffered_audio(self):
        """Recognized words stop delivery and preserve context through the shared path."""
        value = make_consumer()
        state = turn_taking(value)
        state.queue_reply(42, "An unfinished topic.", "automatic")
        state.playback(42, "started")
        pending = Mock()
        pending.done.return_value = False
        pending.cancelling.return_value = 0
        value._pending_response_task = pending

        # Advancing interim text still stops speech without waiting for a final.
        handle_interim(value, InterimSpeech(
            text="Actually", new_speech=True, stability=0.9,
            ended_at=datetime.now(timezone.utc),
        ))
        await asyncio.sleep(0)

        pending.cancel.assert_called_once_with()
        self.assertTrue(state.replies[42].interrupted)
        self.assertEqual(value.harness.pending_interruptions, (
            InterruptedReply(42, "An unfinished topic.", True),
        ))
        value.send.assert_awaited_once()
        self.assertEqual(json.loads(value.send.await_args.args[0]), {
            "type": "cancel_audio",
            "data": {"responseIds": [42], "reason": "user_speech"},
        })


class InterruptionTests(unittest.IsolatedAsyncioTestCase):
    async def test_non_activity_buffered_audio_is_not_interrupted(self):
        value = make_consumer()
        value.harness.ALLOW_SPEECH_INTERRUPTION = False
        state = turn_taking(value)
        state.queue_reply(42, "Finish this reply.", "automatic")
        state.playback(42, "started")

        self.assertFalse(ChatHandler.note_stt_progress(value))
        await asyncio.sleep(0)

        self.assertFalse(state.replies[42].interrupted)
        self.assertEqual(value.harness.pending_interruptions, ())
        value.send.assert_not_called()

    async def test_live_tts_yields_to_speech_only_when_the_harness_opts_in(self):
        for allowed in (False, True):
            with self.subTest(allowed=allowed):
                value = make_consumer()
                value.harness.ALLOW_SPEECH_INTERRUPTION = allowed
                value._tts_streaming = True
                pending = Mock()
                pending.done.return_value = False
                pending.cancelling.return_value = 0
                value._pending_response_task = pending
                state = turn_taking(value)
                state.queue_reply(42, "Speaking now.", "automatic")
                state.playback(42, "started")

                self.assertEqual(ChatHandler.note_stt_progress(value), allowed)
                await asyncio.sleep(0)

                self.assertEqual(pending.cancel.call_count, int(allowed))
                self.assertEqual(state.replies[42].interrupted, allowed)
                self.assertEqual(value.send.await_count, int(allowed))
                self.assertEqual(value._stt_progress_revision, 1)

    async def test_non_activity_still_cancels_outdated_generation_before_tts(self):
        value = make_consumer()
        value.harness.ALLOW_SPEECH_INTERRUPTION = False
        value._tts_streaming = False
        pending = Mock()
        pending.done.return_value = False
        pending.cancelling.return_value = 0
        value._pending_response_task = pending

        self.assertTrue(ChatHandler.note_stt_progress(value))
        pending.cancel.assert_called_once_with()
        value.send.assert_not_called()

    async def test_non_activity_does_not_interrupt_a_reply_registered_during_commit(self):
        """The shielded-commit cancellation path must obey the same harness policy."""
        value = make_consumer()
        value.harness.ALLOW_SPEECH_INTERRUPTION = False
        value._staged_utterances.append(text="first", words=None, timestamp=0)
        committing = asyncio.Event()
        release = asyncio.Event()

        async def commit(*args, **kwargs):
            committing.set()
            await release.wait()
            turn_taking(value).queue_reply(42, "Saved reply.", "automatic")
            return SimpleNamespace(id=42)

        with patch.object(ChatHandler, "_commit_response", new=commit):
            task = asyncio.create_task(ChatHandler._execute_response(value))
            value._pending_response_task = task
            try:
                await asyncio.wait_for(committing.wait(), 2)
                self.assertTrue(ChatHandler.note_stt_progress(value))
                release.set()
                with self.assertRaises(asyncio.CancelledError):
                    await asyncio.wait_for(task, 2)
            finally:
                release.set()
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)

        self.assertFalse(turn_taking(value).replies[42].interrupted)
        self.assertEqual(value.harness.pending_interruptions, ())
        value.send.assert_not_called()

    async def test_pending_context_accessor_is_a_tuple_property(self):
        """Protect the public API used without parentheses by both pipelines."""
        value = make_consumer()
        self.assertIsInstance(value.harness.pending_interruptions, tuple)

    async def test_buffered_audio_can_stop_after_the_response_task_has_finished(self):
        value = make_consumer()
        state = turn_taking(value)
        state.queue_reply(42, "An unfinished topic.", "automatic")
        state.playback(42, "started")
        self.assertFalse(ChatHandler.note_stt_progress(value))
        await asyncio.sleep(0)
        self.assertEqual(value.harness.pending_interruptions, (
            InterruptedReply(42, "An unfinished topic.", True),
        ))
        self.assertIn('"responseIds": [42]', value.send.call_args.args[0])
        ChatHandler.note_stt_progress(value)
        self.assertEqual(len(value.harness.pending_interruptions), 1)

    async def test_queued_unheard_reply_cannot_be_revived_by_late_start(self):
        value = make_consumer()
        state = turn_taking(value)
        state.queue_reply(42, "Not heard yet.", "automatic")
        self.assertEqual(state.interrupt(value.harness), (42,))
        state.playback(42, "started")
        self.assertFalse(state.replies[42].started)

    async def test_completed_audio_is_not_reclassified_by_a_late_interruption(self):
        value = make_consumer()
        state = turn_taking(value)
        state.queue_reply(42, "Heard completely.", "automatic")
        state.playback(42, "finished")
        state.playback(42, "interrupted")
        self.assertTrue(state.replies[42].finished)
        self.assertEqual(state.interrupt(value.harness), ())

    async def test_explicit_reply_now_speech_remains_protected(self):
        value = make_consumer("qtrobot")
        state = turn_taking(value)
        state.queue_reply(42, "Explicit speech.", "reply_now")
        state.playback(42, "started")
        ChatHandler.note_stt_progress(value)
        await asyncio.sleep(0)
        self.assertEqual(value.harness.pending_interruptions, ())
        value.send.assert_not_called()

    async def test_cancelled_and_failed_attempts_retain_context_and_late_events_survive(self):
        value = make_consumer()
        first = InterruptedReply(1, "first topic", True)
        late = InterruptedReply(2, "later topic", False)
        value.harness.on_interrupted(first)
        turn = make_attempt(value.harness)
        value.harness.on_reply_started(turn)
        value.harness.on_reply_cancelled(turn, saved=False)
        self.assertEqual(value.harness.pending_interruptions, (first,))
        value.harness.on_reply_started(turn)
        value.harness.on_reply_saved(ResponseOutcome(
            message="fallback", consume_interruptions=False,
        ))
        self.assertEqual(value.harness.pending_interruptions, (first,))
        value.harness.on_reply_started(turn)
        value.harness.on_interrupted(late)
        value.harness.on_reply_saved(ResponseOutcome(message="success"))
        self.assertEqual(value.harness.pending_interruptions, (late,))

    async def test_activity_preserves_text_and_excludes_it_from_future_goal_observations(self):
        interrupted = InterruptedReply(42, "Hello, I am your companion.", True)
        plan = {
            "acknowledge": "", "answer": "", "required_content": [],
            "follow_up": "", "target_goal_ids": ["greet"], "avoid_repeating": [],
            "next_state": "start_conversation", "transition_reason": "continue",
            "exit_quote": "", "updated_memory": {}, "evidence": [{
                "goal_id": "greet", "message_id": "1:assistant", "quote": "Hello",
            }],
        }
        value = make_consumer()
        harness = ActivityHarness(value, condition="", variant="")
        harness.rag_state.update({
            "_history": [{
                "id": "1:assistant", "response_id": 42, "state": "start_conversation",
                "role": "assistant", "text": interrupted.text,
            }],
            "_goal_progress": {"start_conversation": {
                "greet": {"status": "satisfied", "message_id": "1:assistant"},
            }},
        })
        harness.on_interrupted(interrupted)
        self.assertEqual(harness.rag_state["_history"][0]["text"], interrupted.text)
        self.assertEqual(harness.rag_state["_goal_progress"]["start_conversation"], {})
        planner = SimpleNamespace(generate=AsyncMock(return_value=SimpleNamespace(
            model_dump=lambda: plan,
        )))
        responder = SimpleNamespace(generate=AsyncMock(return_value=("Please go on.", None)))
        _, log = await generate_turn(
            definition=[{"name": "start_conversation", "instructions": "Greet"}],
            rag_state=harness.rag_state, user_text="Actually, a question.", known_name="",
            planner=planner, responder=responder, interruptions=(interrupted,),
        )
        payload = planner.generate.call_args.args[0]
        self.assertEqual(payload["INTERRUPTED_REPLIES"], [asdict(interrupted)])
        self.assertFalse(any(item["id"] == "1:assistant" for item in payload["observations"]))
        self.assertEqual(responder.generate.call_args.args[0]["INTERRUPTED_REPLIES"], [asdict(interrupted)])
        self.assertNotIn("greet", log["agents_data"]["goal_progress"])

    async def test_delivery_observation_survives_adopting_an_older_state_copy(self):
        value = make_consumer()
        harness = ActivityHarness(value, condition="", variant="")
        message = {
            "id": "1:assistant", "response_id": 42, "state": "start_conversation",
            "role": "assistant", "text": "Hello.",
        }
        harness.rag_state["_history"] = [dict(message)]
        proposed = {"current_scenario": "start_conversation", "_history": [dict(message)]}
        harness.on_interrupted(InterruptedReply(42, "Hello.", True))
        harness.on_reply_saved(ResponseOutcome(message="Next", state=ActivityTurn(proposed)))
        self.assertEqual(harness.rag_state["_history"][0]["delivery"], "interrupted")

    async def test_goodbye_closes_after_server_delivery_without_waiting_for_playback(self):
        """Closing remains the existing behavior, without a robot-specific wait."""
        value = make_consumer("reachyrobot")
        value.harness.generate = AsyncMock(return_value=ResponseOutcome(
            message="Goodbye", close_after=True,
        ))

        async def commit(*args, **kwargs):
            turn_taking(value).queue_reply(42, "Goodbye", "automatic")
            return SimpleNamespace(id=42)

        with patch.object(ChatHandler, "_commit_response", new=commit), \
             patch(f"{CHAT_MODULE}.synthesize_and_stream_tts", new=AsyncMock()):
            await asyncio.wait_for(
                ChatHandler._execute_response_locked(value, trigger="harness"), 2,
            )
        value.close.assert_awaited_once()
        self.assertTrue(any('"chat_ended"' in call.args[0] for call in value.send.call_args_list))
