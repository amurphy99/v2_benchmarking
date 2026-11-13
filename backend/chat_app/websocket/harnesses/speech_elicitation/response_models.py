"""
The speech elicitation reply's structured output: its move, its behavior, and its words.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.speech_elicitation.response_models`

Every reply but a wind-down has to end with a question, so the user always has
something to answer. The schema checks it: a reply that doesn't is refused, and
the client asks again (`elicitation_api.py`).

NOTE: In instructor's JSON_SCHEMA mode the model never sees the field
      descriptions; the schema only constrains its output. The prompt
      (`prompts.py`) describes every field the model fills in.

"""
from __future__ import annotations
from typing     import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

# What a reply does to the conversation (`wind_down`: the user wants to stop, so it asks nothing)
ReplyMove = Literal["follow_up", "share", "challenge", "new_angle", "wind_down"]

# How the avatar acts while it says a reply (`behaviors.py` turns each one into an avatar plan)
Behavior = Literal["none", "nod", "smile", "laugh", "surprised", "curious", "thoughtful", "sympathetic"]


# --------------------------------------------------------------------------------
# LLM Response
# --------------------------------------------------------------------------------
# One reply: why, what it does, how the avatar acts, and what it says
class ElicitationTurn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    basis    : str       = Field(..., min_length=1, max_length=300)  # One short reason for the reply (for the logs)
    move     : ReplyMove                                             # What the reply does
    behavior : Behavior                                              # How the avatar acts while saying it
    message  : str       = Field(..., min_length=1, max_length=300)  # What the avatar says

    # Every reply hands the turn back with a question, unless the user wants to stop
    @model_validator(mode="after")
    def ends_with_a_question(self) -> Self:
        if (self.move != "wind_down") and (not self.message.endswith("?")): raise ValueError("the message must end with a question")
        return self
