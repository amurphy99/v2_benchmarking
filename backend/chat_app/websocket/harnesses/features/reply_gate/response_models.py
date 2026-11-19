"""
The reply check's structured output: its basis, and one branch per next step.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.features.reply_gate.response_models`

The verdict is a union told apart by `next_step`, so the model's first tokens
inside it pick the branch, and the schema then allows only that branch's fields:
`reply` (the user is done), `wait` (they seem mid-thought, so the reply is held
with a sign of listening), or `clarify` (a likely misheard word hides what they
meant, so the avatar asks about it instead). The response offers only the
branches of the checks switched on (`check_model`), and `wait` only the chat
type's own sounds.

NOTE: In instructor's JSON_SCHEMA mode the model never sees the field
      descriptions; the schema only constrains its output. The prompt
      (`prompts.py`) describes every field the model fills in.

"""
from __future__ import annotations
from typing     import Annotated, Literal, Self, Union

import functools

from pydantic import BaseModel, ConfigDict, Field, create_model, model_validator

# A movement the check can pair with a sign of listening (`backchannels.BACKCHANNEL_GESTURES`)
Gesture = Literal["nod", "tilt", "smile", "none"]


# --------------------------------------------------------------------------------
# Verdict Branches
# --------------------------------------------------------------------------------
# Every branch trims its text and refuses fields it doesn't have
class _Branch(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

# The user is done, and what they said is clear: the reply goes out
class Reply(_Branch):
    next_step : Literal["reply"]

# The same, with the words a slip most likely stood for (offered with the misheard check; logged only)
class ReplyHeard(Reply):
    likely_said : str | None = Field(..., max_length=200)

# The user seems mid-thought: hold the reply, with a sign of listening
class Wait(_Branch):
    next_step : Literal["wait"]
    sound     : str      # One of the chat type's sounds, or "none" (`check_model` limits it)
    gesture   : Gesture

# A likely misheard word hides what the user meant: ask about it instead of replying
class Clarify(_Branch):
    next_step : Literal["clarify"]
    misheard  : str = Field(..., min_length=1, max_length=100)  # The words that seem wrong
    message   : str = Field(..., min_length=1, max_length=200)  # The question the avatar asks instead

    # A clarification hands the turn back, so it must be a question
    @model_validator(mode="after")
    def asks_a_question(self) -> Self:
        if not self.message.endswith("?"): raise ValueError("the message must end with a question")
        return self


# --------------------------------------------------------------------------------
# The Check's Response
# --------------------------------------------------------------------------------
# Why, then what the avatar does next
class CheckResult(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    basis   : str = Field(..., min_length=1, max_length=200)  # A few words on why (for the logs)
    verdict : Reply                                           # `check_model` widens it to the branches switched on

# The response for one chat type's sounds and the checks switched on, at least one (built once for each combination)
@functools.cache
def check_model(sounds: tuple[str, ...], *, turn_end: bool, misheard: bool) -> type[CheckResult]:
    branches: list[type[_Branch]] = [ReplyHeard if misheard else Reply]
    if turn_end: branches.append(create_model("Wait", __base__=Wait, sound=(Literal[("none", *sounds)], ...)))
    if misheard: branches.append(Clarify)
    verdict = Annotated[Union[tuple(branches)], Field(discriminator="next_step")]
    return create_model("CheckResult", __base__=CheckResult, verdict=(verdict, ...))
