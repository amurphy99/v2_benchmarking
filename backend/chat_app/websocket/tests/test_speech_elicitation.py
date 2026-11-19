"""
Speech elicitation replies, prompts, threads, cues, and the harness.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.tests.test_speech_elicitation`

The LLM clients are replaced with stand-ins that return fixed structured
responses, so these tests check what code decides: that every reply hands the
turn back with a question, how deep a thread goes before the reply may move on,
what the prompt tells the model when the chat is flagging, which frames go to
the client, and when the avatar speaks up. The reply gate and the signs of
listening themselves are tested in `test_harness_features.py`.

"""
from datetime      import datetime, timezone
from types         import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import asyncio, unittest

from pydantic import ValidationError

# From this project
from chat_app.websocket.harnesses.avatar                              import synthesize_sounds
from chat_app.websocket.harnesses.base                                import FinalUtterance, InterimSpeech, TurnAttempt
from chat_app.websocket.harnesses.cues                                import BackToListening
from chat_app.websocket.harnesses.features.backchannels.config        import BACKCHANNEL_MIN_WORDS, BACKCHANNEL_PAUSE_SEC
from chat_app.websocket.harnesses.features.reply_gate.response_models import CheckResult, Reply, check_model
from chat_app.websocket.harnesses.registry                            import build_harness
from chat_app.websocket.harnesses.speech_elicitation.behaviors        import ELICITATION_SIGNS, ELICITATION_SOUNDS
from chat_app.websocket.harnesses.speech_elicitation.config           import ELICITATION_DRY_AFTER_SHORT, ELICITATION_MAX_QUIET_PROMPTS, ELICITATION_MIN_FOLLOW_UPS, ELICITATION_QUIET_AFTER_SEC
from chat_app.websocket.harnesses.speech_elicitation.cues             import ElicitationBackchannels, QuietPrompt
from chat_app.websocket.harnesses.speech_elicitation.elicitation_api  import ElicitationAPIError
from chat_app.websocket.harnesses.speech_elicitation.harness          import MSG_SAY_MORE, ElicitationState
from chat_app.websocket.harnesses.speech_elicitation.prompts          import ELICITATION_NO_ANGLES_YET, build_messages, directive_for, offer_angles
from chat_app.websocket.harnesses.speech_elicitation.response_models  import ElicitationTurn
from chat_app.websocket.harnesses.speech_elicitation.topics           import ELICITATION_TOPICS

# The topic every test talks about (the default variant)
TOPIC = ELICITATION_TOPICS["pet_person"]

# Where the harness, the reply gate, and the signs of listening look up what these tests replace
HARNESS      = "chat_app.websocket.harnesses.speech_elicitation.harness"
GATE         = "chat_app.websocket.harnesses.features.reply_gate.gate"
BACKCHANNELS = "chat_app.websocket.harnesses.features.backchannels.cue"

# The setup's sounds as the stand-in synthesis returns them
SOUNDS = {name: {"audio": "AAA=", "sample_rate": 24_000} for name in ELICITATION_SOUNDS}


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

# A reply check that always finds the user done, so the reply goes out as usual
def done_check() -> SimpleNamespace:
    return SimpleNamespace(check=AsyncMock(return_value=CheckResult(basis="done", verdict=Reply(next_step="reply"))))

# Replace a name for the rest of one test
def replace_for_test(test: unittest.TestCase, target: str, value: object) -> None:
    started = patch(target, value)
    started.start()
    test.addCleanup(started.stop)


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

    # Code tells the reply when the chat is flagging: a silence, a short answer, or short answers in a row
    def test_the_directive_follows_how_much_the_user_said(self) -> None:
        self.assertEqual(directive_for("", 0), "quiet")
        self.assertEqual(directive_for("Dogs, I guess.", 0), "short_answer")
        self.assertEqual(directive_for("Dogs, I guess.", ELICITATION_DRY_AFTER_SHORT - 1), "thread_dry")
        self.assertIsNone(directive_for("Definitely dogs, we always had one growing up.", ELICITATION_DRY_AFTER_SHORT))

    # A thread is offered fresh angles once it has had its follow-ups, or when the chat is flagging (one short answer isn't)
    def test_fresh_angles_wait_until_a_thread_is_explored_or_runs_dry(self) -> None:
        self.assertFalse(offer_angles(ELICITATION_MIN_FOLLOW_UPS - 1, None))
        self.assertFalse(offer_angles(0, "short_answer"))
        self.assertTrue(offer_angles(ELICITATION_MIN_FOLLOW_UPS, None))
        self.assertTrue(offer_angles(0, "thread_dry"))
        self.assertTrue(offer_angles(0, "quiet"))

    # The prompt carries the opening question, the angles only when offered, and the directive only when there is one
    def test_the_prompt_carries_the_topic_the_angles_and_the_directive(self) -> None:
        plain = build_messages(TOPIC, [], None, False)[0]["content"]
        self.assertIn(TOPIC.opening, plain)
        self.assertIn(ELICITATION_NO_ANGLES_YET, plain)
        for angle in TOPIC.angles: self.assertNotIn(f"- {angle}", plain)
        self.assertNotIn("RIGHT NOW", plain)

        offered = build_messages(TOPIC, [], "quiet", True)[0]["content"]
        for angle in TOPIC.angles: self.assertIn(f"- {angle}", offered)
        self.assertNotIn(ELICITATION_NO_ANGLES_YET, offered)
        self.assertIn("RIGHT NOW: The user has gone quiet.", offered)


# ================================================================================
# Harness
# ================================================================================
class HarnessTests(unittest.IsolatedAsyncioTestCase):
    # A harness with the cues on (or off), and the stand-in clients its calls reach (the check finds the user done, unless given another)
    def make(self, condition: str = "cues", reply: object = None, check: SimpleNamespace | None = None) -> tuple[object, SimpleNamespace, SimpleNamespace]:
        consumer = make_consumer()
        api      = SimpleNamespace(reply=AsyncMock(side_effect=reply if isinstance(reply, Exception) else None, return_value=reply))
        replace_for_test(self, f"{HARNESS}.get_elicitation_api",    Mock(return_value=api))
        replace_for_test(self, f"{GATE}.get_reply_check_api",       Mock(return_value=check or done_check()))
        replace_for_test(self, f"{BACKCHANNELS}.synthesize_sounds", AsyncMock(return_value=SOUNDS))
        harness = build_harness(consumer, "speech_elicitation", condition, None)
        self.addCleanup(harness.stop)
        return harness, consumer, api

    # With cues the setup carries the listening sounds and the avatar starts listening; either way it asks for its own opening turn
    async def test_start_sets_the_avatar_up_and_opens_the_chat(self) -> None:
        for condition, frames, sounds in (("cues", ["avatar_setup", "avatar_plan"], SOUNDS), ("no_cues", ["avatar_setup"], None)):
            with self.subTest(condition):
                harness, consumer, _ = self.make(condition)
                await harness.start()
                self.assertEqual([call.args[0]["type"] for call in consumer.send_json.await_args_list], frames)
                self.assertEqual(consumer.send_json.await_args_list[0].args[0]["data"].get("sounds"), sounds)
                consumer.request_harness_turn.assert_called_once()

    # Every sound a sign of listening plays at a pause is one the setup carries
    def test_every_listening_sound_is_in_the_setup(self) -> None:
        played = {step["sound"]["name"] for step in ELICITATION_SIGNS if "sound" in step}
        self.assertTrue(played)
        self.assertLessEqual(played, set(ELICITATION_SOUNDS))

    # The avatar's first turn asks the topic's question, with no LLM call, and starts the first thread
    async def test_the_opening_turn_asks_the_topics_question(self) -> None:
        harness, _, api = self.make()
        outcome = await harness.generate(TurnAttempt(context=[], user_text="", trigger="harness", publish_mood=AsyncMock(), publish_plan=AsyncMock()))
        self.assertEqual((outcome.message, outcome.state), (TOPIC.opening, ElicitationState()))
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

    # A short answer and a silence each reach the reply call as a directive
    async def test_a_flagging_chat_reaches_the_reply_as_a_directive(self) -> None:
        harness, _, api = self.make(reply=turn("Fair enough! What about plants?", move="new_angle"))
        for text, directive in (("Dogs.", "short_answer"), ("", "quiet"), ("Oh, dogs, without any doubt at all.", None)):
            with self.subTest(text):
                await harness.generate(make_attempt(text))
                self.assertEqual(api.reply.await_args.args[2], directive)

    # Each reply on a thread counts toward it, short answers add up until a longer one, and a new angle starts over
    async def test_the_state_follows_the_thread(self) -> None:
        harness, _, api = self.make()
        api.reply.return_value = turn("Ha! Which dog?")
        outcome = await harness.generate(make_attempt("Dogs."))
        self.assertEqual(outcome.state, ElicitationState(follow_ups=1, short_answers=1))

        harness.state = outcome.state
        outcome       = await harness.generate(make_attempt("Our old beagle, Rusty, who used to howl at the mailman."))
        self.assertEqual(outcome.state, ElicitationState(follow_ups=2, short_answers=0))

        api.reply.return_value = turn("Fair enough! What about plants?", move="new_angle")
        self.assertEqual((await harness.generate(make_attempt("Dogs."))).state, ElicitationState())

    # The reply is offered the fresh angles only once its thread has had its follow-ups, or has run dry
    async def test_a_new_thread_is_kept_from_the_fresh_angles(self) -> None:
        harness, _, api = self.make(reply=turn("Ha! Which dog?"))
        cases = (
            (ElicitationState(),                                              "Our old beagle used to howl at the mailman.", False),
            (ElicitationState(follow_ups=ELICITATION_MIN_FOLLOW_UPS),         "Our old beagle used to howl at the mailman.", True ),
            (ElicitationState(short_answers=ELICITATION_DRY_AFTER_SHORT - 1), "Dogs.",                                       True ),
        )
        for state, text, angles in cases:
            with self.subTest(state=state):
                harness.state = state
                await harness.generate(make_attempt(text))
                self.assertEqual(api.reply.await_args.args[3], angles)

    # A likely misheard word gets the reply check's question instead, asked with a curious look, and the thread stays where it was
    async def test_a_misheard_word_gets_a_question_instead(self) -> None:
        question = "Sorry, did you say 'tad person'?"
        verdict  = check_model(tuple(ELICITATION_SOUNDS), ElicitationBackchannels.GESTURES, turn_end=True, misheard=True).model_validate({"basis": "b", "verdict": {"next_step": "clarify", "misheard": "tad person", "message": question}})
        harness, _, _ = self.make(reply=turn("A tad person! What's that?"), check=SimpleNamespace(check=AsyncMock(return_value=verdict)))
        harness.state = ElicitationState(follow_ups=2)

        with self.assertLogs(GATE, level="INFO"): outcome = await harness.generate(make_attempt("I'm a tad person."))
        self.assertEqual((outcome.message, outcome.behavior, outcome.state), (question, "curious", ElicitationState(follow_ups=2)))
        self.assertEqual(outcome.avatar_plan["steps"][0]["move"]["name"], "Head Tilt")

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
        replace_for_test(self, f"{GATE}.get_reply_check_api", Mock(return_value=done_check()))
        self.consumer = make_consumer()
        self.harness  = build_harness(self.consumer, "speech_elicitation", "cues", None)

    # Stop the cues, so no silence timer outlives the test
    async def asyncTearDown(self) -> None:
        self.harness.stop()

    # A pause inside a long enough utterance gets this chat's first sign of listening, which is audible
    async def test_a_pause_inside_an_utterance_gets_a_sign_of_listening(self) -> None:
        signs = next(cue for cue in self.harness.cues if isinstance(cue, ElicitationBackchannels))
        signs.on_interim(interim(" ".join(["word"] * BACKCHANNEL_MIN_WORDS)))
        signs.on_silence(BACKCHANNEL_PAUSE_SEC)
        await asyncio.sleep(0)
        plans = [call.args[0]["data"] for call in self.consumer.send_json.await_args_list]
        self.assertEqual([plan["id"] for plan in plans], ["listen-1"])
        self.assertEqual(plans[0]["steps"][0]["sound"]["name"], "mm_hm")

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

    # Without cues the avatar gives no sign of listening and doesn't go back to listening on its own, but it still speaks up after a silence
    async def test_without_cues_only_the_quiet_prompt_acts(self) -> None:
        plain = build_harness(make_consumer(), "speech_elicitation", "no_cues", None)
        self.addCleanup(plain.stop)
        self.assertFalse(plain.backchannels.on)
        self.assertEqual([type(cue) for cue in plain.cues], [QuietPrompt, ElicitationBackchannels])
        self.assertNotIn(BackToListening, [type(cue) for cue in plain.cues])


# ================================================================================
# Setup Sounds
# ================================================================================
class SetupSoundTests(unittest.IsolatedAsyncioTestCase):
    # Where `synthesize_sounds` looks the text-to-speech provider up, and its clips so far
    PROVIDER = "chat_app.websocket.services.speech.tts.tts_google.TextToSpeechProvider"
    CLIPS    = "chat_app.websocket.harnesses.avatar._sound_clips"

    # Each sound is synthesized once in the reply voice, and sent as base64 PCM with its sample rate
    async def test_each_sound_is_synthesized_once(self) -> None:
        provider = Mock(synthesize_speech=Mock(return_value=(b"\x01\x02", 24_000, 1, 16)))
        with patch(self.PROVIDER, Mock(return_value=provider)), patch.dict(self.CLIPS, clear=True):
            sounds = await synthesize_sounds({"yeah": "Yeah.", "right": "Right."})
            again  = await synthesize_sounds({"yeah": "Yeah."})
        self.assertEqual(sounds, {"yeah": {"audio": "AQI=", "sample_rate": 24_000}, "right": {"audio": "AQI=", "sample_rate": 24_000}})
        self.assertEqual(again, {"yeah": sounds["yeah"]})
        self.assertEqual(provider.synthesize_speech.call_count, 2)

    # A sound that comes back empty stops the chat from starting as a cue session without it
    async def test_an_empty_clip_is_refused(self) -> None:
        provider = Mock(synthesize_speech=Mock(return_value=(b"", 24_000, 1, 16)))
        with patch(self.PROVIDER, Mock(return_value=provider)), patch.dict(self.CLIPS, clear=True):
            with self.assertRaisesRegex(RuntimeError, "No audio was synthesized"): await synthesize_sounds({"yeah": "Yeah."})
