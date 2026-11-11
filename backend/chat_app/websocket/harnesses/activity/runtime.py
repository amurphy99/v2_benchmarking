"""Deterministic goal-evidence and transition validation; no LLM or DB imports."""
from dataclasses import dataclass

from .state_specs import CLOSE_SESSION_STATE, StateSpec


def normalize(text: str) -> str:
    """Return str text case-folded with whitespace collapsed; keep punctuation."""
    return " ".join(text.casefold().split())


def assess_goals(
    spec: StateSpec,
    progress: dict,
    observations: list[dict],
    evidence: list[dict],
) -> dict:
    """Return a copied goal ledger extended with textually grounded evidence.

    Args:
        spec (StateSpec): Required goal IDs and the actor responsible for each.
        progress (dict): Existing goal-ID to status/evidence mapping for this state.
        observations (list[dict]): Messages with id, role, and text, supplied by
            the caller from saved history plus the current user message.
        evidence (list[dict]): Planner claims with goal_id, message_id, and quote.

    Returns:
        dict: Prior progress plus accepted claims marked satisfied. Invalid IDs,
        actor mismatches, and quotes absent after normalization are ignored.

    Inputs are not mutated. Matching a quote does not verify semantic fulfillment.
    """
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
    """Describe a validated proposal; constructing it does not commit state.

    Attributes:
        target (str): State to enter after saving, or the current state to stay.
        reason (str): Runtime decision such as continue, goals_met, or turn_limit.
        skipped_goals (tuple[str, ...]): Unmet goals left behind on an exit.
    """

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
    """Choose an exit or continued state using grounded evidence and reply limits.

    Args:
        current (str): State being answered.
        next_state (str): Ordered successor from the database, or close_session.
        spec (StateSpec): Required goals and minimum/maximum saved-reply counts.
        progress (dict): Current state's validated goal-ID to status mapping.
        turns (int): Replies in this state including the reply being proposed.
        plan (dict): Planner's requested next_state, transition_reason, and exit_quote.
        user_text (str): Current finalized utterance used to ground explicit exits.

    Returns:
        Transition: Grounded user exits take priority; otherwise advance on goals
        plus minimum replies and an allowed proposal, force exit at the maximum,
        or stay. Skipped goals remain distinct from satisfied goals.

    This function neither mutates inputs nor commits the prospective reply count.
    """
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