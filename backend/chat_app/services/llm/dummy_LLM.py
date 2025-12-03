import logging
logger = logging.getLogger(__name__)

# ================================================================================
# Dummy LLM class for testing
# ================================================================================
# The only reason for this now is local testing...
class DummyLLM:
    def __init__(self, *args, **kwargs):
        self.num_messages = 0
        logger.info("Dummy LLM initialized (no real model loaded)")

    async def __call__(self, prompt, max_tokens=None, stop=None, echo=False):
        self.num_messages += 1
        return {"choices": [{"text": f"This is dummy response number {self.num_messages} from the LLM."}]}
    