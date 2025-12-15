# chat_app/services/ragChatHelper.py
import time
import uuid
import logging
from typing import Any

from django.db.models.functions import Lower
from django.core.exceptions import ObjectDoesNotExist
from channels.db import database_sync_to_async

from pgvector.django import CosineDistance

from chat_app.models import RAGInstructions, Activity
from rag_vectorstore.models import RAGInstructionChunkEmbedding  
from rag_vectorstore.services.vdb_services import get_embeddings_model

from .chatHelpers import RagParseError 
from .parsingHelpers import _log_json_fail, _truncate, parse_structured_llm_response, LlmResponse
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


@database_sync_to_async
def get_activity(activity_name: str) -> Activity:
    return Activity.objects.get(name=activity_name)

@database_sync_to_async
def get_available_scenarios(user_id: int, activity: Activity) -> list[dict]:
    """
    Returns [{name: ..., description: ...}, ...]
    """
    qs = (
        RAGInstructions.objects
        .filter(user=user_id, activity=activity)
        .values("name", "description")
        .order_by(Lower("name"))
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

    logger.info("Retrieved %d instruction chunks for instruction '%s'", len(fetched_instructions), instruction_name)
    
    return fetched_instructions


def chunks_to_text(chunks: list[RAGInstructionChunkEmbedding]) -> str:
    parts = []
    for c in chunks:
        parts.append(f"[name={c.name} chunk={c.chunk_index}]\n{c.content.strip()}")
    return "\n\n".join(parts)


def build_system_prompt(
    *,
    available_scenarios_text: str,
    current_scenario: str,
    instructions_text: str,
) -> str:
    
    return f"""
    You are a scenario-based conversational assistant.

    The conversation is structured into SCENARIOS. Scenarios are stages that help guide the flow of the conversation. 
    Scenarios define the goals for what should be achieved in that part of the conversation.
    You will be given instructions for the CURRENT_SCENARIO to help you decide how to respond to the user.
    The instructions for each scenario will include:
    - The ultimate goals of the scenario
    - signals for understanding when the goals of scenario is complete and when it is time to move to a new scenario topic
    - guidelines for how to respond and how to move toward the next scenario.
    - Also, examples of user and system responses that fit within the scenario.

    Here are the AVAILABLE_SCENARIOS:
    {available_scenarios_text}

    Here is the CURRENT_SCENARIO: "{current_scenario}"

    Below are the INSTRUCTIONS for the CURRENT_SCENARIO.

    INSTRUCTIONS FOR CURRENT_SCENARIO:
    ----------------
    {instructions_text}
    ----------------

    Your job each turn:
    1. Read the user message and the recent conversation history.
    2. Use the scenario instructions to decide:
    - how to respond to the user in the current turn,
    - whether to stay in the current scenario or move to a new one in the next turn,
    - which scenario should come next.
    3. Produce a JSON object with the following fields:
    - "assistant_response": your resposne to the users last query (a short natural language reply),
    - "next_scenario": the next scenario you recommend moving to. If you are not ready to change scenarios yet, set "next_scenario" equal to the current scenario. Only move to a new scenario when the goals of the current scenario have been met.

    STRICT OUTPUT CONTRACT (must follow):
    - Output exactly ONE JSON object and nothing else.
    - Do not output markdown, code fences, explanations, labels, or commentary.
    - Do not include trailing commas.
    - Do not include comments with the output.
    - The JSON object MUST be parseable by Python json.loads.
    - Only these keys are allowed: "assistant_response", "next_scenario".
    - "next_scenario" must be either the current scenario or one of AVAILABLE_SCENARIOS.

    Example outputs (single line):
    Example 1:
    {{"assistant_response":"Hi there! How has your day been so far?","next_scenario":"initiate_smalltalk"}}
    Example 2:
    {{"assistant_response":"Nice to meet you, John. What do you enjoy doing in your free time?","next_scenario":"initiate_smalltalk"}}
    Example 3:
    {{"assistant_response":"That sounds fun—what got you into it?","next_scenario":"explore_user_interests"}}
    Example 4:
    {{"assistant_response":"That’s awesome! what got you into photography?","next_scenario":"explore_user_interests"}}
    Example 5:
    {{"assistant_response":"Would you like to talk about a favorite memory connected to that?","next_scenario":"initiate_memory_activity"}}
    """


async def invoke_chain_get_raw_text(messages: list) -> str:
    """
    Run prompt -> llm only and return raw text output.
    Always prefer async chain execution.
    """
    prompt = ChatPromptTemplate.from_messages(messages)
    llm = cf.llm_lc_wrapper.bind(
            temperature=0.1,
            top_p=1.0,
            top_k=0,
            max_tokens=256,
        )

    chain = prompt | llm

    out = await chain.ainvoke({})
    
    if isinstance(out, AIMessage):
        return _message_content_to_text(out.content)

    if isinstance(out, str):
        return out

    return str(out)


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
    logger.info("[RAG][%s] Start", trace_id)

    instruction_owner = await resolve_instruction_owner(user)

    logger.info("[RAG][%s] user=%s instruction_owner=%s activity=%s",
                trace_id, getattr(user, "id", None), getattr(instruction_owner, "id", None), activity_name)

    scenarios = await get_available_scenarios(instruction_owner.id, activity)
    available_scenarios_text = format_available_scenarios(scenarios)

    if not _available_scenarios_logged:
        logger.debug("[RAG][%s] scenarios_count=%d", trace_id, len(scenarios))
        logger.info("Available scenarios:\n%s", available_scenarios_text)
        _available_scenarios_logged = True

    current = rag_state.get("current_scenario") or START_SCENARIO
    logger.info("[RAG][%s] current_scenario=%s", trace_id, current)

    chunks = await retrieve_instruction_chunks(
        instruction_name=current,
        user_id=instruction_owner.id,
        activity_id=activity.id,
        query_text=user_text,
        k=4,
    )
    logger.info("[RAG][%s] retrieved_chunks=%d", trace_id, len(chunks))
    instructions_text = chunks_to_text(chunks)

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
    
    logger.debug("[RAG][%s] msg_history_len=%d", trace_id, len(msg_history))

    messages = [SystemMessage(content=system_prompt)] + msg_history + [
        HumanMessage(content=user_text)
    ]

    raw = await invoke_chain_get_raw_text(messages)
    logger.info("[RAG][%s] LLM raw output:\n%s", trace_id, _truncate(raw, 8000))
    logger.debug("[RAG][%s] LLM raw length=%d", trace_id, len(raw or ""))
    
    try:
        llm_struct = parse_structured_llm_response(raw, output_parser, trace_id=trace_id)
    except RagParseError as e:
        _log_json_fail(trace_id, raw, e)
        raise

    logger.info("LLM next_scenario: %s", llm_struct.next_scenario)

    rag_state["current_scenario"] = llm_struct.next_scenario
    
    t_end = time.time()
    logger.info("[RAG][%s] End next_scenario=%s total=%.3fs",
                trace_id, llm_struct.next_scenario, (t_end - t0))
        
    return {
    "text": llm_struct.assistant_response,
    "current_scenario": current,
    "next_scenario": llm_struct.next_scenario,
    }