"""
Speech elicitation replies, prompts, cues, and the harness.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.tests.test_speech_elicitation`

The LLM client is replaced with a stand-in that returns fixed structured
responses, so these tests check what code decides: that every reply hands the
turn back with a question, what the prompt tells the model when the chat is
flagging, which frames go to the client, and when the avatar speaks up.

"""
from datetime      import datetime, timezone
from types         import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import asyncio, unittest

from pydantic import ValidationError

# From this project
from chat_app.websocket.harnesses.base                               import FinalUtterance, InterimSpeech, TurnAttempt
from chat_app.websocket.harnesses.registry                           import build_harness
from chat_app.websocket.harnesses.speech_elicitation.config          import ELICITATION_MAX_QUIET_PROMPTS, ELICITATION_NOD_EVERY_WORDS, ELICITATION_QUIET_AFTER_SEC
from chat_app.websocket.harnesses.speech_elicitation.cues            import ListeningNods, QuietPrompt
from chat_app.websocket.harnesses.speech_elicitation.elicitation_api import ElicitationAPIError
from chat_app.websocket.harnesses.speech_elicitation.harness         import MSG_SAY_MORE
from chat_app.websocket.harnesses.speech_elicitation.prompts         import build_messages, directive_for
from chat_app.websocket.harnesses.speech_elicitation.response_models import ElicitationTurn
from chat_app.websocket.harnesses.speech_elicitation.topics          import ELICITATION_TOPICS

# The topic every test talks about (the default variant)
TOPIC = ELICITATION_TOPICS["pet_person"]

# Where the harness module looks its client up (patched there)
HARNESS = "chat_app.websocket.harnesses.speech_elicitation.harness"


# --------------------------------------------------------------------------------
# Test Doubles
# --------------------------------------------------------------------------------
# A reply call's response
def turn(message: str, move: str = "follow_up", behavior: str = "none") -> ElicitationTurn:
    return ElicitationTurn(basis="b", move=move, behavior=behavior, message=message)

# One reply attempt after the avatar's opening question ("" for a turn of the avatar's own)
def make_attempt(text: str) -> TurnAttempt:
    context = [("assistant", TOPIC.opening, 0.0), ("user", text, 0.0)] if text else [("assistant", TOPIC.opening, 0.0)]
    return TurnAttempt(context=context, user_text=text, trigger="automatic" if text else "harness", publish_mood=AsyncMock(), publish_plan=AsyncMock())

# A connection with the parts the harness and its cues use
def make_consumer() -> SimpleNamespace:
    return SimpleNamespace(send_json=AsyncMock(), request_harness_turn=Mock(return_value=Mock()), streaming_active=True)

# One interim result: the utterance so far
def interim(text: str) -> InterimSpeech:
    return InterimSpeech(text=text, new_speech=True, stability=0.9, ended_at=datetime.now(timezone.utc))


# ================================================================================
# Replies and Prompts
# ================================================================================
class ReplyTests(unittest.TestCase):
    # Every reply hands the turn back with a question; only a wind-down may ask nothing
    def test_a_reply_must_end_with_a_question_unless_it_winds_down(self) -> None:
        with self.assertRaisesRegex(ValidationError, "must end with a question"): turn("Dogs are great.")
        self.assertEqual(turn("Dogs are great. What was yours called?").move, "follow_up")
        self.assertEqual(turn("Thanks for the chat! End it whenever you're ready.", move="wind_down").move, "wind_down")

    # Every topic's opening line is itself a question
    def test_every_topic_opens_with_a_question(self) -> None:
        for variant, topic in ELICITATION_TOPICS.items():
            with self.subTest(variant): self.assertTrue(topic.opening.endswith("?"))

    # Code tells the reply when the chat is flagging: a silence, or an answer of a few words
    def test_the_directive_follows_how_much_the_user_said(self) -> None:
        self.assertEqual(directive_for(""), "quiet")
        self.assertEqual(directive_for("Dogs, I guess."), "short_answer")
        self.assertIsNone(directive_for("Definitely dogs, we always had one growing up."))

    # The prompt carries the opening question and the topic's angles, and the directive only when there is one
    def test_the_prompt_carries_the_topic_and_the_directive(self) -> None:
        plain = build_messages(TOPIC, [], None)[0]["content"]
        self.assertIn(TOPIC.opening, plain)
        for angle in TOPIC.angles: self.assertIn(f"- {angle}", plain)
        self.assertNotIn("RIGHT NOW", plain)
        self.assertIn("RIGHT NOW: The user has gone quiet.", build_messages(TOPIC, [], "quiet")[0]["content"])


# ================================================================================
# Harness
# ================================================================================
class HarnessTests(unittest.IsolatedAsyncioTestCase):
    # A harness with the cues on (or off), and the stand-in client its reply call reaches
    def make(self, condition: str = "cues", reply: object = None) -> tuple[object, SimpleNamespace, SimpleNamespace]:
        consumer = make_consumer()
        api      = SimpleNamespace(reply=AsyncMock(side_effect=reply if isinstance(reply, Exception) else None, return_value=reply))
        started  = patch(f"{HARNESS}.get_elicitation_api", Mock(return_value=api))
        started.start()
        self.addCleanup(started.stop)
        harness = build_harness(consumer, "speech_elicitation", condition, None)
        self.addCleanup(harness.stop)
        return harness, consumer, api

    # With cues the avatar is set up and starts listening; either way it asks for its own opening turn
    async def test_start_sets_the_avatar_up_and_opens_the_chat(self) -> None:
        for condition, frames in (("cues", ["avatar_setup", "avatar_plan"]), ("no_cues", ["avatar_setup"])):
            with self.subTest(condition):
                harness, consumer, _ = self.make(condition)
                await harness.start()
                self.assertEqual([call.args[0]["type"] for call in consumer.send_json.await_args_list], frames)
                consumer.request_harness_turn.assert_called_once()

    # The avatar's first turn asks the topic's question, with no LLM call
    async def test_the_opening_turn_asks_the_topics_question(self) -> None:
        harness, _, api = self.make()
        outcome = await harness.generate(TurnAttempt(context=[], user_text="", trigger="harness", publish_mood=AsyncMock(), publish_plan=AsyncMock()))
        self.assertEqual(outcome.message, TOPIC.opening)
        api.reply.assert_not_awaited()

    # Each reply carries the plan for the behavior it picked, but only with cues
    async def test_a_reply_carries_its_behavior_plan_only_with_cues(self) -> None:
        for condition, sends_plan in (("cues", True), ("no_cues", False)):
            with self.subTest(condition):
                harness, _, _ = self.make(condition, reply=turn("Ha! What did the cat do next?", behavior="laugh"))
                attempt = make_attempt("My cat once stole a whole roast chicken off the table.")
                harness.on_reply_started(attempt)
                outcome = await harness.generate(attempt)
                self.assertEqual((outcome.message, outcome.behavior), ("Ha! What did the cat do next?", "laugh"))
                self.assertEqual(outcome.avatar_plan is not None, sends_plan)
                self.assertEqual(attempt.publish_plan.await_count, int(sends_plan))
                if sends_plan: self.assertEqual((outcome.avatar_plan["id"], outcome.avatar_plan["steps"][0]["move"]["name"]), ("t1-reply", "Bounce"))

    # A very short answer and a silence each reach the reply call as a directive
    async def test_a_flagging_chat_reaches_the_reply_as_a_directive(self) -> None:
        harness, _, api = self.make(reply=turn("Fair enough! What about plants?", move="new_angle"))
        for text, directive in (("Dogs.", "short_answer"), ("", "quiet"), ("Oh, dogs, without any doubt at all.", None)):
            with self.subTest(text):
                await harness.generate(make_attempt(text))
                self.assertEqual(api.reply.await_args.args[2], directive)

    # A call that fails every attempt still hands the turn back with a question
    async def test_a_failed_call_asks_the_user_to_say_more(self) -> None:
        harness, _, _ = self.make(reply=ElicitationAPIError("down"))
        with self.assertLogs(HARNESS, level="ERROR"): outcome = await harness.generate(make_attempt("Dogs, because they are loyal."))
        self.assertEqual(outcome.message, MSG_SAY_MORE)
        self.assertTrue(MSG_SAY_MORE.endswith("?"))


# ================================================================================
# Cues
# ================================================================================
class CueTests(unittest.IsolatedAsyncioTestCase):
    # A harness with its cues, and a connection that records what they send
    async def asyncSetUp(self) -> None:
        self.consumer = make_consumer()
        self.harness  = build_harness(self.consumer, "speech_elicitation", "cues", None)

    # Stop the cues, so no silence timer outlives the test
    async def asyncTearDown(self) -> None:
        self.harness.stop()

    # The avatar gives a sign of listening each time the utterance grows enough, but not while a reply owns it
    async def test_the_avatar_nods_along_as_the_utterance_grows(self) -> None:
        nods  = next(cue for cue in self.harness.cues if isinstance(cue, ListeningNods))
        words = " ".join(["word"] * ELICITATION_NOD_EVERY_WORDS)

        nods.on_interim(interim("just a few words"))
        nods.on_interim(interim(words))
        nods.on_interim(interim(f"{words} and one more"))
        nods.on_interim(interim(f"{words} {words}"))
        await asyncio.sleep(0)
        self.assertEqual([call.args[0]["data"]["id"] for call in self.consumer.send_json.await_args_list], ["listen-1", "listen-2"])

        nods.on_final(FinalUtterance(text=f"{words} {words}", words=()))
        nods.on_reply_started(make_attempt(words))
        nods.on_interim(interim(words))
        await asyncio.sleep(0)
        self.assertEqual(self.consumer.send_json.await_count, 2)

    # A long silence asks for a turn a few times in a row, and never once the user has said they want to stop
    async def test_silence_prompts_a_few_times_then_waits(self) -> None:
        prompt = next(cue for cue in self.harness.cues if isinstance(cue, QuietPrompt))
        for _ in range(ELICITATION_MAX_QUIET_PROMPTS + 2): prompt.on_silence(ELICITATION_QUIET_AFTER_SEC)
        self.assertEqual(self.consumer.request_harness_turn.call_count, ELICITATION_MAX_QUIET_PROMPTS)

        prompt.on_final(FinalUtterance(text="I think I'm done", words=()))
        with patch(f"{HARNESS}.get_elicitation_api", Mock(return_value=SimpleNamespace(reply=AsyncMock(return_value=turn("Thanks, this was fun!", move="wind_down"))))):
            self.harness.on_reply_saved(await self.harness.generate(make_attempt("I think I'm done")))
        prompt.on_silence(ELICITATION_QUIET_AFTER_SEC)
        self.assertEqual(self.consumer.request_harness_turn.call_count, ELICITATION_MAX_QUIET_PROMPTS)

    # Without cues the avatar never nods, but it still speaks up after a silence
    async def test_without_cues_only_the_quiet_prompt_runs(self) -> None:
        plain = build_harness(make_consumer(), "speech_elicitation", "no_cues", None)
        self.addCleanup(plain.stop)
        self.assertEqual([type(cue) for cue in plain.cues], [QuietPrompt])
