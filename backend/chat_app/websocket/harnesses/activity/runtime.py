"""Deterministic goal-evidence and transition validation; no LLM or DB imports."""
from dataclasses import dataclass

from .state_specs import CLOSE_SESSION_STATE, StateSpec


def normalize(text: str) -> str:
    return " ".join(text.casefold().split())


def assess_goals(
    spec: StateSpec,
    progress: dict,
    observations: list[dict],
    evidence: list[dict],
) -> dict:
    result = dict(progress)
    goals = {goal.id: goal for goal in spec.goals}
    messages = {item["id"]: item for item in observations}

    for item in evidence:
        goal = goals.get(item["goal_id"])
        message = messages.get(item["message_id"])
        quote = normalize(item["quote"])

        if goal is None or message is None or message["role"] != goal.actor:
            continue

        if not quote or quote not in normalize(message["text"]):
            continue

        result[goal.id] = {
            "status": "satisfied",
            "message_id": message["id"],
            "quote": item["quote"],
        }

    return result


@dataclass(frozen=True)
class Transition:
    target: str
    reason: str
    skipped_goals: tuple[str, ...] = ()


def choose_transition(
    *,
    current: str,
    next_state: str,
    spec: StateSpec,
    progress: dict,
    turns: int,
    plan: dict,
    user_text: str,
) -> Transition:
    missing = tuple(
        goal.id
        for goal in spec.goals
        if progress.get(goal.id, {}).get("status") != "satisfied"
    )

    quote = normalize(plan.get("exit_quote", ""))
    grounded_exit = bool(quote and quote in normalize(user_text))
    reason = plan["transition_reason"]

    if grounded_exit and reason == "user_requested_end":
        return Transition(CLOSE_SESSION_STATE, reason, missing)

    if grounded_exit and reason == "user_declined_state":
        return Transition(next_state, reason, missing)

    if (
        not missing
        and turns >= spec.min_turns
        and plan["next_state"] == next_state
    ):
        return Transition(next_state, "goals_met")

    if turns >= spec.max_turns:
        return Transition(next_state, "turn_limit", missing)

    return Transition(current, "continue")