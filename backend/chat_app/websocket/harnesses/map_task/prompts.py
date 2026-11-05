"""
System prompts for the Map Task's calls, and the map facts each call gets.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.map_task.prompts`

Every call gets the same follower instructions, then its own task, then the facts
about the avatar's map worked out in code for this turn (`understanding.py`). The
model never sees coordinates, only directions, distances, and parts of the map.
Each task lists the fields its response fills in, because the model never sees
the schema's field descriptions (`response_models.py`).

"""
from __future__ import annotations
from typing     import TYPE_CHECKING

# From this project
from .geometry import region

if TYPE_CHECKING: from .understanding import TurnReading

# How each direction reads from the follower's spot ("the bus is to your right")
MAP_TASK_DIRECTION_WORDS = {
    "up"         : "above you",
    "up_right"   : "up to your right",
    "right"      : "to your right",
    "down_right" : "down to your right",
    "down"       : "below you",
    "down_left"  : "down to your left",
    "left"       : "to your left",
    "up_left"    : "up to your left",
}

# How far a landmark is, in words (one right next to the avatar is described on its own)
MAP_TASK_DISTANCE_WORDS = {"near": "nearby", "far": "far away"}


# --------------------------------------------------------------------------------
# Prompt Templates
# --------------------------------------------------------------------------------
# How to play, for every call
FOLLOWER_SYSTEM = """
You are playing the Map Task, a game for two people with slightly different maps. You are the
instruction follower. The other person, the giver, has a route drawn on their map and is
describing it so you can follow it on yours.

Neither of you can see the other's map. Some landmarks differ between the two: the giver may have
a landmark you don't, you may have one they don't, or a landmark may be in a different place.

How to play:
- Follow the giver's directions on your map, one step at a time.
- Answer questions about your map truthfully, using only the facts about your map below.
- When they name a landmark you don't have, say so, and mention what you do have nearby if it helps.
- When a direction is unclear, ask one short question instead of guessing.
- Talk like a person playing the game: short, plain sentences, usually under 15 words.
- Never mention ids, coordinates, or numbers.
""".strip()

# The `act` field, for the calls that fill it in
ACT_FIELD = """
- act: what your reply does. acknowledge: you understood a direction. answer: you answered a
  question about your map. clarify: you need them to explain. report_missing: they named
  something your map doesn't have. other: anything else.
""".strip()

# The `move` field, for the calls that fill it in
MOVE_FIELD = """
- move: where the giver told you to go, as one of these kinds:
  - stay: they didn't tell you to move, or you can't tell where yet.
  - to_landmark: go to a landmark on your map. landmark is its id, and side is where you stop:
    at (on it), above, below, left_of, or right_of.
  - direction: go one way with no landmark to aim for. direction is up, up_right, right,
    down_right, down, down_left, left, or up_left (up is toward the top of the map), and size
    is how far: small (a bit), medium, or large (a long way).
""".strip()

# The single-call pipeline's task
FOLLOW_TASK = f"""
Reply to the giver's latest message, and work out the move they asked for. Fill in:
- basis: one short reason for your reply and move.
{ACT_FIELD}
{MOVE_FIELD}
- message: what you say back, in one or two short sentences.
""".strip()

# The draft-and-check pipeline's task (`draft` is the answer drafted from the map)
CHECK_TASK = """
The giver asked about your map, and this answer was drafted from your map's facts:
"{draft}"

Check it against what they asked and the facts below. Fill in:
- ok: true if the draft truthfully answers their question. false if it doesn't, for example
  when they asked whether something is in a particular place and the draft doesn't settle it.
- message: when ok is false, the corrected reply in one or two short sentences. Otherwise null.
""".strip()

# The first task of the assess-then-reply pipeline
ASSESS_TASK = f"""
The giver named something your map doesn't have, so think it through before you answer.
Don't move toward something you can't find on your map. Fill in:
- basis: one short reason for your assessment.
- meaning: what the giver is saying or asking, briefly.
- conflict: what on your map doesn't match what they said, or null when nothing does.
{ACT_FIELD}
{MOVE_FIELD}
""".strip()

# The second task of the assess-then-reply pipeline (`assessment` is the first call's result)
REPLY_TASK = """
Reply to the giver's latest message, using your assessment of it:
{assessment}

Say clearly what doesn't match your map, and offer what you do have nearby if it helps. Fill in:
- message: what you say back, in one or two short sentences.
""".strip()


# ================================================================================
# Build Messages
# ================================================================================
# One call's messages: how to play, this call's task, and the map facts, then the conversation
def build_messages(task: str, reading: TurnReading, history: list[dict[str, str]]) -> list[dict[str, str]]:
    system = f"{FOLLOWER_SYSTEM}\n\nYOUR TASK:\n{task}\n\n{facts_block(reading)}"
    return [{"role": "system", "content": system}, *history]

# The avatar's map as seen from its spot: every landmark, the ones just named first
def facts_block(reading: TurnReading) -> str:
    lines = [f"YOUR MAP (you are {region(reading.position)}):"]
    for fact in reading.facts:
        # Where it is from the avatar (one right next to it needs no direction)
        if fact.distance == "here": where = "right next to you"
        else:                       where = f"{MAP_TASK_DISTANCE_WORDS[fact.distance]}, {MAP_TASK_DIRECTION_WORDS[fact.direction]}"

        # Its other names, and whether the giver just said it
        aliases = f" (also called: {', '.join(fact.landmark.names[1:])})" if fact.landmark.names[1:] else ""
        named   = "; the giver just named it" if fact.mentioned else ""
        lines.append(f"- {fact.landmark.label}{aliases} [id: {fact.landmark.id}]: {where}; it's {fact.region}{named}")

    # Names the giver said that the avatar's map lacks
    if reading.missing: lines.append(f"NOT ON YOUR MAP (the giver named these, but your map doesn't have them): {', '.join(reading.missing)}")
    return "\n".join(lines)
