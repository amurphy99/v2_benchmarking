"""
Dummy LLM class for local testing.
--------------------------------------------------------------------------------
`backend.chat_app.services.llm.live_chat.dummy_LLM`

Simulates how we make requests to the externally hosted LLM models to get chat
responses.

"""
import logging, asyncio
logger = logging.getLogger(__name__)

from dataclasses import dataclass

# Use a delay so that the responses don't come instantly
SIMULATED_DELAY = 1.0  # Artificial request time used to test the cancellation behavior


# --------------------------------------------------------------------------------
# Dummy Structured Response
# --------------------------------------------------------------------------------
@dataclass
class DummyResponse:
    thought       : str
    message       : str
    response_mood : str


# ================================================================================
# Dummy LLM class for testing
# ================================================================================
class DummyLLM:
    def __init__(self, *args, **kwargs):
        self.num_messages = 0
        logger.info("Dummy LLM initialized (no real model loaded)")

    async def __call__(
        self,
        prompt     : str | list[dict],          # Legacy prompt text or current message history
        max_tokens : int       | None = None,   # Legacy maximum response length
        stop       : list[str] | None = None,   # Legacy stop-token list
        echo       : bool             = False,  # Legacy prompt echo flag
    ) -> DummyResponse | dict:
        await asyncio.sleep(SIMULATED_DELAY)
        self.num_messages += 1

        if isinstance(prompt, list):
            return DummyResponse(
                thought       = "Dummy response selected for local testing.",
                message       = f"This is dummy response number {self.num_messages} from the LLM.",
                response_mood = "Neutral",
            )

        return {"choices": [{"text": f"This is dummy response number {self.num_messages} from the LLM."}]}
