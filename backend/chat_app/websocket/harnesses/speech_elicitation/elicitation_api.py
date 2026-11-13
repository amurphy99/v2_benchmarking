"""
Structured LLM client for the speech elicitation reply.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.speech_elicitation.elicitation_api`

One client is shared by every speech elicitation chat (`get_elicitation_api`),
and building it does not contact the endpoint.

"""
from __future__ import annotations
from typing     import TYPE_CHECKING

# From this project
from ....services.llm.structured_api import StructuredAPI
from    .config                      import ELICITATION_MAX_RETRIES, ELICITATION_REPLY_TEMP, ELICITATION_REPLY_THINKING, ELICITATION_RETRY_DELAY_SEC, ELICITATION_TIMEOUT_SEC
from    .prompts                     import build_messages
from    .response_models             import ElicitationTurn

if TYPE_CHECKING:
    from .prompts import Directive
    from .topics  import Topic

# Process-wide client shared by every speech elicitation chat
_elicitation_api: ElicitationAPI | None = None


# A reply call that failed every attempt
class ElicitationAPIError(RuntimeError):
    pass


# --------------------------------------------------------------------------------
# Elicitation API
# --------------------------------------------------------------------------------
# The reply call, retried a set number of times before raising `ElicitationAPIError`
class ElicitationAPI(StructuredAPI):
    NAME  = "Speech elicitation"
    ERROR = ElicitationAPIError

    # Build the client every reply call reuses
    def __init__(self) -> None:
        super().__init__(
            timeout_sec     = ELICITATION_TIMEOUT_SEC,
            max_retries     = ELICITATION_MAX_RETRIES,
            retry_delay_sec = ELICITATION_RETRY_DELAY_SEC,
        )

    # Reply to the user's latest message (or to their silence), ending with a question
    async def reply(self, topic: Topic, history: list[dict[str, str]], directive: Directive | None) -> ElicitationTurn:
        return await self._request(
            label          = "reply",
            response_model = ElicitationTurn,
            messages       = build_messages(topic, history, directive),
            temperature    = ELICITATION_REPLY_TEMP,
            thinking       = ELICITATION_REPLY_THINKING,
        )


# Return the shared client, building it on first use
def get_elicitation_api() -> ElicitationAPI:
    global _elicitation_api
    if _elicitation_api is None: _elicitation_api = ElicitationAPI()
    return _elicitation_api
