"""
Structured LLM client for each active-listening generation stage.
--------------------------------------------------------------------------------
`backend.chat_app.services.llm.live_chat.active_listening.active_listening_api`

One asynchronous client is reused by the stateless response engine. This module
only performs requests when a stage method is awaited; importing or constructing
the client does not contact the configured endpoint.

TODO: How/where to add the extra arguments for disabling "thinking"?
    ```
    extra_body={
        "chat_template_kwargs": {
            "enable_thinking": False,
        },
    }
    ```

"""
from __future__ import annotations
from openai     import AsyncOpenAI
from pydantic   import BaseModel
from typing     import TypeVar

import instructor, asyncio, logging, time
logger = logging.getLogger(__name__)

# From this project
from .....config import (
    ACTIVE_LISTENING_TIMEOUT_SEC, ACTIVE_LISTENING_MAX_RETRIES,
    ACTIVE_LISTENING_RETRY_DELAY_SEC, ACTIVE_LISTENING_ASSESSMENT_TEMP,
    ACTIVE_LISTENING_RESPONSE_TEMP,
)
from  ...endpoint         import LLM_URL, API_KEY, MODEL_NAME
from ....logging_utils    import RESET, BOLD, UNBOLD, LLM_MAIN
from     .prompts         import build_assessment_messages, build_confirmation_messages, build_response_messages
from     .response_models import EndConfirmation, SpokenResponse, TurnAssessment, log_end_confirmation, log_spoken_response, log_turn_assessment


# Structured model returned by one generic request
ResponseT = TypeVar("ResponseT", bound=BaseModel)  # Structured model returned by one generic request

# Custom "Active-Listening" API error
class ActiveListeningAPIError(RuntimeError):
    """Identify an active-listening request that could not return its required schema."""


# ================================================================================
# Active-Listening API
# ================================================================================
class ActiveListeningAPI:
    """
    This helps run all 3 of the "assessment", "response", and "confirmation"
    model calls.

    NOTE: Using a shorter retry policy here than in the original live-chat mode
          because having multiple stages needing to retry can make latency
          snowball...
    
    """
    # Initialize a single reusable asynchronous structured-generation client
    def __init__(
        self,
        model           : str   = MODEL_NAME,                         # Hosted model used by every active-listening stage
        timeout_sec     : float = ACTIVE_LISTENING_TIMEOUT_SEC,       # Per-request endpoint timeout
        max_retries     : int   = ACTIVE_LISTENING_MAX_RETRIES,       # Additional attempts after the initial request
        retry_delay_sec : float = ACTIVE_LISTENING_RETRY_DELAY_SEC,   # Delay between retry attempts
    ) -> None:
        self.model           = model
        self.max_retries     = max_retries
        self.retry_delay_sec = retry_delay_sec
        self.client          = instructor.from_openai(
            AsyncOpenAI(base_url=LLM_URL, api_key=API_KEY, timeout=timeout_sec),
            mode=instructor.Mode.JSON_SCHEMA, # mode=instructor.Mode.JSON,
        )
        logger.info(f"{LLM_MAIN}[LLM] {BOLD}ActiveListeningAPI{UNBOLD} initialized. URL: {LLM_URL}, model: {BOLD}{self.model}{RESET}")

    # --------------------------------------------------------------------------------
    # Classify conversation state and response strategy for the latest user turn
    # --------------------------------------------------------------------------------
    async def assess_turn(self, history: list[dict[str, str]]) -> TurnAssessment:
        t0 = time.monotonic()
        response = await self._request(
            label          = "turn assessment",
            response_model = TurnAssessment,
            messages       = build_assessment_messages(history),
            temperature    = ACTIVE_LISTENING_ASSESSMENT_TEMP,
        )
        t1 = time.monotonic()
        log_turn_assessment(response, t0, t1)
        return response

    # --------------------------------------------------------------------------------
    # Generate concise spoken text from conversation and private structured context
    # --------------------------------------------------------------------------------
    async def generate_response(self, history: list[dict[str, str]], assessment: BaseModel, directive: str) -> SpokenResponse:
        t0 = time.monotonic()
        response = await self._request(
            label          = "spoken response",
            response_model = SpokenResponse,
            messages       = build_response_messages(history, assessment, directive),
            temperature    = ACTIVE_LISTENING_RESPONSE_TEMP,
        )
        t1 = time.monotonic()
        log_spoken_response(response, t0, t1)
        return response

    # --------------------------------------------------------------------------------
    # Separate response structure specifically for confirming if the user is finished
    # --------------------------------------------------------------------------------
    async def classify_end_confirmation(self, history: list[dict[str, str]]) -> EndConfirmation:
        t0 = time.monotonic()
        response = await self._request(
            label          = "end confirmation",
            response_model = EndConfirmation,
            messages       = build_confirmation_messages(history),
            temperature    = ACTIVE_LISTENING_ASSESSMENT_TEMP,
        )
        t1 = time.monotonic()
        log_end_confirmation(response, t0, t1)
        return response

    # ================================================================================
    # General request wrapper that all responses run through
    # ================================================================================
    async def _request(
        self,
        *,
        label          : str,                     # Stage name printed in the logs
        response_model : type[ResponseT],         # Pydantic schema Instructor must return
        messages       : list[dict[str, str]],    # Complete system and conversation messages
        temperature    : float,                   # Sampling temperature for this stage
    ) -> ResponseT:
        last_error : Exception | None = None

        # Attempt to get a response from the backend a set number of times
        for attempt in range(self.max_retries + 1):
            try:
                response: ResponseT = await self.client.chat.completions.create(
                    model          = self.model,
                    response_model = response_model,
                    messages       = messages,
                    temperature    = temperature,
                )
                return response

            # Handle retry logic
            except Exception as exc:
                last_error = exc
                logger.warning(f"{LLM_MAIN}[LLM] Active-listening {label} failed (attempt {attempt + 1}/{self.max_retries + 1}): {exc!r}{RESET}")
                if attempt < self.max_retries: await asyncio.sleep(self.retry_delay_sec)

        # If we exhausted all retries, return the custom error
        raise ActiveListeningAPIError(f"Active-listening {label} failed after all attempts") from last_error
