# chat_app/services/llm/instructor_client.py
import os
import json
import logging
import instructor
from openai import AsyncOpenAI
from ...services import logging_utils as lu

logger = logging.getLogger(__name__)

def build_instructor_client():
    """
    Builds an Instructor-wrapped AsyncOpenAI client for OpenAI-compatible servers.
    """
    
    # For chat completions we want base like: http://host:PORT/v1
    base = os.getenv("LLM_BASE_URL", "127.0.0.1")
    port = "8080"
    llm_url = f"http://{base}:{port}/v1"

    llm_key = os.getenv("LLM_GATEWAY_TOKEN") or "SAMPLE_TOKEN"
    timeout = float(os.getenv("LLM_TIMEOUT", "20"))

    openai_client = AsyncOpenAI(
        base_url=llm_url,
        api_key=llm_key,
        timeout=timeout,
    )

     # Wrap with Instructor and add response hook for logging
    instructor_client = instructor.from_openai(openai_client, mode=instructor.Mode.JSON)
    
    # Add a hook to log raw responses
    original_create = instructor_client.chat.completions.create
    
    async def logged_create(*args, **kwargs):
        response = await original_create(*args, **kwargs)
        try:
            response_dict = response.model_dump() if hasattr(response, 'model_dump') else response.__dict__
            pretty = json.dumps(response_dict, indent=2, ensure_ascii=False)
            logger.info(f"{lu.BRIGHT_YELLOW}---------- INSTRUCTOR RAW RESPONSE ----------{lu.RESET}")
            logger.info(pretty)
            logger.info(f"{lu.BRIGHT_YELLOW}{lu.HLINE}{lu.RESET}")
        except Exception as e:
            logger.warning(f"{lu.BG_RED}Failed to log Instructor response: {e}{lu.RESET}")
        return response
    
    instructor_client.chat.completions.create = logged_create

    # return Instructor client wrapping the OpenAI client in JSON mode
    return instructor_client