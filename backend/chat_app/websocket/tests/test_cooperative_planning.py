"""
Cooperative planning scenarios, plan rules, prompts, pipelines, cues, and the harness.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.tests.test_cooperative_planning`

Every test plans the dinner party scenario (`scenarios/dinner_party.json`). The
LLM client is replaced with a stand-in that returns fixed structured responses,
so these tests check what code decides: which changes the rules allow, what the
prompts show the model, which frames go to the client, and when the chat ends.

"""
from dataclasses   import replace
from datetime      import datetime, timezone
from pathlib       import Path
from types         import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import asyncio, json, tempfile, unittest

# From this project
from chat_app.websocket.harnesses.base                                 import FinalUtterance, InterimSpeech, TurnAttempt
from chat_app.websocket.harnesses.cooperative_planning.cues            import ItemGlance, QuietNudge
from chat_app.websocket.harnesses.cooperative_planning.harness         import MSG_SAY_AGAIN, PLANNING_SCENARIOS, PlanningOutcome
from chat_app.websocket.harnesses.cooperative_planning.pipelines       import PlanningTurn, reply_then_track, single_call, track_then_reply
from chat_app.websocket.harnesses.cooperative_planning.plan_state      import PlanningState, apply_changes, initial_state
from chat_app.websocket.harnesses.cooperative_planning.planning_api    import PlanningAPIError
from chat_app.websocket.harnesses.cooperative_planning.prompts         import COMBINED_TASK, QUICK_REPLY_TASK, REPLY_TASK, TRACK_EXCHANGE_TASK, TRACK_TASK, build_messages, directive_for, plan_block
from chat_app.websocket.harnesses.cooperative_planning.response_models import models_for_scenario
from chat_app.websocket.harnesses.cooperative_planning.scenarios       import PLANNING_SCENARIOS_DIR, load_scenario
from chat_app.websocket.harnesses.registry                             import build_harness

# The scenario every test plans, and its responses
SCENARIO = PLANNING_SCENARIOS["dinner_party"]
MODELS   = models_for_scenario(SCENARIO.item_ids, SCENARIO.avatar_constraint_ids)

# Where the harness module looks its collaborators up (patched there)
HARNESS = "chat_app.websocket.harnesses.cooperative_planning.harness"


# --------------------------------------------------------------------------------
# Test Doubles
# --------------------------------------------------------------------------------
# One of the user's changes, as a call would return it
def user_change(**fields: object) -> object:
    return MODELS.plan_update.model_validate({"basis": "b", "user_changes": [fields]}).user_changes[0]

# One of the avatar's changes, as a call would return it
def avatar_change(**fields: object) -> object:
    return MODELS.spoken_turn.model_validate({"basis": "b", "avatar_changes": [fields], "behavior": "none", "about": None, "message": "m"}).avatar_changes[0]

# A tracking call's response
def plan_update(*changes: dict[str, object]) -> object:
    return MODELS.plan_update.model_validate({"basis": "tracked", "user_changes": list(changes)})

# A reply call's response
def spoken_turn(message: str, *changes: dict[str, object], behavior: str = "none", about: str | None = None) -> object:
    return MODELS.spoken_turn.model_validate({"basis": "replied", "avatar_changes": list(changes), "behavior": behavior, "about": about, "message": message})

# The plan with the starter settled on breadsticks (the avatar asked, and the user said yes)
def starter_settled() -> PlanningState:
    state, _ = apply_changes(initial_state(SCENARIO), [
        ("avatar", avatar_change(op="ask_to_settle", item="starter", choice="breadsticks")),
        ("user",   user_change  (op="accept",        item="starter")),
    ])
    return state

# The plan with every item agreed
def every_item_settled(stage: str = "planning") -> PlanningState:
    state = initial_state(SCENARIO)
    for item_id, choice in (("starter", "breadsticks"), ("main", "pasta"), ("dessert", "tiramisu")):
        state, _ = apply_changes(state, [("avatar", avatar_change(op="ask_to_settle", item=item_id, choice=choice)), ("user", user_change(op="accept", item=item_id))])
    return replace(state, stage=stage)

# One reply attempt after the avatar's opening line
def make_attempt(text: str, trigger: str = "automatic") -> TurnAttempt:
    context = [("assistant", SCENARIO.opening_line, 0.0), ("user", text, 0.0)] if text else [("assistant", SCENARIO.opening_line, 0.0)]
    return TurnAttempt(context=context, user_text=text, trigger=trigger, publish_mood=AsyncMock(), publish_plan=AsyncMock())

# A connection with the parts the harness and its cues use
def make_consumer() -> SimpleNamespace:
    return SimpleNamespace(send_json=AsyncMock(), request_harness_turn=Mock(return_value=Mock()), streaming_active=True)

# The frame types a consumer was sent, in order
def sent_types(consumer: SimpleNamespace) -> list[str]:
    return [call.args[0]["type"] for call in consumer.send_json.await_args_list]

# A stand-in for the planning client: fixed responses, and a record of what each call saw
class StubPlanningAPI:
    def __init__(self, **responses: object) -> None:
        self.responses = responses
        self.calls     : list[tuple[str, object]] = []

    # Each call notes the plan it saw (and the directive, for the replies) and returns its fixed response
    async def track         (self, turn: PlanningTurn                                     ) -> object: return self._answer("track",          turn.state)
    async def reply         (self, turn: PlanningTurn, state: PlanningState, directive: str) -> object: return self._answer("reply",          (state, directive))
    async def combined      (self, turn: PlanningTurn, directive: str                     ) -> object: return self._answer("combined",       directive)
    async def quick_reply   (self, turn: PlanningTurn, directive: str                     ) -> object: return self._answer("quick_reply",    directive)
    async def track_exchange(self, turn: PlanningTurn, reply: str                         ) -> object: return self._answer("track_exchange", reply)

    # Record one call, then return (or raise) its response
    def _answer(self, name: str, seen: object) -> object:
        self.calls.append((name, seen))
        response = self.responses[name]
        if isinstance(response, Exception): raise response
        return response


# ================================================================================
# Scenario Files
# ================================================================================
class ScenarioFileTests(unittest.TestCase):
    """
    Scenario files are written by hand, so each one is checked when the backend starts.
    """
    # The dinner party has three items in order, and three private constraints on each side
    def test_dinner_party_loads_with_items_and_both_sides_constraints(self) -> None:
        self.assertEqual(SCENARIO.item_ids, ("starter", "main", "dessert"))
        self.assertEqual(SCENARIO.items[1].names, ("main course", "main", "entree", "main dish"))
        self.assertEqual(len(SCENARIO.participant.constraints), 3)
        self.assertEqual(SCENARIO.avatar_constraint_ids, ("broken_oven", "no_spicy", "make_ahead"))

    # A broken scenario file is refused, naming the file and what is wrong
    def test_broken_scenario_files_are_refused_by_field(self) -> None:
        breakages = {
            "every item id must be"  : lambda data: data["items"].append(dict(data["items"][0])),
            "items.0.id"             : lambda data: data["items"][0].update(id="Starter"),
            "colour"                 : lambda data: data.update(colour="red"),
            "every constraint id"    : lambda data: data["avatar"]["constraints"][0].update(id="no_fish"),
            "participant.constraints": lambda data: data["participant"].update(constraints=[]),
        }
        with tempfile.TemporaryDirectory() as folder, patch("chat_app.websocket.harnesses.cooperative_planning.scenarios.PLANNING_SCENARIOS_DIR", Path(folder)):
            for fault, breaks in breakages.items():
                with self.subTest(fault):
                    data = json.loads((PLANNING_SCENARIOS_DIR / "dinner_party.json").read_text(encoding="utf-8"))
                    breaks(data)
                    (Path(folder) / "broken.json").write_text(json.dumps(data), encoding="utf-8")
                    with self.assertRaisesRegex(ValueError, f"broken.json[\\s\\S]*{fault}"): load_scenario("broken")


# ================================================================================
# Plan Rules
# ================================================================================
class PlanRuleTests(unittest.TestCase):
    """
    The model only proposes changes; code decides which ones the task allows.
    """
    # A choice waits for the other side's yes, then goes on the card
    def test_a_choice_goes_on_the_card_only_when_the_other_side_says_yes(self) -> None:
        asked, _ = apply_changes(initial_state(SCENARIO), [("avatar", avatar_change(op="ask_to_settle", item="starter", choice="breadsticks"))])
        self.assertIsNone(asked.items["starter"].agreed)
        self.assertEqual(asked.items["starter"].settling.choice, "breadsticks")

        settled, results = apply_changes(asked, [("user", user_change(op="accept", item="starter"))])
        self.assertEqual(settled.items["starter"].agreed, "breadsticks")
        self.assertIsNone(settled.items["starter"].settling)
        self.assertEqual(results[0].refused, "")

    # Neither side can settle its own request, and nothing can be accepted with nothing waiting
    def test_a_side_cannot_accept_its_own_request(self) -> None:
        asked, _       = apply_changes(initial_state(SCENARIO), [("user", user_change(op="ask_to_settle", item="main", choice="pasta"))])
        after, results = apply_changes(asked, [("user", user_change(op="accept", item="main")), ("avatar", avatar_change(op="accept", item="dessert"))])
        self.assertEqual(after, asked)
        self.assertEqual([result.refused for result in results], ["a side can't accept its own request", "nothing is waiting for a yes"])

    # Saying no to a request turns that choice down, with who said no and why
    def test_declining_turns_the_choice_down_with_the_reason(self) -> None:
        asked, _    = apply_changes(initial_state(SCENARIO), [("avatar", avatar_change(op="ask_to_settle", item="main", choice="roast lamb"))])
        declined, _ = apply_changes(asked, [("user", user_change(op="decline", item="main", reason="a guest is vegetarian"))])
        item = declined.items["main"]
        self.assertIsNone(item.settling)
        self.assertEqual((item.refused[0].choice, item.refused[0].by, item.refused[0].reason), ("roast lamb", "user", "a guest is vegetarian"))

    # A choice turned down and then suggested again comes back off the turned-down list
    def test_suggesting_a_turned_down_choice_again_brings_it_back(self) -> None:
        state, _ = apply_changes(initial_state(SCENARIO), [
            ("user",   user_change  (op="suggest", item="dessert", choice="Ice cream")),
            ("avatar", avatar_change(op="reject",  item="dessert", choice="ice cream", reason="it has to be made ahead")),
            ("user",   user_change  (op="suggest", item="dessert", choice="ice cream")),
        ])
        self.assertEqual([s.choice for s in state.items["dessert"].suggestions], ["ice cream"])
        self.assertEqual(state.items["dessert"].refused, ())

    # The plan is approved only during the final check, and reopening an item ends the check
    def test_the_plan_is_approved_only_during_the_final_check_and_reopening_ends_it(self) -> None:
        _, early = apply_changes(every_item_settled(), [("user", user_change(op="approve_plan"))])
        self.assertEqual(early[0].refused, "the whole plan hasn't been read back yet")

        approved, _ = apply_changes(every_item_settled("final_check"), [("user", user_change(op="approve_plan"))])
        self.assertEqual(approved.stage, "approved")

        reopened, _ = apply_changes(every_item_settled("final_check"), [("user", user_change(op="reopen", item="main", reason="too heavy"))])
        self.assertEqual((reopened.stage, reopened.items["main"].agreed, reopened.items["main"].refused[0].choice), ("planning", None, "pasta"))

    # Preferences and the avatar's mentioned constraints are each noted once
    def test_preferences_and_reveals_are_noted_once(self) -> None:
        state, results = apply_changes(initial_state(SCENARIO), [
            ("user",   user_change  (op="note_preference", kind="avoid", text="fish")),
            ("user",   user_change  (op="note_preference", kind="avoid", text="Fish")),
            ("avatar", avatar_change(op="reveal", constraint="broken_oven")),
            ("avatar", avatar_change(op="reveal", constraint="broken_oven")),
        ])
        self.assertEqual((state.user_avoids, state.revealed), (("fish",), ("broken_oven",)))
        self.assertEqual([result.refused for result in results], ["", "already noted", "", "already mentioned"])


# ================================================================================
# Prompts
# ================================================================================
class PromptTests(unittest.TestCase):
    # The avatar learns the participant's constraints only from the conversation, never from a prompt
    def test_no_prompt_ever_shows_the_participants_constraints(self) -> None:
        for task in (TRACK_TASK, REPLY_TASK, COMBINED_TASK, QUICK_REPLY_TASK, TRACK_EXCHANGE_TASK):
            for directive in (None, "read_back", "nudge"):
                system = build_messages(task, SCENARIO, starter_settled(), [], directive)[0]["content"]
                for constraint in SCENARIO.participant.constraints:
                    with self.subTest(task=task[:20], directive=directive, constraint=constraint.id): self.assertNotIn(constraint.text, system)

    # The plan block shows the avatar's own constraints, what is agreed, what waits for a yes, the ideas, and the refusals
    def test_the_plan_block_shows_each_items_state(self) -> None:
        state, _ = apply_changes(starter_settled(), [
            ("avatar", avatar_change(op="reveal",        constraint="broken_oven")),
            ("user",   user_change  (op="suggest",       item="main", choice="lasagna")),
            ("avatar", avatar_change(op="reject",        item="main", choice="lasagna", reason="my oven is broken")),
            ("user",   user_change  (op="ask_to_settle", item="main", choice="stir fry")),
        ])
        block = plan_block(SCENARIO, state)
        self.assertIn("Your oven is broken. [id: broken_oven] (you have mentioned it)", block)
        self.assertIn("- Starter [id: starter]: agreed: breadsticks.", block)
        self.assertIn('Waiting for your yes on "stir fry" (the user asked to settle on it).', block)
        self.assertIn("Turned down: lasagna (by you: my oven is broken).", block)
        self.assertIn("- Nothing yet.", block)

    # A finished plan gets read back, and a quiet user gets nudged about the first open item
    def test_directives_read_back_a_finished_plan_and_nudge_about_the_first_open_item(self) -> None:
        self.assertEqual(directive_for(every_item_settled(), nudge=False), "read_back")
        self.assertIsNone(directive_for(every_item_settled("final_check"), nudge=True))
        self.assertIsNone(directive_for(starter_settled(), nudge=False))
        system = build_messages(REPLY_TASK, SCENARIO, starter_settled(), [], directive_for(starter_settled(), nudge=True))[0]["content"]
        self.assertIn("invite them to keep going with the main course", system)


# ================================================================================
# Pipelines
# ================================================================================
class PipelineTests(unittest.IsolatedAsyncioTestCase):
    # One turn after the opening line
    def setUp(self) -> None:
        self.turn = PlanningTurn(SCENARIO, MODELS, starter_settled(), [{"role": "user", "content": "How about pasta?"}], nudge=False)

    # The reply sees the plan with the user's changes already in it, and both sides' changes come back in order
    async def test_track_then_reply_replies_from_the_plan_the_users_changes_leave(self) -> None:
        api   = StubPlanningAPI(track=plan_update({"op": "ask_to_settle", "item": "main", "choice": "pasta"}),
                                reply=spoken_turn("Pasta sounds great!", {"op": "accept", "item": "main"}, behavior="pleased"))
        reply = await track_then_reply(api, self.turn)

        seen_state, directive = api.calls[1][1]
        self.assertEqual(seen_state.items["main"].settling.choice, "pasta")
        self.assertIsNone(directive)
        self.assertEqual([(by, change.op) for by, change in reply.changes], [("user", "ask_to_settle"), ("avatar", "accept")])
        self.assertEqual((reply.message, reply.behavior, reply.follow_up), ("Pasta sounds great!", "pleased", None))

    # The user's yes to the read-back plan needs no reply call: the closing line ends the chat
    async def test_an_approved_plan_needs_no_reply_call(self) -> None:
        api   = StubPlanningAPI(track=plan_update({"op": "approve_plan"}))
        reply = await track_then_reply(api, replace(self.turn, state=every_item_settled("final_check")))
        self.assertEqual([name for name, _ in api.calls], ["track"])
        self.assertEqual(reply.message, SCENARIO.closing_line)

    # One call proposes the user's changes, then the avatar's
    async def test_single_call_proposes_both_sides_changes_in_order(self) -> None:
        combined = MODELS.combined_turn.model_validate({
            "basis": "b", "behavior": "nod", "about": "main", "message": "Pasta it is?",
            "user_changes"   : [{"op": "suggest", "item": "main", "choice": "pasta"}],
            "avatar_changes" : [{"op": "ask_to_settle", "item": "main", "choice": "pasta"}],
        })
        reply = await single_call(StubPlanningAPI(combined=combined), self.turn)
        self.assertEqual([(by, change.op) for by, change in reply.changes], [("user", "suggest"), ("avatar", "ask_to_settle")])
        self.assertEqual(reply.about, "main")

    # The quick reply proposes nothing; the exchange's changes are worked out afterwards, from what it said
    async def test_reply_then_track_leaves_the_changes_for_after_the_reply(self) -> None:
        quick    = MODELS.quick_reply.model_validate({"basis": "b", "behavior": "none", "about": None, "message": "Pasta? Sure!"})
        exchange = MODELS.exchange_update.model_validate({"basis": "b", "user_changes": [{"op": "suggest", "item": "main", "choice": "pasta"}], "avatar_changes": []})
        api      = StubPlanningAPI(quick_reply=quick, track_exchange=exchange)

        reply = await reply_then_track(api, self.turn)
        self.assertEqual(reply.changes, ())
        self.assertEqual([(by, change.op) for by, change in await reply.follow_up()], [("user", "suggest")])
        self.assertEqual(api.calls[-1], ("track_exchange", "Pasta? Sure!"))

    # A nudge has nothing new from the user, so it is not tracked
    async def test_a_nudge_tracks_nothing(self) -> None:
        api   = StubPlanningAPI(reply=spoken_turn("What should we have for the main course?"))
        reply = await track_then_reply(api, replace(self.turn, nudge=True))
        self.assertEqual([name for name, _ in api.calls], ["reply"])
        self.assertEqual(api.calls[0][1][1], "nudge")
        self.assertEqual(reply.changes, ())


# ================================================================================
# Harness
# ================================================================================
class HarnessTests(unittest.IsolatedAsyncioTestCase):
    # A planning harness with the cues on (or off), and the stand-in client every call reaches
    def make(self, condition: str = "cues", pipeline: str = "track_then_reply", **responses: object) -> tuple[object, SimpleNamespace, StubPlanningAPI]:
        consumer = make_consumer()
        api      = StubPlanningAPI(**responses)
        for target, value in ((f"{HARNESS}.get_planning_api", Mock(return_value=api)), (f"{HARNESS}.PLANNING_PIPELINE", pipeline)):
            started = patch(target, value)
            started.start()
            self.addCleanup(started.stop)
        return build_harness(consumer, "cooperative_planning", condition, None), consumer, api

    # With cues: settings, picking up the card, the participant's card, then the avatar's own opening turn
    async def test_start_sets_the_avatar_up_shows_the_card_and_opens_the_chat(self) -> None:
        harness, consumer, _ = self.make()
        await harness.start()
        self.assertEqual(sent_types(consumer), ["avatar_setup", "avatar_plan", "task_card"])
        self.assertEqual(consumer.send_json.await_args_list[1].args[0]["data"]["steps"][0]["prop"], {"hold": "card"})
        consumer.request_harness_turn.assert_called_once()

    # Without cues: the avatar only idles, so no plan goes out, but the participant still gets their card
    async def test_without_cues_only_the_setup_and_the_card_go_out(self) -> None:
        harness, consumer, _ = self.make(condition="no_cues")
        await harness.start()
        self.assertEqual(sent_types(consumer), ["avatar_setup", "task_card"])
        self.assertEqual(harness.cues, [])

    # The avatar's first turn says the scenario's opening line, with no LLM call
    async def test_the_opening_turn_says_the_scenarios_line(self) -> None:
        harness, _, api = self.make()
        opening = TurnAttempt(context=[], user_text="", trigger="harness", publish_mood=AsyncMock(), publish_plan=AsyncMock())
        outcome = await harness.generate(opening)
        self.assertEqual(outcome.message, SCENARIO.opening_line)
        self.assertEqual(api.calls, [])
        opening.publish_plan.assert_not_awaited()

    # Each reply carries the plan for the behavior it picked, but only with cues
    async def test_a_reply_carries_its_behavior_plan_only_with_cues(self) -> None:
        responses = {"track": plan_update(), "reply": spoken_turn("Nice idea!", behavior="pleased")}
        for condition, sends_plan in (("cues", True), ("no_cues", False)):
            with self.subTest(condition):
                harness, _, _ = self.make(condition, **responses)
                attempt = make_attempt("Maybe soup to start?")
                harness.on_reply_started(attempt)
                outcome = await harness.generate(attempt)
                self.assertEqual(outcome.behavior, "pleased")
                self.assertEqual(outcome.avatar_plan is not None, sends_plan)
                self.assertEqual(attempt.publish_plan.await_count, int(sends_plan))
                if sends_plan: self.assertEqual(outcome.avatar_plan["id"], "t1-reply")

    # A saved reply that settles an item sends the new card; the plan writes the choice in after the reply
    async def test_a_saved_reply_that_changes_the_plan_sends_the_card(self) -> None:
        harness, consumer, _ = self.make(track=plan_update({"op": "ask_to_settle", "item": "starter", "choice": "soup"}),
                                         reply=spoken_turn("Soup it is!", {"op": "accept", "item": "starter"}, behavior="excited"))
        outcome = await harness.generate(make_attempt("Can we settle on soup?"))
        self.assertEqual(harness.state.items["starter"].agreed, None)
        self.assertEqual(outcome.avatar_plan["steps"][-2]["gaze"]["on"], "card")

        harness.on_reply_saved(outcome)
        await asyncio.sleep(0)
        self.assertEqual(harness.state.items["starter"].agreed, "soup")
        self.assertEqual(consumer.send_json.await_args.args[0]["data"]["items"][0]["value"], "soup")

    # Every item agreed: the reply reads the plan back and the final check starts, and the user's yes ends the chat
    async def test_the_read_back_starts_the_final_check_and_the_users_yes_ends_the_chat(self) -> None:
        harness, _, api = self.make(track=plan_update(), reply=spoken_turn("Breadsticks, pasta, and tiramisu. Happy with that?", behavior="glance_at_card"))
        harness.state = every_item_settled()
        read_back = await harness.generate(make_attempt("Great!"))
        self.assertEqual(api.calls[1][1][1], "read_back")
        self.assertEqual((read_back.state.stage, read_back.close_after), ("final_check", False))

        harness.on_reply_saved(read_back)
        api.responses["track"] = plan_update({"op": "approve_plan"})
        goodbye = await harness.generate(make_attempt("Yes, perfect!"))
        self.assertEqual((goodbye.message, goodbye.close_after, goodbye.state.stage), (SCENARIO.closing_line, True, "approved"))

    # A call that fails every attempt gets the scripted line, and the plan stays as it was
    async def test_a_failed_call_says_it_again_and_keeps_the_plan(self) -> None:
        harness, _, _ = self.make(track=PlanningAPIError("down"))
        with self.assertLogs(HARNESS, level="ERROR"): outcome = await harness.generate(make_attempt("Soup?"))
        self.assertEqual((outcome.message, outcome.state, outcome.results), (MSG_SAY_AGAIN, initial_state(SCENARIO), ()))
        self.assertEqual(outcome.avatar_plan["steps"][0]["state"], "listening")

    # reply_then_track: the reply leaves the plan alone, its tracking applies once it is saved, and the next turn waits for it
    async def test_reply_then_track_applies_the_exchange_once_the_reply_is_saved(self) -> None:
        quick    = MODELS.quick_reply.model_validate({"basis": "b", "behavior": "none", "about": None, "message": "Soup? Lovely."})
        exchange = MODELS.exchange_update.model_validate({"basis": "b", "user_changes": [{"op": "suggest", "item": "starter", "choice": "soup"}], "avatar_changes": []})
        harness, consumer, _ = self.make(pipeline="reply_then_track", quick_reply=quick, track_exchange=exchange)

        outcome = await harness.generate(make_attempt("Maybe soup?"))
        self.assertIsInstance(outcome, PlanningOutcome)
        self.assertEqual(outcome.state, initial_state(SCENARIO))

        harness.on_reply_saved(outcome)
        await harness.generate(make_attempt("Or salad?"))
        self.assertEqual([s.choice for s in harness.state.items["starter"].suggestions], ["soup"])
        self.assertIn("task_card", sent_types(consumer))


# ================================================================================
# Cues
# ================================================================================
class CueTests(unittest.IsolatedAsyncioTestCase):
    # A harness with its cues, and a connection that records what they send
    async def asyncSetUp(self) -> None:
        self.consumer = make_consumer()
        self.harness  = build_harness(self.consumer, "cooperative_planning", "cues", None)

    # Stop the cues, so no silence timer outlives the test
    async def asyncTearDown(self) -> None:
        self.harness.stop()

    # Naming an item glances at its line on the card, but not while a reply owns the avatar
    async def test_naming_an_item_glances_at_its_line_while_listening(self) -> None:
        glance = next(cue for cue in self.harness.cues if isinstance(cue, ItemGlance))
        glance.on_interim(InterimSpeech(text="maybe for the entree", new_speech=True, stability=0.9, ended_at=datetime.now(timezone.utc)))
        await asyncio.sleep(0)
        plan = self.consumer.send_json.await_args.args[0]["data"]
        self.assertEqual((plan["id"], plan["steps"][0]["gaze"]["on"]), ("glance-main-1", "card"))

        glance.on_final(FinalUtterance(text="maybe for the entree", words=()))
        glance.on_reply_started(make_attempt("maybe for the entree"))
        glance.on_interim(InterimSpeech(text="and dessert", new_speech=True, stability=0.9, ended_at=datetime.now(timezone.utc)))
        await asyncio.sleep(0)
        self.assertEqual(self.consumer.send_json.await_count, 1)

    # A long silence asks for a nudge turn, a few times in a row, and the user speaking starts the count over
    async def test_silence_nudges_a_few_times_then_waits(self) -> None:
        nudge = next(cue for cue in self.harness.cues if isinstance(cue, QuietNudge))
        for _ in range(4): nudge.on_silence(12.0)
        self.assertEqual(self.consumer.request_harness_turn.call_count, 2)

        nudge.on_final(FinalUtterance(text="hmm", words=()))
        nudge.on_silence(12.0)
        self.assertEqual(self.consumer.request_harness_turn.call_count, 3)

    # While a reply is worked out the avatar reads its card over (published before any call), and listens again when newer speech cancels it
    async def test_the_avatar_reads_its_card_while_thinking_and_listens_again_when_cancelled(self) -> None:
        attempt = make_attempt("Soup?")
        with patch(f"{HARNESS}.get_planning_api", Mock(return_value=StubPlanningAPI(track=plan_update(), reply=spoken_turn("Soup sounds nice.")))):
            self.harness.on_reply_started(attempt)
            await self.harness.generate(attempt)
        thinking = attempt.publish_plan.await_args.args[0]
        self.assertEqual((thinking["id"], thinking["steps"][0]["state"]), ("t1-think", "thinking"))

        self.harness.on_reply_cancelled(attempt, saved=False)
        await asyncio.sleep(0)
        plan = self.consumer.send_json.await_args.args[0]["data"]
        self.assertEqual((plan["id"], plan["steps"][0]["state"]), ("t1-listen", "listening"))
