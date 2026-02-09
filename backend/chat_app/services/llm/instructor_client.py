# chat_app/services/llm/instructor_client.py
import os
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

    # 1. Initialize Instructor
    instructor_client = instructor.from_openai(openai_client, mode=instructor.Mode.JSON)

    # 2. Define the INPUT Hook (Fires BEFORE API call)
    def log_input_hook(*args, **kwargs):
        logger.info(f"{lu.BRIGHT_YELLOW}---------- INSTRUCTOR INPUT (SENT) ----------{lu.RESET}")
        
        # Log the messages exactly as they go to the LLM (including system prompts)
        if 'messages' in kwargs:
            for msg in kwargs['messages']:
                role = msg.get('role', 'unknown').upper()
                content = msg.get('content', '')
                logger.info(f"[{role}]: {content}")
        
        logger.info(f"{lu.BRIGHT_YELLOW}{lu.HLINE}{lu.RESET}")

    # 3. Define the OUTPUT Hook (Fires AFTER API call, receives Raw Response)
    def log_response_hook(response, *args, **kwargs):
        logger.info(f"{lu.BRIGHT_YELLOW}---------- INSTRUCTOR RAW OUTPUT (RECEIVED) ----------{lu.RESET}")
        
        # 'response' is the raw ChatCompletion object (not your Pydantic model)
        try:
            # Log Usage Stats
            if hasattr(response, 'usage') and response.usage:
                u = response.usage
                logger.info(f"USAGE: Prompt: {u.prompt_tokens} | Completion: {u.completion_tokens} | Total: {u.total_tokens}")
            
            # Log Finish Reason (Check for Truncation)
            if hasattr(response, 'choices') and len(response.choices) > 0:
                choice = response.choices[0]
                finish_reason = choice.finish_reason
                logger.info(f"FINISH REASON: {finish_reason}")
                
                if finish_reason == "length":
                    logger.warning(f"{lu.BG_RED}WARNING: Response was truncated due to length!{lu.RESET}")

            # Log Raw Content (might be large)
            # logger.info(f"RAW CONTENT: {response.choices[0].message.content}")

        except Exception as e:
            logger.warning(f"Failed to log raw response details: {e}")
            
        logger.info(f"{lu.BRIGHT_YELLOW}{lu.HLINE}{lu.RESET}")

    # 4. Attach Hooks
    instructor_client.on("completion:kwargs", log_input_hook)
    instructor_client.on("completion:response", log_response_hook)

    return instructor_client