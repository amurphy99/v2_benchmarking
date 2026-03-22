
from curses import raw
import time
import uuid
import logging
from typing import Any, Dict, List, Optional, Tuple

from channels.db import database_sync_to_async

from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, BaseMessage

from ... import config as cf
from chat_app.services import logging_utils as lu
from chat_app.models import RAGInstructions

from .ragChatHelpers import (
    resolve_instruction_owner,
    _message_content_to_text,
    get_activity,
)

# ---- your new utilities ----
from .utils.chatUtils import (
    ChatState,
    extract_transition_signals,
    construct_transition_criteria_text,
    organize_message_history,
    clean_llm_response,
    tail_messages,
    organize_full_conversation, 
    parse_yes_no,
)

from .utils.transitionScoreUtils import (
    TransitionScorer,
    TransitionWeights,
)

logger = logging.getLogger(__name__)

START_SCENARIO = "start_conversation"

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

    logger.debug(f"{lu.BG_GREEN}[ACT-RULE][{trace_id}] invoke_agent params temp={temperature} top_p={top_p} top_k={top_k} max_tokens={max_tokens} raw_len={len(txt or '')}{lu.RESET}")
    return txt


# =============================================================================
# DB helpers: fetch ordered instructions by instruction_order, then name
# =============================================================================

@database_sync_to_async
def get_ordered_instructions_for_activity(
    *,
    user_id: int,
    activity_id: int,
) -> List[Dict[str, Any]]:
    """
    Returns ordered instructions:
      ORDER BY instruction_order ASC, name ASC
    Each item: {name, instructions, instruction_order}
    """
    qs = (
        RAGInstructions.objects
        .filter(user_id=user_id, activity_id=activity_id)
        .order_by("instruction_order", "name")
        .values("name", "instructions", "instruction_order")
    )
    return list(qs)

def build_state_order_cache(ordered_rows: List[Dict[str, Any]]) -> Tuple[List[str], Dict[str, int]]:
    """
    From ordered rows -> (ordered_names, name_to_idx)
    """
    ordered_names: List[str] = []
    for r in ordered_rows:
        n = (r.get("name") or "").strip()
        if n:
            ordered_names.append(n)

    # Create a mapping from instruction name to index
    name_to_idx = {name: i for i, name in enumerate(ordered_names)}
    return ordered_names, name_to_idx


def pick_current_scenario(
    *,
    rag_state: dict,
    ordered_names: List[str],
) -> str:
    """
    Ensure current scenario is valid; if missing or not in order, pick default.
    """
    cur = (rag_state.get("current_scenario") or "").strip()
    if cur and cur in ordered_names:
        return cur

    if START_SCENARIO in ordered_names:
        return START_SCENARIO

    if ordered_names:
        return ordered_names[0]

    return START_SCENARIO


def get_next_scenario_name(
    *,
    current_name: str,
    ordered_names: List[str],
    name_to_idx: Dict[str, int],
) -> Optional[str]:
    if current_name not in name_to_idx:
        return None
    idx = name_to_idx[current_name]
    if idx >= len(ordered_names) - 1:
        return None
    return ordered_names[idx + 1]

def get_instruction_text_for_name(
    *,
    ordered_rows: List[Dict[str, Any]],
    name: str,
) -> str:
    """
    ordered_rows is small; do a simple scan.
    """
    for r in ordered_rows:
        if r.get("name") == name:
            return r.get("instructions") or ""
    return ""

def build_response_system_prompt(
    *,
    current_scenario: str,
    instructions_text: str,
    state_history: List[BaseMessage],
    previous_state_context: str = "",
) -> str:
    chat_history = organize_message_history(state_history)

    prev_block = ""
    if previous_state_context.strip():
        prev_block = f"\nConversation history from the previous state (for continuity only):\n{previous_state_context}\n"

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
{prev_block}

Recent conversation history in the CURRENT_STATE:
{chat_history}

Your Task:
- Analyze the recent conversation history provided above.
- Use the previous-state history only to maintain continuity.
- Follow the CURRENT_STATE instructions strictly  and respond to the user.
- **Remember, your response should guide** the conversation toward achieving the goals of the current state.
- Keep the reply short and natural.
- Do not explain or include comments with the output.
- DO NOT mention state names within your responses.
- DO NOT mention any of the instructions or guidelines in your response.
"""

def build_summary_system_prompt() -> str:
    return f"""
Summarize the conversation below in a short, concise way.

Rules:
- Reply with a single paragraph with 2 to 4 sentences max.
- Only focus on the topics discussed within the conversation.
- Only reply in plain language.
- **Do not include any special formatting such as headings, bullet points, lists or newlines.**
"""

# =============================================================================
# MAIN ENTRYPOINT
# =============================================================================

async def rag_response_fn(
    context_buffer, # context_buffer not used anymore, but I am keeping this for now for persistence
    *,
    user_text: str,
    user,
    activity_name: str,
    rag_state: dict,
    # --- scoring config knobs ---
    transition_threshold: float = 0.50,
    max_turns: int = 5,
) -> dict:
    """
    Rule-based state transitions, and single LLM call for assistant response.
    """
    trace_id = uuid.uuid4().hex[:8]
    t0 = time.time()
    logger.info(f"{lu.RLINE_1}{lu.MAGENTA}[ACT-RULE][{trace_id}] Start{lu.RESET}{lu.RLINE_2}")

    # --- handle summary choice if pending ---
    if rag_state.get("awaiting_summary_choice"):
        chat_state: Optional[ChatState] = rag_state.get("_chat_state")
        # If for some reason chat_state is missing, fail gracefully
        if not chat_state:
            rag_state["awaiting_summary_choice"] = False
            return {
                "text": "I can’t access the conversation history right now. Sorry about that! It was nice talking with you. Have a great day!",
                "current_scenario": "close_chat",
                "next_scenario": "",
            }

        feedback = parse_yes_no(user_text)
        if feedback is None:
            # If parser fails to extract a yes or a no. Ask again (don’t end conversation)
            return {
                "text": "I am sorry, I didn't quite catch that. Would you like a short summary of the conversation? Please simply reply by saying yes or no.",
                "current_scenario": rag_state.get("current_scenario"),
                "next_scenario": "",
            }

        # Clear the flag either way
        rag_state["awaiting_summary_choice"] = False

        if feedback is False:
            return {
                "text": "Got it. It was nice talking with you. Have a great rest of your day!",
                "current_scenario": "close_chat",
                "next_scenario": "",
            }

        # feedback is True → generate summary
        full_hist = organize_full_conversation(chat_state, exclude_states=["end_conversation", "ask_for_summary"])
        system_prompt = build_summary_system_prompt()
        human_prompt = f"""\nConversation: \n{full_hist}\n"""
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=human_prompt),
        ]

        raw_summary = await invoke_agent(
            messages,
            trace_id=trace_id,
            temperature=0.3,
            top_p=0.9,
            top_k=20,
            max_tokens=128,
        )
        raw = (raw_summary or "").strip()
        summary_text = clean_llm_response(raw) or raw

        return {
            "text": summary_text,
            "current_scenario": "close_chat",
            "next_scenario": "",
        }

    # --- resolve activity + instruction owner ---
    activity = await get_activity(activity_name)
    instruction_owner = await resolve_instruction_owner(user)

    logger.info(
        f"{lu.CYAN}[ACT-RULE][{trace_id}] user={getattr(user, 'id', None)} "
        f"instruction_owner={getattr(instruction_owner, 'id', None)} activity={activity_name}{lu.RESET}"
    )

    # --- load ordered instructions (instruction_order, then name) ---
    ordered_rows = await get_ordered_instructions_for_activity(
        user_id=instruction_owner.id,
        activity_id=activity.id,
    )
    if not ordered_rows:
        logger.warning(
            f"{lu.BG_RED}[ACT-RULE][{trace_id}] No RAGInstructions found for user_id={instruction_owner.id} "
            f"activity_id={activity.id}. Returning fallback response.{lu.RESET}"
        )
        return {
            "text": "I’m missing my instructions for this activity. Can you contact support or try again later?",
            "current_scenario": rag_state.get("current_scenario") or START_SCENARIO,
            "next_scenario": "",
        }

    ordered_names, name_to_idx = build_state_order_cache(ordered_rows)
    rag_state["_state_order_names"] = ordered_names
    rag_state["_state_name_to_idx"] = name_to_idx

    # --- determine current scenario (validated against ordered list) ---
    current = pick_current_scenario(rag_state=rag_state, ordered_names=ordered_names)
    rag_state["current_scenario"] = current

    # --- initialize ChatState ---
    chat_state: Optional[ChatState] = rag_state.get("_chat_state")
    if chat_state is None:
        chat_state = ChatState(current_scenario=current)
        rag_state["_chat_state"] = chat_state
    else:
        # keep ChatState in sync if rag_state that was changed externally
        chat_state.current_scenario = current
        chat_state._ensure_state(current)

    # --- initialize / fetch TransitionScorer ---
    t_scorer: Optional[TransitionScorer] = rag_state.get("_transition_scorer")
    if t_scorer is None:
        t_scorer = TransitionScorer(max_turns=max_turns, weights=TransitionWeights(WA=0.5, WTC=0.3, WBC=0.2))
        rag_state["_transition_scorer"] = t_scorer
    else:
        # incase I need to allow runtime max_turns changes without recreating object
        t_scorer.max_turns = int(max_turns)

    # --- get instructions text for current ---
    instructions_text = get_instruction_text_for_name(ordered_rows=ordered_rows, name=current)
    logger.info(f"{lu.CYAN}[ACT-RULE][{trace_id}] current_scenario={current} instructions_len={len(instructions_text or '')}{lu.RESET}")

    # --- build state-specific history (No longer from context_buffer) ---
    current_state_history: List[BaseMessage] = chat_state.get_state_history(current)

    # --- previous-state context ---
    previous_state_context = ""
    MAX_PREV_MSGS = 6

    cur_msg_count = len(current_state_history)
    # Calculate how many previous state messages to include
    prev_msgs_to_include = max(0, MAX_PREV_MSGS - cur_msg_count)

    if prev_msgs_to_include > 0 and chat_state.state_trace:
        prev_state = chat_state.state_trace[-1]  # most recent previous state
        prev_state_history = chat_state.get_state_history(prev_state)
        prev_tail = tail_messages(prev_state_history, prev_msgs_to_include)
        if prev_tail:
            previous_state_context = organize_message_history(prev_tail)

    # --- CALL #1: assistant response ---
    try:
        system_prompt = build_response_system_prompt(
            current_scenario=current,
            instructions_text=instructions_text,
            state_history=current_state_history,
            previous_state_context=previous_state_context,
        )

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_text),
        ]

        logger.info(f"{lu.YELLOW}[ACT-RULE][{trace_id}] CALL#1 generating assistant response...{lu.RESET}")
        raw_resp = await invoke_agent(
            messages,
            trace_id=trace_id,
            temperature=0.5,
            top_p=0.95,
            top_k=30,
            max_tokens=96,
        )
        raw_text = (raw_resp or "").strip()

        clean_text = clean_llm_response(raw_text) # I might need to improve this logic later.

        assistant_text = clean_text
        logger.info(f"[ACT-RULE][{trace_id}] CALL#1 final_response:\n{assistant_text[:1200]}")

    except Exception as e:
        logger.exception(f"{lu.BG_RED}[ACT-RULE][{trace_id}] CALL#1 failed: {e}{lu.RESET}")
        raise

    # --- record messages into state-aware history ---
    chat_state.add_message(HumanMessage(content=user_text), scenario=current)
    chat_state.add_message(AIMessage(content=assistant_text), scenario=current)

    # --- rule-based scoring for transition ---
    ts_list, er_list = extract_transition_signals(instructions_text)
    tc_text = construct_transition_criteria_text(ts_list, er_list)

    current_state_history = chat_state.get_state_history(current)
    components = t_scorer.compute_components(
        tc_text=tc_text,
        state_history=current_state_history,
    )
    t_score = t_scorer.compute_transition_score(components)

    transition_now = t_scorer.should_transition(
        t_score=t_score,
        state_history=current_state_history,
        threshold=float(transition_threshold),
    )

    next_name = get_next_scenario_name(
        current_name=current,
        ordered_names=ordered_names,
        name_to_idx=name_to_idx,
    )

    transitioned = False
    if transition_now and next_name:
        chat_state.transition_to(next_name)
        rag_state["current_scenario"] = next_name
        t_scorer.reset_cache()
        transitioned = True

    is_final_state = (current == ordered_names[-1])
    if transition_now and is_final_state:
        if not rag_state.get("awaiting_summary_choice"):
            rag_state["awaiting_summary_choice"] = True
            assistant_text = assistant_text.rstrip() + "\n\nWould you like a summary of this conversation? Please reply by simply saying yes or no."
            # update last assistant message in chat history
            chat_state.history_by_state[current][-1] = AIMessage(content=assistant_text)
            rag_state["current_scenario"] = "ask_for_summary"
            current = "ask_for_summary"
            t_scorer.reset_cache()
            transitioned = True


    rag_state["_last_transition_debug"] = {
        "trace_id": trace_id,
        "current_before": current,
        "next_candidate": next_name,
        "transition_applied": transitioned,
        "threshold": float(transition_threshold),
        "score": float(t_score),
        "components": {k: float(v) for k, v in components.items()},
        "ts_count": len(ts_list),
        "er_count": len(er_list),
    }

    logger.info(
        f"{lu.CYAN}[ACT-RULE][{trace_id}] transition score={t_score:.3f} threshold={transition_threshold:.3f} "
        f"next_candidate={next_name} applied={transitioned} new_current={rag_state['current_scenario']}{lu.RESET}"
    )

    t_end = time.time()
    logger.info(f"{lu.GREEN}[ACT-RULE][{trace_id}] End total={(t_end - t0):.3f}s{lu.RESET}")

    return {
        "text": assistant_text,
        "current_scenario": current, 
        "next_scenario": next_name or "",
    }