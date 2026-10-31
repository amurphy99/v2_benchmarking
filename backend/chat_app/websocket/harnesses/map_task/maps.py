"""
Map Task map files: the avatar's map, the giver's map, and names to listen for.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.map_task.maps`

Each variant is one file in `maps/` (the format is in this folder's README). Its
`follower` part is the avatar's own map: where it starts and where each landmark
is. Its `giver` part is the participant's map, which the avatar never sees. Only
its landmark names are used here, so a landmark the avatar doesn't have is still
recognized when the participant names it.

Points are 0-1 across and down from the map's top-left as the avatar reads it,
the frame avatar plans use for gaze (`AVATAR_PLANS.md` §8.2), so up is a smaller y.

"""
from __future__  import annotations
from dataclasses import dataclass
from pathlib     import Path

import json, re

# Where each variant's map file lives
MAP_TASK_MAPS_DIR = Path(__file__).parent / "maps"

# Reach of a landmark whose entry gives no `radius` (map units: 1 is the map's width)
MAP_TASK_DEFAULT_RADIUS = 0.04

# Largest `radius` a landmark entry may give
MAP_TASK_MAX_RADIUS = 0.5

# A landmark id: lowercase letters, digits, and underscores
MAP_TASK_LANDMARK_ID = re.compile(r"[a-z][a-z0-9_]*")

# A point on a map: 0-1 across and down from its top-left, as the avatar reads it
Point = tuple[float, float]


# --------------------------------------------------------------------------------
# Map Types
# --------------------------------------------------------------------------------
# One landmark on the avatar's map
@dataclass(frozen=True, slots=True)
class Landmark:
    id     : str              # Stable id the LLM's moves and the cues use
    label  : str              # What the avatar calls it ("rope bridge")
    names  : tuple[str, ...]  # Every way the user might say it, lowercase (the label first)
    at     : Point            # Its center
    radius : float            # How far it reaches from its center

# The participant's map, which the avatar never sees
@dataclass(frozen=True, slots=True)
class GiverMap:
    image          : str | None         # Picture shown to the participant (None until there is one)
    landmark_names : tuple[str, ...]    # Every landmark name on it, lowercase
    route          : tuple[Point, ...]  # The route drawn on it, for scoring later (may be empty)

# One map variant: the avatar's map and the participant's
@dataclass(frozen=True, slots=True)
class TaskMap:
    name        : str                  # The variant (its file's name)
    description : str                  # Where the map comes from
    start       : Point                # Where the avatar starts
    landmarks   : dict[str, Landmark]  # The avatar's landmarks, by id
    giver       : GiverMap             # The participant's map
    lexicon     : tuple[str, ...]      # Every landmark name on either map, longest first


# ================================================================================
# Load and Check a Map File
# ================================================================================
# Read one variant's map file, refusing anything a turn couldn't use
def load_map(variant: str) -> TaskMap:
    """
    The harness loads every variant at import, so a broken map file stops the
    backend at startup, naming the file and the field at fault, instead of failing
    partway through a session.
    """
    path = MAP_TASK_MAPS_DIR / f"{variant}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    _keys(data, path.name, required={"description", "follower", "giver"})

    # The avatar's map
    follower = data["follower"]
    _keys(follower, f"{path.name} follower", required={"start", "landmarks"})
    entries   = _list(follower["landmarks"], f"{path.name} follower.landmarks")
    landmarks = [_landmark(entry, f"{path.name} follower.landmarks[{index}]") for index, entry in enumerate(entries)]
    if not landmarks:                                                raise ValueError(f"{path.name} follower.landmarks: needs at least one landmark")
    if len({landmark.id for landmark in landmarks}) != len(landmarks): raise ValueError(f"{path.name} follower.landmarks: every id must be different")

    # The participant's map
    giver = data["giver"]
    _keys(giver, f"{path.name} giver", required={"image", "landmark_names"}, optional={"route"})
    giver_map = GiverMap(
        image          = _image(giver["image"], f"{path.name} giver.image"),
        landmark_names = tuple(_name (name,  f"{path.name} giver.landmark_names") for name  in _list(giver["landmark_names"], f"{path.name} giver.landmark_names")),
        route          = tuple(_point(point, f"{path.name} giver.route")          for point in _list(giver.get("route", []),   f"{path.name} giver.route")),
    )

    # Names to listen for, longest first so "rope bridge" is found before "bridge"
    names = {name for landmark in landmarks for name in landmark.names} | set(giver_map.landmark_names)
    return TaskMap(
        name        = variant,
        description = _text(data["description"], f"{path.name} description"),
        start       = _point(follower["start"], f"{path.name} follower.start"),
        landmarks   = {landmark.id: landmark for landmark in landmarks},
        giver       = giver_map,
        lexicon     = tuple(sorted(names, key=lambda name: (-len(name), name))),
    )


# --------------------------------------------------------------------------------
# Field Checks
# --------------------------------------------------------------------------------
# One landmark entry: {id, label, also_called?, at, radius?}
def _landmark(entry: object, where: str) -> Landmark:
    _keys(entry, where, required={"id", "label", "at"}, optional={"also_called", "radius"})
    if (not isinstance(entry["id"], str)) or (not MAP_TASK_LANDMARK_ID.fullmatch(entry["id"])):
        raise ValueError(f"{where}.id: must be lowercase letters, digits, and underscores")

    # The label is how the avatar says it; every name it might be called by is matched in lowercase
    label   = _text(entry["label"], f"{where}.label")
    aliases = tuple(_name(name, f"{where}.also_called") for name in _list(entry.get("also_called", []), f"{where}.also_called"))

    # An entry without a radius is a small landmark
    radius = entry.get("radius", MAP_TASK_DEFAULT_RADIUS)
    if (not isinstance(radius, (int, float))) or (isinstance(radius, bool)) or (not 0 < radius <= MAP_TASK_MAX_RADIUS):
        raise ValueError(f"{where}.radius: must be a number above 0 and at most {MAP_TASK_MAX_RADIUS}")

    return Landmark(
        id     = entry["id"],
        label  = label,
        names  = tuple(dict.fromkeys((label.lower(), *aliases))),
        at     = _point(entry["at"], f"{where}.at"),
        radius = float(radius),
    )

# A point [x, y] with both from 0 to 1
def _point(value: object, where: str) -> Point:
    numbers = isinstance(value, list) and (len(value) == 2) and all(isinstance(n, (int, float)) and (not isinstance(n, bool)) for n in value)
    if (not numbers) or (not all(0 <= n <= 1 for n in value)): raise ValueError(f"{where}: must be a point [x, y] with both from 0 to 1")
    return (float(value[0]), float(value[1]))

# A landmark name: non-empty text, lowercase so matching ignores case
def _name(value: object, where: str) -> str:
    return _text(value, where).lower()

# Non-empty text, without surrounding spaces
def _text(value: object, where: str) -> str:
    if (not isinstance(value, str)) or (not value.strip()): raise ValueError(f"{where}: must be non-empty text")
    return value.strip()

# The participant's picture: a file in `frontend/public/map_task/`, or null until there is one
def _image(value: object, where: str) -> str | None:
    if value is None: return None
    else:             return _text(value, where)

# A list
def _list(value: object, where: str) -> list:
    if not isinstance(value, list): raise ValueError(f"{where}: must be a list")
    return value

# An object with exactly the keys a map file allows there
def _keys(value: object, where: str, *, required: set[str], optional: set[str] = frozenset()) -> None:
    if not isinstance(value, dict): raise ValueError(f"{where}: must be an object")
    missing = required - value.keys()
    unknown = value.keys() - required - optional
    if missing: raise ValueError(f"{where}: missing {', '.join(sorted(missing))}")
    if unknown: raise ValueError(f"{where}: unknown {', '.join(sorted(unknown))}")
