"""
Where things are on a map from one spot, and where a move takes that spot.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.map_task.geometry`

Directions are the map's own, as its reader sees it: up is toward the top edge
(a smaller y) and right is toward the right edge. Distances are in map units,
where 1 is the map's whole width or height.

"""
from __future__ import annotations
from typing     import TYPE_CHECKING, Literal

import math

if TYPE_CHECKING: from .maps import Landmark, Point

# Directions on the map, clockwise from up
Direction  = Literal["up", "up_right", "right", "down_right", "down", "down_left", "left", "up_left"]
DIRECTIONS = ("up", "up_right", "right", "down_right", "down", "down_left", "left", "up_left")

# Where the avatar stops when it is sent to a landmark
Side = Literal["at", "above", "below", "left_of", "right_of"]

# How far a move without a landmark goes ("a bit", "a long way")
StepSize = Literal["small", "medium", "large"]

# How far a landmark is from the avatar's spot
DistanceBand = Literal["here", "near", "far"]


# --------------------------------------------------------------------------------
# Distances and Steps (map units)
# --------------------------------------------------------------------------------
MAP_TASK_HERE_DISTANCE = 0.05  # Within this of a landmark's edge counts as being at it
MAP_TASK_NEAR_DISTANCE = 0.25  # Within this of a landmark's edge is near; past it is far
MAP_TASK_BESIDE_GAP    = 0.04  # Gap left between the avatar and a landmark it stops beside

# Distance one move of each size covers
MAP_TASK_STEPS = {"small": 0.08, "medium": 0.18, "large": 0.35}

# Each axis's share of a diagonal step of length 1
MAP_TASK_DIAGONAL = math.sqrt(0.5)

# One step of length 1 in each direction (y grows downward)
MAP_TASK_DIRECTION_STEPS = {
    "up"         : ( 0.0,               -1.0              ),
    "up_right"   : ( MAP_TASK_DIAGONAL, -MAP_TASK_DIAGONAL),
    "right"      : ( 1.0,                0.0              ),
    "down_right" : ( MAP_TASK_DIAGONAL,  MAP_TASK_DIAGONAL),
    "down"       : ( 0.0,                1.0              ),
    "down_left"  : (-MAP_TASK_DIAGONAL,  MAP_TASK_DIAGONAL),
    "left"       : (-1.0,                0.0              ),
    "up_left"    : (-MAP_TASK_DIAGONAL, -MAP_TASK_DIAGONAL),
}

# Where each part of the map is, by row and column thirds, worded to follow "it's"
MAP_TASK_REGIONS = {
    (0, 0): "in the top left corner",    (0, 1): "at the top",       (0, 2): "in the top right corner",
    (1, 0): "on the left side",          (1, 1): "in the middle",    (1, 2): "on the right side",
    (2, 0): "in the bottom left corner", (2, 1): "at the bottom",    (2, 2): "in the bottom right corner",
}


# ================================================================================
# Seeing the Map
# ================================================================================
# Which way a point lies from the avatar's spot (None when it is right there)
def direction(origin: Point, target: Point) -> Direction | None:
    dx, dy = target[0] - origin[0], target[1] - origin[1]
    if math.hypot(dx, dy) < MAP_TASK_HERE_DISTANCE: return None

    # Turn clockwise from up, in eighths (y grows downward, so up is -y)
    eighth = round(math.degrees(math.atan2(dx, -dy)) / 45) % 8
    return DIRECTIONS[eighth]

# How far a landmark is from the avatar's spot, measured to the landmark's edge
def distance_band(origin: Point, landmark: Landmark) -> DistanceBand:
    gap = math.dist(origin, landmark.at) - landmark.radius
    if gap <= MAP_TASK_HERE_DISTANCE: return "here"
    if gap <= MAP_TASK_NEAR_DISTANCE: return "near"
    return "far"

# The part of the map a point is in ("in the top left corner", "at the bottom")
def region(point: Point) -> str:
    # A point on the right or bottom edge (1.0) belongs to the last third
    row = min(int(point[1] * 3), 2)
    col = min(int(point[0] * 3), 2)
    return MAP_TASK_REGIONS[(row, col)]


# ================================================================================
# Moving on the Map
# ================================================================================
# Where the avatar stops when sent to a landmark: on it, or just beside it on one side
def beside(landmark: Landmark, side: Side) -> Point:
    x, y  = landmark.at
    reach = landmark.radius + MAP_TASK_BESIDE_GAP
    if   side == "at":      return landmark.at
    elif side == "above":   return _on_map((x,         y - reach))
    elif side == "below":   return _on_map((x,         y + reach))
    elif side == "left_of": return _on_map((x - reach, y        ))
    else:                   return _on_map((x + reach, y        ))

# Where one move in a direction takes the avatar
def step(position: Point, toward: Direction, size: StepSize) -> Point:
    dx, dy   = MAP_TASK_DIRECTION_STEPS[toward]
    distance = MAP_TASK_STEPS[size]
    return _on_map((position[0] + (dx * distance), position[1] + (dy * distance)))

# A point brought back onto the map (a move past an edge stops at that edge)
def _on_map(point: Point) -> Point:
    return (min(max(point[0], 0.0), 1.0), min(max(point[1], 0.0), 1.0))
