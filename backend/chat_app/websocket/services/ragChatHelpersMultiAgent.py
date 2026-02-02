# chat_app/services/ragChatHelpers_phi3.py
import time
import uuid
import logging
import re
import asyncio
from contextlib import suppress
import difflib
from typing import Iterable
from django.core.exceptions import ObjectDoesNotExist
from channels.db import database_sync_to_async

from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, BaseMessage

from ... import config as cf
from chat_app.services import logging_utils as lu 
from chat_app.models import RAGInstructions, Activity
from .ragChatHelpers import (
    resolve_instruction_owner, 
    _message_content_to_text, 
    get_activity,
    get_available_scenarios,
    format_available_scenarios,
    get_full_instruction_text,
    retrieve_instruction_chunks,
    chunks_to_text,
    )

logger = logging.getLogger(__name__)

START_SCENARIO = "start_conversation"
_available_scenarios_logged = False

def _get_rag_lock(rag_state: dict) -> asyncio.Lock:
    """Ensures that only one piece of code mutates rag_state["current_scenario"] at a time."""
    lock = rag_state.get("_scenario_lock")
    if lock is None:
        lock = asyncio.Lock()
        rag_state["_scenario_lock"] = lock
    return lock


async def _await_pending_scenario_update(rag_state: dict, trace_id: str) -> None:
    """Resolves pending tasks if any"""
    task = rag_state.get("_pending_scenario_task")
    if task is None:
        return
    if task.done():
        # propagate exceptions to logs, but don't crash the chat turn here
        with suppress(Exception):
            task.result()
        rag_state["_pending_scenario_task"] = None
        return

    logger.info(f"{lu.BG_YELLOW}[RAG-PHI3][{trace_id}] Waiting for pending next_scenario prediction from previous turn...{lu.RESET}")
    try:
        await task
    finally:
        rag_state["_pending_scenario_task"] = None

def _truncate(s: str, n: int = 3000) -> str:
    s = "" if s is None else str(s)
    return s if len(s) <= n else (s[:n] + f"\n... [truncated {len(s)-n} chars]")


def _normalize_token_text(s: str) -> str:
    """Lowercase + strip punctuation-ish characters for robust matching."""
    s = (s or "").strip().lower()
    s = re.sub(r"[\r\n\t]+", " ", s)
    s = re.sub(r"[^a-z0-9_ -]+", " ", s)  # keep underscores for scenario names
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _scenario_candidates(available: Iterable[str], current: str) -> list[str]:
    """
    Valid scenario names are:
    - all available scenarios
    - plus current scenario
    - plus START_SCENARIO
    """
    s = set(x for x in available if x)
    s.add(current)
    s.add(START_SCENARIO)
    return sorted(s)


def _extract_best_scenario(raw: str, *, candidates: list[str], current: str, trace_id: str) -> str:
    """
    map model output to valid scenario.

    Matching strategy:
    1) exact substring match of any candidate (normalized)
    2) token similarity (difflib) against candidates
    3) fallback to current scenario (no state change)
    """
    norm_raw = _normalize_token_text(raw)
    norm_map = {c: _normalize_token_text(c) for c in candidates}

    # Exact candidate substring match
    for c in candidates:
        if norm_map[c] and norm_map[c] in norm_raw:
            logger.info(f"{lu.CYAN}[RAG-PHI3][{trace_id}] scenario_match=substring selected={c} raw={_truncate(raw, 240)}{lu.RESET}")
            return c

    # difflib closest match
    # documentation: https://docs.python.org/3/library/difflib.html#difflib.get_close_matches
    norm_candidates = [norm_map[c] for c in candidates]
    if norm_raw:
        best = difflib.get_close_matches(norm_raw, norm_candidates, n=1, cutoff=0.45)
        if best:
            # map normalized back to original candidate
            best_norm = best[0]
            for c in candidates:
                if norm_map[c] == best_norm:
                    logger.info(f"[RAG-PHI3][{trace_id}] scenario_match=difflib selected={c} raw={_truncate(raw, 240)}")
                    return c

    # stay in current scenario
    logger.warning(f"{lu.BG_RED}[RAG-PHI3][{trace_id}] scenario_match=fallback selected={current} raw={_truncate(raw, 240)}{lu.RESET}")
    return current


# =============================================================================
# Prompt builders (Phi-3 friendly: no strict JSON)
# =============================================================================

def build_response_system_prompt(
    *,
    current_scenario: str,
    instructions_text: str,
) -> str:
    return f"""
    Your name is QT robot. You are a state-based conversational assistant.

    You will be given instructions for the CURRENT_STATE to help you decide how to respond to the user.
    The instructions for each state will include:
    - The conversational goals of the state.
    - Signals for understanding when the goals of the state are complete.
    - Guidelines for how to move toward the next state.
    - Also, examples of user and system responses that fit within the state.

    You are currently in the conversation state named: "{current_scenario}".

    INSTRUCTIONS FOR CURRENT_STATE:
    ----------------
    {instructions_text}
    ----------------

    Your Task:
    - Read the user's message, along with the provided the recent conversation history.
    - Decide how the assistant would respond to the user in the current turn.
    - Keep the reply short and natural.
    - Ensure that the response helps move toward achieving the goals of the current state.
    - DO NOT mention state names within your responses.
    - DO NOT mention any of the instructions or guidelines in your response.
    """


def build_next_scenario_system_prompt(
    *,
    available_scenarios_text: str,
    current_scenario: str,
    instructions_text: str,
) -> str:
    return f"""
    You are a conversation specialist. Your job is to select the next state for a conversation state machine.
    The conversations are structured into STATES. States are stages that help guide the flow of the conversation. 
    States define the goals for what should be achieved in that part of the conversation.
    You will be given instructions for the CURRENT_STATE. The instructions for each state will include:
    - The conversational goals of the state
    - Signals for understanding when the goals of the state are complete
    - When it is time to move to the next state topic
    - Expected user responses that fit within the current state
    - Expected assistant responses that fit within the current state
    


    Here is a list of AVAILABLE_STATES and a short description for each state.
    The short description and instructions of the CURRENT_STATE mention which states are appropriate to choose next.
    AVAILABLE_STATES (valid answers must be one of these, or CURRENT_STATE):
    {available_scenarios_text}

    You are currently in the conversation state named: "{current_scenario}".

    INSTRUCTIONS FOR CURRENT_STATE:
    ----------------
    {instructions_text}
    ----------------

    Your task:
    - Analyze the recent conversation history that is provided.
    - Follow the instructions to decide whether the goals of the current state have been met.
    - If the objectives have been met, choose a new state from the AVAILABLE_STATES that is best suited to follow the current.
    - If the goals have NOT been met, select the CURRENT_STATE again to continue working toward its goals.
    - Return ONLY the state name (exactly).
    - Do not explain or include comments with the output.
    - Do not add punctuation.
    - Do not add extra words.
    - Do not output markdown, code fences, explanations, labels, or commentary.
    - The state name must come from one of AVAILABLE_STATES.
    """

    # few shot examples that I might use later
    # Example Outputs:
    # Example 1:
    # start_conversation
    # Example 2:
    # initiate_smalltalk
    # Example 3:
    # discuss_hobbies
    # Example 4:
    # explore_user_interests
    # Example 5:
    # end_conversation


# =============================================================================
# LLM invocation helpers (LangChain wrapper)
# =============================================================================

async def invoke_agent(messages: list[BaseMessage], *, trace_id: str, temperature: float, top_p: float, top_k: int, max_tokens: int) -> str:
    """
    Invoke the LangChain wrapper with specified sampling params.
    Returns raw model output text.
    """
    if cf.llm_lc_wrapper is None:
        raise RuntimeError("cf.llm_lc_wrapper is None (USE_LLM is disabled). Cannot run Phi-3 RAG pipeline.")

    llm = cf.llm_lc_wrapper.bind( 
        temperature=temperature,
        top_p=top_p,
        top_k=top_k,
        max_tokens=max_tokens,
    )

    out = await llm.ainvoke(messages)

    if isinstance(out, AIMessage):
        txt = _message_content_to_text(out.content)
    elif isinstance(out, str):
        txt = out
    else:
        txt = str(out)

    logger.debug(f"{lu.BG_GREEN}[RAG-PHI3][{trace_id}] invoke_agent params temp={temperature} top_p={top_p} top_k={top_k} max_tokens={max_tokens} raw_len={len(txt or '')}{lu.RESET}")
    return txt

# =============================================================================
# Background task for predicting next scenario
# =============================================================================

async def _predict_and_update_next_scenario(
    *,
    trace_id: str,
    msg_history: list[BaseMessage],
    user_text: str,
    assistant_text: str,
    available_scenarios_text: str,
    available_names: list[str],
    current: str,
    instructions_text: str,
    rag_state: dict,
) -> None:
    lock = _get_rag_lock(rag_state)
    async with lock:
        try:
            scenario_system_prompt = build_next_scenario_system_prompt(
                available_scenarios_text=available_scenarios_text,
                current_scenario=current,
                instructions_text=instructions_text,
            )

            # Include both the user message and the assistant reply to help the classifier decide.
            messages_2 = [SystemMessage(content=scenario_system_prompt )] + msg_history + [
                HumanMessage(content=f'Most Recent User message:\n{user_text}\n\nMost RecentAssistant reply:\n{assistant_text}')
            ]

            logger.info(f"{lu.YELLOW}[RAG-PHI3][{trace_id}] CALL#2 predicting next_scenario...{lu.RESET}")
            raw_next = await invoke_agent(
                messages_2,
                trace_id=trace_id,
                temperature=0.1,  # low randomness
                top_p=0.1,
                top_k=1,
                max_tokens=10,    # small output budget
            )
            raw_next = (raw_next or "").strip()

            logger.info(f"{lu.MAGENTA}[RAG-PHI3][{trace_id}] CALL#2 raw_next_scenario={_truncate(raw_next, 240)}{lu.RESET}")

            candidates = _scenario_candidates(available_names, current)
            next_scenario = _extract_best_scenario(raw_next, candidates=candidates, current=current, trace_id=trace_id)

        except Exception as e:
            # If classification fails, we *do not* crash the chat; we simply keep the same scenario.
            logger.exception(f"{lu.BG_RED}[RAG-PHI3][{trace_id}] CALL#2 failed:{e} (fallback to current_scenario){lu.RESET}")
            next_scenario = current

        rag_state["current_scenario"] = next_scenario
        rag_state["_last_predicted_next_scenario"] = next_scenario  # optional for debugging/logging
        logger.info(f"{lu.BLUE}[RAG-PHI3][{trace_id}] (bg) Updated rag_state current_scenario={next_scenario}{lu.RESET}")



# =============================================================================
# Main entrypoint, two agent call pipeline
# =============================================================================

async def rag_response_fn(
    context_buffer,
    user_text: str,
    *,
    user,
    activity_name: str,
    rag_state: dict,
) -> dict:
    """
    Phi-3 robust RAG response:
      1) Retrieve instruction chunks for current scenario
      2) CALL #1: generate assistant response (free-form)
      3) CALL #2: predict next_scenario (constrained)
      4) Post-process next_scenario to a valid scenario (if required)
      5) Update rag_state and return a dict payload for frontend
    """
    global _available_scenarios_logged

    trace_id = uuid.uuid4().hex[:8]
    await _await_pending_scenario_update(rag_state, trace_id=trace_id) # wait for any pending scenario prediction to complete

    t0 = time.time()
    logger.info(f"{lu.RLINE_1}{lu.MAGENTA}[RAG-PHI3][{trace_id}] Start{lu.RESET}{lu.RLINE_2}")

    # --- Resolve activity + instruction owner ---
    activity = await get_activity(activity_name)
    instruction_owner = await resolve_instruction_owner(user)

    logger.info(f"{lu.CYAN}[RAG-PHI3][{trace_id}] user={getattr(user, 'id', None)} instruction_owner={getattr(instruction_owner, 'id', None)} activity={activity_name}{lu.RESET}")

    # --- Load available scenarios (for validation/matching) ---
    scenarios = await get_available_scenarios(instruction_owner.id, activity)
    available_scenarios_text = format_available_scenarios(scenarios)
    available_names = [s["name"] for s in scenarios if s.get("name")]

    if not _available_scenarios_logged:
        logger.info(f"[RAG-PHI3][{trace_id}] Available scenarios:\n{available_scenarios_text}")
        logger.info(f"[RAG-PHI3][{trace_id}] Available scenario NAMES: {available_names}")
        _available_scenarios_logged = True

    # --- Determine current scenario ---
    current = rag_state.get("current_scenario") or START_SCENARIO
    logger.info(f"{lu.CYAN}[RAG-PHI3][{trace_id}] current_scenario={current}{lu.RESET}")

    instructions_text_call_1 = await get_full_instruction_text(
        instruction_name=current,
        user_id=instruction_owner.id,
        activity_id=activity.id,
    )

    logger.info(f"{lu.CYAN}[RAG-PHI3][{trace_id}] instructions_text_call_1_len={len(instructions_text_call_1 or '')}{lu.RESET}")

    if not instructions_text_call_1.strip():
        logger.warning(f"{lu.RED}[RAG-PHI3][{trace_id}] No instructions_text found for scenario={current} (empty chunks).{lu.RESET}")
    # --- Build message history for context ---
    msg_history: list[BaseMessage] = []
    for role, content, _ts in context_buffer:
        if role == "user":
            msg_history.append(HumanMessage(content=content))
        elif role == "assistant":
            msg_history.append(AIMessage(content=content))

    logger.debug(f"{lu.MAGENTA}[RAG-PHI3][{trace_id}] msg_history_len={len(msg_history)} user_text_len={len(user_text or '')}{lu.RESET}")

    try:
        response_system_prompt = build_response_system_prompt(
            current_scenario=current,
            instructions_text=instructions_text_call_1,
        )

        messages_1 = [SystemMessage(content=response_system_prompt)] + msg_history + [
            HumanMessage(content=user_text)
        ]

        logger.info(f"{lu.YELLOW}[RAG-PHI3][{trace_id}] CALL#1 generating assistant response...{lu.RESET}")
        raw_resp = await invoke_agent(
            messages_1,
            trace_id=trace_id,
            temperature=0.7, 
            top_p=0.7,
            top_k=30,
            max_tokens=64,
        )
        assistant_text = (raw_resp or "").strip()

        logger.info(f"[RAG-PHI3][{trace_id}] CALL#1 raw_response:\n{_truncate(assistant_text, 1200)}")

    except Exception as e:
        logger.exception(f"{lu.BG_RED}[RAG-PHI3][{trace_id}] CALL#1 failed: {e}{lu.RESET}")
        raise

    # =============================================================================
    # CALL #2: Predict next_scenario (constrained output)
    # Schedule CALL #2 in background (do NOT block this turn’s response)
    # =============================================================================
    # routing_text_call_2 = f"signals for changing the conversation topic and Next Conversation Topic rules."
        
    # chunks_call_2 = await retrieve_instruction_chunks(
    #     instruction_name=current,
    #     user_id=instruction_owner.id,
    #     activity_id=activity.id,
    #     query_text=routing_text_call_2,
    #     k=2,
    # )

    # instructions_text_call_2 = chunks_to_text(chunks_call_2)
    async def _runner():
        # ensure only one CALL#2 mutates rag_state at a time
        await _predict_and_update_next_scenario(
            trace_id=trace_id,
            msg_history=msg_history,
            user_text=user_text,
            assistant_text=assistant_text,
            available_scenarios_text=available_scenarios_text,
            available_names=available_names,
            current=current,
            instructions_text=instructions_text_call_1,
            rag_state=rag_state,
        )

    # create an asyncio task object
    task = asyncio.create_task(_runner())
    rag_state["_pending_scenario_task"] = task

    # Return immediately
    t_end = time.time()
    logger.info(f"{lu.GREEN}[RAG-PHI3][{trace_id}] End (fast-return) current={current} total={(t_end - t0):.3f}s{lu.RESET}")

    return {
        "text": assistant_text,
        "current_scenario": current,
        "next_scenario": "",  # frontend doesn’t need this at the moment
    }