"""
Structured LLM client for the intro: one reading of the user's answer.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.features.intro.intro_api`

The reading decides what the intro does next with what the user said, and
writes the answer when they asked a question about the task. One client is
shared by every chat with an intro (`get_intro_api`), and building it does not
contact the endpoint.

NOTE: In instructor's JSON_SCHEMA mode the model never sees the field
      descriptions; the schema only constrains its output. The prompt
      (`prompts.py`) describes every field the model fills in.

"""
from __future__ import annotations
from typing     import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

# From this project
from .....services.llm.structured_api import StructuredAPI
from     .config                      import INTRO_MAX_RETRIES, INTRO_RETRY_DELAY_SEC, INTRO_TEMP, INTRO_THINKING, INTRO_TIMEOUT_SEC

# What comes next: begin the task, explain it, answer a question, wait, or let the task answer it
IntroStep = Literal["start", "explain", "answer", "wait", "task"]

# Process-wide client shared by every chat with an intro
_intro_api: IntroAPI | None = None


# A reading of the user's answer that failed
class IntroAPIError(RuntimeError):
    pass


# One reading: why, whether they know the task, what comes next, and the answer to their question
class IntroReading(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    basis      : str         = Field(..., min_length=1, max_length=300)  # One short reason (for the logs)
    knows_task : bool | None                                            # They said they know how it works (None: they didn't say)
    next_step  : IntroStep                                              # What the intro does next
    answer     : str | None  = Field(..., max_length=300)               # The answer to their question (an `answer` step's)

    # A question gets its answer
    @model_validator(mode="after")
    def answers_its_question(self) -> Self:
        if (self.next_step == "answer") and (not self.answer): raise ValueError("an answer step needs its answer")
        return self


# --------------------------------------------------------------------------------
# Intro API
# --------------------------------------------------------------------------------
# The reading call, retried a set number of times before raising `IntroAPIError`
class IntroAPI(StructuredAPI):
    NAME  = "Intro"
    ERROR = IntroAPIError

    # Build the client every reading reuses
    def __init__(self) -> None:
        super().__init__(timeout_sec=INTRO_TIMEOUT_SEC, max_retries=INTRO_MAX_RETRIES, retry_delay_sec=INTRO_RETRY_DELAY_SEC)

    # Read the user's answer (`prompts.build_intro_messages`)
    async def read(self, messages: list[dict[str, str]]) -> IntroReading:
        return await self._request(label="intro", response_model=IntroReading, messages=messages, temperature=INTRO_TEMP, thinking=INTRO_THINKING)


# Return the shared client, building it on first use
def get_intro_api() -> IntroAPI:
    global _intro_api
    if _intro_api is None: _intro_api = IntroAPI()
    return _intro_api
