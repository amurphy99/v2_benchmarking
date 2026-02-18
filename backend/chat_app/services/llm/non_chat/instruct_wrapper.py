"""
Assist with all non-live-chat related LLM calls used around the project.
--------------------------------------------------------------------------------
`backend.chat_app.services.llm.non_chat.instruct_wrapper`

Doesn't need to import anything from the other files because this will always be
called by something else. Just serves as a default pathway for those methods to
access the LLMs.

TODO: Might need to add guards for local mode for any other services that make
      use of this file... `post_chat_analysis` has one already though.

"""
import logging, os
logger = logging.getLogger(__name__)

# Imports for generation
import asyncio
import instructor
from openai   import OpenAI, AsyncOpenAI
from pydantic import ValidationError

# From this project
from ....services import logging_utils as lu
from ....services.logging_utils import RESET, BOLD, UNBOLD, LLM_MAIN

# ================================================================================
# InstructWrapper
# ================================================================================    
class InstructWrapper:

    # Initialize static variables from the environment
    API_KEY  = os.getenv("LLM_GATEWAY_TOKEN", "DEFAULT_TOKEN")
    BASE_URL = os.getenv("LLM_BASE_URL",      "127.0.0.1"    )
    FULL_URL = f"http://{BASE_URL}:8080/v1"

    # Initialize an asynchronous OpenAI client instance to use
    @staticmethod
    def init_async_client():
        return instructor.from_openai(
            AsyncOpenAI(base_url=InstructWrapper.FULL_URL, api_key=InstructWrapper.API_KEY, timeout=20.0),
            mode=instructor.Mode.JSON,
        )

    # --------------------------------------------------------------------------------
    # Catch errors and retry if a call fails
    # --------------------------------------------------------------------------------
    @staticmethod
    async def call_with_retries_async(client, *, model, response_model, messages, temperature=0.2, max_retries=3, backoff_sec=1.0, default=None):
        # Try to get a response the given number of times
        for attempt in range(max_retries + 1):
            try: return await client.chat.completions.create(model=model, response_model=response_model, messages=messages, temperature=temperature)
            
            # Capture Pydantic response schema validation errors (i.e. the model didn't return proper JSON)
            except (ValidationError, Exception) as e:
                logger.info(f"{LLM_MAIN}[LLM] Post-chat LLM call {lu.RED}{BOLD}FAILED{UNBOLD}{LLM_MAIN} (attempt {attempt+1}/{max_retries+1}): {repr(e)} {RESET}")
                if attempt < max_retries: await asyncio.sleep(backoff_sec * (2 ** attempt))
        
        # The maximum retries has been exceeded
        return default
