"""
System prompts for the Map Task's calls, and the map facts each call gets.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.map_task.prompts`

Every call gets the same follower instructions, then its own task, then the facts
about the avatar's map worked out in code for this turn (`understanding.py`). The
model sees its own coordinates, landmark extents, and recent committed trail.
It never receives the giver's route or the giver's landmark coordinates.
Each task lists the fields its response fills in, because the model never sees
the schema's field descriptions (`response_models.py`).

"""
from __future__ import annotations
from typing     import TYPE_CHECKING

# From this project
from .geometry        import MAP_TASK_BESIDE_GAP, MAP_TASK_STEPS, region
from .response_models import MAP_TASK_MAX_WAYPOINTS

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

# Recent committed points supplied for instructions such as "keep going"
MAP_TASK_CONTEXT_POINTS = 8


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
- Use coordinates internally to draw your path; never read ids or coordinates aloud.
- Move only when instructed. Questions, acknowledgements, and requests for clarification
  do not authorize a move. If you need clarification, choose stay.
- You do not know the giver's route or finish. Never invent the rest of the route.
""".strip()

# The `act` field, for the calls that fill it in
ACT_FIELD = """
- act: what your reply does. acknowledge: you understood a direction. answer: you answered a
  question about your map. clarify: you need them to explain. report_missing: they named
  something your map doesn't have. other: anything else.
""".strip()

# The `move` field, for the calls that fill it in
MOVE_FIELD = f"""
- move: where the giver told you to go, as one of these kinds:
  - stay: they didn't tell you to move, or you can't tell where yet.
  - to_landmark: go to a landmark on your map. landmark is its id, and side is where you stop:
    at (reach its nearest edge), above, below, left_of, or right_of.
  - direction: go one way with no landmark to aim for. direction is up, up_right, right,
    down_right, down, down_left, left, or up_left (up is toward the top of the map), and size
    is how far: small (a bit), medium, or large (a long way).
  - path: draw through open space using points, an ordered list of 1 to
    {MAP_TASK_MAX_WAYPOINTS} [x, y] waypoints. Start from your current position; include
    every bend and the final stop, without repeating the starting point. Use this for
    multiple directions in one turn, precise distances, passing beside a landmark,
    going between landmarks, and curving around them. Do not reduce these to a jump
    to a landmark. Paths are straight segments between successive points; approximate
    a curve with enough points to keep the segments outside the landmark's radius.
    Landmarks are regions, not point targets. Keep the requested side and clearance
    along the whole path, not just at its endpoint. Crossing a region is allowed when
    explicitly requested (for example crossing a bridge).

Coordinate rules: x increases rightward, y downward, both in [0, 1]. Distances are
in map units (1 = the paper's longer side). For a distance d, a horizontal change
is d / scale[0], and a vertical change is d / scale[1]. A circular landmark reaches
radius / scale[0] across and radius / scale[1] down from its center. A usual gap
beside its edge is {MAP_TASK_BESIDE_GAP}. Direction step lengths are {MAP_TASK_STEPS}.
For "continue", use the last distinct segment of your committed trail. Ask which
way if there is no established direction. Stop at the paper's boundary.

Example on a landscape map with scale [1, 0.704762], starting at [0.30, 0.66]:
"right a little, then up a little" becomes path points [[0.38, 0.66], [0.38, 0.546486]].
Both legs have length 0.08 map units. Do not jump diagonally to the final point.
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
    lines.append(f"Your position: {list(reading.position)}; paper scale: {list(reading.task_map.scale)}.")
    lines.append(f"Recent committed trail: {[list(point) for point in reading.path[-MAP_TASK_CONTEXT_POINTS:]]}")
    for fact in reading.facts:
        # Where it is from the avatar (one right next to it needs no direction)
        if fact.distance == "here": where = "right next to you"
        else:                       where = f"{MAP_TASK_DISTANCE_WORDS[fact.distance]}, {MAP_TASK_DIRECTION_WORDS[fact.direction]}"

        # Its other names, and whether the giver just said it
        aliases = f" (also called: {', '.join(fact.landmark.names[1:])})" if fact.landmark.names[1:] else ""
        named   = "; the giver just named it" if fact.mentioned else ""
        lines.append(f"- {fact.landmark.label}{aliases} [id: {fact.landmark.id}]: {where}; it's {fact.region}{named}")
        lines.append(f"  center: {list(fact.landmark.at)}; radius: {fact.landmark.radius} map units")

    # Names the giver said that the avatar's map lacks
    if reading.missing: lines.append(f"NOT ON YOUR MAP (the giver named these, but your map doesn't have them): {', '.join(reading.missing)}")
    return "\n".join(lines)
