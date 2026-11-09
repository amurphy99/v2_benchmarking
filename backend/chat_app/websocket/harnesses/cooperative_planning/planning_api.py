"""
Structured LLM client for the cooperative planning calls.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.cooperative_planning.planning_api`

Each method is one call a pipeline makes (`pipelines.py`). One client is shared
by every planning chat (`get_planning_api`), and building it does not contact the
endpoint. Each call's temperature and thinking switch are in `config.py`.

"""
from __future__ import annotations
from typing     import TYPE_CHECKING

# From this project
from ....services.llm.structured_api import StructuredAPI
from    .config                      import (
    PLANNING_TIMEOUT_SEC, PLANNING_MAX_RETRIES, PLANNING_RETRY_DELAY_SEC,
    PLANNING_TRACK_TEMP, PLANNING_REPLY_TEMP, PLANNING_COMBINED_TEMP,
    PLANNING_TRACK_THINKING, PLANNING_REPLY_THINKING, PLANNING_COMBINED_THINKING,
)
from    .prompts                     import COMBINED_TASK, QUICK_REPLY_TASK, REPLY_TASK, TRACK_EXCHANGE_TASK, TRACK_TASK, build_messages

if TYPE_CHECKING:
    from .pipelines       import PlanningTurn
    from .plan_state      import PlanningState
    from .prompts         import Directive
    from .response_models import CombinedTurn, ExchangeUpdate, PlanUpdate, QuickReply, SpokenTurn

# Process-wide client shared by every planning chat
_planning_api: PlanningAPI | None = None


# A planning call that failed every attempt
class PlanningAPIError(RuntimeError):
    pass


# ================================================================================
# Planning API
# ================================================================================
# The planning calls, each retried a set number of times before raising `PlanningAPIError`
class PlanningAPI(StructuredAPI):
    NAME  = "Cooperative planning"
    ERROR = PlanningAPIError

    # Build the client every planning call reuses
    def __init__(self) -> None:
        super().__init__(
            timeout_sec     = PLANNING_TIMEOUT_SEC,
            max_retries     = PLANNING_MAX_RETRIES,
            retry_delay_sec = PLANNING_RETRY_DELAY_SEC,
        )

    # Work out how the user's latest message changes the plan
    async def track(self, turn: PlanningTurn) -> PlanUpdate:
        return await self._request(
            label          = "track",
            response_model = turn.models.plan_update,
            messages       = build_messages(TRACK_TASK, turn.scenario, turn.state, turn.history, None),
            temperature    = PLANNING_TRACK_TEMP,
            thinking       = PLANNING_TRACK_THINKING,
        )

    # Reply from a plan that already includes the user's latest message
    async def reply(self, turn: PlanningTurn, state: PlanningState, directive: Directive | None) -> SpokenTurn:
        return await self._request(
            label          = "reply",
            response_model = turn.models.spoken_turn,
            messages       = build_messages(REPLY_TASK, turn.scenario, state, turn.history, directive),
            temperature    = PLANNING_REPLY_TEMP,
            thinking       = PLANNING_REPLY_THINKING,
        )

    # Reply and work out both sides' changes in one call
    async def combined(self, turn: PlanningTurn, directive: Directive | None) -> CombinedTurn:
        return await self._request(
            label          = "combined",
            response_model = turn.models.combined_turn,
            messages       = build_messages(COMBINED_TASK, turn.scenario, turn.state, turn.history, directive),
            temperature    = PLANNING_COMBINED_TEMP,
            thinking       = PLANNING_COMBINED_THINKING,
        )

    # Reply from the plan as it was before the user's latest message
    async def quick_reply(self, turn: PlanningTurn, directive: Directive | None) -> QuickReply:
        return await self._request(
            label          = "quick reply",
            response_model = turn.models.quick_reply,
            messages       = build_messages(QUICK_REPLY_TASK, turn.scenario, turn.state, turn.history, directive),
            temperature    = PLANNING_REPLY_TEMP,
            thinking       = PLANNING_REPLY_THINKING,
        )

    # Work out how the last exchange (the user's message, then the reply already said) changed the plan
    async def track_exchange(self, turn: PlanningTurn, reply: str) -> ExchangeUpdate:
        return await self._request(
            label          = "track exchange",
            response_model = turn.models.exchange_update,
            messages       = build_messages(TRACK_EXCHANGE_TASK, turn.scenario, turn.state, [*turn.history, {"role": "assistant", "content": reply}], None),
            temperature    = PLANNING_TRACK_TEMP,
            thinking       = PLANNING_TRACK_THINKING,
        )


# --------------------------------------------------------------------------------
# Return the shared client, building it on first use
# --------------------------------------------------------------------------------
def get_planning_api() -> PlanningAPI:
    global _planning_api
    if _planning_api is None: _planning_api = PlanningAPI()
    return _planning_api
