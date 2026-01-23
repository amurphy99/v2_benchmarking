import json
import re
from .chatHelpers import RagParseError 
import logging
from pydantic import BaseModel, Field

from langchain_core.output_parsers import PydanticOutputParser

logger = logging.getLogger(__name__)

class LlmResponse(BaseModel):
    assistant_response: str = Field(..., description="the assistant's response to the user query")
    next_scenario: str = Field(..., description="the next scenario to move to after this response. (can be same as current if a topic change is not needed).")

def _truncate(s: str, n: int = 3000) -> str:
    s = "" if s is None else str(s)
    return s if len(s) <= n else (s[:n] + f"\n... [truncated {len(s)-n} chars]")

def _log_json_fail(trace_id: str, raw_text: str, err: Exception):
    logger.error(
        "[RAG][%s] JSON parse failed: %s\nRAW:\n%s",
        trace_id, repr(err), _truncate(raw_text, 8000)
    )

def _extract_last_balanced_json_object(raw: str) -> str | None:
    """Sometimes the model actually returns a valid JSON somewhere inside the response.
    This function tries to extract that object."""
    start = None
    depth = 0
    last_obj = None

    for i, ch in enumerate(raw):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            if depth > 0:
                depth -= 1
                if depth == 0 and start is not None:
                    last_obj = raw[start:i+1]
                    start = None

    return last_obj


def parse_llm_json(text: str) -> dict:
    raw = (text or "").strip()
    raw = raw.replace("<|end|>", "").strip()

    def try_load(s: str) -> dict | None:
        try:
            return json.loads(s)
        except Exception:
            return None

    # direct parse (if model behaved perfectly)
    obj = try_load(raw)
    if obj is not None:
        return obj

    # Extract last balanced {...}
    candidate = _extract_last_balanced_json_object(raw)

    # try to repair if no balanced object found
    if not candidate:
        start = raw.find("{")
        if start == -1:
            raise RagParseError("No JSON object start found")
        candidate = raw[start:]  # may be truncated/missing final brace

    logger.debug("[RAG] parse_llm_json candidate:\n%s", _truncate(candidate, 4000))

    # Attempt 1: parse candidate
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

    logger.debug("[RAG] parse_llm_json repaired:\n%s", _truncate(repaired, 4000))
    raise RagParseError("Failed to parse/repair JSON output from LLM")


def parse_structured_llm_response(raw_text: str, output_parser: PydanticOutputParser, *, trace_id: str = "no-trace") -> "LlmResponse":
    """
    Cycle:
      1) Try PydanticOutputParser.parse(raw_text)
      2) If fail -> repair/extract JSON -> validate -> LlmResponse
      3) If still fail -> raise RagParseError
    """
    # ---- PydanticOutputParser ----
    try:
        logger.debug("[RAG][%s] parse: trying pydantic parser", trace_id)
        parsed = output_parser.parse(raw_text)
        logger.debug("[RAG][%s] parse: pydantic success", trace_id)
        return parsed
    except Exception as e1:
        first_err = e1
        logger.warning("[RAG][%s] parse: pydantic failed: %s", trace_id, repr(e1))
    
    # ---- Try Repairing JSON ----
    try:
        logger.debug("[RAG][%s] parse: trying repair json", trace_id)
        payload = parse_llm_json(raw_text)
        logger.debug("[RAG][%s] parse: repair json success keys=%s", trace_id, list(payload.keys()))
    except Exception as e2:
        logger.error("[RAG][%s] parse: repair json failed: %s", trace_id, repr(e2))
        raise RagParseError(f"Failed parsing via pydantic and repair; repair step error: {e2}") from first_err

    try:
        resp = payload.get("assistant_response")
        nxt = payload.get("next_scenario")

        if not isinstance(resp, str) or not resp.strip():
            raise ValueError("assistant_response missing/invalid")
        if not isinstance(nxt, str) or not nxt.strip():
            raise ValueError("next_scenario missing/invalid")

        logger.info("[RAG][%s] parse: validated next=%s", trace_id, nxt.strip())

        return LlmResponse(
            assistant_response=resp.strip(),
            next_scenario=nxt.strip(),
        )
    except Exception as e3:
        raise RagParseError(f"Failed parsing via pydantic and repair; validation error: {e3}") from first_err