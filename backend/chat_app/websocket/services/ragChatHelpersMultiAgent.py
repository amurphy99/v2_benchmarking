import time
import json
import uuid
import logging
import asyncio
from contextlib import suppress
from pydantic import BaseModel, Field

from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, BaseMessage

from ... import config as cf
from chat_app.services import logging_utils as lu 
from .ragChatHelpers import (
    resolve_instruction_owner, 
    _lc_messages_to_openai,
    get_activity,
    get_available_scenarios,
    format_available_scenarios,
    get_full_instruction_text,
    )

from .utils.chatUtils import (
    ChatState,
)

logger = logging.getLogger(__name__)

START_SCENARIO = "start_conversation"
_available_scenarios_logged = False

class Agent2Output(BaseModel):
    thought: str = Field(..., description="Brief internal reasoning about your decision.")
    agent1_instructions: str = Field(
        description="Natural language instructions that guide your assistant on how to respond next turn."
    )
    next_state: str = Field(
        description="The next state name. Must be either the current state or one of the available states."
    )

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


# =============================================================================
# Prompt builders 
# =============================================================================

def build_agent1_system_prompt(*, agent2_instructions: str) -> str:
    return f"""
    You are an assistant whose job is to respond to user queries. You will be given instructions 
    by your superiors on how to respond to the user. You will need to follow those instructions.
    But **Remember, your intructions will only provide general guidelines on how to respond, 
    and you need to match them to the specific context of the conversation based on conversation history.**

    SUPERVISOR INSTRUCTIONS:
    ----------------
    {agent2_instructions}
    ----------------

    Rules:
    - Respond in plain natural language only.
    - Follow the supervisor's guidance while maintaining a natural flow
    - Do NOT mention the supervisor instructions.
    - Do NOT include explanations, reasoning, or analysis.
    - Keep it short and friendly.
    - Do not use emojis or emoticons.

    Current Conversation: History:
    """.strip()

def build_agent2_system_prompt(
    *,
    available_scenarios_text: str,
    current_scenario: str,
    instructions_text: str,
) -> str:
    return f"""
    You are a conversation specialist supervising another assistant.

    The conversation is structured into states. Each state has goals and transition conditions.

    Here is a ordered list of AVAILABLE_STATES:
    {available_scenarios_text}

    CURRENT_STATE:
    "{current_scenario}"

    INSTRUCTIONS FOR CURRENT_STATE:
    ----------------
    {instructions_text}

    Based on the conversation history, your tasks:

    1. **Assess Progress**: How well have the current state's objectives been met?
    2. **Plan Next Response**: What should the assistant focus on in their immediate response?
    3. **State Transition**: Should we stay in current state or move to the next?

    Guidelines for agent1_instructions:
    - Be specific about what to address or ask
    - Include any key information to convey
    - Specify the tone or approach needed
    - Don't write the response - give clear guidance

    State Transition Rules:
    - Only advance states when current objectives are complete
    - If user seems confused or off-track, stay in current state
    - Choose the most logical next state from available options

    Output format: Valid JSON only, no markdown.
    
    Required fields:
    - "thought": Your analysis of conversation progress and next steps
    - "agent1_instructions": Specific guidance for the assistant's response
    - "next_state": Current state name or next appropriate state

    Conversation History:
    """.strip()


# =============================================================================
# LLM invocation helpers (LangChain wrapper)
# =============================================================================

async def invoke_agent1_chat(
    messages: list[BaseMessage],
    *,
    trace_id: str,
    temperature: float = 0.6,
    max_tokens: int = 128,
) -> str:
    if cf.openai_client is None:
        raise RuntimeError("cf.openai_client is None.")

    openai_messages = _lc_messages_to_openai(messages)

    resp = await cf.openai_client.chat.completions.create(
        model=cf.INSTRUCTOR_MODEL_NAME,
        messages=openai_messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )

    # OpenAI-style response object
    try:
        logger.debug(f"{lu.BG_BLUE}[RAG-PHI3][{trace_id}] Agent-1 raw response: {resp.choices[0].message.content}{lu.RESET}")
        return (resp.choices[0].message.content or "").strip()
    except Exception:
        # Fallback (should be rare)
        return str(resp).strip()

# =============================================================================
# Background task for predicting next scenario
# =============================================================================

async def _predict_and_update_next_scenario(
    *,
    trace_id: str,
    msg_history: list[BaseMessage],
    available_scenarios_text: str,
    current: str,
    instructions_text: str,
    rag_state: dict,
) -> None:
    lock = _get_rag_lock(rag_state)
    async with lock:
        try:
            scenario_system_prompt = build_agent2_system_prompt(
                available_scenarios_text=available_scenarios_text,
                current_scenario=current,
                instructions_text=instructions_text,
            )

            logger.info(f"{lu.YELLOW}[RAG-PHI3][{trace_id}] Agent-2 predicting next_state...{lu.RESET}")

            messages_2 = [SystemMessage(content=scenario_system_prompt)] + msg_history

            openai_messages = _lc_messages_to_openai(messages_2)
            resp = await cf.instructor_client.chat.completions.create(
                model=cf.INSTRUCTOR_MODEL_NAME,
                messages=openai_messages,
                response_model=Agent2Output,
                temperature=0.2,
                max_tokens=400,
            )

            logger.info(f"{lu.BLUE}[RAG-PHI3][{trace_id}] Agent-2 thought: {resp.thought}{lu.RESET}")
            logger.info(f"{lu.BLUE}[RAG-PHI3][{trace_id}] Agent-2 instructions for Agent-1: {resp.agent1_instructions}{lu.RESET}")
            logger.info(f"{lu.BLUE}[RAG-PHI3][{trace_id}] Agent-2 structured next_state={resp.next_state}{lu.RESET}")

            # Update rag_state with new scenario and instructions for agent1
            rag_state["agent2_instructions"] = resp.agent1_instructions
            rag_state["current_scenario"] = resp.next_state
            rag_state["_last_predicted_next_scenario"] = resp.next_state


        except Exception as e:
            # If classification fails, we *do not* crash the chat; we simply keep the same scenario.
            logger.exception(f"{lu.BG_RED}[RAG-PHI3][{trace_id}] CALL#2 failed:{e} (fallback to current_scenario){lu.RESET}")
            rag_state["current_scenario"] = current        

            # If no previous instructions exist, set safe default
            if "agent2_instructions" not in rag_state:
                rag_state["agent2_instructions"] = (
                    "Respond warmly and briefly. Ask one gentle follow-up question."
                )

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
    scenarios = await get_available_scenarios(instruction_owner.id, activity.id)
    available_scenarios_text = format_available_scenarios(scenarios)

    if not _available_scenarios_logged:
        logger.info(f"[RAG-PHI3][{trace_id}] Available scenarios:\n{available_scenarios_text}")
        _available_scenarios_logged = True

    # --- Determine current scenario ---
    current = rag_state.get("current_scenario") or START_SCENARIO
    logger.info(f"{lu.CYAN}[RAG-PHI3][{trace_id}] current_scenario={current}{lu.RESET}")

    chat_state: ChatState | None = rag_state.get("_chat_state")
    if chat_state is None:
        chat_state = ChatState(current_scenario=current)
        rag_state["_chat_state"] = chat_state
    else:
        # keep ChatState in sync with rag_state current scenario
        chat_state.current_scenario = current
        chat_state._ensure_state(current)

    # --- initialize rolling tail history (last 10 messages) ---
    tail_history = rag_state.get("_tail_history")
    if tail_history is None:
        tail_history = []
        rag_state["_tail_history"] = tail_history

    if "agent2_instructions" not in rag_state:
        rag_state["agent2_instructions"] = (
            "Greet the user warmly and ask to know their name."
        )

    instructions_text_call_1 = await get_full_instruction_text(
        instruction_name=current,
        user_id=instruction_owner.id,
        activity_id=activity.id,
    )

    logger.info(f"{lu.CYAN}[RAG-PHI3][{trace_id}] instructions_text_call_1_len={len(instructions_text_call_1 or '')}{lu.RESET}")

    if not instructions_text_call_1.strip():
        logger.warning(f"{lu.RED}[RAG-PHI3][{trace_id}] No instructions_text found for scenario={current} (empty chunks).{lu.RESET}")
    # --- Build message history for context ---
    msg_history = list(tail_history)

    logger.debug(f"{lu.MAGENTA}[RAG-PHI3][{trace_id}] msg_history_len={len(msg_history)} user_text_len={len(user_text or '')}{lu.RESET}")

    try:
        agent2_instructions = rag_state.get("agent2_instructions") or "Respond warmly and briefly. Ask one gentle follow-up question."

        response_system_prompt = build_agent1_system_prompt(agent2_instructions=agent2_instructions)

        messages_1 = [SystemMessage(content=response_system_prompt)] + msg_history + [
            HumanMessage(content=user_text)
        ]

        logger.info(f"{lu.YELLOW}[RAG-PHI3][{trace_id}] CALL#1 generating Agent-1 response...{lu.RESET}")
        
        assistant_text = await invoke_agent1_chat(
            messages_1,
            trace_id=trace_id,
            temperature=0.6,
            max_tokens=256,
        )
        assistant_text = (assistant_text or "").strip()

        chat_state.add_message(HumanMessage(content=user_text), scenario=current)
        chat_state.add_message(AIMessage(content=assistant_text), scenario=current)

        tail_history.append(HumanMessage(content=user_text))
        tail_history.append(AIMessage(content=assistant_text))

        # keep only last 10 messages (5 turns)
        if len(tail_history) > 10:
            rag_state["_tail_history"] = tail_history[-10:]
            tail_history = rag_state["_tail_history"]
        else:
            rag_state["_tail_history"] = tail_history # ensure it's saved back to rag_state

    except Exception as e:
        logger.exception(f"{lu.BG_RED}[RAG-PHI3][{trace_id}] CALL#1 failed: {e}{lu.RESET}")
        raise

    # --- AGENT-2: Analyze conversation and prepare for next turn ---
    # This runs in background to prepare for the next user message
    msg_history_call2 = list(tail_history)

    async def _runner():
        # ensure only one CALL#2 mutates rag_state at a time
        await _predict_and_update_next_scenario(
            trace_id=trace_id,
            msg_history=msg_history_call2,  
            available_scenarios_text=available_scenarios_text,
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