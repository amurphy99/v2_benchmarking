"""
Read each user turn against the avatar's map: names, questions, and moves.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.map_task.understanding`

Runs in code, before any LLM call, on every turn. It finds the landmark names the
user said (including ones the avatar's map lacks), describes every landmark from
the avatar's current spot, and picks the route that decides which pipeline
replies (`pipelines.ROUTE_PIPELINES`).

"""
from __future__  import annotations
from dataclasses import dataclass
from typing      import Literal, TYPE_CHECKING

import math, re

# From this project
from .geometry import Direction, DistanceBand, direction, distance_band, region

if TYPE_CHECKING: from .maps import Landmark, Point, TaskMap

# Which kind of turn this is, for choosing its pipeline
Route = Literal["simple_question", "instruction", "mismatch", "other"]

# Asking about the avatar's map ("do you have", "is there", "can you see", "where is")
MAP_TASK_QUESTION = re.compile(r"\b(do you (have|see)|have you got|is there|are there|can you see|where('s| is| are))\b", re.IGNORECASE)

# Telling the avatar to move
MAP_TASK_MOVE_VERB = re.compile(r"\b(go|going|move|head|turn|walk|keep|continue|come|follow|curve|pass|cross|travel)\b", re.IGNORECASE)

# A plural ending a landmark name may carry ("bridges", "buses")
MAP_TASK_PLURAL = r"(?:e?s)?"


# --------------------------------------------------------------------------------
# Turn Types
# --------------------------------------------------------------------------------
# One landmark name the user said
@dataclass(frozen=True, slots=True)
class Mention:
    name     : str              # The name heard, lowercase ("bridge")
    landmark : Landmark | None  # The avatar's landmark it names (None when the avatar's map has none)

# One landmark as seen from the avatar's spot
@dataclass(frozen=True, slots=True)
class LandmarkFact:
    landmark  : Landmark
    direction : Direction | None  # Which way it lies (None when the avatar is on it)
    distance  : DistanceBand      # How far it is, to its edge
    region    : str               # The part of the map it is in
    mentioned : bool              # The user named it this turn

# Everything the pipelines know about one turn
@dataclass(frozen=True, slots=True)
class TurnReading:
    text     : str                       # What the user said
    task_map : TaskMap                   # The avatar's map (and the giver's names)
    position : Point                     # Where the avatar is
    mentions : tuple[Mention, ...]       # Landmarks named, in the order said, each once
    missing  : tuple[str, ...]           # Names said that aren't on the avatar's map
    facts    : tuple[LandmarkFact, ...]  # Every landmark: the named ones first, then nearest first
    question : bool                      # They asked something about the avatar's map
    movement : bool                      # They told the avatar to move
    route    : Route                     # Which kind of turn this is


# ================================================================================
# Read a Turn
# ================================================================================
# Find everything the pipelines need about one turn
def read_turn(text: str, task_map: TaskMap, position: Point) -> TurnReading:
    mentions = spot_mentions(text, task_map)
    named    = [mention.landmark for mention in mentions if mention.landmark is not None]
    missing  = tuple(mention.name for mention in mentions if mention.landmark is None)
    question = bool(MAP_TASK_QUESTION.search(text)) or text.rstrip().endswith("?")
    movement = bool(MAP_TASK_MOVE_VERB.search(text))

    # Named landmarks first (in the order said), then the rest from nearest to farthest
    named_ids = [landmark.id for landmark in named]
    others    = sorted((landmark for landmark in task_map.landmarks.values() if landmark.id not in named_ids), key=lambda landmark: math.dist(position, landmark.at))
    facts     = tuple(_fact(landmark, position, mentioned=(landmark.id in named_ids)) for landmark in (*named, *others))

    return TurnReading(
        text     = text,
        task_map = task_map,
        position = position,
        mentions = mentions,
        missing  = missing,
        facts    = facts,
        question = question,
        movement = movement,
        route    = _route(len(named), missing, question, movement),
    )

# Pick the route (a name the avatar lacks is a mismatch; one landmark asked about is simple)
def _route(named_count: int, missing: tuple[str, ...], question: bool, movement: bool) -> Route:
    if missing:                                                return "mismatch"
    if question and (named_count == 1) and (not movement):     return "simple_question"
    if movement or named_count:                                return "instruction"
    return "other"

# Describe one landmark from the avatar's spot
def _fact(landmark: Landmark, position: Point, *, mentioned: bool) -> LandmarkFact:
    return LandmarkFact(
        landmark  = landmark,
        direction = direction(position, landmark.at),
        distance  = distance_band(position, landmark),
        region    = region(landmark.at),
        mentioned = mentioned,
    )


# --------------------------------------------------------------------------------
# Spot Landmark Names
# --------------------------------------------------------------------------------
# Every landmark name in the text, each landmark once (the longest name wins where two overlap)
def spot_mentions(text: str, task_map: TaskMap) -> tuple[Mention, ...]:
    by_name = {name: landmark for landmark in task_map.landmarks.values() for name in landmark.names}
    pattern = re.compile(r"\b(" + "|".join(re.escape(name) for name in task_map.lexicon) + r")" + MAP_TASK_PLURAL + r"\b", re.IGNORECASE)

    # A landmark said by two of its names ("the rope bridge ... the bridge") counts once
    mentions, seen = [], set()
    for match in pattern.finditer(text):
        name     = match.group(1).lower()
        landmark = by_name.get(name)
        key      = landmark.id if landmark is not None else name
        if key in seen: continue
        seen.add(key)
        mentions.append(Mention(name=name, landmark=landmark))
    return tuple(mentions)
