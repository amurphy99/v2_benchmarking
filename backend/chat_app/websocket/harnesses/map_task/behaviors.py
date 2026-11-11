"""
The Map Task avatar's plans: its setup, its map, and how each reply plays out.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.map_task.behaviors`

Sent only with the `cues` condition, where the avatar holds its own map. While a
reply is worked out, the avatar raises its map and reads it: all over for a
landmark it was asked about or doesn't have, or around its own spot otherwise.
The reply's plan then shows what the reply did as soon as its text arrives:
tracing the move from the old spot to the new one, locking onto a landmark it
found, or one last sweep and a head shake for one it doesn't have. The map comes
down as the reply's audio starts.

Points are the avatar's own map coordinates, the frame the map files use: 0-1
across and down its map as it reads it (`HARNESS_PROTOCOL.md` §8.2). The faces
and movements are the Smiley's names (§9).

"""
from __future__ import annotations
from typing     import TYPE_CHECKING

# From this project
from .geometry import step

if TYPE_CHECKING:
    from ..avatar          import AvatarPlan, AvatarSetup
    from  .geometry        import Direction
    from  .maps            import Landmark, Point, Scale
    from  .response_models import FollowerReply
    from  .understanding   import TurnReading

# Session settings in each condition (with cues, the client's idle glances run too)
MAP_TASK_SETUP_CUES    = {"rest": "Slightly Smiling Face", "auto": {"idle_glances": True,  "thinking_look": False, "speech_gaze": False, "listening_motions": False}}
MAP_TASK_SETUP_NO_CUES = {"rest": "Slightly Smiling Face", "auto": {"idle_glances": False, "thinking_look": False, "speech_gaze": False, "listening_motions": False}}

# The middle of the map, where a search over the whole map is centered
MAP_TASK_MAP_CENTER = [0.5, 0.5]

# --------------------------------------------------------------------------------
# Reading the Map (map units)
# --------------------------------------------------------------------------------
MAP_TASK_SEARCH_RADIUS    = 0.45  # Searching the whole map for a landmark
MAP_TASK_LAST_LOOK_RADIUS = 0.50  # The last, quicker sweep before saying a landmark isn't there
MAP_TASK_READ_RADIUS      = 0.12  # Reading the map around its own spot
MAP_TASK_TRACE_SPEED      = 0.40  # How fast the eyes trace a move, in map widths per second

# --------------------------------------------------------------------------------
# Plan Timing
# --------------------------------------------------------------------------------
MAP_TASK_FOUND_MS       =   350    # Locking onto a landmark it found, or a last look at its own spot
MAP_TASK_GLANCE_MS      =   700    # A glance at a landmark the user named, while listening
MAP_TASK_DIRECTION_MS   =   600    # A look toward a direction the user said, while listening
MAP_TASK_SEARCH_MS      =   900    # A quick search for a named landmark it doesn't have, while listening
MAP_TASK_LAST_LOOK_MS   =   700    # The last sweep before saying a landmark isn't there
MAP_TASK_TRACE_HOLD_MS  =   400    # Holding the end of a traced move
MAP_TASK_LOWER_AFTER_MS =   200    # How far into the reply's audio the map comes down
MAP_TASK_LOOK_BACK_MS   = 1_500    # Holding the user's gaze as the reply starts

# How long each look lasts during the last sweep (shortest and longest, ms)
MAP_TASK_LAST_LOOK_FIX_MS = [180, 260]

# Faces and movements
MAP_TASK_SEARCH_FACE  = {"name": "Furrowed Brow",            "strength": 0.5}
MAP_TASK_FOUND_FACE   = {"name": "Wide-Eyed",                "strength": 0.6, "hold_ms":   500}
MAP_TASK_PUZZLED_FACE = {"name": "Face with Raised Eyebrow", "strength": 0.5, "hold_ms": 1_200}
MAP_TASK_NOT_THERE    = {"name": "Shake No",                 "strength": 0.6}
MAP_TASK_GOT_IT       = {"name": "Nod",                      "strength": 0.5}


# ================================================================================
# Setup and Standing Plans
# ================================================================================
# Session settings for the chat's condition (each one replaces the last)
def setup_for(with_cues: bool) -> AvatarSetup:
    return MAP_TASK_SETUP_CUES if with_cues else MAP_TASK_SETUP_NO_CUES

# Pick the map up as the chat starts, and listen
def start_plan() -> AvatarPlan:
    return {"id": "start", "steps": [{"prop": {"hold": "map"}, "state": "listening"}]}

# Raise the map and read it while a reply is worked out: all over for a landmark asked about or missing, else around its spot
def thinking_plan(turn: int, reading: TurnReading) -> AvatarPlan:
    if reading.route in ("simple_question", "mismatch"): look = {"face": MAP_TASK_SEARCH_FACE, "gaze": {"on": "map", "scan": {"around": MAP_TASK_MAP_CENTER,    "radius": MAP_TASK_SEARCH_RADIUS}}}
    else:                                                look = {                              "gaze": {"on": "map", "scan": {"around": list(reading.position), "radius": MAP_TASK_READ_RADIUS  }}}
    return {"id": f"t{turn}-think", "turn": turn, "steps": [{"state": "thinking", "prop": {"raise": 1}, **look}]}


# ================================================================================
# Reply Plans
# ================================================================================
# One reply's plan: what the reply did on the map, then the map down and the eyes on the user as its audio starts
def reply_plan(
    turn    : int,                # The harness's turn number (in the plan's id, and echoed in feedback)
    reading : TurnReading,        # The turn the reply answers
    reply   : FollowerReply,      # The reply
    before  : Point,              # Where the avatar was
    path    : tuple[Point, ...],  # Every new waypoint, empty when it stays
) -> AvatarPlan:
    steps = [*_map_steps(reading, reply, before, path), _reply_audio_step(reply)]
    return {"id": f"t{turn}-reply", "turn": turn, "feedback": "end", "steps": steps}

# What the reply did on the map, played as soon as the plan arrives (before its audio starts)
def _map_steps(
    reading : TurnReading,        # The turn being answered
    reply   : FollowerReply,      # The chosen reply and act
    before  : Point,              # The starting spot
    path    : tuple[Point, ...],  # Every new waypoint
) -> list[dict[str, object]]:
    # Trace every bend, including a loop that ends where it began
    if path: return [{"gaze": {"on": "map", "trace": [list(before), *[list(point) for point in path]], "speed": MAP_TASK_TRACE_SPEED, "hold_ms": MAP_TASK_TRACE_HOLD_MS}}]

    # Not on its map: one last, quicker sweep, then a small head shake
    if reply.act == "report_missing":
        return [
            {"gaze": {"on": "map", "scan": {"around": MAP_TASK_MAP_CENTER, "radius": MAP_TASK_LAST_LOOK_RADIUS, "fix_ms": MAP_TASK_LAST_LOOK_FIX_MS}, "hold_ms": MAP_TASK_LAST_LOOK_MS}},
            {"move": MAP_TASK_NOT_THERE},
        ]

    # Found the landmark it was asked about: lock onto it, eyes widening
    found = _named_landmark(reading)
    if (reply.act == "answer") and (found is not None): return [{"gaze": {"on": "map", "at": list(found.at)}, "ms": MAP_TASK_FOUND_MS}, {"face": MAP_TASK_FOUND_FACE}]

    # Anything else: a last look at its own spot
    return [{"gaze": {"on": "map", "at": list(before)}, "ms": MAP_TASK_FOUND_MS}]

# As the reply's audio starts: the map down, the eyes on the user, and listening once it stops talking
# (with a nod for a direction it took, or a puzzled look for a question back)
def _reply_audio_step(reply: FollowerReply) -> dict[str, object]:
    step = {"start_on": "reply_audio", "wait_ms": MAP_TASK_LOWER_AFTER_MS, "state": "listening", "prop": {"raise": 0}, "gaze": {"on": "user", "hold_ms": MAP_TASK_LOOK_BACK_MS}, "face": "rest"}
    if   reply.act == "acknowledge": step["move"] = MAP_TASK_GOT_IT
    elif reply.act == "clarify":     step["face"] = MAP_TASK_PUZZLED_FACE
    return step

# The first landmark the user named that is on the avatar's map (None when they named none)
def _named_landmark(reading: TurnReading) -> Landmark | None:
    return next((mention.landmark for mention in reading.mentions if mention.landmark is not None), None)


# ================================================================================
# Cue Plans (while listening)
# ================================================================================
# A quick look at a landmark the user just named
def landmark_glance_plan(landmark: Landmark, count: int) -> AvatarPlan:
    return {"id": f"glance-{landmark.id}-{count}", "steps": [{"gaze": {"on": "map", "at": list(landmark.at), "hold_ms": MAP_TASK_GLANCE_MS}}]}

# A quick, puzzled search for a landmark the user named that isn't on the avatar's map
def search_plan(count: int) -> AvatarPlan:
    search = {"on": "map", "scan": {"around": MAP_TASK_MAP_CENTER, "radius": MAP_TASK_SEARCH_RADIUS}, "hold_ms": MAP_TASK_SEARCH_MS}
    return {"id": f"search-{count}", "steps": [{"gaze": search, "face": {**MAP_TASK_SEARCH_FACE, "hold_ms": MAP_TASK_SEARCH_MS}}]}

# A look from the avatar's spot toward a direction the user just said
def direction_plan(position: Point, toward: Direction, count: int, scale: Scale) -> AvatarPlan:
    spot = step(position, toward, "medium", scale)
    return {"id": f"look-{toward}-{count}", "steps": [{"gaze": {"on": "map", "at": list(spot), "hold_ms": MAP_TASK_DIRECTION_MS}}]}
