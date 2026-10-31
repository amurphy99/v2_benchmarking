"""
Structured LLM client for the Map Task follower's calls.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.map_task.map_task_api`

Each method is one call a pipeline makes (`pipelines.py`). One client is shared
by every Map Task chat (`get_map_task_api`), and building it does not contact
the endpoint. Which calls let the model think first is set in `config.py`.

"""
from __future__ import annotations
from typing     import TYPE_CHECKING

# From this project
from ....services.llm.structured_api import StructuredAPI
from    .config                      import (
    MAP_TASK_TIMEOUT_SEC, MAP_TASK_MAX_RETRIES, MAP_TASK_RETRY_DELAY_SEC,
    MAP_TASK_FOLLOW_TEMP, MAP_TASK_CHECK_TEMP, MAP_TASK_ASSESS_TEMP, MAP_TASK_REPLY_TEMP,
    MAP_TASK_FOLLOW_THINKING, MAP_TASK_CHECK_THINKING, MAP_TASK_ASSESS_THINKING, MAP_TASK_REPLY_THINKING,
)
from    .prompts                     import ASSESS_TASK, CHECK_TASK, FOLLOW_TASK, REPLY_TASK, build_messages
from    .response_models             import DraftCheck, FollowerTurn, SpokenReply, TurnAssessment, models_for_map

if TYPE_CHECKING: from .understanding import TurnReading

# Process-wide client shared by every Map Task chat
_map_task_api: MapTaskAPI | None = None


# A Map Task call that failed every attempt
class MapTaskAPIError(RuntimeError):
    pass


# ================================================================================
# Map Task API
# ================================================================================
# The follower's LLM calls, each retried a set number of times before raising `MapTaskAPIError`
class MapTaskAPI(StructuredAPI):
    NAME  = "Map Task"
    ERROR = MapTaskAPIError

    # Build the client every Map Task call reuses
    def __init__(self) -> None:
        super().__init__(
            timeout_sec     = MAP_TASK_TIMEOUT_SEC,
            max_retries     = MAP_TASK_MAX_RETRIES,
            retry_delay_sec = MAP_TASK_RETRY_DELAY_SEC,
        )

    # Reply to a turn and give the move it asks for, in one call
    async def follow(self, reading: TurnReading, history: list[dict[str, str]]) -> FollowerTurn:
        return await self._request(
            label          = "follow",
            response_model = models_for_map(tuple(reading.task_map.landmarks)).follower_turn,
            messages       = build_messages(FOLLOW_TASK, reading, history),
            temperature    = MAP_TASK_FOLLOW_TEMP,
            thinking       = MAP_TASK_FOLLOW_THINKING,
        )

    # Confirm an answer drafted from the map, or correct it
    async def check_draft(self, reading: TurnReading, history: list[dict[str, str]], draft: str) -> DraftCheck:
        return await self._request(
            label          = "draft check",
            response_model = DraftCheck,
            messages       = build_messages(CHECK_TASK.format(draft=draft), reading, history),
            temperature    = MAP_TASK_CHECK_TEMP,
            thinking       = MAP_TASK_CHECK_THINKING,
        )

    # Work out what a mismatched turn means, what doesn't match, and the move it asks for
    async def assess(self, reading: TurnReading, history: list[dict[str, str]]) -> TurnAssessment:
        return await self._request(
            label          = "assessment",
            response_model = models_for_map(tuple(reading.task_map.landmarks)).assessment,
            messages       = build_messages(ASSESS_TASK, reading, history),
            temperature    = MAP_TASK_ASSESS_TEMP,
            thinking       = MAP_TASK_ASSESS_THINKING,
        )

    # Say the reply to a turn that was assessed first
    async def reply(self, reading: TurnReading, history: list[dict[str, str]], assessment: TurnAssessment) -> SpokenReply:
        return await self._request(
            label          = "reply",
            response_model = SpokenReply,
            messages       = build_messages(REPLY_TASK.format(assessment=assessment.model_dump_json()), reading, history),
            temperature    = MAP_TASK_REPLY_TEMP,
            thinking       = MAP_TASK_REPLY_THINKING,
        )


# --------------------------------------------------------------------------------
# Return the shared client, building it on first use
# --------------------------------------------------------------------------------
def get_map_task_api() -> MapTaskAPI:
    global _map_task_api
    if _map_task_api is None: _map_task_api = MapTaskAPI()
    return _map_task_api
