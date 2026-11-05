"""
Interchangeable ways to reply to a Map Task turn, and which route uses which.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.map_task.pipelines`

Every pipeline takes the same inputs (the client, the turn's reading, and the
conversation) and returns a `FollowerReply`, so `ROUTE_PIPELINES` can pair any
route with any pipeline. They differ in how much the model does:

* `draft_and_check`: code drafts the answer from the map, and one short call
  confirms or corrects it.
* `single_call`: one call writes the reply and picks the move.
* `assess_then_reply`: one call works out the turn and its move, and a second
  writes the reply from that assessment.

"""
from __future__ import annotations
from typing     import Awaitable, Callable, TYPE_CHECKING

import re

# From this project
from .response_models import NO_MOVE, FollowerReply

if TYPE_CHECKING:
    from .map_task_api  import MapTaskAPI
    from .understanding import LandmarkFact, Route, TurnReading

# Asking where a landmark is, rather than whether the avatar has it
MAP_TASK_WHERE_QUESTION = re.compile(r"\bwhere\b", re.IGNORECASE)

# How each direction reads in the follower's own words ("the bus is to my right")
MAP_TASK_DRAFT_DIRECTIONS = {
    "up"         : "above me",
    "up_right"   : "up to my right",
    "right"      : "to my right",
    "down_right" : "down to my right",
    "down"       : "below me",
    "down_left"  : "down to my left",
    "left"       : "to my left",
    "up_left"    : "up to my left",
}

# Drafted answers, filled in from the map ("Yes, I have the bus, a long way to my right.")
MSG_DRAFT_HAVE  = "Yes, I have the {label}, {where}."
MSG_DRAFT_WHERE = "The {label} is {where}."

# Where a landmark is, in the follower's own words, when it's right beside the avatar or far off
MSG_DRAFT_HERE = "right next to me"
MSG_DRAFT_FAR  = "a long way {direction}"

# One way of replying to a turn, from its reading and the conversation so far
Pipeline = Callable[["MapTaskAPI", "TurnReading", list[dict[str, str]]], Awaitable[FollowerReply]]


# --------------------------------------------------------------------------------
# Pipelines
# --------------------------------------------------------------------------------
# Draft the answer from the map in code, then have one short call confirm or correct it
async def draft_and_check(api: MapTaskAPI, reading: TurnReading, history: list[dict[str, str]]) -> FollowerReply:
    draft = draft_answer(reading)
    check = await api.check_draft(reading, history, draft)
    if check.ok: return FollowerReply(message=draft,         act="answer", move=NO_MOVE, basis="The drafted answer checked out.")
    else:        return FollowerReply(message=check.message, act="answer", move=NO_MOVE, basis=f"The check corrected the draft {draft!r}.")

# Write the reply and pick the move in one call
async def single_call(api: MapTaskAPI, reading: TurnReading, history: list[dict[str, str]]) -> FollowerReply:
    turn = await api.follow(reading, history)
    return FollowerReply(message=turn.message, act=turn.act, move=turn.move, basis=turn.basis)

# Work out the turn and its move first, then write the reply from that assessment
async def assess_then_reply(api: MapTaskAPI, reading: TurnReading, history: list[dict[str, str]]) -> FollowerReply:
    assessment = await api.assess(reading, history)
    spoken     = await api.reply(reading, history, assessment)
    return FollowerReply(message=spoken.message, act=assessment.act, move=assessment.move, basis=assessment.basis)


# Which pipeline replies to each route (`understanding.read_turn` picks the route)
ROUTE_PIPELINES: dict[Route, Pipeline] = {
    "simple_question" : draft_and_check,
    "instruction"     : single_call,
    "other"           : single_call,
    "mismatch"        : assess_then_reply,
}


# --------------------------------------------------------------------------------
# Drafted Answers
# --------------------------------------------------------------------------------
# Answer a question about the one landmark the user named, which the avatar has
def draft_answer(reading: TurnReading) -> str:
    fact  = next(fact for fact in reading.facts if fact.mentioned)
    where = _draft_where(fact)
    if MAP_TASK_WHERE_QUESTION.search(reading.text): return MSG_DRAFT_WHERE.format(label=fact.landmark.label, where=where)
    else:                                            return MSG_DRAFT_HAVE .format(label=fact.landmark.label, where=where)

# Where a landmark is from the avatar, in its own words ("a long way to my right")
def _draft_where(fact: LandmarkFact) -> str:
    if fact.distance == "here": return MSG_DRAFT_HERE
    if fact.distance == "far":  return MSG_DRAFT_FAR.format(direction=MAP_TASK_DRAFT_DIRECTIONS[fact.direction])
    return MAP_TASK_DRAFT_DIRECTIONS[fact.direction]
