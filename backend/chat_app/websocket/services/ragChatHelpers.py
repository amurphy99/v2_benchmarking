# chat_app/services/ragChatHelper.py
import json
import asyncio
import logging
import re

from django.db.models.functions import Lower
from django.core.exceptions import ObjectDoesNotExist

from pgvector.django import CosineDistance

from chat_app.models import RAGInstructions, Activity
from rag_vectorstore.models import RAGInstructionChunkEmbedding  
from .chatHelpers import RagParseError 
from rag_vectorstore.services.vdb_services import get_embeddings_model

from pydantic import BaseModel, Field
from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, BaseMessage

from ...         import config        as cf

logger = logging.getLogger(__name__)


START_SCENARIO = "start_conversation"

class LlmResponse(BaseModel):
    assistant_response: str = Field(..., description="the assistant's response to the user query")
    current_scenario: str = Field(..., description="the current scenrario (stage) of the conversation.")
    next_scenario: str = Field(..., description="the next scenario to move to after this response. (can be same as current if a topic change is not needed).")


output_parser = PydanticOutputParser(pydantic_object=LlmResponse)
_available_scenarios_logged = False

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


def parse_llm_json(text: str) -> dict:
    """
    JSON extraction and light repair.
    Handles:
      - extra leading/trailing text
      - trailing <|end|>
      - trailing commas
      - missing final '}' (common truncation case)
    If still invalid -> raise RagParseError.
    """
    raw = (text or "").strip()
    raw = raw.replace("<|end|>", "").strip()

    # Extract likely JSON region
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1:
        raise RagParseError("No JSON object start found")
    if end == -1:
        # If no closing brace at all, try to treat full tail as JSON and fix later
        candidate = raw[start:]
    else:
        candidate = raw[start:end + 1]

    def try_load(s: str) -> dict | None:
        try:
            return json.loads(s)
        except Exception:
            return None

    # Attempt 1: direct
    obj = try_load(candidate)
    if obj is not None:
        return obj

    # Repair 1: remove trailing commas before } or ]
    repaired = re.sub(r",\s*([}\]])", r"\1", candidate)

    # Repair 2: if braces look unbalanced, close them (only if it's close)
    open_braces = repaired.count("{")
    close_braces = repaired.count("}")
    if close_braces < open_braces and (open_braces - close_braces) <= 2:
        repaired = repaired + ("}" * (open_braces - close_braces))

    obj = try_load(repaired)
    if obj is not None:
        return obj

    raise RagParseError("Failed to parse/repair JSON output from LLM")


def get_activity(activity_name: str) -> Activity:
    return Activity.objects.get(name=activity_name)


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
    
    return f"""<|system|>
    You are a scenario-based conversational assistant.

    The conversation is structured into SCENARIOS. Scenarios are stages that help guide the flow of the conversation. 
    Scenarios define the goals for what should be achieved in that part of the conversation.
    You will be given instructions for the CURRENT_SCENARIO to help you decide how to respond to the user.
    The instructions for each scenario will include:
    - The ultimate goals of the scenario
    - signals for understanding when the goals of scenario is complete and it is time to move to a new scenario topic
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
    - how to respond to the user,
    - whether to stay in the current scenario or move to a new one,
    - which scenario should come next.
    3. Produce a JSON object with the following fields:
    - "assistant_response": your resposne to the users last query (a short natural language reply),
    - "current_scenario": the scenario you believe we are currently in *after* interpreting this message,
    - "next_scenario": the next scenario you recommend moving to. If you are not ready to change scenarios yet, set "next_scenario" equal to the current scenario. Only move to a new scenario when the goals of the current scenario have been met.

    JSON OUTPUT FORMAT (very important):
    **Return ONLY a JSON object, no extra text**. Example:

    {{
    "assistant_response": "Hi there! How has your day been so far?",
    "current_scenario": "start_conversation",
    "next_scenario": "initiate_smalltalk"
    }} <|end|>
    """



async def invoke_chain_get_raw_text(messages: list) -> str:
    """
    Run prompt -> llm only and return raw text output.
    Runs off the event loop to avoid blocking the websocket.
    """
    prompt = ChatPromptTemplate.from_messages(messages)
    chain = prompt | cf.llm 

    def _run():
        out = chain.invoke({})
        # LlamaCpp usually returns a string; other models may return objects.
        return out if isinstance(out, str) else str(out)

    return await asyncio.to_thread(_run)

def parse_structured_llm_response(raw_text: str, output_parser: PydanticOutputParser) -> "LlmResponse":
    """
    Cycle:
      1) Try PydanticOutputParser.parse(raw_text)
      2) If fail -> repair/extract JSON -> validate -> LlmResponse
      3) If still fail -> raise RagParseError
    """
    # ---- PydanticOutputParser ----
    try:
        parsed = output_parser.parse(raw_text)
        # parsed should already be LlmResponse if parser is configured with it
        return parsed
    except Exception as e1:
        first_err = e1

    # ---- repair + json + validate ----
    try:
        payload = parse_llm_json(raw_text) 
    except Exception as e2:
        raise RagParseError(f"Failed parsing via pydantic and repair; repair step error: {e2}") from first_err

    try:
        resp = payload.get("assistant_response")
        cur = payload.get("current_scenario")
        nxt = payload.get("next_scenario")

        if not isinstance(resp, str) or not resp.strip():
            raise ValueError("assistant_response missing/invalid")
        if not isinstance(cur, str) or not cur.strip():
            raise ValueError("current_scenario missing/invalid")
        if not isinstance(nxt, str) or not nxt.strip():
            raise ValueError("next_scenario missing/invalid")

        return LlmResponse(
            assistant_response=resp.strip(),
            current_scenario=cur.strip(),
            next_scenario=nxt.strip(),
        )
    except Exception as e3:
        raise RagParseError(f"Failed parsing via pydantic and repair; validation error: {e3}") from first_err


async def rag_response_fn(
    context_buffer,
    user_text: str,
    *,
    user,
    activity_name: str,
    rag_state: dict,
) -> dict:
    global _available_scenarios_logged
    activity = get_activity(activity_name)
    instruction_owner = resolve_instruction_owner(user)

    scenarios = get_available_scenarios(instruction_owner, activity)
    available_scenarios_text = format_available_scenarios(scenarios)

    if not _available_scenarios_logged:
        logger.info("Available scenarios:\n%s", available_scenarios_text)
        _available_scenarios_logged = True

    current = rag_state.get("current_scenario") or START_SCENARIO

    chunks = retrieve_instruction_chunks(
        instruction_name=current,
        user_id=instruction_owner,
        activity_id=activity.id,
        query_text=user_text,
        k=4,
    )
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

    messages = [SystemMessage(content=system_prompt)] + msg_history + [
        HumanMessage(content=user_text + "\n<|assistant|>\n")
    ]

    raw = await invoke_chain_get_raw_text(messages)
    
    llm_struct = parse_structured_llm_response(raw, output_parser)

    logger.info("LLM next_scenario: %s", llm_struct.next_scenario)

    rag_state["current_scenario"] = llm_struct.next_scenario
    
    return {
    "text": llm_struct.assistant_response,
    "current_scenario": llm_struct.current_scenario,
    "next_scenario": llm_struct.next_scenario,
    }