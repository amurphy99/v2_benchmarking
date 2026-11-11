"""Generate against an attempt-local state. The harness commits it after saving."""
import logging
import time
from dataclasses import asdict

from langchain_core.messages import AIMessage, HumanMessage

from .history import ChatState, clean_llm_response
from .runtime import assess_goals, choose_transition, Transition
from .state_specs import CLOSE_SESSION_STATE, STATE_SPECS

logger = logging.getLogger(__name__)

FALLBACK_REPLY = "Sorry, could you say that again?"


async def generate_turn(
    *,
    definition,
    rag_state,
    user_text,
    known_name,
    planner,
    responder,
):
    """Plan and draft one reply, updating only the supplied attempt-local state.

    Args:
        definition (list[dict]): Ordered database rows with state names and instructions.
        rag_state (dict): Deep-copied dialogue ledger; histories, goals, counters,
            planner memory, and closing flags are updated in place.
        user_text (str): Finalized user utterance represented by this attempt.
        known_name (str): Account first name, or an empty string if unavailable.
        planner (PlannerAgent): Generates structured goal evidence and reply guidance.
        responder (ResponseAgent): Drafts text for the current state using that guidance.

    Returns:
        tuple[str, dict]: Cleaned reply and turn-log fields, including state before/
        after, prospective saved-reply count, timing, and agents_data diagnostics.

    The harness adopts these changes only after the exchange is saved. Planner
    failure uses fallback guidance; responder failure preserves prior goals,
    state, and planner memory but still prepares a reply-count increment.
    """
    started = time.monotonic()

    current = rag_state["current_scenario"]
    names = [row["name"] for row in definition]
    index = names.index(current)
    row = definition[index]
    spec = STATE_SPECS[current]

    next_state = (
        names[index + 1]
        if index + 1 < len(names)
        else CLOSE_SESSION_STATE
    )

    turn_index = rag_state.get("_turn_index", 0) + 1
    turns = rag_state.get("_same_state_turn_count", 0) + 1
    history = rag_state.get("_history", [])

    user_message = {
        "id": f"{turn_index}:user",
        "role": "user",
        "text": user_text,
        "state": current,
    }

    progress = rag_state.get("_goal_progress", {}).get(current, {})
    observations = [
        item for item in history if item["state"] == current
    ] + [user_message]

    payload = {
        "CURRENT_STATE": current,
        "ALLOWED_NEXT_STATE": next_state,
        "CURRENT_USER_TEXT": user_text,
        "KNOWN_NAME": known_name,
        "instructions": row["instructions"],
        "goals": [asdict(goal) for goal in spec.goals],
        "saved_turns": turns - 1,
        "turns_after_this_reply": turns,
        "min_turns": spec.min_turns,
        "max_turns": spec.max_turns,
        "progress": progress,
        "observations": observations,
        "working_memory": rag_state.get("planner_memory", {}),
        "recent_context": history[-20:],
    }

    plan = {
        "acknowledge": "Acknowledge the user's latest contribution.",
        "answer": "Answer any direct question.",
        "required_content": [],
        "follow_up": "Ask one gentle question about an unfinished goal.",
        "target_goal_ids": [
            goal.id for goal in spec.goals if goal.id not in progress
        ],
        "avoid_repeating": [],
        "next_state": current,
        "transition_reason": "continue",
        "exit_quote": "",
        "evidence": [],
        "updated_memory": rag_state.get("planner_memory", {}),
    }

    planner_error = False
    planner_usage = None
    planner_started = time.monotonic()

    try:
        result = await planner.generate(payload)
        plan = result.model_dump()
        planner_usage = getattr(
            getattr(result, "_raw_response", None),
            "usage",
            None,
        )
    except Exception:
        planner_error = True
        logger.exception(
            "Activity planner failed; responding from current state goals."
        )

    planner_ms = int((time.monotonic() - planner_started) * 1000)

    proposed_progress = assess_goals(
        spec,
        progress,
        observations,
        plan["evidence"],
    )

    transition = choose_transition(
        current=current,
        next_state=next_state,
        spec=spec,
        progress=proposed_progress,
        turns=turns,
        plan=plan,
        user_text=user_text,
    )

    target_ids = {goal.id for goal in spec.goals} - proposed_progress.keys()
    plan["target_goal_ids"] = [
        goal for goal in plan["target_goal_ids"] if goal in target_ids
    ]

    response_plan = {
        key: plan[key]
        for key in (
            "acknowledge",
            "answer",
            "required_content",
            "follow_up",
            "target_goal_ids",
            "avoid_repeating",
        )
    }

    response_error = False
    response_usage = None
    response_started = time.monotonic()

    try:
        raw_text, response_usage = await responder.generate(
            {
                "CURRENT_STATE": current,
                "instructions": row["instructions"],
                "KNOWN_NAME": known_name,
                "goals": [asdict(goal) for goal in spec.goals],
                "goal_progress": proposed_progress,
                "RESPONSE_PLAN": response_plan,
            },
            history[-20:] + [user_message],
        )

        text = clean_llm_response(raw_text).strip()

        if not text:
            raise ValueError("The cleaned response was empty.")

    except Exception:
        response_error = True
        logger.exception(
            "Activity response failed; preserving current state and goals."
        )
        text = FALLBACK_REPLY
        transition = Transition(current, "response_failed")
        proposed_progress = dict(progress)

    response_ms = int((time.monotonic() - response_started) * 1000)

    # All changes below affect only this attempt's copy; cancellation discards it.
    rag_state["_history"] = history + [
        user_message,
        {
            "id": f"{turn_index}:assistant",
            "role": "assistant",
            "text": text,
            "state": current,
        },
    ]

    chat_state = (
        rag_state.get("_chat_state")
        or ChatState(current_scenario=current)
    )

    if chat_state.current_scenario != current:
        chat_state.transition_to(current)

    chat_state.add_message(HumanMessage(content=user_text), scenario=current)
    chat_state.add_message(AIMessage(content=text), scenario=current)
    rag_state["_chat_state"] = chat_state

    rag_state.setdefault("_goal_progress", {})[current] = proposed_progress

    if not response_error:
        rag_state["planner_memory"] = plan["updated_memory"]

    if transition.target != current:
        for goal_id in transition.skipped_goals:
            proposed_progress[goal_id] = {
                "status": "skipped",
                "reason": transition.reason,
            }

        rag_state.setdefault("_state_exits", []).append({
            "state": current,
            "target": transition.target,
            "reason": transition.reason,
            "turn_index": turn_index,
            "skipped_goals": list(transition.skipped_goals),
        })

        if not transition.skipped_goals:
            rag_state.setdefault("_completed_states", set()).add(current)

    rag_state["current_scenario"] = transition.target
    rag_state["_same_state_turn_count"] = (
        turns if transition.target == current else 0
    )
    rag_state["_turn_index"] = turn_index

    if transition.target == CLOSE_SESSION_STATE:
        rag_state["_closing_flow_active"] = True

    agents_data = {
        "planner_error": planner_error,
        "planner_output": plan,
        "planner_latency_ms": planner_ms,
        "responder_latency_ms": response_ms,
        "responder_error": response_error,
        "transition": asdict(transition),
        "goal_progress": proposed_progress,
    }

    for prefix, usage in (
        ("responder", response_usage),
        ("planner", planner_usage),
    ):
        for key in ("prompt_tokens", "completion_tokens", "total_tokens"):
            value = getattr(usage, key, None)

            if value is not None:
                agents_data[f"{prefix}_{key}"] = value

    return text, {
        "turn_index": turn_index,
        "user_text_length": len(user_text),
        "state_before": current,
        "state_after": transition.target,
        "same_state_turn_count": turns,
        "forced_state_transition": transition.reason == "turn_limit",
        "total_latency_ms": int((time.monotonic() - started) * 1000),
        "agents_data": agents_data,
    }
