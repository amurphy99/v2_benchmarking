"""
The Map Task's cues: the avatar's eyes follow the directions as they are heard.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.map_task.cues`

Switched on by the `cues` condition, with the shared `BackToListening`
(`harnesses/cues.py`), which lowers the map when newer speech cancels a reply.
Both cues here react to the user's words the moment they are recognized, and only
while the avatar is listening (their plans would cut a reply's plan short):

* `LandmarkGlance` glances at a landmark on the avatar's map as the user names
  it, or searches the map with a slight frown for one the avatar doesn't have.
* `DirectionGlance` looks from the avatar's spot toward a direction as the user
  says it ("go up", "to the right").

"""
from __future__ import annotations
from typing     import TYPE_CHECKING

import re

# From this project
from ...services.bg_helpers import fire_and_log
from  ..avatar              import send_avatar_plan
from  ..cues                import KeywordCue
from   .behaviors           import direction_plan, landmark_glance_plan, search_plan
from   .understanding       import lexicon_pattern, names_on_map

if TYPE_CHECKING:
    from ..avatar  import AvatarPlan
    from  .harness import MapTaskHarness

# Direction words, by the way they point on the map ("right" alone is too often "okay" to count)
MAP_TASK_SPOKEN_DIRECTIONS = {
    "up"    : re.compile(r"\b(up|upwards?|north(wards?)?)\b",       re.IGNORECASE),
    "down"  : re.compile(r"\b(down|downwards?|south(wards?)?)\b",   re.IGNORECASE),
    "left"  : re.compile(r"\b(left|west(wards?)?)\b",               re.IGNORECASE),
    "right" : re.compile(r"\b((on|to) (the|your) right|(go|going|turn|turning|head|heading|move|moving|bear|veer|curve) right|right(-hand)? side|east(wards?)?)\b", re.IGNORECASE),
}


# Send a plan to the harness's client without holding up the turn event
def _send_plan(harness: MapTaskHarness, plan: AvatarPlan, name: str) -> None:
    fire_and_log(send_avatar_plan(harness.consumer, plan), name=f"map_task::{name}")


# --------------------------------------------------------------------------------
# Landmark Glance
# --------------------------------------------------------------------------------
# Glance at a landmark on the avatar's map as the user names it, or search for one it doesn't have
class LandmarkGlance(KeywordCue):
    harness              : MapTaskHarness
    QUIET_WHILE_REPLYING = True

    # Listen for every landmark name on either map, the longest first (as a turn is read)
    def __init__(self, harness: MapTaskHarness) -> None:
        super().__init__(harness)
        self.PATTERNS   = {"landmark": lexicon_pattern(harness.task_map)}
        self._landmarks = names_on_map(harness.task_map)  # The avatar's landmark for each of its names
        self._looks     = 0                               # Looks so far (in each plan's id)

    # Glance at the named landmark, or search for it when the avatar's map doesn't have it
    def on_match(self, name: str, match: re.Match[str]) -> None:
        self._looks += 1
        landmark = self._landmarks.get(match.group(1).lower())
        plan     = search_plan(self._looks) if (landmark is None) else landmark_glance_plan(landmark, self._looks)
        _send_plan(self.harness, plan, "landmark_glance")


# --------------------------------------------------------------------------------
# Direction Glance
# --------------------------------------------------------------------------------
# Look from the avatar's spot toward a direction as the user says it
class DirectionGlance(KeywordCue):
    harness              : MapTaskHarness
    PATTERNS             = MAP_TASK_SPOKEN_DIRECTIONS
    QUIET_WHILE_REPLYING = True

    # Start with no looks
    def __init__(self, harness: MapTaskHarness) -> None:
        super().__init__(harness)
        self._looks = 0  # Looks so far (in each plan's id)

    # Look toward the direction just said, from where the avatar is now
    def on_match(self, name: str, match: re.Match[str]) -> None:
        self._looks += 1
        _send_plan(self.harness, direction_plan(self.harness.state.position, name, self._looks, self.harness.task_map.scale), "direction_glance")
