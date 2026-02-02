# chat_app/services/ragChatHelper.py
import time
import uuid
import json
import logging
from typing import Any

from django.db.models.functions import Lower
from django.core.exceptions import ObjectDoesNotExist
from channels.db import database_sync_to_async

from pgvector.django import CosineDistance

from chat_app.models import RAGInstructions, Activity
from chat_app.services import logging_utils as lu
from rag_vectorstore.models import RAGInstructionChunkEmbedding  
from rag_vectorstore.services.vdb_services import get_embeddings_model

from .chatHelpers import RagParseError 
from .utils.jsonParsingUtils import _log_json_fail, _truncate, parse_structured_llm_response, LlmResponse
from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, BaseMessage

from ...         import config        as cf

logger = logging.getLogger(__name__)

START_SCENARIO = "start_conversation"

output_parser = PydanticOutputParser(pydantic_object=LlmResponse)
_available_scenarios_logged = False

@database_sync_to_async
def resolve_instruction_owner(user):
    """
    Memory activity instructions are authored by caregiver.
    The `user` is actually a patient (plwd), so we need to use their paired caregiver's id to fetch
    instructions.
    """
    # If the user is a patient, they should have a Profile via related_name="PLwD"
    try:
        profile = user.PLwD  # Profile where this user is the patient (plwd)
        return profile.caregiver
    except ObjectDoesNotExist:
        pass

    # Otherwise treat them as caregiver (or unpaired)
    return user

def _message_content_to_text(content: Any) -> str:
    """Normalize LangChain message content to plain text."""
    if isinstance(content, str):
        return content

    # Some models return list[dict|str] blocks we join them.
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                # common pattern: {"type":"text","text":"..."}
                txt = item.get("text")
                if isinstance(txt, str):
                    parts.append(txt)
                else:
                    parts.append(str(item))
            else:
                parts.append(str(item))
        return "\n".join(parts)

    return str(content)

def _lc_messages_to_openai(messages: list[BaseMessage]) -> list[dict]:
    out: list[dict] = []
    for m in messages:
        if isinstance(m, SystemMessage):
            role = "system"
        elif isinstance(m, HumanMessage):
            role = "user"
        elif isinstance(m, AIMessage):
            role = "assistant"
        else:
            role = "user"
        
        out.append({"role": role, "content": _message_content_to_text(m.content)})
    return out


@database_sync_to_async
def get_activity(activity_name: str) -> Activity:
    return Activity.objects.get(name=activity_name)

@database_sync_to_async
def get_available_scenarios(user_id: int, activity_id: int) -> list[dict]:
    """
    Returns [{name: ..., description: ...}, ...]
    """
    qs = (
        RAGInstructions.objects
        .filter(user_id=user_id, activity_id=activity_id)
        .order_by("instruction_order", "name")
        .values("name",  "description", "instructions", "instruction_order")
    )
    return list(qs)


def format_available_scenarios(scenarios: list[dict]) -> str:
    """
    Turn:
      [{"name": "initiate_smalltalk", "description": "..."}]
    into a nice prompt chunk:
      - initiate_smalltalk: ...
    """
    lines = []
    for s in scenarios:
        lines.append(f"- {s['name']}: {s['description']}")
    # Ensure start scenario is always present in the prompt
    if not any(s["name"] == START_SCENARIO for s in scenarios):
        lines.insert(0, f"- {START_SCENARIO}: starting state of the conversation")
    return "\n".join(lines)


def embed_query(text: str) -> list[float]:
    """
    Use the SAME embedding model instance used by VDB services.
    """
    embeddings_model = get_embeddings_model()
    return embeddings_model.embed_query(text)

@database_sync_to_async
def retrieve_instruction_chunks(
    *,
    instruction_name: str,
    user_id:int,
    activity_id: int,
    query_text: str,
    k: int = 4,
) -> list[RAGInstructionChunkEmbedding]:
    """
    Retrieves top-k chunks for a given scenario name (instruction_name) for this user/activity.
    """
    q_emb = embed_query(query_text)

    fetched_instructions = list(
        RAGInstructionChunkEmbedding.objects
        .filter(name=instruction_name, user_id=user_id, activity_id=activity_id)
        .annotate(distance=CosineDistance("embedding", q_emb))
        .order_by("distance")[:k]
    )

    logger.info(f"{lu.CYAN}Retrieved %d instruction chunks for instruction '%s'{lu.RESET}", len(fetched_instructions), instruction_name)
    
    return fetched_instructions

# =============================================================================
# DB helper function for fetching the full instruction text from the main DB
# =============================================================================
@database_sync_to_async
def get_full_instruction_text(
    *,
    instruction_name: str,
    user_id: int,
    activity_id: int,
) -> str:
    """
    Retrieves the full instructions text for a given scenario (instruction_name)
    for this user + activity from the main DB.

    Raises ObjectDoesNotExist if not found.
    """
    try:
        inst = RAGInstructions.objects.get(
            user_id=user_id,
            activity_id=activity_id,
            name=instruction_name,
        )
        return inst.instructions
    except ObjectDoesNotExist:
        logger.info(f"{lu.BG_RED}[RAG-PHI3] No RAGInstructions row found for user_id={user_id} activity_id={activity_id} name='{instruction_name}'{lu.RESET}")
        return ""

def chunks_to_text(chunks: list[RAGInstructionChunkEmbedding]) -> str:
    parts = []
    for i, c in enumerate(chunks):
        parts.append(f"Chunk{i+1}\n{c.content.strip()}")
    return "\n\n".join(parts)


def build_system_prompt(
    *,
    available_scenarios_text: str,
    current_scenario: str,
    instructions_text: str,
) -> str:
    
    return F"""
You are QT, a warm and calm conversational assistant for people living with memory problems or dementia.

You are part of a state machine conversation.

You DO NOT decide states by reasoning.
You ONLY follow the RULES below exactly.

You will output EXACTLY ONE JSON object.

-------------------------------------
CURRENT_STATE: "{current_scenario}"
-------------------------------------

AVAILABLE_STATES:
{available_scenarios_text}

-------------------------------------
RULES FOR CURRENT_STATE
-------------------------------------
{instructions_text}
-------------------------------------

HOW TO CHOOSE THE NEXT STATE:

You must use the SPECIFIC INSTRUCTIONS given for the CURRENT_STATE.

You MUST follow these rules exactly.
Do NOT invent your own rules.
Do NOT guess.
Do NOT interpret goals.
Only match the user message to the rules.

-------------------------------------
HOW TO WRITE THE RESPONSE
-------------------------------------

1. Write a short, warm, simple reply.
2. Follow the tone required by CURRENT_STATE.
3. Do not ask complex questions.
4. Do not mention states.
5. Do not explain anything.

-------------------------------------
OUTPUT FORMAT (STRICT)
-------------------------------------

Return ONLY this JSON:

{
  "assistant_response": "...",
  "next_state": "..."
}

No markdown.
No extra text.
No comments.
No emojis.
""" 

async def invoke_chain_get_raw_text(messages: list) -> str:
    """
    Instructor-based call to OpenAI-compatible /v1/chat/completions.
    Returns JSON text so your existing parse_structured_llm_response() stays unchanged.
    """
    if cf.instructor_client is None:
        raise RuntimeError("Instructor client is not initialized (USE_LLM is false or init failed).")

    model = cf.INSTRUCTOR_MODEL_NAME
    openai_messages = _lc_messages_to_openai(messages)

    # Instructor returns a parsed Pydantic object when response_model is provided.
    resp_obj = await cf.instructor_client.chat.completions.create(
        model=model,
        messages=openai_messages,
        response_model=LlmResponse,
        temperature=0.3,
        max_tokens=128,
    )

    try:
        # Return as string if its a valid JSON object
        return json.dumps(resp_obj.model_dump(), ensure_ascii=False)
    except Exception:
        # Fallback: return raw text content
        logger.warning(f"{lu.BG_RED}Failed to serialize Instructor LLM response to JSON, returning str() fallback.{lu.RESET}")
        return str(resp_obj)
    


async def rag_response_fn(
    context_buffer,
    user_text: str,
    *,
    user,
    activity_name: str,
    rag_state: dict,
) -> dict:
    global _available_scenarios_logged
    activity = await get_activity(activity_name)

    trace_id = uuid.uuid4().hex[:8]
    t0 = time.time()
    logger.info(f"{lu.MAGENTA}[RAG][{trace_id}] Start{lu.RESET}")

    instruction_owner = await resolve_instruction_owner(user)

    logger.info(f"{lu.CYAN}[RAG][{trace_id}] user={getattr(user, 'id', None)} instruction_owner={getattr(instruction_owner, 'id', None)} activity={activity_name}{lu.RESET}")

    scenarios = await get_available_scenarios(instruction_owner.id, activity.id)
    available_scenarios_text = format_available_scenarios(scenarios)

    if not _available_scenarios_logged:
        logger.debug(f"{lu.YELLOW}[RAG][{trace_id}] scenarios_count={len(scenarios)}{lu.RESET}")
        logger.info(f"{lu.MAGENTA}Available scenarios:\n{available_scenarios_text}{lu.RESET}")
        _available_scenarios_logged = True

    current = rag_state.get("current_scenario") or START_SCENARIO
    logger.info(f"{lu.CYAN}[RAG][{trace_id}] current_scenario={current}{lu.RESET}")

    instructions_text = await get_full_instruction_text(
        instruction_name=current,
        user_id=instruction_owner.id,
        activity_id=activity.id,
    )

    logger.info(f"{lu.CYAN}[RAG][{trace_id}] retrieved_instructions_text_len={len(instructions_text)}{lu.RESET}")
    if not instructions_text.strip():
        logger.warning(f"{lu.RED}[RAG][{trace_id}] No instructions_text found for scenario={current}.{lu.RESET}")

    system_prompt = build_system_prompt(
        available_scenarios_text=available_scenarios_text,
        current_scenario=current,
        instructions_text=instructions_text,
    )

    # Build message history
    msg_history: list[BaseMessage] = []
    for role, content, _ts in context_buffer:
        if role == "user":
            msg_history.append(HumanMessage(content=content))
        elif role == "assistant":
            msg_history.append(AIMessage(content=content))
    
    logger.debug(f"{lu.MAGENTA}[RAG][{trace_id}] msg_history_len={len(msg_history)}{lu.RESET}")

    messages = [SystemMessage(content=system_prompt)] + msg_history + [
        HumanMessage(content=user_text)
    ]

    raw = await invoke_chain_get_raw_text(messages)
    logger.debug(f"{lu.MAGENTA}[RAG][{trace_id}] LLM raw length={len(raw or '')}{lu.RESET}")
    
    try:
        llm_struct = parse_structured_llm_response(raw, output_parser, trace_id=trace_id)
    except RagParseError as e:
        _log_json_fail(trace_id, raw, e)
        raise

    logger.info(f"{lu.GREEN}LLM next_state: {llm_struct.next_state}{lu.RESET}")

    rag_state["current_scenario"] = llm_struct.next_state
    
    t_end = time.time()
    logger.info(f"{lu.GREEN}[RAG][{trace_id}] End next_state={llm_struct.next_state} total={(t_end - t0):.3f}s{lu.RESET}")
        
    return {
    "text": llm_struct.assistant_response,
    "current_scenario": current,
    "next_scenario": llm_struct.next_state,
    }