"""
Structured LLM client for each active-listening generation stage.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.active_listening.active_listening_api`

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
from pydantic   import BaseModel

import time

# From this project
from ....services.llm.structured_api import StructuredAPI
from    .config                      import (
    ACTIVE_LISTENING_TIMEOUT_SEC, ACTIVE_LISTENING_MAX_RETRIES,
    ACTIVE_LISTENING_RETRY_DELAY_SEC, ACTIVE_LISTENING_ASSESSMENT_TEMP,
    ACTIVE_LISTENING_RESPONSE_TEMP,
)
from    .prompts                     import build_assessment_messages, build_confirmation_messages, build_response_messages
from    .response_models             import EndConfirmation, SpokenResponse, TurnAssessment, log_end_confirmation, log_spoken_response, log_turn_assessment


# Custom "Active-Listening" API error
class ActiveListeningAPIError(RuntimeError):
    """Identify an active-listening request that could not return its required schema."""


# ================================================================================
# Active-Listening API
# ================================================================================
class ActiveListeningAPI(StructuredAPI):
    """
    This helps run all 3 of the "assessment", "response", and "confirmation"
    model calls. Requests and their retries go through the shared `StructuredAPI`.

    NOTE: Using a shorter retry policy here than in the original live-chat mode
          because having multiple stages needing to retry can make latency
          snowball...

    """
    NAME  = "Active-listening"
    ERROR = ActiveListeningAPIError

    # Initialize a single reusable asynchronous structured-generation client
    def __init__(self) -> None:
        super().__init__(
            timeout_sec     = ACTIVE_LISTENING_TIMEOUT_SEC,
            max_retries     = ACTIVE_LISTENING_MAX_RETRIES,
            retry_delay_sec = ACTIVE_LISTENING_RETRY_DELAY_SEC,
        )

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
