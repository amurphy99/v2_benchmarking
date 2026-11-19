"""
Shared harness features: signs of listening, and the reply gate.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.tests.test_harness_features`

The features run for a stand-in chat, the gate's replies are stand-ins, and the
check client returns a fixed verdict, so these tests check what code decides:
when a sign of listening goes out, when a reply goes out, waits, or gives way to
a question, what newer speech cancels, and what the check is asked.

"""
from datetime      import datetime, timezone
from types         import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import asyncio, unittest

from pydantic import ValidationError

# From this project
from chat_app.websocket.harnesses.base                                import FinalUtterance, InterimSpeech, ResponseOutcome, TurnAttempt
from chat_app.websocket.harnesses.features.backchannels.config        import BACKCHANNEL_MIN_WORDS, BACKCHANNEL_PAUSE_SEC
from chat_app.websocket.harnesses.features.backchannels.cue           import BACKCHANNEL_NOD, BACKCHANNEL_TILT, Backchannels, listening_sound
from chat_app.websocket.harnesses.features.reply_gate.config          import REPLY_CHECK_CONTEXT_MESSAGES
from chat_app.websocket.harnesses.features.reply_gate.gate            import MisheardCheck, ReplyGate, TurnEndCheck
from chat_app.websocket.harnesses.features.reply_gate.prompts         import build_check_messages
from chat_app.websocket.harnesses.features.reply_gate.reply_check_api import ReplyCheckAPIError
from chat_app.websocket.harnesses.features.reply_gate.response_models import CheckResult, Clarify, check_model

# Where the gate and the signs of listening look up what these tests replace
GATE         = "chat_app.websocket.harnesses.features.reply_gate.gate"
BACKCHANNELS = "chat_app.websocket.harnesses.features.backchannels.cue"

# The stand-in chat's sounds and gestures, and the check's response with both checks on
SOUNDS      = {"mm_hm": "Mm-hm.", "oh_no": "Oh no."}
GESTURES    = Backchannels.GESTURES
CHECK_MODEL = check_model(tuple(SOUNDS), GESTURES, turn_end=True, misheard=True)

# An utterance long enough for a sign of listening
LONG_ENOUGH = " ".join(["word"] * BACKCHANNEL_MIN_WORDS)

# The stand-in reply's thinking plan and outcome, and the question a clarification asks
THINKING = {"id": "t1-think", "steps": [{"state": "thinking"}]}
REPLY    = ResponseOutcome(message="Oh, which dog was that?")
QUESTION = "Sorry, did you say 'tad person'?"

# Each verdict the stand-in check can give
DONE      = {"next_step": "reply",   "likely_said": None}
MID_SOUND = {"next_step": "wait",    "sound": "mm_hm", "gesture": "nod"}
MID_QUIET = {"next_step": "wait",    "sound": "none",  "gesture": "nod"}
MISHEARD  = {"next_step": "clarify", "misheard": "tad person", "message": QUESTION}


# --------------------------------------------------------------------------------
# Test Doubles
# --------------------------------------------------------------------------------
# Signs of listening with the stand-in chat's sounds, and three signs in turn
class StubBackchannels(Backchannels):
    SOUNDS = SOUNDS
    SIGNS  = ({"move": BACKCHANNEL_NOD, "sound": listening_sound("mm_hm")}, {"move": BACKCHANNEL_TILT}, {"move": BACKCHANNEL_NOD})

# A chat type's reply: it publishes its thinking plan, then answers (or works until cancelled)
class StubReply:
    # Answer at once, or keep working until something cancels it
    def __init__(self, *, forever: bool = False) -> None:
        self.forever   = forever
        self.attempts  : list[TurnAttempt] = []  # Every attempt it was handed
        self.cancelled = False                   # It was cancelled while working

    # Reply to one attempt
    async def __call__(self, attempt: TurnAttempt) -> ResponseOutcome:
        self.attempts.append(attempt)
        await attempt.publish_plan(THINKING)
        try:
            if self.forever: await asyncio.Event().wait()
            return REPLY
        except asyncio.CancelledError:
            self.cancelled = True
            raise

# The chat type's outcome for a clarifying question
def clarify(message: str) -> ResponseOutcome:
    return ResponseOutcome(message=message)

# A chat in one condition, on a connection that records what it is sent
def make_harness(condition: str = "cues") -> SimpleNamespace:
    return SimpleNamespace(NAME="stub_chat", condition=condition, consumer=SimpleNamespace(send_json=AsyncMock(), streaming_active=True))

# One reply attempt for a user's turn
def make_attempt(trigger: str = "automatic") -> TurnAttempt:
    context = [("assistant", "Are you a cat person, a dog person, or a plant person?", 0.0), ("user", "I'm a tad person.", 0.0)]
    return TurnAttempt(context=context, user_text="I'm a tad person.", trigger=trigger, publish_mood=AsyncMock(), publish_plan=AsyncMock())

# One interim result: the utterance so far
def interim(text: str) -> InterimSpeech:
    return InterimSpeech(text=text, new_speech=True, stability=0.9, ended_at=datetime.now(timezone.utc))

# The avatar plans a connection was sent, in order
def sent_plans(consumer: SimpleNamespace) -> list[dict]:
    return [call.args[0]["data"] for call in consumer.send_json.await_args_list]

# A check client whose verdict arrives a moment after it is asked, so the reply has started by then
def check_client(verdict: dict[str, object] | None, *, fails: bool = False) -> SimpleNamespace:
    async def check(messages: list[dict[str, str]], response_model: type) -> CheckResult:
        await asyncio.sleep(0.01)
        if fails: raise ReplyCheckAPIError("Reply check check failed after all attempts")
        return CHECK_MODEL.model_validate({"basis": "b", "verdict": verdict})
    return SimpleNamespace(check=AsyncMock(side_effect=check))


# ================================================================================
# Signs of Listening
# ================================================================================
class BackchannelTests(unittest.IsolatedAsyncioTestCase):
    # Signs for a chat with the cues on (or off), stopped once the test ends
    def make(self, condition: str = "cues") -> tuple[StubBackchannels, SimpleNamespace]:
        harness = make_harness(condition)
        signs   = StubBackchannels(harness)
        self.addCleanup(signs.stop)
        return signs, harness.consumer

    # A pause in a long enough utterance gets a sign, but a short utterance doesn't, and neither does a pause right after a sign
    async def test_a_pause_in_a_long_enough_utterance_gets_a_sign(self) -> None:
        signs, consumer = self.make()
        signs.on_interim(interim("well I"))
        signs.on_silence(BACKCHANNEL_PAUSE_SEC)
        signs.on_interim(interim(LONG_ENOUGH))
        signs.on_silence(BACKCHANNEL_PAUSE_SEC)
        signs.on_silence(BACKCHANNEL_PAUSE_SEC)
        await asyncio.sleep(0)
        self.assertEqual([(plan["id"], plan["steps"]) for plan in sent_plans(consumer)], [("listen-1", [StubBackchannels.SIGNS[0]])])

    # Pauses take the signs in turn, and start over after the last
    async def test_pauses_take_the_signs_in_turn(self) -> None:
        signs, consumer   = self.make()
        signs.MIN_GAP_SEC = 0
        signs.on_interim(interim(LONG_ENOUGH))
        for _ in range(len(StubBackchannels.SIGNS) + 1): signs.on_silence(BACKCHANNEL_PAUSE_SEC)
        await asyncio.sleep(0)
        self.assertEqual([plan["steps"][0] for plan in sent_plans(consumer)], [*StubBackchannels.SIGNS, StubBackchannels.SIGNS[0]])

    # Once the utterance is finished the reply is the answer, so the pause that ended it gets no sign
    async def test_a_finished_utterance_gets_no_sign(self) -> None:
        signs, consumer = self.make()
        signs.on_interim(interim(LONG_ENOUGH))
        signs.on_final(FinalUtterance(text=LONG_ENOUGH, words=()))
        signs.on_silence(BACKCHANNEL_PAUSE_SEC)
        await asyncio.sleep(0)
        consumer.send_json.assert_not_awaited()

    # The check's sign plays what it picked, and the signs at pauses keep their distance from it
    async def test_the_checks_sign_shares_the_gap_with_the_pause_signs(self) -> None:
        signs, consumer = self.make()
        self.assertIsNone(signs.chosen_sign("none", "none"))
        self.assertEqual(signs.chosen_sign("oh_no", "tilt")["steps"], [{"move": BACKCHANNEL_TILT, "sound": listening_sound("oh_no")}])

        signs.on_interim(interim(LONG_ENOUGH))
        signs.on_silence(BACKCHANNEL_PAUSE_SEC)
        await asyncio.sleep(0)
        consumer.send_json.assert_not_awaited()
        self.assertIsNone(signs.chosen_sign("mm_hm", "nod"))

    # Switched off (no cues), it gives no signs and the setup gets no sounds; switched on partway through, it gives them
    async def test_the_switch_turns_the_signs_and_sounds_off(self) -> None:
        signs, consumer = self.make("no_cues")
        signs.on_interim(interim(LONG_ENOUGH))
        signs.on_silence(BACKCHANNEL_PAUSE_SEC)
        with patch(f"{BACKCHANNELS}.synthesize_sounds", AsyncMock()) as synthesize: self.assertIsNone(await signs.sounds())
        synthesize.assert_not_awaited()
        self.assertIsNone(signs.chosen_sign("mm_hm", "nod"))
        await asyncio.sleep(0)
        consumer.send_json.assert_not_awaited()

        signs.on = True
        self.assertIsNotNone(signs.chosen_sign("mm_hm", "nod"))


# ================================================================================
# Reply Gate
# ================================================================================
class ReplyGateTests(unittest.IsolatedAsyncioTestCase):
    # A gate with both checks for a chat in one condition, and the check client it reaches
    def make(self, verdict: dict[str, object] | None, condition: str = "cues", *, hold_sec: float = 0.0, fails: bool = False) -> tuple[ReplyGate, SimpleNamespace]:
        client  = check_client(verdict, fails=fails)
        started = patch(f"{GATE}.get_reply_check_api", Mock(return_value=client))
        started.start()
        self.addCleanup(started.stop)

        harness = make_harness(condition)
        signs   = StubBackchannels(harness)
        self.addCleanup(signs.stop)
        return ReplyGate(harness, checks=(TurnEndCheck(harness), MisheardCheck(harness)), backchannels=signs, hold_sec=hold_sec), client

    # The user is done: the reply goes out with its plans, and the reply worked on an attempt of its own
    async def test_a_finished_turn_gets_the_reply(self) -> None:
        gate, client   = self.make(DONE)
        attempt, reply = make_attempt(), StubReply()
        with self.assertLogs(GATE, level="INFO"): self.assertIs(await gate.run(attempt, reply, clarify), REPLY)
        attempt.publish_plan.assert_awaited_once_with(THINKING)
        self.assertIsNot(reply.attempts[0].publish_plan, attempt.publish_plan)
        client.check.assert_awaited_once()

    # Mid-thought: the check's sign goes out first, and the reply's own plans wait for the hold to end
    async def test_a_mid_thought_turn_gets_a_sign_then_the_reply_after_the_hold(self) -> None:
        gate, _ = self.make(MID_SOUND, hold_sec=0.05)
        attempt = make_attempt()
        with self.assertLogs(GATE, level="INFO"): self.assertIs(await gate.run(attempt, StubReply(), clarify), REPLY)
        plans = [call.args[0]["steps"] for call in attempt.publish_plan.await_args_list]
        self.assertEqual(plans, [[{"move": BACKCHANNEL_NOD, "sound": listening_sound("mm_hm")}], THINKING["steps"]])

    # Newer speech during the hold cancels the attempt, and the reply working beside it, before its plans go out
    async def test_newer_speech_during_the_hold_cancels_the_reply(self) -> None:
        gate, _        = self.make(MID_QUIET, hold_sec=60)
        attempt, reply = make_attempt(), StubReply(forever=True)
        with self.assertLogs(GATE, level="INFO"):
            running = asyncio.create_task(gate.run(attempt, reply, clarify))
            async with asyncio.timeout(2):
                while not attempt.publish_plan.await_count: await asyncio.sleep(0.01)

        running.cancel()
        with self.assertRaises(asyncio.CancelledError): await running
        self.assertTrue(reply.cancelled)
        self.assertEqual([call.args[0]["steps"] for call in attempt.publish_plan.await_args_list], [[{"move": BACKCHANNEL_NOD}]])

    # A likely misheard word: the reply is dropped (with its plans), and the check's question goes out instead
    async def test_a_misheard_word_gets_a_question_instead(self) -> None:
        gate, _        = self.make(MISHEARD)
        attempt, reply = make_attempt(), StubReply(forever=True)
        with self.assertLogs(GATE, level="INFO"): outcome = await gate.run(attempt, reply, clarify)
        self.assertEqual(outcome.message, QUESTION)
        self.assertTrue(reply.cancelled)
        attempt.publish_plan.assert_not_awaited()

    # Only replies to finished speech are checked: a `reply_now` reply and the harness's own turns go straight out
    async def test_only_replies_to_finished_speech_are_checked(self) -> None:
        for trigger in ("reply_now", "harness"):
            with self.subTest(trigger):
                gate, client   = self.make(MISHEARD)
                attempt, reply = make_attempt(trigger), StubReply()
                self.assertIs(await gate.run(attempt, reply, clarify), REPLY)
                self.assertIs(reply.attempts[0], attempt)
                client.check.assert_not_awaited()

    # With every check switched off (no cues), the reply goes straight out
    async def test_with_every_check_off_the_reply_goes_straight_out(self) -> None:
        gate, client = self.make(MISHEARD, condition="no_cues")
        self.assertIs(await gate.run(make_attempt(), StubReply(), clarify), REPLY)
        client.check.assert_not_awaited()

    # A check that fails lets the reply go out as usual
    async def test_a_failed_check_lets_the_reply_out(self) -> None:
        gate, _ = self.make(None, fails=True)
        with self.assertLogs(GATE, level="ERROR"): outcome = await gate.run(make_attempt(), StubReply(), clarify)
        self.assertIs(outcome, REPLY)


# ================================================================================
# The Check's Prompt and Response
# ================================================================================
class CheckPromptTests(unittest.TestCase):
    # The response offers only the steps of the checks switched on, and a held reply only the chat's own sounds
    def test_the_response_offers_only_the_steps_switched_on(self) -> None:
        for turn_end, misheard, steps in ((True, False, ["Reply", "Wait"]), (False, True, ["ReplyHeard", "Clarify"]), (True, True, ["ReplyHeard", "Wait", "Clarify"])):
            with self.subTest(turn_end=turn_end, misheard=misheard):
                schema = check_model(tuple(SOUNDS), GESTURES, turn_end=turn_end, misheard=misheard).model_json_schema()
                self.assertEqual(list(schema["properties"]), ["basis", "verdict"])
                self.assertEqual([branch["$ref"].rsplit("/", 1)[-1] for branch in schema["properties"]["verdict"]["oneOf"]], steps)
        wait = check_model(tuple(SOUNDS), GESTURES, turn_end=True, misheard=False).model_json_schema()["$defs"]["Wait"]
        self.assertEqual(wait["properties"]["sound"]["enum"], ["none", *SOUNDS])

    # A chat type's own gestures limit what the check may pair with a sound, in the response and in the prompt
    def test_a_chat_types_gestures_limit_the_checks_sign(self) -> None:
        neutral = ("nod", "tilt", "none")
        wait    = check_model(tuple(SOUNDS), neutral, turn_end=True, misheard=False).model_json_schema()["$defs"]["Wait"]
        self.assertEqual(wait["properties"]["gesture"]["enum"], list(neutral))
        self.assertIn("gesture: one of nod, tilt, none.", build_check_messages((TurnEndCheck(make_harness()),), SOUNDS, neutral, [], "Well.")[0]["content"])

    # A clarification hands the turn back, so it must be a question
    def test_a_clarification_must_be_a_question(self) -> None:
        with self.assertRaisesRegex(ValidationError, "must end with a question"): Clarify(next_step="clarify", misheard="tad person", message="You said tad person.")

    # The prompt covers only the checks switched on, with the chat's notes and sounds, and reads only the last few messages
    def test_the_prompt_follows_the_checks_switched_on(self) -> None:
        history  = [{"role": ("user" if (index % 2) else "assistant"), "content": f"message {index}"} for index in range(REPLY_CHECK_CONTEXT_MESSAGES + 4)]
        messages = build_check_messages((TurnEndCheck(make_harness(), "- A note of this chat's own."),), SOUNDS, GESTURES, history, "Well, I went.")
        system   = messages[0]["content"]
        for expected in ("IS THE USER DONE?", "- A note of this chat's own.", 'oh_no for "Oh no."'): self.assertIn(expected, system)
        self.assertNotIn("WAS ANYTHING MISHEARD?", system)
        self.assertEqual(messages[1:], history[-REPLY_CHECK_CONTEXT_MESSAGES:])

    # A turn of several sentences has its last one quoted on its own, and with both checks on, waiting comes first
    def test_the_last_sentence_of_a_longer_turn_is_quoted(self) -> None:
        checks = (TurnEndCheck(make_harness()), MisheardCheck(make_harness()))
        longer = build_check_messages(checks, SOUNDS, GESTURES, [], "We went to the lake. It was cold, and then we")[0]["content"]
        self.assertIn('THEIR LAST SENTENCE: "It was cold, and then we"', longer)
        self.assertIn("choose wait over clarify", longer)
        self.assertNotIn("THEIR LAST SENTENCE", build_check_messages(checks, SOUNDS, GESTURES, [], "We went to the lake.")[0]["content"])
