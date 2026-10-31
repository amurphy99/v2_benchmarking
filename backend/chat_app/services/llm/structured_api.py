"""
Shared structured-generation client for the chat types' LLM calls, with retries.
--------------------------------------------------------------------------------
`backend.chat_app.services.llm.structured_api`

A chat type's API class subclasses `StructuredAPI`, names its own error type
(`ERROR`) so its callers can catch exactly that, and sends each call through
`_request`. Building one does not contact the endpoint; only an awaited request
does.

NOTE: A response that fails its schema's validation counts as a failed attempt.
      Instructor is left at its default of one try, so it never re-asks the
      model with the validation error inside an attempt.

"""
from __future__ import annotations
from   typing   import TypeVar

import asyncio, logging
logger = logging.getLogger(__name__)

# Structured generation imports
import instructor
from openai   import AsyncOpenAI
from pydantic import BaseModel

# From this project
from ..logging_utils import RESET, BOLD, UNBOLD, LLM_MAIN
from  .endpoint      import LLM_URL, API_KEY, MODEL_NAME

# Structured model returned by one request
ResponseT = TypeVar("ResponseT", bound=BaseModel)

# Chat-template setting that turns the model's thinking off (where the template supports it)
NO_THINKING = {"chat_template_kwargs": {"enable_thinking": False}}


# ================================================================================
# Structured API
# ================================================================================
# One reusable structured-generation client with bounded retries
class StructuredAPI:
    NAME  : str             = "Structured"  # Shown in this client's log lines
    ERROR : type[Exception] = RuntimeError  # Raised once every attempt has failed

    # --------------------------------------------------------------------------------
    # Build the asynchronous client every request reuses
    # --------------------------------------------------------------------------------
    def __init__(
        self,
        *,
        timeout_sec     : float,             # Per-request endpoint timeout
        max_retries     : int,               # Additional attempts after the first
        retry_delay_sec : float,             # Delay between attempts
        model           : str = MODEL_NAME,  # Hosted model every request uses
    ) -> None:
        self.model           = model
        self.max_retries     = max_retries
        self.retry_delay_sec = retry_delay_sec
        self.client          = instructor.from_openai(
            AsyncOpenAI(base_url=LLM_URL, api_key=API_KEY, timeout=timeout_sec),
            mode=instructor.Mode.JSON_SCHEMA,
        )
        logger.info(f"{LLM_MAIN}[LLM] {BOLD}{type(self).__name__}{UNBOLD} initialized. URL: {LLM_URL}, model: {BOLD}{self.model}{RESET}")

    # --------------------------------------------------------------------------------
    # Send one structured request (with a set number of retries)
    # --------------------------------------------------------------------------------
    # Raises with `ERROR` once all retries have been exhausted
    async def _request(
        self,
        *,
        label          : str,                   # Call name printed in the logs
        response_model : type[ResponseT],       # Pydantic schema Instructor must return
        messages       : list[dict[str, str]],  # Complete system and conversation messages
        temperature    : float,                 # Sampling temperature for this call
        thinking       : bool = True,           # False asks the endpoint to skip the model's thinking
    ) -> ResponseT:
        last_error : Exception | None = None

        # Attempt to get a response from the backend a set number of times
        for attempt in range(self.max_retries + 1):
            try:
                return await self.client.chat.completions.create(
                    model          = self.model,
                    response_model = response_model,
                    messages       = messages,
                    temperature    = temperature,
                    extra_body     = None if thinking else NO_THINKING,
                )

            # Handle retry logic
            except Exception as exc:
                last_error = exc
                logger.warning(f"{LLM_MAIN}[LLM] {self.NAME} {label} failed (attempt {attempt + 1}/{self.max_retries + 1}): {exc!r}{RESET}")
                if attempt < self.max_retries: await asyncio.sleep(self.retry_delay_sec)

        # If we exhausted all retries, raise this client's own error
        raise self.ERROR(f"{self.NAME} {label} failed after all attempts") from last_error
