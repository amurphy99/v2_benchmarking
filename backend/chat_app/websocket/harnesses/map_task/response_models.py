"""
The Map Task's structured LLM outputs, and the reply every pipeline returns.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.map_task.response_models`

A move is one of three shapes (stay, go to a landmark, go one direction), so a
response can't mix their fields. The responses that carry a move are built once
per map (`models_for_map`), with the landmark limited to that map's ids: the
schema the endpoint decodes against then only allows landmarks the avatar has.

NOTE: In instructor's JSON_SCHEMA mode the model never sees the field
      descriptions; the schema only constrains its output. The prompts
      (`prompts.py`) describe every field the model fills in.

"""
from __future__  import annotations
from dataclasses import dataclass
from typing      import Annotated, Literal, Self

import functools

from pydantic import BaseModel, ConfigDict, Field, create_model, model_validator

# From this project
from .geometry import Direction, Side, StepSize

# What the follower's reply does
FollowerAct = Literal["acknowledge", "answer", "clarify", "report_missing", "other"]


# --------------------------------------------------------------------------------
# Moves
# --------------------------------------------------------------------------------
# Stay where the avatar is
class Stay(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind : Literal["stay"]

# Go to a landmark on the avatar's map, stopping on it or beside it
class ToLandmark(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind     : Literal["to_landmark"]
    landmark : str   # Landmark id (`models_for_map` limits it to one map's ids)
    side     : Side  # Stop on it ("at"), or just above, below, left of, or right of it

# Go one way without a landmark to aim for
class InDirection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind      : Literal["direction"]
    direction : Direction  # Which way on the map (up is toward the top)
    size      : StepSize   # A bit, some way, or a long way

# Any one move, told apart by its `kind`
Move = Annotated[Stay | ToLandmark | InDirection, Field(discriminator="kind")]

# The move every reply that moves nothing carries
NO_MOVE = Stay(kind="stay")


# --------------------------------------------------------------------------------
# LLM Responses
# --------------------------------------------------------------------------------
# The reply from the single-call pipeline
class FollowerTurn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    basis   : str         = Field(..., min_length=1, max_length=300)  # One short reason for the reply and move
    act     : FollowerAct                                             # What the reply does
    move    : Move                                                    # The move the giver asked for, or stay
    message : str         = Field(..., min_length=1, max_length=300)  # What the follower says back

# The draft-and-check pipeline's verdict on an answer drafted from the map
class DraftCheck(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    ok      : bool                                      # The draft truthfully answers what the giver asked
    message : str | None = Field(None, max_length=300)  # The corrected reply, when `ok` is false

    # A rejected draft must come with its replacement
    @model_validator(mode="after")
    def correction_when_rejected(self) -> Self:
        if (not self.ok) and (not self.message): raise ValueError("a rejected draft needs a corrected message")
        return self

# The first call of the assess-then-reply pipeline: what the giver means, and what doesn't match
class TurnAssessment(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    basis    : str         = Field(...,  min_length=1, max_length=300)  # One short reason for the assessment
    meaning  : str         = Field(...,  min_length=1, max_length=300)  # What the giver is saying or asking
    conflict : str | None  = Field(None, max_length=300)                # What on the avatar's map doesn't match (None when nothing)
    act      : FollowerAct                                              # What the reply should do
    move     : Move                                                     # The move they asked for, or stay

# The second call of the assess-then-reply pipeline: what the follower says
class SpokenReply(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    message : str = Field(..., min_length=1, max_length=300)  # What the follower says back


# --------------------------------------------------------------------------------
# Responses for One Map
# --------------------------------------------------------------------------------
# The responses that carry a move, with its landmark limited to one map's ids
@dataclass(frozen=True, slots=True)
class MapModels:
    follower_turn : type[FollowerTurn]
    assessment    : type[TurnAssessment]

# Build the move-carrying responses for one map's landmark ids (once per map)
@functools.cache
def models_for_map(landmark_ids: tuple[str, ...]) -> MapModels:
    to_landmark = create_model("ToLandmark", __base__=ToLandmark, landmark=(Literal[landmark_ids], ...))
    move        = Annotated[Stay | to_landmark | InDirection, Field(discriminator="kind")]
    return MapModels(
        follower_turn = create_model("FollowerTurn",   __base__=FollowerTurn,   move=(move, ...)),
        assessment    = create_model("TurnAssessment", __base__=TurnAssessment, move=(move, ...)),
    )


# --------------------------------------------------------------------------------
# Follower Reply
# --------------------------------------------------------------------------------
# What every pipeline returns: the words, what they do, the move to make, and why
@dataclass(frozen=True, slots=True)
class FollowerReply:
    message : str
    act     : FollowerAct
    move    : Move
    basis   : str  # Why this reply and move (for the turn's log line)
