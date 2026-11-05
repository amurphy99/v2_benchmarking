import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from chat_app.websocket.harnesses.activity.harness import ActivityHarness
from chat_app.websocket.harnesses.activity.pipeline import generate_turn
from chat_app.websocket.harnesses.activity.runtime import (
    assess_goals,
    choose_transition,
)
from chat_app.websocket.harnesses.activity.state_specs import GoalSpec, StateSpec

HARNESS_MODULE = "chat_app.websocket.harnesses.activity.harness"


class GoalTests(unittest.TestCase):
    def setUp(self):
        self.spec = StateSpec((
            GoalSpec("ask", "Ask about interests", "assistant"),
        ), 2, 4)

        self.observations = [{
            "id": "1:assistant",
            "role": "assistant",
            "text": "What do you enjoy?",
        }]

        self.plan = {
            "next_state": "next",
            "transition_reason": "goals_met",
            "exit_quote": "",
        }

    def transition(self, progress=None, turns=2, user_text="Hello"):
        return choose_transition(
            current="current",
            next_state="next",
            spec=self.spec,
            progress=progress or {},
            turns=turns,
            plan=self.plan,
            user_text=user_text,
        )

    def test_evidence_requires_matching_actor_and_exact_quote(self):
        evidence = [{
            "goal_id": "ask",
            "message_id": "1:assistant",
            "quote": "What do you enjoy?",
        }]

        self.assertIn(
            "ask",
            assess_goals(self.spec, {}, self.observations, evidence),
        )

        evidence[0]["quote"] = "I asked about interests"
        self.assertEqual(
            assess_goals(self.spec, {}, self.observations, evidence),
            {},
        )

        self.observations[0]["role"] = "user"
        evidence[0]["quote"] = "What do you enjoy?"
        self.assertEqual(
            assess_goals(self.spec, {}, self.observations, evidence),
            {},
        )

    def test_missing_goals_block_normal_transition(self):
        self.assertEqual(self.transition().target, "current")

    def test_minimum_turns_still_apply_when_goals_are_met(self):
        progress = {"ask": {"status": "satisfied"}}
        self.assertEqual(self.transition(progress, turns=1).target, "current")
        self.assertEqual(self.transition(progress, turns=2).target, "next")

    def test_turn_limit_records_unmet_goals(self):
        result = self.transition(turns=4)
        self.assertEqual(
            (result.target, result.reason, result.skipped_goals),
            ("next", "turn_limit", ("ask",)),
        )

    def test_unknown_target_cannot_skip_states(self):
        self.plan["next_state"] = "invented"
        self.assertEqual(
            self.transition({"ask": {"status": "satisfied"}}).target,
            "current",
        )

    def test_user_exit_requires_grounding_in_current_user_text(self):
        self.plan.update(
            transition_reason="user_requested_end",
            exit_quote="Please end the chat",
        )

        self.assertEqual(self.transition().target, "current")
        self.assertEqual(
            self.transition(user_text="Please end the chat").target,
            "close_session",
        )


class AttemptTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        consumer = SimpleNamespace(
            user=SimpleNamespace(id=1, first_name="Sam"),
            session_id=1,
        )

        self.harness = ActivityHarness(consumer, condition="", variant="")
        self.harness.definition = []

        self.attempt = SimpleNamespace(
            context=[("user", "Hello", 0.0)],
            user_text="Hello",
        )

    async def test_state_changes_only_when_reply_is_saved(self):
        async def generate(**kwargs):
            kwargs["rag_state"]["current_scenario"] = "next"
            return "Hello", None

        with patch(f"{HARNESS_MODULE}.generate_turn", new=generate):
            outcome = await self.harness.generate(self.attempt)

        self.assertEqual(
            self.harness.rag_state["current_scenario"],
            "start_conversation",
        )

        self.harness.on_reply_saved(outcome)

        self.assertEqual(
            self.harness.rag_state["current_scenario"],
            "next",
        )

    async def test_cancellation_discards_nested_changes(self):
        self.harness.rag_state["nested"] = {"evidence": []}
        entered = asyncio.Event()

        async def generate(**kwargs):
            kwargs["rag_state"]["nested"]["evidence"].append("uncommitted")
            entered.set()
            await asyncio.Event().wait()

        with patch(f"{HARNESS_MODULE}.generate_turn", new=generate):
            task = asyncio.create_task(self.harness.generate(self.attempt))
            await entered.wait()
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)

        self.assertEqual(
            self.harness.rag_state["nested"]["evidence"],
            [],
        )

    async def test_closing_flags_also_wait_for_save(self):
        self.harness.rag_state["_closing_flow_active"] = True

        async def closing(**kwargs):
            kwargs["rag_state"]["awaiting_summary_choice"] = True
            return "Would you like a summary?", False

        with patch(f"{HARNESS_MODULE}.handle_closing_turn", new=closing):
            outcome = await self.harness.generate(self.attempt)

        self.assertNotIn(
            "awaiting_summary_choice",
            self.harness.rag_state,
        )

        self.harness.on_reply_saved(outcome)
        self.assertTrue(
            self.harness.rag_state["awaiting_summary_choice"],
        )


class PipelineFailureTests(unittest.IsolatedAsyncioTestCase):
    async def test_response_failure_does_not_advance_or_apply_planner_memory(self):
        state = {
            "current_scenario": "imaginative_discussion",
            "_same_state_turn_count": 3,
        }

        planner = SimpleNamespace(
            generate=AsyncMock(
                side_effect=RuntimeError("planner unavailable"),
            ),
        )
        responder = SimpleNamespace(
            generate=AsyncMock(
                side_effect=RuntimeError("response unavailable"),
            ),
        )

        text, log = await generate_turn(
            definition=[{
                "name": "imaginative_discussion",
                "instructions": "Imagine together",
            }],
            rag_state=state,
            user_text="A flying car",
            known_name="",
            planner=planner,
            responder=responder,
        )

        self.assertTrue(text)
        self.assertEqual(
            state["current_scenario"],
            "imaginative_discussion",
        )
        self.assertNotIn("planner_memory", state)
        self.assertFalse(log["forced_state_transition"])

    async def test_planner_failure_still_allows_a_response(self):
        state = {"current_scenario": "imaginative_discussion"}

        planner = SimpleNamespace(
            generate=AsyncMock(
                side_effect=RuntimeError("planner unavailable"),
            ),
        )
        responder = SimpleNamespace(
            generate=AsyncMock(return_value=(
                "What would your flying car look like?",
                None,
            )),
        )

        text, log = await generate_turn(
            definition=[{
                "name": "imaginative_discussion",
                "instructions": "Imagine together",
            }],
            rag_state=state,
            user_text="A flying car",
            known_name="",
            planner=planner,
            responder=responder,
        )

        self.assertEqual(text, "What would your flying car look like?")
        self.assertTrue(log["agents_data"]["planner_error"])
        self.assertEqual(state["_same_state_turn_count"], 1)