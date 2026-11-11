"""
Map Task map files: both maps of one variant, and the names to listen for.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.map_task.maps`

Each variant is one file in `maps/` (the format is in this folder's README). It
lists every landmark once, with the maps that have it: the participant's (the
giver's), the avatar's (the follower's), or both, and where it sits or what it is
called on the avatar's map when that differs. The route runs from the start (on
both maps) to the finish (only on the participant's).

A turn is read against the avatar's map (`understanding.py`). Of the
participant's map only the names matter there, so a landmark the avatar lacks is
still recognized when the participant names it. Clients get each map as a view
to draw (`giver_view`, `follower_view`), and the staff preview page gets every
file, read fresh from disk (`map_file_previews`).

Points are 0-1 across and down from the map's top-left as the avatar reads it,
the frame avatar plans use for gaze (`HARNESS_PROTOCOL.md` §8.2), so up is a smaller y.
A map is landscape (wide) or portrait (tall) paper; distances are measured in its
real proportions, in map units where 1 is the paper's longer side (`scale`).

"""
from __future__  import annotations
from dataclasses import dataclass
from pathlib     import Path

import json, re

# From this project
from .map_icons import MAP_TASK_ICONS

# Where each variant's map file lives
MAP_TASK_MAPS_DIR = Path(__file__).parent / "maps"

# Reach of a landmark whose entry gives no `radius` (map units: 1 is the paper's longer side)
MAP_TASK_DEFAULT_RADIUS = 0.04

# Largest `radius` a landmark entry may give
MAP_TASK_MAX_RADIUS = 0.5

# A landmark id: lowercase letters, digits, and underscores
MAP_TASK_LANDMARK_ID = re.compile(r"[a-z][a-z0-9_]*")

# The maps a landmark entry can be on (`on`; both when left out)
MAP_TASK_SIDES = ("both", "giver", "follower")

# What a landmark's `follower` entry can change on the avatar's copy
MAP_TASK_FOLLOWER_CHANGES = frozenset({"at", "label", "also_called"})

# Each paper shape's width and height (the avatar's held map is landscape; `shape` picks one, landscape when left out)
MAP_TASK_PAPER = {"landscape": (210, 148), "portrait": (148, 210)}

# A point on a map: 0-1 across and down from its top-left, as the avatar reads it
Point = tuple[float, float]

# How long the paper's width and height are in map units (the longer side is 1)
Scale = tuple[float, float]


# --------------------------------------------------------------------------------
# Map Types
# --------------------------------------------------------------------------------
# One landmark as one of the two maps shows it
@dataclass(frozen=True, slots=True)
class Landmark:
    id     : str              # Stable id the LLM's moves and the cues use (the same on both maps)
    label  : str              # What this map calls it ("rope bridge")
    names  : tuple[str, ...]  # Every way the user might say it, lowercase (the label first)
    icon   : str              # The picture it is drawn with (`map_icons.MAP_TASK_ICONS`)
    at     : Point            # Its center
    radius : float            # How far it reaches from its center

# The participant's map, which the avatar never sees
@dataclass(frozen=True, slots=True)
class GiverMap:
    landmarks : dict[str, Landmark]  # Its landmarks, by id
    route     : tuple[Point, ...]    # The route drawn on it, from the start to the finish

# One map variant: the avatar's map and the participant's
@dataclass(frozen=True, slots=True)
class TaskMap:
    name        : str                  # The variant (its file's name)
    description : str                  # Where the map comes from
    shape       : str                  # The paper both maps are on: "landscape" or "portrait"
    start       : Point                # Where the avatar starts (the route's first point, on both maps)
    landmarks   : dict[str, Landmark]  # The avatar's landmarks, by id
    giver       : GiverMap             # The participant's map
    lexicon     : tuple[str, ...]      # Every landmark name on either map, longest first

    # How long the paper's width and height are in map units (distances on it are measured with these)
    @property
    def scale(self) -> Scale:
        width, height = MAP_TASK_PAPER[self.shape]
        return (width / max(width, height), height / max(width, height))


# ================================================================================
# Load and Check a Map File
# ================================================================================
# Read one variant's map file, refusing anything a turn or a client couldn't use
def load_map(variant: str) -> TaskMap:
    """
    The harness loads every variant at import, so a broken map file stops the
    backend at startup, naming the file and the field at fault, instead of failing
    partway through a session.
    """
    path = MAP_TASK_MAPS_DIR / f"{variant}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    _keys(data, path.name, required={"description", "route", "landmarks"}, optional={"shape"})
    shape = data.get("shape", "landscape")
    if shape not in MAP_TASK_PAPER: raise ValueError(f"{path.name} shape: must be one of {', '.join(MAP_TASK_PAPER)}")

    # The route, from the start (on both maps) to the finish (only on the participant's)
    route = tuple(_point(point, f"{path.name} route[{index}]") for index, point in enumerate(_list(data["route"], f"{path.name} route")))
    if len(route) < 2: raise ValueError(f"{path.name} route: needs at least a start and a finish")

    # Each landmark's copy on each map that has it
    entries  = _list(data["landmarks"], f"{path.name} landmarks")
    copies   = [_landmark_copies(entry, f"{path.name} landmarks[{index}]") for index, entry in enumerate(entries)]
    giver    = [giver_copy    for giver_copy, _    in copies if giver_copy    is not None]
    follower = [follower_copy for _, follower_copy in copies if follower_copy is not None]

    # Ids name one landmark across both maps, and the avatar needs something to find
    ids = [entry["id"] for entry in entries]
    if len(set(ids)) != len(ids): raise ValueError(f"{path.name} landmarks: every id must be different")
    if not follower:              raise ValueError(f"{path.name} landmarks: the avatar's map needs at least one landmark")

    # Names to listen for, longest first so "rope bridge" is found before "bridge"
    names = {name for landmark in (*giver, *follower) for name in landmark.names}
    return TaskMap(
        name        = variant,
        description = _text(data["description"], f"{path.name} description"),
        shape       = shape,
        start       = route[0],
        landmarks   = {landmark.id: landmark for landmark in follower},
        giver       = GiverMap(landmarks={landmark.id: landmark for landmark in giver}, route=route),
        lexicon     = tuple(sorted(names, key=lambda name: (-len(name), name))),
    )


# --------------------------------------------------------------------------------
# Landmark Entries
# --------------------------------------------------------------------------------
# One landmark entry's copy on the participant's map and on the avatar's (None for a map without it)
def _landmark_copies(entry: object, where: str) -> tuple[Landmark | None, Landmark | None]:
    _keys(entry, where, required={"id", "label", "icon", "at"}, optional={"also_called", "radius", "on", "follower"})
    if (not isinstance(entry["id"], str)) or (not MAP_TASK_LANDMARK_ID.fullmatch(entry["id"])):
        raise ValueError(f"{where}.id: must be lowercase letters, digits, and underscores")

    # Which maps have it
    on = entry.get("on", "both")
    if on not in MAP_TASK_SIDES: raise ValueError(f"{where}.on: must be one of {', '.join(MAP_TASK_SIDES)}")

    # The participant's copy, which is also the avatar's unless `follower` changes it
    shared   = _landmark(entry, where)
    changes  = entry.get("follower")
    follower = shared if (changes is None) else _changed_copy(entry, changes, on, f"{where}.follower")
    return (shared if (on != "follower") else None, follower if (on != "giver") else None)

# The avatar's copy of a landmark on both maps, moved or renamed by its `follower` entry
def _changed_copy(entry: dict, changes: object, on: str, where: str) -> Landmark:
    _keys(changes, where, required=set(), optional=MAP_TASK_FOLLOWER_CHANGES)
    if on != "both": raise ValueError(f"{where}: only a landmark on both maps can differ on the avatar's map")
    if not changes:  raise ValueError(f"{where}: give at least one of {', '.join(sorted(MAP_TASK_FOLLOWER_CHANGES))}")

    # A new name drops the participant's other names unless it brings its own
    fields = {**entry, **changes}
    if ("label" in changes) and ("also_called" not in changes): fields.pop("also_called", None)
    return _landmark(fields, where)

# A landmark from an entry's fields: {id, label, icon, at, also_called?, radius?}
def _landmark(fields: dict, where: str) -> Landmark:
    # The label is how the map writes it; every name it might be called by is matched in lowercase
    label   = _text(fields["label"], f"{where}.label")
    aliases = tuple(_name(name, f"{where}.also_called") for name in _list(fields.get("also_called", []), f"{where}.also_called"))

    # The picture must be one the clients can draw
    icon = fields["icon"]
    if (not isinstance(icon, str)) or (icon not in MAP_TASK_ICONS): raise ValueError(f"{where}.icon: {icon!r} is not one of the icons in map_icons.py")

    # An entry without a radius is a small landmark
    radius = fields.get("radius", MAP_TASK_DEFAULT_RADIUS)
    if (not isinstance(radius, (int, float))) or (isinstance(radius, bool)) or (not 0 < radius <= MAP_TASK_MAX_RADIUS):
        raise ValueError(f"{where}.radius: must be a number above 0 and at most {MAP_TASK_MAX_RADIUS}")

    return Landmark(
        id     = fields["id"],
        label  = label,
        names  = tuple(dict.fromkeys((label.lower(), *aliases))),
        icon   = icon,
        at     = _point(fields["at"], f"{where}.at"),
        radius = float(radius),
    )


# --------------------------------------------------------------------------------
# Field Checks
# --------------------------------------------------------------------------------
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

# A list
def _list(value: object, where: str) -> list:
    if not isinstance(value, list): raise ValueError(f"{where}: must be a list")
    return value

# An object with exactly the keys a map file allows there
def _keys(value: object, where: str, *, required: set[str], optional: set[str] | frozenset[str] = frozenset()) -> None:
    if not isinstance(value, dict): raise ValueError(f"{where}: must be an object")
    missing = required - value.keys()
    unknown = value.keys() - required - optional
    if missing: raise ValueError(f"{where}: missing {', '.join(sorted(missing))}")
    if unknown: raise ValueError(f"{where}: unknown {', '.join(sorted(unknown))}")


# ================================================================================
# Views for Clients
# ================================================================================
# One landmark as a client draws it
def _landmark_view(landmark: Landmark) -> dict[str, object]:
    return {"id": landmark.id, "label": landmark.label, "icon": landmark.icon, "at": list(landmark.at), "radius": landmark.radius}

# The participant's map as a client draws it: its paper, its landmarks, and the route from the start to the finish
def giver_view(task_map: TaskMap) -> dict[str, object]:
    return {"shape": task_map.shape, "landmarks": [_landmark_view(landmark) for landmark in task_map.giver.landmarks.values()], "route": [list(point) for point in task_map.giver.route]}

# The avatar's map as a monitor draws it: its paper, its landmarks, and where it starts
def follower_view(task_map: TaskMap) -> dict[str, object]:
    return {"shape": task_map.shape, "landmarks": [_landmark_view(landmark) for landmark in task_map.landmarks.values()], "start": list(task_map.start)}

# Every map file as the staff preview page shows it, read fresh from disk (the chat types listed first)
def map_file_previews(registered: tuple[str, ...]) -> list[dict[str, object]]:
    """
    Reads each file again on every call, so an edit shows on the next page load
    without restarting the backend. A file that doesn't load is listed with the
    error that would stop startup, and a file not in `MAP_TASK_VARIANTS` is marked
    as not offered to clients.
    """
    previews = []
    for path in sorted(MAP_TASK_MAPS_DIR.glob("*.json"), key=lambda path: (path.stem not in registered, path.stem)):
        preview = {"variant": path.stem, "registered": path.stem in registered, "error": None, "giver": None, "follower": None}
        try:                        task_map = load_map(path.stem)
        except ValueError as error: preview["error"] = str(error)
        else:                       preview.update(giver=giver_view(task_map), follower=follower_view(task_map))
        previews.append(preview)
    return previews
