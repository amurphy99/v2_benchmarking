"""
Dummy LLM class for local testing.
--------------------------------------------------------------------------------
`backend.chat_app.services.llm.dummy_LLM`

Simulates how we make requests to the externally hosted LLM models to get chat
responses.

"""

import logging, asyncio
logger = logging.getLogger(__name__)

# Use a delay so that the responses don't come instantly
SIMULATED_DELAY = 1.0

# ================================================================================
# Dummy LLM class for testing
# ================================================================================
# The only reason for this now is local testing...
class DummyLLM:
    def __init__(self, *args, **kwargs):
        self.num_messages = 0
        logger.info("Dummy LLM initialized (no real model loaded)")

    async def __call__(self, prompt, max_tokens=None, stop=None, echo=False):
        await asyncio.sleep(SIMULATED_DELAY)  # Simulate 1 second network / model delay
        self.num_messages += 1
        return {"choices": [{"text": f"This is dummy response number {self.num_messages} from the LLM."}]}
    