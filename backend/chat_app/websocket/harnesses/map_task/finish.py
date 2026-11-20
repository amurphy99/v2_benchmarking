"""
How a Map Task ends: at the finish, or on the user's word once the avatar checks.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.map_task.finish`

The avatar never knows where the finish is, but code does: the last point of the
participant's route. A reply that leaves the avatar within
`MAP_TASK_FINISH_RADIUS` of it ends the chat, with a closing line after the
reply's own words.

When the user says the avatar has reached the finish (or asks whether it has),
the reply's act is `finish`. The first time, the avatar says where it is on its
own map and asks whether that's the finish ("Alright, I'm in the bottom left
corner, below the saloon. Is that the finish?"). A `finish` act answering that
question takes the user's word for it and ends the chat; any other reply drops
the question. Every line is fixed, and where the avatar is comes from its map in
code, so the check always describes its real spot.

"""
from __future__  import annotations
from dataclasses import dataclass
from typing      import Literal, TYPE_CHECKING

# From this project
from .config   import MAP_TASK_FINISH_RADIUS
from .geometry import direction, distance, distance_band, region

if TYPE_CHECKING:
    from .maps            import Point, TaskMap
    from .response_models import FollowerAct

# How the task ended: the avatar reached the finish, or the user confirmed it was there
MapTaskEnd = Literal["reached_finish", "giver_confirmed"]

# The avatar's closing lines, and its check of where it is (`where` comes from `where_am_i`)
MSG_REACHED_FINISH   = "That's the finish! We made it. Thanks for guiding me."
MSG_FINISH_CONFIRMED = "Great, we made it! Thanks for guiding me."
MSG_FINISH_CHECK     = "Alright, I'm {where}. Is that the finish?"

# Where the avatar is beside a close landmark, from the way that landmark lies ("below the bridge")
MAP_TASK_BESIDE_WORDS = {
    "up"         : "below",
    "up_right"   : "below and to the left of",
    "right"      : "to the left of",
    "down_right" : "above and to the left of",
    "down"       : "above",
    "down_left"  : "above and to the right of",
    "left"       : "to the right of",
    "up_left"    : "below and to the right of",
}


# One reply as the task may end with it: the words, how the task ended, and whether it asks
@dataclass(frozen=True, slots=True)
class FinishStep:
    message : str                # What the avatar says
    ended   : MapTaskEnd | None  # How the task ends with this reply (None while it goes on)
    asked   : bool               # The reply asks whether the avatar is at the finish


# ================================================================================
# Finish Step
# ================================================================================
# Where one reply leaves the task: over (at the finish, or on their yes), checking, or going on
def finish_step(
    task_map : TaskMap,            # The session's maps (the finish is the route's last point)
    position : Point,              # Where the reply leaves the avatar
    act      : FollowerAct,        # What the reply does (`finish`: the user says it's at the finish)
    message  : str,                # The reply's own words
    asked    : bool,               # The last saved reply asked whether the avatar is at the finish
    ended    : MapTaskEnd | None,  # How the task already ended (its closing line was cut off before the close)
) -> FinishStep:
    # 1) Over already, or at the finish now: the closing line (after the reply's own words, if any)
    if ended is not None: return FinishStep(MSG_REACHED_FINISH if (ended == "reached_finish") else MSG_FINISH_CONFIRMED, ended, False)
    if at_finish(task_map, position):
        closing = MSG_REACHED_FINISH if (act == "finish") else f"{message} {MSG_REACHED_FINISH}"
        return FinishStep(closing, "reached_finish", False)

    # 2) A reply about something else goes out as it is (and drops a question the avatar asked)
    if act != "finish": return FinishStep(message, None, False)

    # 3) The user's yes to the avatar's check ends the task; otherwise the avatar checks where it is
    if asked: return FinishStep(MSG_FINISH_CONFIRMED, "giver_confirmed", False)
    return FinishStep(MSG_FINISH_CHECK.format(where=where_am_i(task_map, position)), None, True)


# --------------------------------------------------------------------------------
# The Finish and the Avatar's Spot
# --------------------------------------------------------------------------------
# The avatar is within the finish's radius
def at_finish(task_map: TaskMap, position: Point) -> bool:
    return distance(position, task_map.giver.route[-1], task_map.scale) <= MAP_TASK_FINISH_RADIUS

# Where the avatar is on its own map: the part of the map, and the nearest landmark close by
def where_am_i(task_map: TaskMap, position: Point) -> str:
    nearest = min(task_map.landmarks.values(), key=lambda landmark: distance(position, landmark.at, task_map.scale) - landmark.radius)
    band    = distance_band(position, nearest, task_map.scale)
    if band == "far": return region(position)

    # Right by it, or on one side of it ("below the bridge")
    toward = direction(position, nearest.at, task_map.scale)
    beside = "right by" if ((band == "here") or (toward is None)) else MAP_TASK_BESIDE_WORDS[toward]
    return f"{region(position)}, {beside} the {nearest.label}"
