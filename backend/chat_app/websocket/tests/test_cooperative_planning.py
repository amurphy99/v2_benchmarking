"""
Cooperative planning scenarios, plan rules, prompts, pipelines, cues, and the harness.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.tests.test_cooperative_planning`

Every test plans the dinner party scenario (`scenarios/dinner_party.json`),
except the ones that check every scenario file. The LLM client is replaced with a stand-in that returns fixed structured responses,
so these tests check what code decides: which changes the rules allow, what the
prompts show the model, which frames go to the client, and when the chat ends.

"""
from dataclasses   import replace
from datetime      import datetime, timezone
from pathlib       import Path
from types         import SimpleNamespace
from typing        import get_args
from unittest.mock import AsyncMock, Mock, patch

import asyncio, json, tempfile, unittest

# From this project
from chat_app.websocket.harnesses.base                                 import FinalUtterance, InterimSpeech, TurnAttempt
from chat_app.websocket.harnesses.cooperative_planning.behaviors       import PLANNING_SOUNDS, reply_plan
from chat_app.websocket.harnesses.cooperative_planning.cues            import ItemGlance, PlanningBackchannels, QuietNudge
from chat_app.websocket.harnesses.cooperative_planning.harness         import MSG_SAY_AGAIN, PLANNING_SCENARIOS, PlanningOutcome
from chat_app.websocket.harnesses.cooperative_planning.pipelines       import PlanningTurn, reply_then_track, single_call, track_then_reply
from chat_app.websocket.harnesses.cooperative_planning.plan_state      import PlanningState, Suggestion, apply_changes, card_frame, initial_state, planning_history, planning_reveal
from chat_app.websocket.harnesses.cooperative_planning.planning_api    import PlanningAPIError
from chat_app.websocket.harnesses.cooperative_planning.prompts         import BEHAVIOR_FIELD, COMBINED_TASK, PLANNING_REACTION_WHEN, QUICK_REPLY_TASK, REPLY_TASK, TRACK_EXCHANGE_TASK, TRACK_TASK, build_messages, directive_for, misheard_notes, plan_block, recap_line
from chat_app.websocket.harnesses.cooperative_planning.response_models import Behavior, CardBehavior, PlanningReaction, models_for_scenario
from chat_app.websocket.harnesses.cooperative_planning.scenarios       import PLANNING_SCENARIOS_DIR, load_scenario
from chat_app.websocket.harnesses.features.intro.flow                  import IntroState
from chat_app.websocket.harnesses.features.intro.intro_api             import IntroReading
from chat_app.websocket.harnesses.features.intro.prompts               import INTRO_QUESTION
from chat_app.websocket.harnesses.features.reply_gate.response_models  import CheckResult, Reply, check_model
from chat_app.websocket.harnesses.reactions                            import REACTIONS
from chat_app.websocket.harnesses.registry                             import build_harness

# The scenario every test plans, and its responses
SCENARIO = PLANNING_SCENARIOS["dinner_party"]
MODELS   = models_for_scenario(SCENARIO.item_ids, SCENARIO.avatar_constraint_ids)

# Where the harness module looks its collaborators up (patched there)
HARNESS = "chat_app.websocket.harnesses.cooperative_planning.harness"

# Where the signs of listening synthesize their sound, and the clip the stand-in returns
SYNTHESIZE_SOUNDS = "chat_app.websocket.harnesses.features.backchannels.cue.synthesize_sounds"
SOUNDS            = {"mm_hm": {"audio": "AAA=", "sample_rate": 24_000}}

# Where the reply gate looks its check client up, and the logger it writes each verdict to
GET_REPLY_CHECK = "chat_app.websocket.harnesses.features.reply_gate.gate.get_reply_check_api"
GATE_LOGGER     = "chat_app.websocket.harnesses.features.reply_gate.gate"

# The intro's switch (patched to `()` where a test is about the planning itself), and its call
INTRO_SWITCH = "chat_app.websocket.harnesses.features.intro.flow.FEATURE_INTRO_CONDITIONS"
GET_INTRO    = "chat_app.websocket.harnesses.features.intro.flow.get_intro_api"

# Where every harness module logs (the intro, the reply gate, and the planning's own)
HARNESSES_LOGGER = "chat_app.websocket.harnesses"

# A check that finds the user done, so every reply goes out as usual
CHECK_DONE = CheckResult(basis="done", verdict=Reply(next_step="reply"))


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

# A single call's response: the user's changes, the avatar's, and the reply
def combined_turn(message: str, user: tuple[dict[str, object], ...] = (), avatar: tuple[dict[str, object], ...] = (), behavior: str = "none") -> object:
    return MODELS.combined_turn.model_validate({"basis": "both", "user_changes": list(user), "avatar_changes": list(avatar), "behavior": behavior, "about": None, "message": message})

# The plan with each listed item agreed: the avatar's idea, and the user's yes to it
def agreed_on(*choices: tuple[str, str], stage: str = "planning") -> PlanningState:
    state = initial_state(SCENARIO)
    for item_id, choice in choices:
        state, _ = apply_changes(state, [("avatar", avatar_change(op="suggest", item=item_id, choice=choice)), ("user", user_change(op="agree", item=item_id, choice=choice))])
    return replace(state, stage=stage)

# The plan with the starter agreed on breadsticks
def starter_settled() -> PlanningState:
    return agreed_on(("starter", "breadsticks"))

# The plan with every item agreed
def every_item_settled(stage: str = "planning") -> PlanningState:
    return agreed_on(("starter", "breadsticks"), ("main", "pasta"), ("dessert", "tiramisu"), stage=stage)

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

    # The task's first line, said after the intro's "Hi!", never says hi again
    def test_no_scenario_starts_its_task_with_a_second_hello(self) -> None:
        for variant, scenario in PLANNING_SCENARIOS.items():
            with self.subTest(variant): self.assertFalse(scenario.start_line.startswith("Hi"), scenario.start_line)

    # Every scenario has the same shape, so a session's variant never changes how much there is to plan
    def test_every_scenario_has_three_items_and_three_constraints_a_side(self) -> None:
        for variant, scenario in PLANNING_SCENARIOS.items():
            with self.subTest(variant):
                self.assertEqual(len(scenario.items), 3)
                self.assertEqual((len(scenario.participant.constraints), len(scenario.avatar.constraints)), (3, 3))

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
    # A yes to the other side's idea puts it on the card at once, credited to the side that had it
    def test_a_yes_to_the_other_sides_idea_puts_it_on_the_card(self) -> None:
        suggested, _    = apply_changes(initial_state(SCENARIO), [("avatar", avatar_change(op="suggest", item="starter", choice="breadsticks"))])
        agreed, results = apply_changes(suggested, [("user", user_change(op="agree", item="starter", choice="breadsticks"))])
        item = agreed.items["starter"]
        self.assertEqual((item.agreed, item.suggestions, item.put_forward), ("breadsticks", (), (Suggestion("breadsticks", "avatar"),)))
        self.assertEqual(results[0].refused, "")

    # A side can't agree to its own idea, or to one the other side turned down
    def test_a_side_cannot_agree_to_its_own_idea_or_one_turned_down(self) -> None:
        state, _ = apply_changes(initial_state(SCENARIO), [
            ("user",   user_change  (op="suggest", item="main",    choice="pasta")),
            ("avatar", avatar_change(op="reject",  item="dessert", choice="ice cream", reason="it has to be made ahead")),
        ])
        after, results = apply_changes(state, [("user", user_change(op="agree", item="main", choice="pasta")), ("user", user_change(op="agree", item="dessert", choice="ice cream"))])
        self.assertEqual(after, state)
        self.assertEqual([result.refused for result in results], ["a side can't agree to its own idea", "the other side turned it down"])

    # A yes to an idea never noted still counts, credited to the other side (calls can miss one)
    def test_a_yes_to_an_idea_never_noted_still_counts(self) -> None:
        agreed, _ = apply_changes(initial_state(SCENARIO), [("user", user_change(op="agree", item="dessert", choice="tiramisu"))])
        self.assertEqual((agreed.items["dessert"].agreed, agreed.items["dessert"].put_forward), ("tiramisu", (Suggestion("tiramisu", "avatar"),)))

    # A yes to a new idea changes an agreed item, and ends the final check
    def test_a_new_yes_changes_an_agreed_item_and_ends_the_final_check(self) -> None:
        changed, _ = apply_changes(every_item_settled("final_check"), [
            ("user",   user_change  (op="suggest", item="main", choice="risotto")),
            ("avatar", avatar_change(op="agree",   item="main", choice="risotto")),
        ])
        self.assertEqual((changed.items["main"].agreed, changed.stage, changed.all_agreed), ("risotto", "planning", True))

    # Turning an idea down keeps who turned it down and why
    def test_turning_an_idea_down_keeps_who_and_why(self) -> None:
        state, _ = apply_changes(initial_state(SCENARIO), [
            ("avatar", avatar_change(op="suggest", item="main", choice="roast lamb")),
            ("user",   user_change  (op="reject",  item="main", choice="roast lamb", reason="a guest is vegetarian")),
        ])
        refusal = state.items["main"].refused[0]
        self.assertEqual((refusal.choice, refusal.by, refusal.reason, state.items["main"].suggestions), ("roast lamb", "user", "a guest is vegetarian", ()))

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
# History and the Reveal
# ================================================================================
class HistoryTests(unittest.TestCase):
    """
    The completed-session history says who suggested what, and the participant's
    client is shown the avatar's side once the chat ends.
    """
    # The side that first put a choice forward is kept once it is agreed or turned down
    def test_the_history_says_who_suggested_each_choice(self) -> None:
        state, _ = apply_changes(initial_state(SCENARIO), [
            ("avatar", avatar_change(op="suggest", item="starter", choice="Breadsticks")),
            ("user",   user_change  (op="agree",   item="starter", choice="breadsticks")),
            ("user",   user_change  (op="suggest", item="main",    choice="salmon")),
            ("avatar", avatar_change(op="reject",  item="main",    choice="salmon", reason="the oven is broken")),
            ("avatar", avatar_change(op="reject",  item="main",    choice="roast",  reason="too much work")),
        ])
        self.assertEqual(state.items["starter"].put_forward, (Suggestion("Breadsticks", "avatar"),))

        # A choice turned down before either side suggested it has no suggester
        items = {item["id"]: item["state"] for item in planning_history(SCENARIO, state)["items"]}
        self.assertEqual((items["starter"]["agreed"], items["starter"]["suggested_by"]), ("breadsticks", "avatar"))
        self.assertNotIn("settling", items["starter"])  # Nothing waits for a yes any more
        self.assertEqual(items["main"]["put_forward"], [{"choice": "salmon", "by": "user"}])
        self.assertEqual(items["main"]["refused"], [
            {"choice": "salmon", "by": "avatar", "reason": "the oven is broken", "suggested_by": "user"},
            {"choice": "roast",  "by": "avatar", "reason": "too much work",      "suggested_by": None  },
        ])

    # The history lists the avatar's constraints it mentioned, in order, and the reveal marks them
    def test_the_avatars_mentioned_constraints_are_kept_and_revealed(self) -> None:
        state, _ = apply_changes(initial_state(SCENARIO), [("avatar", avatar_change(op="reveal", constraint="make_ahead")), ("avatar", avatar_change(op="reveal", constraint="broken_oven"))])
        texts    = {constraint.id: constraint.text for constraint in SCENARIO.avatar.constraints}
        self.assertEqual(planning_history(SCENARIO, state)["avatar_mentioned"], [texts["make_ahead"], texts["broken_oven"]])

        reveal = planning_reveal(SCENARIO, state)
        self.assertEqual((reveal["kind"], reveal["brief"]), ("cooperative_planning", SCENARIO.avatar.brief))
        self.assertEqual(reveal["constraints"], [{"text": texts[constraint_id], "mentioned": constraint_id != "no_spicy"} for constraint_id in SCENARIO.avatar_constraint_ids])


# ================================================================================
# Prompts
# ================================================================================
class PromptTests(unittest.TestCase):
    # The avatar learns the participant's constraints only from the conversation, never from a prompt
    def test_no_prompt_ever_shows_the_participants_constraints(self) -> None:
        for task in (TRACK_TASK, REPLY_TASK, COMBINED_TASK, QUICK_REPLY_TASK, TRACK_EXCHANGE_TASK):
            for directive in (None, "nudge"):
                system = build_messages(task, SCENARIO, starter_settled(), [], directive)[0]["content"]
                for constraint in SCENARIO.participant.constraints:
                    with self.subTest(task=task[:20], directive=directive, constraint=constraint.id): self.assertNotIn(constraint.text, system)

    # Every scenario's prompt opens with the avatar's own brief, and never carries the participant's
    def test_each_prompt_opens_with_the_avatars_brief_and_never_shows_the_participants(self) -> None:
        for variant, scenario in PLANNING_SCENARIOS.items():
            with self.subTest(variant):
                system = build_messages(REPLY_TASK, scenario, initial_state(scenario), [], None)[0]["content"]
                self.assertTrue(system.startswith(scenario.avatar.brief))
                self.assertNotIn(scenario.participant.brief, system)

    # The participant's card carries their own brief and constraints, and nothing of the avatar's
    def test_the_card_carries_the_participants_brief_and_none_of_the_avatars_materials(self) -> None:
        for variant, scenario in PLANNING_SCENARIOS.items():
            with self.subTest(variant):
                card = card_frame(scenario, initial_state(scenario))["data"]
                self.assertEqual(card["brief"], scenario.participant.brief)
                self.assertNotIn(scenario.avatar.brief, json.dumps(card))
                for constraint in scenario.avatar.constraints: self.assertNotIn(constraint.text, json.dumps(card))

    # The instructions put a yes on the card at once, and read a slip against the ideas on the table
    def test_the_instructions_settle_on_a_yes_and_read_slips_against_the_ideas(self) -> None:
        system = build_messages(COMBINED_TASK, SCENARIO, initial_state(SCENARIO), [], None)[0]["content"]
        for text in ("it goes on the card right away, so never ask them to confirm it", "words that sound like one of those ideas"): self.assertIn(text, system)
        self.assertNotIn("ask_to_settle", system)

    # The plan block shows the avatar's own constraints, what is agreed, the ideas, and the refusals
    def test_the_plan_block_shows_each_items_state(self) -> None:
        state, _ = apply_changes(starter_settled(), [
            ("avatar", avatar_change(op="reveal",  constraint="broken_oven")),
            ("user",   user_change  (op="suggest", item="main", choice="lasagna")),
            ("avatar", avatar_change(op="reject",  item="main", choice="lasagna", reason="my oven is broken")),
            ("user",   user_change  (op="suggest", item="main", choice="stir fry")),
        ])
        block = plan_block(SCENARIO, state)
        self.assertIn("Your oven is broken. [id: broken_oven] (you have mentioned it)", block)
        self.assertIn("- Starter [id: starter]: agreed: breadsticks.", block)
        self.assertIn("Ideas: stir fry (user).", block)
        self.assertIn("Turned down: lasagna (by you: my oven is broken).", block)
        self.assertIn("- Nothing yet.", block)

    # The behaviors are the card's two looks and shared reactions with no hand (the card hides it),
    # each in the prompt, in planning's own words where it has them
    def test_the_behaviors_are_the_card_looks_and_shared_reactions(self) -> None:
        reactions = get_args(PlanningReaction)
        self.assertEqual(set(get_args(Behavior)), {*reactions, *get_args(CardBehavior)})
        self.assertLessEqual(set(reactions), set(REACTIONS))
        self.assertLessEqual(set(PLANNING_REACTION_WHEN), set(reactions))
        self.assertFalse({"giggle", "gasp"} & set(reactions))
        for name in get_args(Behavior): self.assertIn(f"  - {name}: ", BEHAVIOR_FIELD)
        self.assertIn(f"  - sorry: a sorry look, {PLANNING_REACTION_WHEN['sorry']}.", BEHAVIOR_FIELD)

    # A quiet user gets nudged about the first open item (a finished plan is read back by code instead)
    def test_a_quiet_user_is_nudged_about_the_first_open_item(self) -> None:
        self.assertIsNone(directive_for(every_item_settled(), nudge=True))
        self.assertIsNone(directive_for(starter_settled(), nudge=False))
        system = build_messages(REPLY_TASK, SCENARIO, starter_settled(), [], directive_for(starter_settled(), nudge=True))[0]["content"]
        self.assertIn("invite them to keep going with the main course", system)

    # The read-back lists the agreed choices in the card's order, and asks if they'd change anything
    def test_the_recap_reads_the_plan_back(self) -> None:
        self.assertEqual(recap_line(SCENARIO, every_item_settled()), "So that's breadsticks, pasta, and tiramisu. Anything you'd change?")

    # The reply check's notes name every idea on the table so far, the agreed ones marked
    def test_the_misheard_notes_list_the_ideas_on_the_table(self) -> None:
        self.assertIn("The ideas on the table so far: none yet.", misheard_notes(SCENARIO, initial_state(SCENARIO)))
        state, _ = apply_changes(starter_settled(), [("user", user_change(op="suggest", item="dessert", choice="ice cream"))])
        self.assertIn("The ideas on the table so far: starter: breadsticks (agreed); dessert: ice cream.", misheard_notes(SCENARIO, state))


# ================================================================================
# Pipelines
# ================================================================================
class PipelineTests(unittest.IsolatedAsyncioTestCase):
    # One turn after the opening line
    def setUp(self) -> None:
        self.turn = PlanningTurn(SCENARIO, MODELS, starter_settled(), [{"role": "user", "content": "How about pasta?"}], nudge=False)

    # The reply sees the plan with the user's changes already in it, and both sides' changes come back in order
    async def test_track_then_reply_replies_from_the_plan_the_users_changes_leave(self) -> None:
        api   = StubPlanningAPI(track=plan_update({"op": "suggest", "item": "main", "choice": "pasta"}),
                                reply=spoken_turn("Pasta sounds great!", {"op": "agree", "item": "main", "choice": "pasta"}, behavior="smile"))
        reply = await track_then_reply(api, self.turn)

        seen_state, directive = api.calls[1][1]
        self.assertEqual([idea.choice for idea in seen_state.items["main"].suggestions], ["pasta"])
        self.assertIsNone(directive)
        self.assertEqual([(by, change.op) for by, change in reply.changes], [("user", "suggest"), ("avatar", "agree")])
        self.assertEqual((reply.message, reply.behavior, reply.follow_up), ("Pasta sounds great!", "smile", None))

    # The user's yes to the read-back plan needs no reply call: the closing line ends the chat
    async def test_an_approved_plan_needs_no_reply_call(self) -> None:
        api   = StubPlanningAPI(track=plan_update({"op": "approve_plan"}))
        reply = await track_then_reply(api, replace(self.turn, state=every_item_settled("final_check")))
        self.assertEqual([name for name, _ in api.calls], ["track"])
        self.assertEqual(reply.message, SCENARIO.closing_line)

    # One call proposes the user's changes, then the avatar's
    async def test_single_call_proposes_both_sides_changes_in_order(self) -> None:
        combined = MODELS.combined_turn.model_validate({
            "basis": "b", "behavior": "nod", "about": "main", "message": "Pasta it is!",
            "user_changes"   : [{"op": "suggest", "item": "main", "choice": "pasta"}],
            "avatar_changes" : [{"op": "agree",   "item": "main", "choice": "pasta"}],
        })
        reply = await single_call(StubPlanningAPI(combined=combined), self.turn)
        self.assertEqual([(by, change.op) for by, change in reply.changes], [("user", "suggest"), ("avatar", "agree")])
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
    # A planning harness and the client its calls reach (cues on or off; no intro unless asked)
    def make(
        self,
        condition   : str  = "cues",              # The chat's condition
        pipeline    : str  = "track_then_reply",  # The pipeline that answers each turn
        intro       : bool = False,               # Open with the intro (left out where a test is about the planning)
        **responses : object,                     # Each stand-in call's response, by its name
    ) -> tuple[object, SimpleNamespace, StubPlanningAPI]:
        consumer = make_consumer()
        api      = StubPlanningAPI(**responses)
        for target, value in ((f"{HARNESS}.get_planning_api", Mock(return_value=api)), (f"{HARNESS}.PLANNING_PIPELINE", pipeline), (SYNTHESIZE_SOUNDS, AsyncMock(return_value=SOUNDS)), (GET_REPLY_CHECK, Mock(return_value=SimpleNamespace(check=AsyncMock(return_value=CHECK_DONE)))), (INTRO_SWITCH, ("cues", "no_cues") if intro else ())):
            started = patch(target, value)
            started.start()
            self.addCleanup(started.stop)
        return build_harness(consumer, "cooperative_planning", condition, None), consumer, api

    # With cues: settings (with the listening sound), picking up the card, the participant's card, then the avatar's own opening turn
    async def test_start_sets_the_avatar_up_shows_the_card_and_opens_the_chat(self) -> None:
        harness, consumer, _ = self.make()
        await harness.start()
        self.assertEqual(sent_types(consumer), ["avatar_setup", "avatar_plan", "task_card"])
        self.assertEqual(consumer.send_json.await_args_list[0].args[0]["data"]["sounds"], SOUNDS)
        self.assertEqual(consumer.send_json.await_args_list[1].args[0]["data"]["steps"][0]["prop"], {"hold": "card"})
        consumer.request_harness_turn.assert_called_once()

    # A likely misheard word gets the reply check's question instead, with a pondering look, and the plan stays as it was
    # (the reply worked out beside the check is dropped, with the change it proposed)
    async def test_a_misheard_word_gets_a_question_instead(self) -> None:
        harness, _, _ = self.make(track=plan_update({"op": "suggest", "item": "dessert", "choice": "tear a misu"}), reply=spoken_turn("Tear a misu? Sounds tasty."))
        question = "Sorry, did you say tiramisu?"
        verdict  = {"next_step": "clarify", "misheard": "tear a misu", "message": question}
        result   = check_model(tuple(PLANNING_SOUNDS), PlanningBackchannels.GESTURES, turn_end=True, misheard=True).model_validate({"basis": "b", "verdict": verdict})
        with patch(GET_REPLY_CHECK, Mock(return_value=SimpleNamespace(check=AsyncMock(return_value=result)))):
            with self.assertLogs(GATE_LOGGER, level="INFO"): outcome = await harness.generate(make_attempt("Let's have tear a misu for dessert."))
        self.assertEqual((outcome.message, outcome.behavior, outcome.state, outcome.results), (question, "curious", harness.state, ()))

    # Both checks run with cues, the misheard one knowing what is being planned; neither runs without cues
    async def test_the_reply_gate_checks_only_with_cues(self) -> None:
        cued, _, _  = self.make()
        plain, _, _ = self.make(condition="no_cues")
        self.assertEqual([check.on for check in cued.reply_gate.checks], [True, True])
        self.assertEqual([check.on for check in plain.reply_gate.checks], [False, False])
        for word in (SCENARIO.event, *(item.label.lower() for item in SCENARIO.items)): self.assertIn(word, cued.reply_gate.checks[1].notes)

        # ...and the ideas on the table as each check runs
        cued.state = starter_settled()
        self.assertIn("starter: breadsticks (agreed)", cued.reply_gate.checks[1].notes)

    # Without cues: the avatar only idles, so no plan goes out, but the participant still gets their card
    # (the setup still carries the sound, and every shared feature is there, switched off, for a command to switch on)
    async def test_without_cues_only_the_setup_and_the_card_go_out(self) -> None:
        harness, consumer, _ = self.make(condition="no_cues")
        await harness.start()
        self.assertEqual(sent_types(consumer), ["avatar_setup", "task_card"])
        self.assertEqual(consumer.send_json.await_args_list[0].args[0]["data"]["sounds"], SOUNDS)
        self.assertEqual([type(cue) for cue in harness.cues], [PlanningBackchannels])
        self.assertEqual({name: feature.on for name, feature in harness.features.items()}, {"backchannels": False, "turn_end": False, "misheard": False})

    # With the intro: what the scenario is first, then its first line once they're ready
    async def test_the_intro_opens_the_chat_then_the_scenarios_first_line(self) -> None:
        harness, consumer, api = self.make(intro=True)
        self.addCleanup(harness.stop)
        reading = SimpleNamespace(read=AsyncMock(return_value=IntroReading(basis="Done it before.", knows_task=True, next_step="start", answer=None)))
        with patch(GET_INTRO, Mock(return_value=reading)):
            opening = await harness.generate(TurnAttempt(context=[], user_text="", trigger="harness", publish_mood=AsyncMock(), publish_plan=AsyncMock()))
            harness.on_reply_saved(opening)
            with self.assertLogs(HARNESSES_LOGGER, level="INFO"): started = await harness.generate(make_attempt("Yes, I have."))
        await asyncio.sleep(0)

        self.assertEqual((opening.message, opening.behavior), (f"Hi! {SCENARIO.intro} {INTRO_QUESTION}", "smile"))
        self.assertEqual((started.message, started.state.intro), (f"Great, let's begin! {SCENARIO.start_line}", IntroState(stage="done", knew_task=True)))
        self.assertEqual(api.calls, [])
        self.assertNotIn("task_card", sent_types(consumer))  # The intro's progress alone doesn't send the card again

    # An answer to the intro that offers an idea goes to the planning, and the intro is over
    async def test_an_answer_with_an_idea_goes_to_the_planning(self) -> None:
        harness, _, _ = self.make(intro=True, track=plan_update({"op": "suggest", "item": "starter", "choice": "soup"}), reply=spoken_turn("Soup sounds nice."))
        harness.state = replace(harness.state, intro=IntroState(stage="asked"))
        reading       = SimpleNamespace(read=AsyncMock(return_value=IntroReading(basis="Offered an idea.", knows_task=None, next_step="task", answer=None)))
        with patch(GET_INTRO, Mock(return_value=reading)), self.assertLogs(HARNESSES_LOGGER, level="INFO"):
            outcome = await harness.generate(make_attempt("Sure. How about soup to start?"))

        self.assertEqual(outcome.message, "Soup sounds nice.")
        self.assertEqual(outcome.state.items["starter"].suggestions, (Suggestion("soup", "user"),))
        self.assertEqual((outcome.state.intro, outcome.task_snapshot["intro"]["finished"]), (IntroState(stage="done"), True))

    # The avatar's first turn says the scenario's opening line, with no LLM call
    async def test_the_opening_turn_says_the_scenarios_line(self) -> None:
        harness, _, api = self.make()
        opening = TurnAttempt(context=[], user_text="", trigger="harness", publish_mood=AsyncMock(), publish_plan=AsyncMock())
        outcome = await harness.generate(opening)
        self.assertEqual(outcome.message, SCENARIO.opening_line)
        self.assertEqual(api.calls, [])
        opening.publish_plan.assert_not_awaited()

    # Pondering lowers the card and looks away (Ponder), then back at the user before writing in
    def test_pondering_looks_away_then_back_at_the_user(self) -> None:
        steps = reply_plan(SCENARIO, 1, "ponder", None, ["main"])["steps"]
        self.assertEqual((steps[0]["prop"], steps[0]["gaze"], steps[0]["animation"]["name"]), ({"raise": 0}, "release", "Ponder"))
        self.assertEqual(steps[1]["gaze"]["on"], "user")
        self.assertEqual((steps[2]["start_on"], steps[2]["gaze"]["on"]), ("reply_end", "card"))

    # Each reply carries the plan for the behavior it picked, but only with cues
    async def test_a_reply_carries_its_behavior_plan_only_with_cues(self) -> None:
        responses = {"track": plan_update(), "reply": spoken_turn("Nice idea!", behavior="smile")}
        for condition, sends_plan in (("cues", True), ("no_cues", False)):
            with self.subTest(condition):
                harness, _, _ = self.make(condition, **responses)
                attempt = make_attempt("Maybe soup to start?")
                harness.on_reply_started(attempt)
                outcome = await harness.generate(attempt)
                self.assertEqual(outcome.behavior, "smile")
                self.assertEqual(outcome.avatar_plan is not None, sends_plan)
                self.assertEqual(attempt.publish_plan.await_count, int(sends_plan))
                if sends_plan: self.assertEqual(outcome.avatar_plan["id"], "t1-reply")

    # A saved reply that settles an item sends the new card; the plan writes the choice in after the reply
    async def test_a_saved_reply_that_changes_the_plan_sends_the_card(self) -> None:
        harness, consumer, _ = self.make(track=plan_update({"op": "suggest", "item": "starter", "choice": "soup"}),
                                         reply=spoken_turn("Soup it is!", {"op": "agree", "item": "starter", "choice": "soup"}, behavior="delighted"))
        outcome = await harness.generate(make_attempt("How about soup?"))
        self.assertEqual(harness.state.items["starter"].agreed, None)
        self.assertEqual(outcome.avatar_plan["steps"][-2]["gaze"]["on"], "card")

        harness.on_reply_saved(outcome)
        await asyncio.sleep(0)
        self.assertEqual(harness.state.items["starter"].agreed, "soup")
        self.assertEqual(consumer.send_json.await_args.args[0]["data"]["items"][0]["value"], "soup")

    # One call (the default): the last yes brings the read-back at once, and a yes to that ends the chat
    async def test_the_last_yes_reads_the_plan_back_and_the_next_yes_ends_the_chat(self) -> None:
        last_yes = combined_turn("Tiramisu it is!", user=({"op": "agree", "item": "dessert", "choice": "tiramisu"},), behavior="delighted")
        harness, _, api = self.make(pipeline="single_call", combined=last_yes)
        harness.state, _ = apply_changes(agreed_on(("starter", "breadsticks"), ("main", "pasta")), [("avatar", avatar_change(op="suggest", item="dessert", choice="tiramisu"))])

        read_back = await harness.generate(make_attempt("Sure, tiramisu."))
        self.assertEqual(read_back.message, "Tiramisu it is! So that's breadsticks, pasta, and tiramisu. Anything you'd change?")
        self.assertEqual((read_back.state.stage, read_back.close_after), ("final_check", False))

        harness.on_reply_saved(read_back)
        api.responses["combined"] = combined_turn("Great!", user=({"op": "approve_plan"},))
        goodbye = await harness.generate(make_attempt("No, that's perfect!"))
        self.assertEqual((goodbye.message, goodbye.close_after, goodbye.state.stage), (SCENARIO.closing_line, True, "approved"))

    # A change during the final check reopens it, and the reply reads the changed plan back
    async def test_a_change_during_the_final_check_reads_the_new_plan_back(self) -> None:
        change = combined_turn("Risotto works!", user=({"op": "suggest", "item": "main", "choice": "risotto"},), avatar=({"op": "agree", "item": "main", "choice": "risotto"},))
        harness, _, _ = self.make(pipeline="single_call", combined=change)
        harness.state = every_item_settled("final_check")
        outcome = await harness.generate(make_attempt("Could we do risotto instead of pasta?"))
        self.assertEqual(outcome.message, "Risotto works! So that's breadsticks, risotto, and tiramisu. Anything you'd change?")
        self.assertEqual(outcome.state.stage, "final_check")

    # The avatar's own turn with the plan finished (a nudge in the final check) reads it back, no call
    async def test_a_nudge_with_the_plan_finished_reads_it_back(self) -> None:
        harness, _, api = self.make()
        harness.state = every_item_settled("final_check")
        outcome = await harness.generate(make_attempt("", trigger="harness"))
        self.assertEqual((outcome.message, outcome.state.stage, api.calls), (recap_line(SCENARIO, harness.state), "final_check", []))

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

        consumer.session_id = 1
        save_snapshot = AsyncMock()
        with patch(f"{HARNESS}.db_s2a", return_value=save_snapshot):
            harness.on_reply_saved(outcome)
            await harness.generate(make_attempt("Or salad?"))
        save_snapshot.assert_awaited_once()
        self.assertEqual(save_snapshot.await_args.args[1]["items"][0]["state"]["suggestions"], [{"choice": "soup", "by": "user"}])
        self.assertEqual([s.choice for s in harness.state.items["starter"].suggestions], ["soup"])
        self.assertIn("task_card", sent_types(consumer))


# ================================================================================
# Cues
# ================================================================================
class CueTests(unittest.IsolatedAsyncioTestCase):
    # A harness with its cues (and no intro), and a connection that records what they send
    async def asyncSetUp(self) -> None:
        no_intro = patch(INTRO_SWITCH, ())
        no_intro.start()
        self.addCleanup(no_intro.stop)
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
        with patch(f"{HARNESS}.get_planning_api", Mock(return_value=StubPlanningAPI(combined=combined_turn("Soup sounds nice.")))):
            self.harness.on_reply_started(attempt)
            await self.harness.generate(attempt)
        thinking = attempt.publish_plan.await_args.args[0]
        self.assertEqual((thinking["id"], thinking["steps"][0]["state"]), ("t1-think", "thinking"))

        self.harness.on_reply_cancelled(attempt, saved=False)
        await asyncio.sleep(0)
        plan = self.consumer.send_json.await_args.args[0]["data"]
        self.assertEqual((plan["id"], plan["steps"][0]["state"]), ("t1-listen", "listening"))
