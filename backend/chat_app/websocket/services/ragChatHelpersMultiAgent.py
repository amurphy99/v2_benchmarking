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

CLOSE_SESSION_STATE = "close_session"
CLOSE_SESSION_DESCRIPTION = (
    "- close_session: CLOSING — **transition here when the conversation nears its end**. "
    "This triggers the closing interactions where the assistant says goodbye with an optional summary. "
    "The session terminates after the closing flow completes. Never skip directly to this from other states."
)

MAX_SAME_STATE_TURNS = 5 # Maximum number of turns allowed in the same state before forcing a transition

# =============================================================================
# Agent-2 structured output schema
# =============================================================================

class Agent2Memory(BaseModel):
    key_entities: list[str] = Field(
        default_factory=list,
        description="List of short sentences describing important named entities: people, places, events, organizations, etc."
    )
    important_facts: list[str] = Field(
        default_factory=list,
        description="List of short sentences describing key facts or context worth remembering for the long-term."
    )

class Agent2Output(BaseModel):
    assistant_instructions: str = Field(
        description="Natural language instructions that guide your assistant on how to respond next turn."
    )
    next_state: str = Field(
        description="The next state name. Must be either the current state or one of the available states."
    )
    updated_memory: Agent2Memory = Field(
        description="Your working memory. Carry over what's still relevant, add new important things if they feel important, and remove what's not relevant. Try to keep it concise."
    )

def _get_rag_lock(rag_state: dict) -> asyncio.Lock:
    """Ensures that only one piece of code mutates rag_state["current_scenario"] at a time."""
    lock = rag_state.get("_scenario_lock")
    if lock is None:
        lock = asyncio.Lock()
        rag_state["_scenario_lock"] = lock
    return lock


# =============================================================================
# Prompt builders 
# =============================================================================

def build_agent1_system_prompt(*, instruction_text, agent2_instructions: str) -> str:
    return f"""
    You are an assistant whose job is to have natural conversations with a user. The conversation is structured into states. Each state has goals and transition conditions.
    You will be given instructions by your superiors on how to respond to the user in a given state. You will need to follow those instructions.
    But **Remember, your intructions will only provide general guidelines on how to respond, 
    and you need to match them to the specific context of the conversation based on the context provided for the current state and conversation history.**

    CURRENT STATE CONTEXT:
    ----------------
    {instruction_text}

    SUPERVISOR INSTRUCTIONS:
    ----------------
    {agent2_instructions}
    ----------------

    Rules:
    - Respond in plain natural language only.
    - Follow the supervisor's guidance while maintaining a natural flow.
    - Do NOT mention the supervisor instructions.
    - Do NOT include explanations, reasoning, or analysis.
    - Keep your responses short and friendly.
    - Do not use emojis or emoticons.
    - Don't refer to yourself as an “AI” or an "LLM".

    Current Conversation: History:
    """.strip()


def build_agent2_memory(current_memory: Agent2Memory | None = None) -> str:
    if current_memory and (current_memory.key_entities or current_memory.important_facts):
        entities = ", ".join(current_memory.key_entities) or "none"
        facts = "\n".join(f"  - {f}" for f in current_memory.important_facts) or "  none"
        return f"""
        YOUR WORKING MEMORY (accumulated from previous turns):
        Key entities: {entities}
        Important facts:
        {facts}

        Carry this forward in your output. Keep what's still relevant, add new things, drop what's no longer needed.
        """
    else:
        return ""

def build_agent2_system_prompt(
    *,
    available_scenarios_text: str,
    current_scenario: str,
    instructions_text: str,
    current_memory: Agent2Memory | None = None,
) -> str:
    memory_section = build_agent2_memory(current_memory=current_memory)

    return f"""
    You are a conversation specialist whose job is to plan the conversation flow and provide guidance to your assistant. 
    
    The conversation is structured into states. Each state has goals and transition conditions. You need to plan the conversation flow in manner that aligns with the goals described in the state instructions.
    Based on the instructions for the current state, the conversation history, and your working memory from previous turns, you will provide guidance to your assistant on how to respond next turn. 
    You will also determine whether to stay in the current state or transition to a new state.
    Here is an ordered list of AVAILABLE_STATES:
    {available_scenarios_text}
    States marked [COMPLETED] have already been addressed. Do NOT return to them unless the user explicitly brings up that topic.

    CURRENT_STATE:
    "{current_scenario}"

    INSTRUCTIONS FOR CURRENT_STATE:
    ----------------
    {instructions_text}

    Your working memory from previous turns:
    ----------------
    {memory_section}
    
    Based on the conversation history and your working memory from previous turns, your tasks:

    1. **Assess Progress**: How well have the current state's objectives been met?
    2. **Plan Next Response**: What should the assistant focus on in their immediate response?
    3. **State Transition**: Should we stay in current state or move to the next?

    Guidelines for assistant_instructions:
    - Be specific about what to address in the assistant's next response based on the current scenario's goals and the conversation history.
    - Include any key information to convey
    - Specify the tone or approach needed
    - **YOU ONLY PROVIDE GUIDANCE ON HOW TO RESPOND.** 
    - For example, instead of telling the assistant to say "Hello, how can I help you today?", you will instruct them to "Greet the user warmly and ask how you can assist them with their current needs."

    State Transition Rules:
    - Only advance states when current objectives are complete
    - If user seems confused or off-track, stay in current state
    - Choose the most logical next state from available options

    Output format: Valid JSON only, no markdown.
    
    Required fields:
    - "assistant_instructions": Specific guidance for the assistant's response
    - "next_state": Current state name or next appropriate state
    - "updated_memory": Your working memory with "key_entities" (list of strings) and "important_facts" (list of strings)

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
    max_tokens: int = 256,
    max_retries: int = 2,
) -> str:
    if cf.openai_client is None:
        raise RuntimeError("cf.openai_client is None.")

    openai_messages = _lc_messages_to_openai(messages)

    for attempt in range(1, max_retries + 1):
        resp = await cf.openai_client.chat.completions.create(
            model=cf.INSTRUCTOR_MODEL_NAME,
            messages=openai_messages,
            temperature=temperature,
            max_tokens=max_tokens,
            #  disable thinking to avoid exhausting max_tokens and faster response times.
            reasoning_effort="none", 
        )

        try:
            choice = resp.choices[0]
            finish_reason = choice.finish_reason
            raw_content = choice.message.content
            text = (raw_content or "").strip()

            logger.info(
                f"{lu.BG_BLUE}[Multi-Agent][{trace_id}] Agent-1 raw response "
                f"(attempt={attempt}, finish_reason={finish_reason!r}): {raw_content!r}{lu.RESET}"
            )

            if text:
                return text

            logger.warning(
                f"{lu.RED}[Multi-Agent][{trace_id}] Agent-1 returned empty content "
                f"(attempt={attempt}/{max_retries}, finish_reason={finish_reason!r}). "
                f"tool_calls={getattr(choice.message, 'tool_calls', None)!r}{lu.RESET}"
            )

        except Exception:
            logger.exception(f"{lu.BG_RED}[Multi-Agent][{trace_id}] Agent-1 response parse error (attempt={attempt}){lu.RESET}")

    # All retries exhausted — return empty; caller decides what to do
    return ""

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
            current_memory: Agent2Memory | None = rag_state.get("agent2_memory")  # None on first turn
            scenario_system_prompt = build_agent2_system_prompt(
                available_scenarios_text=available_scenarios_text,
                current_scenario=current,
                instructions_text=instructions_text,
                current_memory=current_memory
            )

            logger.info(f"{lu.YELLOW}[Multi-Agent][{trace_id}] Agent-2 predicting next_state...{lu.RESET}")

            messages_2 = [SystemMessage(content=scenario_system_prompt)] + msg_history

            openai_messages = _lc_messages_to_openai(messages_2)
            resp = await cf.instructor_client.chat.completions.create(
                model=cf.INSTRUCTOR_MODEL_NAME,
                messages=openai_messages,
                response_model=Agent2Output,
                temperature=0.2,
                max_tokens=1024,
                #  disable thinking to avoid exhausting max_tokens and faster response times.
                reasoning_effort="none",
            )

            logger.info(f"{lu.BLUE}[Multi-Agent][{trace_id}] Agent-2 instructions for Assistant: {resp.assistant_instructions}{lu.RESET}")
            logger.info(f"{lu.BLUE}[Multi-Agent][{trace_id}] Agent-2 structured next_state={resp.next_state}{lu.RESET}")
            logger.info(f"{lu.BLUE}[Multi-Agent][{trace_id}] Agent-2 updated memory: {resp.updated_memory}{lu.RESET}")

            # Update rag_state with new scenario
            rag_state["agent2_instructions"] = resp.assistant_instructions
            rag_state["current_scenario"] = resp.next_state

            if resp.next_state != current:
                completed: set[str] = rag_state.setdefault("_completed_states", set())
                completed.add(current)

            rag_state["agent2_memory"]                 = resp.updated_memory


        except Exception as e:
            # If classification fails, we *do not* crash the chat; we simply keep the same scenario.
            logger.exception(f"{lu.BG_RED}[Multi-Agent][{trace_id}] CALL#2 failed:{e} (fallback to current_scenario){lu.RESET}")
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
    *,
    user_text: str,
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
    # await _await_pending_scenario_update(rag_state, trace_id=trace_id) # wait for any pending scenario prediction to complete

    t0 = time.time()
    logger.info(f"{lu.RLINE_1}{lu.MAGENTA}[Multi-Agent][{trace_id}] Start{lu.RESET}{lu.RLINE_2}")

    # --- Resolve activity + instruction owner ---
    activity = await get_activity(activity_name)

    logger.info(f"{lu.CYAN}[Multi-Agent][{trace_id}] user={getattr(user, 'id', None)} activity={activity_name}{lu.RESET}")

    # --- Load available scenarios (globally) ---
    scenarios = await get_available_scenarios(activity.id)

    completed_states: set[str] = rag_state.get("_completed_states", set()) # initialize completed states with any previously completed ones, set to empty set if none exist
    available_scenarios_text = format_available_scenarios(scenarios, completed_states=completed_states)
    available_scenarios_text = available_scenarios_text + f"\n{CLOSE_SESSION_DESCRIPTION}"

    if not _available_scenarios_logged:
        logger.info(f"[Multi-Agent][{trace_id}] Available scenarios:\n{available_scenarios_text}")
        _available_scenarios_logged = True

    # --- Determine current scenario ---
    current = rag_state.get("current_scenario") or START_SCENARIO
    logger.info(f"{lu.CYAN}[Multi-Agent][{trace_id}] current_scenario={current}{lu.RESET}")

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
        activity_id=activity.id,
    )

    logger.info(f"{lu.CYAN}[Multi-Agent][{trace_id}] instructions_text_call_1_len={len(instructions_text_call_1 or '')}{lu.RESET}")

    if not instructions_text_call_1.strip():
        logger.warning(f"{lu.RED}[Multi-Agent][{trace_id}] No instructions_text found for scenario={current} (empty chunks).{lu.RESET}")
    # --- Build message history for context ---
    msg_history = list(tail_history)

    logger.debug(f"{lu.MAGENTA}[Multi-Agent][{trace_id}] msg_history_len={len(msg_history)} user_text_len={len(user_text or '')}{lu.RESET}")

    await _predict_and_update_next_scenario(
        trace_id=trace_id,
        msg_history=list(tail_history) + [HumanMessage(content=user_text)],
        available_scenarios_text=available_scenarios_text,
        current=current,
        instructions_text=instructions_text_call_1,
        rag_state=rag_state,
    )

    new_state = rag_state.get("current_scenario", current)
    if new_state == current:
        same_count = rag_state.get("_same_state_turn_count", 0) + 1 
        rag_state["_same_state_turn_count"] = same_count
        logger.info(f"{lu.YELLOW}[Multi-Agent][{trace_id}] same_state_turn_count={same_count} for scenario={current}{lu.RESET}")
        if same_count >= MAX_SAME_STATE_TURNS:
            scenario_names = [s["name"] for s in scenarios]  # already ordered by instruction_order
            scenario_names.append(CLOSE_SESSION_STATE)  # Add close_session
            try:
                idx = scenario_names.index(current)
                if idx + 1 < len(scenario_names):
                    forced_next = scenario_names[idx + 1]
                    logger.warning(
                        f"{lu.RED}[Multi-Agent][{trace_id}] Forcing advance '{current}' → '{forced_next}' "
                        f"after {same_count} consecutive turns.{lu.RESET}"
                    )
                    # the state will be change in the next turn
                    rag_state["current_scenario"] = forced_next
                    rag_state["_same_state_turn_count"] = 0
            except ValueError:
                pass
    else:
        rag_state["_same_state_turn_count"] = 0

    try:
        agent2_instructions = rag_state.get("agent2_instructions") or "Respond warmly and briefly. Ask one gentle follow-up question."

        response_system_prompt = build_agent1_system_prompt(instruction_text=instructions_text_call_1, agent2_instructions=agent2_instructions)

        messages_1 = [SystemMessage(content=response_system_prompt)] + msg_history + [
            HumanMessage(content=user_text)
        ]

        logger.info(f"{lu.YELLOW}[Multi-Agent][{trace_id}] CALL#1 generating Agent-1 response...{lu.RESET}")
        
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

        # number of messages to keep in tail_history for context
        max_tail_history_len = 20
        if len(tail_history) > max_tail_history_len:
            rag_state["_tail_history"] = tail_history[-max_tail_history_len:]
            tail_history = rag_state["_tail_history"]
        else:
            rag_state["_tail_history"] = tail_history # ensure it's saved back to rag_state

    except Exception as e:
        logger.exception(f"{lu.BG_RED}[Multi-Agent][{trace_id}] CALL#1 failed: {e}{lu.RESET}")
        raise

    # Return immediately
    t_end = time.time()
    logger.info(f"{lu.GREEN}[Multi-Agent][{trace_id}] End current turn={rag_state['current_scenario']} total={(t_end - t0):.3f}s{lu.RESET}")

    return {
        "text": assistant_text,
        "current_scenario": current,
        "next_scenario": "",  # frontend doesn’t need this at the moment
        "close_session": rag_state["current_scenario"] == CLOSE_SESSION_STATE, # frontend or robot can use this to trigger session closure
    }