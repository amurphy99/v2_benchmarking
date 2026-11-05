"""
Unit tests for the `reply_now` state and command helpers.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.tests.test_reply_state`

Exercise queue barriers, the `reply_now` STT flush, staged transcript snapshots, command
acknowledgements, and interim STT comparison.

"""
import asyncio, json, threading, time, unittest

from datetime      import timedelta
from types         import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

# From this project
from chat_app.websocket.consumers.consumers                   import ChatConsumer
from chat_app.websocket.consumers.handlers.ch_events          import handle_ws_command
from chat_app.websocket.consumers.processing.commands        import dispatch_command
from chat_app.websocket.consumers.processing.messages        import _publish_chat_message
from chat_app.websocket.consumers.processing.stream          import set_streaming_active
from chat_app.websocket.consumers.utils.groups               import claim_primary_connection, format_send_actions_command
from chat_app.websocket.services.chatHelpers                import ChatHandler
from chat_app.websocket.services.chat_state                 import StagedUtteranceBuffer
from chat_app.websocket.services.speech.stt.audio_queue     import AudioBarrier, AudioChunk, AudioInputQueue
from chat_app.websocket.services.speech.stt.speechProvider  import SpeechToTextProvider
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
    # Order the marker between older and newer audio; dequeuing it says nothing about recognition
    async def test_queue_orders_barrier_between_older_and_newer_audio(self) -> None:
        audio_queue = AudioInputQueue()
        audio_queue.put_audio(received_at=1.0, data=b"a")
        audio_queue.put_audio(received_at=2.0, data=b"b")
        barrier = audio_queue.put_barrier()
        audio_queue.put_audio(received_at=3.0, data=b"c")

        first  = audio_queue.get()
        second = audio_queue.get()
        marker = audio_queue.get()
        fourth = audio_queue.get()

        self.assertEqual([first.data, second.data], [b"a", b"b"])
        self.assertIs(marker, barrier)
        self.assertIsInstance(fourth, AudioChunk)
        self.assertEqual(fourth.data, b"c")
        with self.assertRaises(asyncio.TimeoutError):
            await barrier.wait(timeout=0.05)

    # Propagate both successful and failed one-shot barrier outcomes
    async def test_barrier_resolves_and_fails_without_external_services(self) -> None:
        reached = AudioBarrier()
        reached.resolve()
        await reached.wait(timeout=0.05)

        stopped = AudioBarrier()
        stopped.fail("stopped")
        with self.assertRaisesRegex(RuntimeError, "stopped"):
            await stopped.wait(timeout=0.05)

    # A waiter that times out must not cancel the barrier for the next one (paused `reply_now` reuses it)
    async def test_timed_out_waiter_leaves_the_barrier_usable(self) -> None:
        barrier = AudioBarrier()
        with self.assertRaises(asyncio.TimeoutError):
            await barrier.wait(timeout=0.01)

        barrier.resolve()
        await barrier.wait(timeout=0.05)

    # Fail an unreached boundary instead of leaving its coordinator blocked on shutdown
    async def test_aborting_queue_releases_an_unreached_barrier(self) -> None:
        audio_queue = AudioInputQueue()
        audio_queue.put_audio(received_at=1.0, data=b"old")
        barrier = audio_queue.put_barrier()

        audio_queue.abort()

        with self.assertRaisesRegex(RuntimeError, "aborted"):
            await barrier.wait(timeout=0.05)
        self.assertIsInstance(audio_queue.get(), AudioBarrier)  # Fresh marker that ends the generator


# ================================================================================
# STT Flush Tests (`reply_now` makes Google finalize before snapshotting)
# ================================================================================
class FakeSpeechClient:
    """
    Stand-in for Google's streaming client: consumes requests until the generator ends
    (a barrier half-closes the stream), then returns one final for that audio.
    """
    # Optionally hold the stream back so a test can reorder lifecycle calls first
    def __init__(self, gate: threading.Event | None = None) -> None:
        self.gate    = gate
        self.streams = []

    # Mirror `SpeechClient.streaming_recognize` closely enough for the provider
    def streaming_recognize(self, config: object, requests: object) -> object:
        if self.gate is not None: self.gate.wait(5)
        audio = b"".join(request.audio_content for request in requests)
        self.streams.append(audio)
        time.sleep(0.05)  # Google's finalization latency after half-close
        if audio:
            alternative = SimpleNamespace(transcript=audio.decode(), words=[])
            yield SimpleNamespace(results=[SimpleNamespace(is_final=True, result_end_time=None, alternatives=[alternative])])


class SpeechFlushTests(unittest.IsolatedAsyncioTestCase):
    """
    Verify that a flush barrier resolves only after the final transcript for every chunk
    ahead of it has been staged, and that later audio moves to a successor stream.
    """
    # Build a provider around the fake client with deliberately slow staging
    async def asyncSetUp(self) -> None:
        self.staged = []

        async def stage(consumer, text, timestamp, words):
            await asyncio.sleep(0.1)
            self.staged.append(text)

        stage_patch  = patch.object(ChatHandler, "stage_and_schedule", new=stage)
        client_patch = patch("chat_app.websocket.services.speech.stt.speechProvider.speech.SpeechClient")
        final_patch  = patch("chat_app.websocket.services.speech.stt.speechProvider.handle_final")  # No harness hears these finals
        stage_patch.start(); client_patch.start(); final_patch.start()
        self.addCleanup(stage_patch.stop); self.addCleanup(client_patch.stop); self.addCleanup(final_patch.stop)

        self.consumer = type("WeakConsumer", (), {})()  # The provider only keeps a weakref to it
        self.provider = SpeechToTextProvider(consumer=self.consumer, loop=asyncio.get_running_loop())
        self.addCleanup(self.provider.shutdown)

    # The waiter wakes with the last utterance staged; audio after the request starts a new stream
    async def test_flush_waits_for_staged_final_and_hands_off_later_audio(self) -> None:
        client = self.provider._client = FakeSpeechClient()
        self.provider.send_audio(b"hello ")
        self.provider.send_audio(b"world")
        barrier = self.provider.create_audio_barrier()
        self.provider.send_audio(b"next")

        await barrier.wait(timeout=2)
        self.assertEqual(self.staged, ["hello world"])

        self.provider.stop()
        await self.provider.create_audio_barrier().wait(timeout=2)  # The pause barrier, while paused
        self.assertEqual(self.staged, ["hello world", "next"])
        self.assertEqual(client.streams, [b"hello world", b"next"])

    # Text-only clients never open a stream, so there is nothing to flush
    async def test_flush_without_a_stream_resolves_immediately(self) -> None:
        self.provider._client = FakeSpeechClient()
        await self.provider.create_audio_barrier().wait(timeout=0.05)

    # A quick resume still ends the paused stream at its barrier; resumed audio moves to a successor
    async def test_quick_resume_still_flushes_the_paused_stream(self) -> None:
        gate   = threading.Event()
        client = self.provider._client = FakeSpeechClient(gate)
        self.provider.send_audio(b"before pause")
        self.provider.stop()
        barrier = self.provider.create_audio_barrier()  # `reply_now` while paused reuses the pause barrier
        self.provider.start()
        self.provider.send_audio(b"after resume")
        gate.set()

        await barrier.wait(timeout=2)
        self.assertEqual(self.staged, ["before pause"])

        self.provider.stop()
        await self.provider.create_audio_barrier().wait(timeout=2)
        self.assertEqual(self.staged, ["before pause", "after resume"])
        self.assertEqual(client.streams, [b"before pause", b"after resume"])


class ReplyNowCoordinatorTests(unittest.IsolatedAsyncioTestCase):
    """
    Verify that the coordinator answers as soon as the STT flush resolves, from a snapshot
    that includes the utterance Google finalized during the flush.
    """
    # Build a consumer and a barrier that stages `late_text` just before it resolves
    def make_consumer(self, *, late_text: str | None) -> tuple[SimpleNamespace, AudioBarrier]:
        loop     = asyncio.get_running_loop()
        barrier  = AudioBarrier()
        consumer = SimpleNamespace(
            response_mode             = "manual",
            events                    = [],
            _reply_now_generation     = 0,
            _reply_now_task           = None,
            _pending_response_task    = None,
            _pending_response_trigger = None,
            _manual_response_task     = None,
            _staged_utterances        = StagedUtteranceBuffer(),
        )

        def finish() -> None:
            if late_text: consumer._staged_utterances.append(text=late_text, words=None, timestamp=0.0)
            consumer.events.append(("flushed", loop.time()))
            barrier.resolve()
        loop.call_later(0.1, finish)

        async def execute(consumer_: SimpleNamespace, trigger: str = "automatic") -> str:
            snapshot = consumer_._staged_utterances.snapshot()
            consumer_.events.append(("execute", loop.time(), [item.text for item in snapshot]))
            consumer_._staged_utterances.consume(snapshot)
            return "reply"

        execute_patch = patch.object(ChatHandler, "_execute_response", new=execute)
        execute_patch.start()
        self.addCleanup(execute_patch.stop)
        return consumer, barrier

    # The utterance still interim at the request is part of the reply, with no extra wait
    async def test_reply_includes_the_utterance_finalized_by_the_flush(self) -> None:
        consumer, barrier = self.make_consumer(late_text="this morning I planted tomatoes")
        consumer._staged_utterances.append(text="I went to the garden.", words=None, timestamp=0.0)

        result  = await ChatHandler.request_reply_now(consumer, barrier)
        flushed = next(event for event in consumer.events if event[0] == "flushed")
        execute = next(event for event in consumer.events if event[0] == "execute")

        self.assertEqual(result, "reply")
        self.assertEqual(execute[2], ["I went to the garden.", "this morning I planted tomatoes"])
        self.assertLess(execute[1] - flushed[1], 0.1)

    # Nothing said since the last reply: finish silently as soon as the flush confirms it
    async def test_empty_reply_after_a_flush_completes_without_waiting(self) -> None:
        consumer, barrier = self.make_consumer(late_text=None)

        self.assertIsNone(await ChatHandler.request_reply_now(consumer, barrier))
        flushed = next(event for event in consumer.events if event[0] == "flushed")
        self.assertLess(asyncio.get_running_loop().time() - flushed[1], 0.1)


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
# Response Cancellation Policy Tests
# ================================================================================
class ResponseCancellationPolicyTests(unittest.TestCase):
    # Continued speech invalidates an automatically scheduled response
    def test_stt_progress_cancels_automatic_response(self) -> None:
        task = Mock()
        task.done.return_value       = False
        task.cancelling.return_value = 0
        consumer = SimpleNamespace(
            _stt_progress_revision   = 4,
            _pending_response_task   = task,
            _pending_response_trigger = "automatic",
        )

        self.assertTrue(ChatHandler.note_stt_progress(consumer))
        task.cancel.assert_called_once_with()
        self.assertEqual(consumer._stt_progress_revision, 5)

    # An explicit reply remains live while later speech is staged for another turn
    def test_stt_progress_does_not_cancel_reply_now_response(self) -> None:
        task = Mock()
        task.done.return_value       = False
        task.cancelling.return_value = 0
        consumer = SimpleNamespace(
            _stt_progress_revision   = 8,
            _pending_response_task   = task,
            _pending_response_trigger = "reply_now",
        )

        self.assertFalse(ChatHandler.note_stt_progress(consumer))
        task.cancel.assert_not_called()
        self.assertEqual(consumer._stt_progress_revision, 9)


# ================================================================================
# Command Dispatch Tests
# ================================================================================
class CommandDispatchTests(unittest.IsolatedAsyncioTestCase):
    """
    Verify the ack contract every client depends on: the caller's correlation ID comes
    back, and the complete control state rides along on success and on rejection alike.
    """
    # Apply a state change and report the resulting control state in its acknowledgement
    async def test_accepted_command_returns_correlated_state(self) -> None:
        consumer = SimpleNamespace(
            response_mode            = "automatic",
            streaming_active         = True,
            save_audio               = False,
            stt_provider             = SimpleNamespace(start=Mock(), stop=Mock()),
            audio_recorder           = SimpleNamespace(resume=Mock(), pause=Mock()),
            send                     = AsyncMock(),
            _broadcast_stream_status = AsyncMock(),
        )

        ack = await dispatch_command(consumer, {"id": "request-1", "name": "set_listening", "data": {"state": "paused"}})

        self.assertFalse(consumer.streaming_active)
        consumer.stt_provider.stop.assert_called_once_with()
        self.assertEqual(ack["id"   ], "request-1")
        self.assertEqual(ack["name" ], "set_listening")
        self.assertTrue (ack["ok"   ])
        self.assertEqual(ack["state"], {"listening": "paused", "response_mode": "automatic", "recording_enabled": False})

    # Reject an out-of-vocabulary value without changing state, and say why
    async def test_rejected_command_explains_itself_and_changes_nothing(self) -> None:
        consumer = SimpleNamespace(response_mode="automatic", streaming_active=True, save_audio=False)

        ack = await dispatch_command(consumer, {"id": "request-2", "name": "set_response_mode", "data": {"mode": "sometimes"}})

        self.assertEqual(consumer.response_mode, "automatic")
        self.assertFalse(ack["ok"])
        self.assertIn   ("automatic", ack["message"])
        self.assertEqual(ack["state"]["response_mode"], "automatic")

    # Keep malformed caller data from escaping the documented acknowledgement schema
    async def test_invalid_command_id_is_rejected_with_safe_ack_shape(self) -> None:
        consumer = SimpleNamespace(response_mode="automatic", streaming_active=True, save_audio=False)

        ack = await dispatch_command(consumer, {"id": 123, "name": "get_control_state"})

        self.assertFalse(ack["ok"])
        self.assertIsInstance(ack["id"], str)
        self.assertEqual(ack["name"], "get_control_state")
        self.assertIn("non-empty string", ack["message"])
        self.assertEqual(set(ack), {"id", "name", "ok", "message", "state"})

    # Preserve coverage for the response commands that share the canonical envelope
    async def test_response_commands_use_their_canonical_bodies(self) -> None:
        consumer = SimpleNamespace(
            response_mode="manual",
            streaming_active=True,
            save_audio=False,
            last_response="previous response",
            accept_reply_now=AsyncMock(),
            speak_response=Mock(),
            _pending_response_task=None,
            _manual_response_task=None,
            _reply_now_task=None,
        )

        reply_ack  = await dispatch_command(consumer, {"id": "reply",  "name": "reply_now"})
        repeat_ack = await dispatch_command(consumer, {"id": "repeat", "name": "repeat_last"})
        custom_ack = await dispatch_command(consumer, {"id": "custom", "name": "send_custom", "data": {"message": "  hello  "}})

        self.assertTrue(reply_ack["ok"] and repeat_ack["ok"] and custom_ack["ok"])
        consumer.accept_reply_now.assert_awaited_once_with({"command_id": "reply"})
        self.assertEqual(consumer.speak_response.call_args_list[0].args, ("previous response",))
        self.assertEqual(consumer.speak_response.call_args_list[1].args, ("hello",))

    # Verify the recording setter is explicit and publishes the resulting state
    async def test_set_recording_requires_a_boolean_and_broadcasts(self) -> None:
        consumer = SimpleNamespace(
            response_mode="automatic",
            streaming_active=True,
            save_audio=False,
            _broadcast_recording_state=AsyncMock(),
            send_json=AsyncMock(),
        )

        rejected = await dispatch_command(consumer, {"id": "bad", "name": "set_recording", "data": {"enabled": 1}})
        accepted = await dispatch_command(consumer, {"id": "good", "name": "set_recording", "data": {"enabled": True}})

        self.assertFalse(rejected["ok"])
        self.assertTrue(accepted["ok"])
        self.assertTrue(consumer.save_audio)
        consumer._broadcast_recording_state.assert_awaited_once_with(True)
        consumer.send_json.assert_awaited_once_with({"type": "recording_status", "data": {"enabled": True}})

    # Exercise both high-level manual-mode shortcuts and their task-cancellation semantics
    async def test_manual_mode_shortcuts_apply_their_documented_state(self) -> None:
        pending = Mock()
        pending.done.return_value = False
        manual = Mock()
        manual.done.return_value = False
        forced = Mock()
        forced.done.return_value = False
        consumer = SimpleNamespace(
            response_mode="automatic",
            streaming_active=True,
            save_audio=False,
            reply_now=Mock(),
            _pending_response_task=pending,
            _manual_response_task=manual,
            _reply_now_task=forced,
        )

        paused = await dispatch_command(consumer, {"id": "pause", "name": "pause_and_listen"})
        resumed = await dispatch_command(consumer, {"id": "resume", "name": "resume_and_respond"})

        self.assertTrue(paused["ok"] and resumed["ok"])
        pending.cancel.assert_called_once_with()
        manual.cancel.assert_called_once_with()
        forced.cancel.assert_called_once_with()
        consumer.reply_now.assert_called_once_with()
        self.assertEqual(consumer.response_mode, "automatic")

    # Validate the robot-action command before handing its asynchronous relay to the task helper
    async def test_robot_action_command_accepts_only_canonical_kind_and_value(self) -> None:
        consumer = SimpleNamespace(response_mode="automatic", streaming_active=True, save_audio=False)

        with patch("chat_app.websocket.consumers.processing.commands.fire_and_log") as fire_and_log:
            accepted = await dispatch_command(
                consumer,
                {"id": "action", "name": "robot_action", "data": {"kind": "animation", "value": "Wave"}},
            )
            relay_coroutine = fire_and_log.call_args.args[0]
            relay_coroutine.close()

        rejected = await dispatch_command(
            consumer,
            {"id": "bad-action", "name": "robot_action", "data": {"kind": "gesture", "value": "Wave"}},
        )

        self.assertTrue(accepted["ok"])
        self.assertFalse(rejected["ok"])
        self.assertIn("emotion, animation", rejected["message"])

    # The state probe is a real public command and must return a complete no-op acknowledgement
    async def test_get_control_state_is_a_no_op_with_complete_state(self) -> None:
        consumer = SimpleNamespace(response_mode="manual", streaming_active=False, save_audio=True)

        ack = await dispatch_command(consumer, {"id": "state", "name": "get_control_state"})

        self.assertTrue(ack["ok"])
        self.assertIsNone(ack["message"])
        self.assertEqual(ack["state"], {
            "listening": "paused",
            "response_mode": "manual",
            "recording_enabled": True,
        })


# ================================================================================
# Client Protocol Frame Tests
# ================================================================================
class ClientProtocolFrameTests(unittest.IsolatedAsyncioTestCase):
    # Primary and listener consumers relay this already-final client frame unchanged
    async def test_committed_message_uses_canonical_nested_data_shape(self) -> None:
        consumer = SimpleNamespace(context_buffer=[], MAX_CONTEXT=30, _broadcast_room=AsyncMock())

        await _publish_chat_message(consumer, "user", "hello", 123.5)

        consumer._broadcast_room.assert_awaited_once_with({
            "type": "message",
            "data": {"role": "user", "content": "hello", "ts": 123.5},
        })

    # Robot actions always use kind/value/duration and normalize only surrounding whitespace
    async def test_robot_action_uses_canonical_shape(self) -> None:
        consumer = SimpleNamespace(send_json=AsyncMock())

        await format_send_actions_command(
            consumer,
            {"data": {"kind": "emotion", "value": " Happy ", "duration_ms": 750}},
        )

        consumer.send_json.assert_awaited_once_with({
            "type": "robot_action",
            "data": {"kind": "emotion", "value": "Happy", "duration_ms": 750},
        })

    # Primary and listener stream frames share the same object body
    async def test_stream_status_uses_canonical_object_body(self) -> None:
        consumer = SimpleNamespace(
            streaming_active=True,
            stt_provider=SimpleNamespace(stop=Mock()),
            audio_recorder=SimpleNamespace(pause=Mock()),
            send=AsyncMock(),
            _broadcast_stream_status=AsyncMock(),
        )

        await set_streaming_active(consumer, active=False)

        sent = json.loads(consumer.send.await_args.args[0])
        self.assertEqual(sent, {"type": "stream_status", "data": {"status": "paused"}})
        consumer._broadcast_stream_status.assert_awaited_once_with("paused")

    # Listener relays retain their authenticated admin identity and receipt timestamp
    async def test_listener_command_passes_server_owned_origin_metadata(self) -> None:
        consumer = SimpleNamespace(
            channel_layer=SimpleNamespace(send=AsyncMock()),
            _broadcast_control_state=AsyncMock(),
        )
        event = {
            "payload"         : {"id": "listener-reply", "name": "reply_now"},
            "reply_channel"   : "listener-channel",
            "requested_by_id" : 42,
            "received_at"     : 1_789_500_000.25,
        }
        ack = {"ok": True, "state": {"response_mode": "manual"}}

        with patch(
            "chat_app.websocket.consumers.handlers.ch_events.dispatch_command",
            new=AsyncMock(return_value=ack),
        ) as dispatch:
            await handle_ws_command(consumer, event)

        self.assertEqual(dispatch.await_args.kwargs["reply_now_metadata"], {
            "origin"          : "admin_listener",
            "requested_by_id" : 42,
            "received_at"     : 1_789_500_000.25,
        })

    # Register only after notifying older channels so a connection cannot replace itself
    async def test_primary_connection_claim_notifies_then_registers(self) -> None:
        calls = []

        async def group_send(group, event):
            calls.append(("send", group, event))

        async def group_add(group, channel):
            calls.append(("add", group, channel))

        consumer = SimpleNamespace(
            user=SimpleNamespace(id=7),
            channel_name="new-channel",
            channel_layer=SimpleNamespace(group_send=group_send, group_add=group_add),
        )

        await claim_primary_connection(consumer)

        self.assertEqual(calls[0][0], "send")
        self.assertEqual(calls[1][0], "add")
        self.assertEqual(calls[0][1], "chat_user_7_primary")
        self.assertEqual(calls[0][2]["replacement_channel"], "new-channel")

    # An older primary channel closes with the documented application close code
    async def test_replaced_primary_connection_closes(self) -> None:
        consumer = SimpleNamespace(
            channel_name="old-channel",
            user=SimpleNamespace(id=7),
            close=AsyncMock(),
        )

        await ChatConsumer.ws_session_replaced(
            consumer,
            {"replacement_channel": "new-channel"},
        )

        consumer.close.assert_awaited_once_with(code=4004)


if __name__ == "__main__":
    unittest.main()
