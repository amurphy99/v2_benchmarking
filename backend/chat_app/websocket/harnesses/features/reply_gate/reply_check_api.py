"""
Structured LLM client for the reply check.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.features.reply_gate.reply_check_api`

One client is shared by every chat that uses the reply check
(`get_reply_check_api`), and building it does not contact the endpoint. A check
gets a single attempt: a verdict that needed a retry would come too late to
matter, so a check that fails lets the reply go out as usual (`gate.py`).

"""
from __future__ import annotations
from typing     import TYPE_CHECKING

# From this project
from .....services.llm.structured_api import StructuredAPI
from     .config                      import REPLY_CHECK_MAX_RETRIES, REPLY_CHECK_TEMP, REPLY_CHECK_THINKING, REPLY_CHECK_TIMEOUT_SEC

if TYPE_CHECKING: from .response_models import CheckResult

# Process-wide client shared by every chat that uses the reply check
_reply_check_api: ReplyCheckAPI | None = None


# A reply check that failed
class ReplyCheckAPIError(RuntimeError):
    pass


# --------------------------------------------------------------------------------
# Reply Check API
# --------------------------------------------------------------------------------
# The check call, tried once before raising `ReplyCheckAPIError`
class ReplyCheckAPI(StructuredAPI):
    NAME  = "Reply check"
    ERROR = ReplyCheckAPIError

    # Build the client every check reuses
    def __init__(self) -> None:
        super().__init__(
            timeout_sec     = REPLY_CHECK_TIMEOUT_SEC,
            max_retries     = REPLY_CHECK_MAX_RETRIES,
            retry_delay_sec = 0,
        )

    # Decide what the avatar does next, with the response built for this chat (`response_models.check_model`)
    async def check(self, messages: list[dict[str, str]], response_model: type[CheckResult]) -> CheckResult:
        return await self._request(
            label          = "check",
            response_model = response_model,
            messages       = messages,
            temperature    = REPLY_CHECK_TEMP,
            thinking       = REPLY_CHECK_THINKING,
        )


# Return the shared client, building it on first use
def get_reply_check_api() -> ReplyCheckAPI:
    global _reply_check_api
    if _reply_check_api is None: _reply_check_api = ReplyCheckAPI()
    return _reply_check_api
