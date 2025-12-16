# chat_app/services/ragChatHelpers_phi3.py
import time
import uuid
import logging
import re
import difflib
from typing import Iterable

from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, BaseMessage

from ... import config as cf
from chat_app.services import logging_utils as lu 
from .ragChatHelpers import (
    resolve_instruction_owner, 
    _message_content_to_text, 
    get_activity,
    get_available_scenarios,
    format_available_scenarios,
    retrieve_instruction_chunks,
    chunks_to_text,
    )

logger = logging.getLogger(__name__)

START_SCENARIO = "start_conversation"
_available_scenarios_logged = False

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
            logger.info("[RAG-PHI3][%s] scenario_match=substring selected=%s raw=%s",
                        trace_id, c, _truncate(raw, 240))
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
                    logger.info("[RAG-PHI3][%s] scenario_match=difflib selected=%s raw=%s",
                                trace_id, c, _truncate(raw, 240))
                    return c

    # stay in current scenario
    logger.warning("[RAG-PHI3][%s] scenario_match=fallback selected=%s raw=%s",
                   trace_id, current, _truncate(raw, 240))
    return current


# =============================================================================
# Prompt builders (Phi-3 friendly: no strict JSON)
# =============================================================================

def build_response_system_prompt(
    *,
    available_scenarios_text: str,
    current_scenario: str,
    instructions_text: str,
) -> str:
    return f"""
    Your name is QT robot. You are a scenario-based conversational assistant.

    The conversation is structured into SCENARIOS. Scenarios are stages that help guide the flow of the conversation. 
    Scenarios define the goals for what should be achieved in that part of the conversation.
    You will be given instructions for the CURRENT_SCENARIO to help you decide how to respond to the user.
    The instructions for each scenario will include:
    - The ultimate goals of the scenario
    - Signals for understanding when the goals of scenario is complete.
    - Guidelines for how to respond and how to move toward the next scenario.
    - Also, examples of user and system responses that fit within the scenario.

    AVAILABLE_SCENARIOS:
    {available_scenarios_text}

    CURRENT_SCENARIO: "{current_scenario}"

    INSTRUCTIONS FOR CURRENT_SCENARIO:
    ----------------
    {instructions_text}
    ----------------

    Task:
    - Read the user's message and the recent conversation history.
    - Decide how the assistant would respond to the user in the current turn, following the instructions for the CURRENT_SCENARIO.
    - Keep the reply short and natural.
    - Ensure that the response helps move toward achieving the goals of the current scenario.
    - DO NOT mention scenario names within you responses.
    """


def build_next_scenario_system_prompt(
    *,
    available_scenarios_text: str,
    current_scenario: str,
    instructions_text: str,
) -> str:
    return f"""
    You are a conversation specialist. Your job is to select the next scenario for a conversation state machine.
    The conversations are structured into SCENARIOS. Scenarios are stages that help guide the flow of the conversation. 
    Scenarios define the goals for what should be achieved in that part of the conversation.
    You will be given instructions for the CURRENT_SCENARIO. The instructions for each scenario will include:
    - The ultimate goals of the scenario
    - Signals for understanding when the goals of scenario is complete and when it is time to move to a new scenario topic
    
    You task:
    - Follow the instructions to decide whether the goals of the current scenario have been met.
    - If the objectives have been met, choose a new scenario from the AVAILABLE_SCENARIOS that is best suited to follow the current.
    - If the goals have NOT been met, select the CURRENT_SCENARIO again to continue working toward its goals.


    Here is a list of and a short description about when they should be used. 
    AVAILABLE_SCENARIOS (valid answers must be one of these, or CURRENT_SCENARIO):
    {available_scenarios_text}

    CURRENT_SCENARIO: "{current_scenario}"

    INSTRUCTIONS FOR CURRENT_SCENARIO:
    ----------------
    {instructions_text}
    ----------------

    Rules:
    - Return ONLY the scenario name (exactly).
    - Do not explain or include comments with the output.
    - Do not add punctuation.
    - Do not add extra words.
    - Do not output markdown, code fences, explanations, labels, or commentary.
    - The scenario name must come from one of AVAILABLE_SCENARIOS.
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

async def invoke_phi3(messages: list[BaseMessage], *, trace_id: str, temperature: float, top_p: float, top_k: int, max_tokens: int) -> str:
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

    logger.debug("[RAG-PHI3][%s] invoke_phi3 params temp=%.3f top_p=%.3f top_k=%d max_tokens=%d raw_len=%d",
                 trace_id, temperature, top_p, top_k, max_tokens, len(txt or ""))

    return txt


# =============================================================================
# Main entrypoint: rag_response_fn (two-call Phi-3 pipeline)
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
    t0 = time.time()
    logger.info(f"{lu.RLINE_1}{lu.MAGENTA}[RAG-PHI3][{trace_id}] Start{lu.RESET}{lu.RLINE_2}")

    # --- Resolve activity + instruction owner ---
    activity = await get_activity(activity_name)
    instruction_owner = await resolve_instruction_owner(user)

    logger.info("[RAG-PHI3][%s] user=%s instruction_owner=%s activity=%s",
                trace_id, getattr(user, "id", None), getattr(instruction_owner, "id", None), activity_name)

    # --- Load available scenarios (for validation/matching) ---
    scenarios = await get_available_scenarios(instruction_owner.id, activity)
    available_scenarios_text = format_available_scenarios(scenarios)
    available_names = [s["name"] for s in scenarios if s.get("name")]

    if not _available_scenarios_logged:
        logger.info("[RAG-PHI3][%s] Available scenarios:\n%s", trace_id, available_scenarios_text)
        logger.info("[RAG-PHI3][%s] Available scenario NAMES: %s", trace_id, available_names)
        _available_scenarios_logged = True

    # --- Determine current scenario ---
    current = rag_state.get("current_scenario") or START_SCENARIO
    logger.info("[RAG-PHI3][%s] current_scenario=%s", trace_id, current)

    # --- Retrieve instruction chunks for current scenario ---
    chunks = await retrieve_instruction_chunks(
        instruction_name=current,
        user_id=instruction_owner.id,
        activity_id=activity.id,
        query_text=user_text,
        k=4,
    )
    logger.info("[RAG-PHI3][%s] retrieved_chunks=%d", trace_id, len(chunks))
    instructions_text = chunks_to_text(chunks)

    if not instructions_text.strip():
        logger.warning("[RAG-PHI3][%s] No instructions_text found for scenario=%s (empty chunks).", trace_id, current)

    # --- Build message history for context ---
    msg_history: list[BaseMessage] = []
    for role, content, _ts in context_buffer:
        if role == "user":
            msg_history.append(HumanMessage(content=content))
        elif role == "assistant":
            msg_history.append(AIMessage(content=content))

    logger.debug("[RAG-PHI3][%s] msg_history_len=%d user_text_len=%d",
                 trace_id, len(msg_history), len(user_text or ""))

    try:
        response_system_prompt = build_response_system_prompt(
            available_scenarios_text=available_scenarios_text,
            current_scenario=current,
            instructions_text=instructions_text,
        )

        messages_1 = [SystemMessage(content=response_system_prompt)] + msg_history + [
            HumanMessage(content=user_text)
        ]

        logger.info(f"{lu.YELLOW}[RAG-PHI3][{trace_id}] CALL#1 generating assistant response...{lu.RESET}")
        raw_resp = await invoke_phi3(
            messages_1,
            trace_id=trace_id,
            temperature=0.7, 
            top_p=0.7,
            top_k=30,
            max_tokens=128,
        )
        assistant_text = (raw_resp or "").strip()

        logger.info("[RAG-PHI3][%s] CALL#1 raw_response:\n%s", trace_id, _truncate(assistant_text, 1200))

    except Exception as e:
        logger.exception("[RAG-PHI3][%s] CALL#1 failed: %r", trace_id, e)
        raise

    # =============================================================================
    # CALL #2: Predict next_scenario (constrained output)
    # =============================================================================
    try:
        scenario_system_prompt = build_next_scenario_system_prompt(
            available_scenarios_text=available_scenarios_text,
            current_scenario=current,
            instructions_text=instructions_text,
        )

        # Include both the user message and the assistant reply to help the classifier decide.

        messages_2 = [SystemMessage(content=scenario_system_prompt )] + msg_history + [
            HumanMessage(content=f'User message:\n{user_text}\n\nAssistant reply:\n{assistant_text}\n\nNext scenario:')
        ]

        logger.info(f"{lu.YELLOW}[RAG-PHI3][{trace_id}] CALL#2 predicting next_scenario...{lu.RESET}")
        raw_next = await invoke_phi3(
            messages_2,
            trace_id=trace_id,
            temperature=0.1,  # low randomness
            top_p=0.1,
            top_k=1,
            max_tokens=24,    # small output budget
        )
        raw_next = (raw_next or "").strip()

        logger.info("[RAG-PHI3][%s] CALL#2 raw_next_scenario=%s", trace_id, _truncate(raw_next, 240))

        candidates = _scenario_candidates(available_names, current)
        next_scenario = _extract_best_scenario(raw_next, candidates=candidates, current=current, trace_id=trace_id)

    except Exception as e:
        # If classification fails, we *do not* crash the chat; we simply keep the same scenario.
        logger.exception("[RAG-PHI3][%s] CALL#2 failed: %r (fallback to current_scenario)", trace_id, e)
        next_scenario = current

    # --- Update state ---
    rag_state["current_scenario"] = next_scenario

    t_end = time.time()
    logger.info(f"{lu.GREEN}[RAG-PHI3][{trace_id}] End current={current} next={next_scenario} total={(t_end - t0):.3f}s{lu.RESET}")

    # --- Return frontend payload  ---
    return {
        "text": assistant_text,
        "current_scenario": current,
        "next_scenario": next_scenario,
    }
