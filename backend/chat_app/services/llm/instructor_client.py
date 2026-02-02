# chat_app/services/llm/instructor_client.py
import os
import instructor
from openai import AsyncOpenAI

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

    # return Instructor client wrapping the OpenAI client in JSON mode
    return instructor.from_openai(openai_client, mode=instructor.Mode.JSON)