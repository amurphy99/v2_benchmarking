"""
Unit tests for the `reply_now` state and command helpers.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.tests.test_reply_state`

Exercise queue barriers, staged transcript snapshots, command acknowledgements, and
interim STT comparison.

"""
import unittest

from datetime      import timedelta
from types         import SimpleNamespace
from unittest.mock import AsyncMock, Mock

# From this project
from chat_app.websocket.consumers.processing.commands        import dispatch_command
from chat_app.websocket.services.chat_state                 import StagedUtteranceBuffer
from chat_app.websocket.services.speech.stt.audio_queue     import AudioBarrier, AudioChunk, StopSignal, AudioInputQueue
from chat_app.websocket.services.speech.stt.stream_state    import InterimProgressTracker


# ================================================================================
# Staged Utterance Buffer Tests
# ================================================================================
class StagedUtteranceBufferTests(unittest.TestCase):
    """
    Verify that successful responses consume only the transcript records they used.
    """
    # Keep a late transcript and its words after consuming an older snapshot
    def test_snapshot_consumes_only_its_text_and_words(self) -> None:
        staged = StagedUtteranceBuffer()
        staged.append(text="first", words=[{"word": "first"}], timestamp=1.0)
        snapshot = staged.snapshot()

        staged.append(text="late", words=[{"word": "late"}], timestamp=2.0)
        staged.consume(snapshot)

        remaining = staged.snapshot()
        self.assertEqual([item.text for item in remaining], ["late"])
        self.assertEqual(remaining[0].words, ({"word": "late"},))


# ================================================================================
# Audio Barrier Tests
# ================================================================================
class AudioBarrierTests(unittest.IsolatedAsyncioTestCase):
    """
    Verify queue ordering and barrier completion across the asyncio/thread boundary.
    """
    # Resolve the marker after older audio and before newer audio
    async def test_queue_reaches_barrier_between_older_and_newer_audio(self) -> None:
        audio_queue = AudioInputQueue()
        audio_queue.put_audio(received_at=1.0, data=b"a")
        audio_queue.put_audio(received_at=2.0, data=b"b")
        barrier = audio_queue.put_barrier()
        audio_queue.put_audio(received_at=3.0, data=b"c")

        first  = audio_queue.get(timeout=0.01)
        second = audio_queue.get(timeout=0.01)
        marker = audio_queue.get(timeout=0.01)
        await barrier.wait(timeout=0.05)
        fourth = audio_queue.get(timeout=0.01)

        self.assertEqual([first.data, second.data], [b"a", b"b"])
        self.assertIs(marker, barrier)
        self.assertIsInstance(fourth, AudioChunk)
        self.assertEqual(fourth.data, b"c")

    # Propagate both successful and failed one-shot barrier outcomes
    async def test_barrier_resolves_and_fails_without_external_services(self) -> None:
        reached = AudioBarrier()
        reached.resolve()
        await reached.wait(timeout=0.05)

        stopped = AudioBarrier()
        stopped.fail("stopped")
        with self.assertRaisesRegex(RuntimeError, "stopped"):
            await stopped.wait(timeout=0.05)

    # Fail an unreached boundary instead of leaving its coordinator blocked
    async def test_stopping_queue_releases_an_unreached_barrier(self) -> None:
        audio_queue = AudioInputQueue()
        audio_queue.put_audio(received_at=1.0, data=b"old")
        barrier = audio_queue.put_barrier()

        audio_queue.stop()

        with self.assertRaisesRegex(RuntimeError, "stopped"):
            await barrier.wait(timeout=0.05)
        self.assertIsInstance(audio_queue.get(timeout=0.01), StopSignal)

    # Preserve resumed audio while removing the previous stream's stop marker
    async def test_restart_keeps_audio_queued_after_stop_marker(self) -> None:
        audio_queue = AudioInputQueue()
        audio_queue.stop()
        audio_queue.put_audio(received_at=1.0, data=b"resumed")

        audio_queue.prepare_for_restart()

        item = audio_queue.get(timeout=0.01)
        self.assertIsInstance(item, AudioChunk)
        self.assertEqual(item.data, b"resumed")


# ================================================================================
# Interim Progress Tracker Tests
# ================================================================================
class InterimProgressTrackerTests(unittest.TestCase):
    """
    Verify that only transcript growth beyond Google's timing watermark is meaningful.
    """
    # Build the result shape consumed by InterimProgressTracker
    @staticmethod
    def result(end_seconds : float | None) -> SimpleNamespace:
        duration = None if (end_seconds is None) else timedelta(seconds=end_seconds)
        return SimpleNamespace(result_end_time=duration)

    # Ignore repeated text and same-length reinterpretations of the same audio
    def test_repeated_or_same_length_revisions_do_not_count_as_new_speech(self) -> None:
        tracker = InterimProgressTracker()
        self.assertTrue (tracker.has_new_speech(self.result(1.0), "hello"))
        self.assertFalse(tracker.has_new_speech(self.result(1.1), "hello"))
        self.assertFalse(tracker.has_new_speech(self.result(1.2), "yellow"))
        self.assertTrue (tracker.has_new_speech(self.result(1.3), "yellow world"))
        self.assertFalse(tracker.has_new_speech(self.result(1.4), "yellow world"))

    # Start a new text segment after finalization without moving timing backward
    def test_final_resets_interim_text_but_preserves_the_timing_watermark(self) -> None:
        tracker = InterimProgressTracker()
        self.assertTrue(tracker.has_new_speech(self.result(1.0), "hello"))

        tracker.record_final(self.result(1.0))
        
        self.assertFalse(tracker.has_new_speech(self.result(1.01), "old revision"))
        self.assertTrue (tracker.has_new_speech(self.result(1.2),  "new"))

    # Compare normalized word-count growth when timing metadata is unavailable
    def test_transcript_growth_is_the_fallback_without_timing(self) -> None:
        tracker = InterimProgressTracker()
        self.assertTrue (tracker.has_new_speech(self.result(None), "one"))
        self.assertFalse(tracker.has_new_speech(self.result(None), "won"))
        self.assertTrue (tracker.has_new_speech(self.result(None), "won two"))


# ================================================================================
# Command Dispatch Tests
# ================================================================================
class CommandDispatchTests(unittest.IsolatedAsyncioTestCase):
    """
    Verify immediate, correlated acknowledgement of a canonical `reply_now` request.
    """
    # Dispatch one request and preserve its caller-provided correlation ID
    async def test_reply_now_is_accepted_and_correlated(self) -> None:
        consumer           = SimpleNamespace(reply_on_user_utt=False, streaming_active=True, save_audio=False)
        consumer.reply_now = Mock()

        ack = await dispatch_command(consumer, {"id": "request-1", "name": "reply_now"})

        consumer.reply_now.assert_called_once_with()
        self.assertEqual(ack["id"              ], "request-1")
        self.assertEqual(ack["name"            ], "reply_now")
        self.assertTrue (ack["ok"              ])
        self.assertTrue (ack["state"]["manualMode"])

    # Set automatic-response state directly instead of relying on transport-specific aliases
    async def test_pause_responses_uses_desired_boolean_state(self) -> None:
        consumer = SimpleNamespace(
            reply_on_user_utt      = True,
            streaming_active       = True,
            save_audio             = False,
            _pending_response_task = None,
            _manual_response_task = None,
        )

        ack = await dispatch_command(consumer, {"id": "request-2", "name": "pause_responses", "data": True})

        self.assertTrue(ack["ok"])
        self.assertFalse(consumer.reply_on_user_utt)
        self.assertTrue(ack["state"]["responsesPaused"])

    # Apply listening state through the shared stream operation
    async def test_pause_listening_stops_stt_and_notifies_clients(self) -> None:
        consumer = SimpleNamespace(
            reply_on_user_utt        = True,
            streaming_active         = True,
            save_audio               = False,
            stt_provider             = SimpleNamespace(start=Mock(), stop=Mock()),
            send                     = AsyncMock(),
            _broadcast_stream_status = AsyncMock(),
        )

        ack = await dispatch_command(consumer, {"id": "request-3", "name": "pause_listening", "data": True})

        self.assertTrue(ack["ok"])
        self.assertFalse(consumer.streaming_active)
        consumer.stt_provider.stop.assert_called_once_with()
        consumer._broadcast_stream_status.assert_awaited_once_with("paused")

    # Read custom response text from the same data envelope sent by the admin frontend
    async def test_send_custom_uses_canonical_data_envelope(self) -> None:
        consumer                = SimpleNamespace(reply_on_user_utt=False, streaming_active=True, save_audio=False)
        consumer.speak_response = Mock()

        ack = await dispatch_command(
            consumer,
            {"id": "request-4", "name": "send_custom", "data": {"message": "  hello  "}},
        )

        self.assertTrue(ack["ok"])
        self.assertTrue(consumer.reply_on_user_utt)
        consumer.speak_response.assert_called_once_with("hello")


if __name__ == "__main__":
    unittest.main()
