"""
Chat-type selection, and when a reply's effects apply.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.tests.test_chat_types`

Covers the boundary that turns `chat_type`, `condition`, and `variant` into a
harness, the unguided chat's scripted end-chat and pause replies, and the rule
that a reply changes chat state only once its exchange is saved.

"""
from types         import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import asyncio, unittest

from channels.db      import database_sync_to_async as db_s2a
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator

from django.contrib.auth import get_user_model
from django.test         import TransactionTestCase

# From this project
from chat_app.models                               import ChatSession
from chat_app.websocket.harnesses.base             import ChatHarness, MoodPublisher, ResponseOutcome, ResponseTrigger, TurnAttempt
from chat_app.websocket.harnesses.registry         import CHAT_TYPES, ChatTypeRejected, build_harness
from chat_app.websocket.harnesses.unguided.harness import UnguidedHarness
from chat_app.websocket.harnesses.unguided.intents import MSG_END_CANCEL, MSG_END_CONFIRM, MSG_END_GOODBYE, MSG_PAUSE
from chat_app.websocket.routing                    import websocket_urlpatterns
from chat_app.websocket.services.chatHelpers       import ChatHandler
from chat_app.websocket.services.chat_state        import StagedUtteranceBuffer

# Long enough for a refused connection to report its close code
CONNECT_TIMEOUT_SEC = 5


# One reply attempt for a single staged user turn
def make_attempt(text: str, publish_mood: MoodPublisher, trigger: ResponseTrigger = "automatic") -> TurnAttempt:
    return TurnAttempt(context=[("user", text, 0.0)], user_text=text, trigger=trigger, publish_mood=publish_mood)


# ================================================================================
# Chat Type Selection
# ================================================================================
# A chat type with conditions and variants, registered only inside the test that needs it
class FixtureHarness(ChatHarness):
    NAME       = "fixture"
    CONDITIONS = ("cues", "baseline")
    VARIANTS   = ("map_1", "map_2")

    # Never asked for a reply here
    async def generate(self, attempt: TurnAttempt) -> ResponseOutcome:
        return ResponseOutcome(message="")


class ChatTypeSelectionTests(unittest.TestCase):
    """
    Check the boundary that turns a client's `chat_type`, `condition`, and `variant`
    into one harness, with the documented defaults.
    """
    # A client that sends no chat type gets the unguided chat, with no condition or variant
    def test_no_chat_type_selects_the_unguided_chat(self) -> None:
        harness = build_harness(SimpleNamespace(), None, None, None)
        self.assertIsInstance(harness, UnguidedHarness)
        self.assertEqual((harness.condition, harness.variant), ("", ""))

    # Every registered name builds its own harness
    def test_each_chat_type_name_builds_its_harness(self) -> None:
        for name, harness_class in CHAT_TYPES.items():
            self.assertIsInstance(build_harness(SimpleNamespace(), name, None, None), harness_class)

    # A chat type this backend doesn't have is refused
    def test_unknown_chat_type_is_refused(self) -> None:
        with self.assertRaises(ChatTypeRejected): build_harness(SimpleNamespace(), "nope", None, None)

    # A condition or variant is refused for a chat type that takes none
    def test_options_are_refused_for_a_chat_type_without_them(self) -> None:
        with self.assertRaises(ChatTypeRejected): build_harness(SimpleNamespace(), "unguided", "cues", None)
        with self.assertRaises(ChatTypeRejected): build_harness(SimpleNamespace(), "unguided", None, "map_1")

    # An option left out takes the chat type's first one; a name not on its list is refused
    def test_options_default_to_the_first_and_must_be_on_the_list(self) -> None:
        with patch.dict(CHAT_TYPES, {FixtureHarness.NAME: FixtureHarness}):
            default  = build_harness(SimpleNamespace(), "fixture", None,       None   )
            explicit = build_harness(SimpleNamespace(), "fixture", "baseline", "map_2")
            with self.assertRaises(ChatTypeRejected): build_harness(SimpleNamespace(), "fixture", "louder", None)

        self.assertEqual((default .condition, default .variant), ("cues",     "map_1"))
        self.assertEqual((explicit.condition, explicit.variant), ("baseline", "map_2"))


# --------------------------------------------------------------------------------
# Connection Refusal
# --------------------------------------------------------------------------------
# An unknown chat type closes the socket before it is accepted or a session exists
class ChatTypeRefusalTests(TransactionTestCase):
    # A participant whose connection gets as far as the chat-type check
    def setUp(self) -> None:
        self.user = get_user_model().objects.create_user(username="chat_type_refused")

    # The documented close code comes back, and no session row is created
    async def test_unknown_chat_type_closes_with_4005(self) -> None:
        communicator = WebsocketCommunicator(URLRouter(websocket_urlpatterns), "/ws/chat/")
        communicator.scope.update({"user": self.user, "source": "webapp", "chat_type": "nope", "condition": None, "variant": None})
        accepted, close_code = await communicator.connect(timeout=CONNECT_TIMEOUT_SEC)
        await communicator.disconnect(timeout=CONNECT_TIMEOUT_SEC)

        self.assertFalse(accepted)
        self.assertEqual(close_code, 4005)
        self.assertFalse(await db_s2a(ChatSession.objects.exists)())


# ================================================================================
# Unguided Scripted Replies
# ================================================================================
class UnguidedIntentTests(unittest.IsolatedAsyncioTestCase):
    """
    The unguided chat's end-chat and pause replies propose their effects, and the
    harness changes its own state only when `committed` is called.
    """
    # A fresh harness in its starting state
    def setUp(self) -> None:
        self.harness = UnguidedHarness(SimpleNamespace(), condition="", variant="")

    # An end request asks for confirmation, but enters that state only once its reply is saved
    async def test_end_request_asks_to_confirm_and_waits_for_the_save(self) -> None:
        outcome = await self.harness.generate(make_attempt("I think we should end the chat now", AsyncMock()))

        self.assertEqual(outcome.message, MSG_END_CONFIRM)
        self.assertEqual(self.harness.state, "normal")
        self.harness.committed(outcome)
        self.assertEqual(self.harness.state, "awaiting_end_confirmation")

    # After the confirmation question, "yes" says goodbye and closes, and "no" resumes
    async def test_confirmation_closes_and_denial_resumes(self) -> None:
        self.harness.state = "awaiting_end_confirmation"
        goodbye = await self.harness.generate(make_attempt("yes",            AsyncMock()))
        resume  = await self.harness.generate(make_attempt("no, keep going", AsyncMock()))

        self.assertEqual((goodbye.message, goodbye.close_after), (MSG_END_GOODBYE, True    ))
        self.assertEqual((resume .message, resume .state      ), (MSG_END_CANCEL,  "normal"))

    # A pause request asks for listening to stop in its outcome
    async def test_pause_request_asks_to_stop_listening(self) -> None:
        outcome = await self.harness.generate(make_attempt("can we take a break", AsyncMock()))
        self.assertEqual((outcome.message, outcome.pause_listening), (MSG_PAUSE, True))

    # Anything else gets the LLM's reply with its mood sent first, which drops a pending end request
    async def test_other_speech_gets_the_llm_reply_and_its_mood(self) -> None:
        self.harness.state = "awaiting_end_confirmation"
        publish_mood = AsyncMock()
        llm_reply    = SimpleNamespace(message="It is sunny today.", response_mood="Happy")

        with patch("chat_app.websocket.harnesses.unguided.harness.get_LLM_response", new=AsyncMock(return_value=llm_reply)):
            outcome = await self.harness.generate(make_attempt("what is the weather like", publish_mood))

        publish_mood.assert_awaited_once_with("Happy")
        self.assertEqual((outcome.message, outcome.state), ("It is sunny today.", "normal"))
        self.assertEqual(self.harness.state, "awaiting_end_confirmation")


# ================================================================================
# Effects Wait for the Saved Exchange
# ================================================================================
class ReplyEffectTests(unittest.IsolatedAsyncioTestCase):
    """
    Run `ChatHandler._execute_response` with the real unguided harness, the database
    writes and background work replaced, to check when a reply's effects apply.
    """
    # Replace the exchange commit, stream control, and background biomarker work
    def setUp(self) -> None:
        saved        = (SimpleNamespace(id=1), SimpleNamespace(id=2))
        commit_patch = patch("chat_app.websocket.services.chatHelpers.commit_chat_exchange", new=AsyncMock(return_value=saved))
        stream_patch = patch("chat_app.websocket.services.chatHelpers.set_streaming_active", new=AsyncMock())
        work_patch   = patch("chat_app.websocket.services.chatHelpers.fire_and_log",         new=Mock(side_effect=lambda work, name: work.close()))

        self.commit = commit_patch.start(); self.addCleanup(commit_patch.stop)
        self.stream = stream_patch.start(); self.addCleanup(stream_patch.stop)
        work_patch.start();                 self.addCleanup(work_patch.stop)

    # A text-only connection with one staged user turn, served by the unguided harness
    def make_consumer(self, text: str) -> SimpleNamespace:
        consumer = SimpleNamespace(
            context_buffer         = [],
            use_backend_TTS        = False,
            last_response          = None,
            send                   = AsyncMock(),
            _staged_utterances     = StagedUtteranceBuffer(),
            _stt_progress_revision = 0,
            _response_lock         = asyncio.Lock(),
        )
        consumer.harness = UnguidedHarness(consumer, condition="", variant="")
        consumer._staged_utterances.append(text=text, words=None, timestamp=0.0)
        return consumer

    # A saved end request enters its pending state and consumes the staged turn
    async def test_saved_end_request_enters_its_pending_state(self) -> None:
        consumer = self.make_consumer("I'd like to end the chat")

        self.assertEqual(await ChatHandler._execute_response(consumer), MSG_END_CONFIRM)
        self.commit.assert_awaited_once()
        self.assertEqual(consumer.harness.state, "awaiting_end_confirmation")
        self.assertEqual(len(consumer._staged_utterances), 0)

    # A saved pause request stops listening after its reply goes out
    async def test_saved_pause_request_stops_listening(self) -> None:
        consumer = self.make_consumer("can we take a break")

        await ChatHandler._execute_response(consumer)
        consumer.send.assert_awaited_once()
        self.stream.assert_awaited_once_with(consumer, active=False)

    # A reply cancelled by newer speech changes no state and keeps its staged turn for the retry
    async def test_cancelled_reply_changes_nothing(self) -> None:
        consumer = self.make_consumer("what is the weather like")
        consumer.harness.state = "awaiting_end_confirmation"
        started = asyncio.Event()

        # Stand in for an LLM call that is still running when newer speech arrives
        async def slow_llm(context: list) -> None:
            started.set()
            await asyncio.Event().wait()

        with patch("chat_app.websocket.harnesses.unguided.harness.get_LLM_response", new=slow_llm):
            attempt = asyncio.create_task(ChatHandler._execute_response(consumer))
            await started.wait()
            attempt.cancel()
            await asyncio.gather(attempt, return_exceptions=True)

        self.commit.assert_not_awaited()
        self.assertEqual(consumer.harness.state, "awaiting_end_confirmation")
        self.assertEqual(len(consumer._staged_utterances), 1)


# ================================================================================
# Mood Timing
# ================================================================================
class MoodGateTests(unittest.IsolatedAsyncioTestCase):
    """
    Newer speech cancels an automatic reply but never a `reply_now` one, so only an
    automatic reply's mood is dropped once the STT revision has moved.
    """
    # Newer speech has arrived since the attempt started at revision 4
    def setUp(self) -> None:
        self.consumer = SimpleNamespace(_stt_progress_revision=5)

    # The mood of an automatic reply that newer speech cancelled never goes out
    async def test_automatic_mood_is_dropped_after_newer_speech(self) -> None:
        with patch("chat_app.websocket.services.chatHelpers.send_mood", new=AsyncMock()) as send_mood:
            await ChatHandler._publish_response_mood(self.consumer, "Happy", "automatic", 4)
        send_mood.assert_not_awaited()

    # A `reply_now` reply still plays after newer speech, so its mood goes out too
    async def test_reply_now_mood_survives_newer_speech(self) -> None:
        with patch("chat_app.websocket.services.chatHelpers.send_mood", new=AsyncMock()) as send_mood:
            await ChatHandler._publish_response_mood(self.consumer, "Happy", "reply_now", 4)
        send_mood.assert_awaited_once_with(self.consumer, "Happy")


if __name__ == "__main__":
    unittest.main()
