"""
The planning harness's cues: reading the card, glancing at items, and nudging.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.cooperative_planning.cues`

Switched on by the `cues` condition, with the shared `BackToListening`
(`harnesses/cues.py`), which lowers the card and looks back at the user when newer
speech cancels a reply. The harness itself sends the look that reads the card over
while a reply is prepared, through `publish_plan`, so it always goes out before
the reply's own plan. Each cue here reacts to the turn events with an avatar plan
(`behaviors.py`), or with a turn of the avatar's own:

* `ItemGlance` glances at an item's line on the card the moment the user names
  the item ("for dessert, maybe..."), while the avatar is listening.
* `QuietNudge` asks for a turn that invites the user to keep going after a long
  silence on their turn, a few times in a row at most.

A new plan drops every older plan's waiting steps, so the glance only fires
while no reply is being prepared or played (it would cut that reply's plan short).

"""
from __future__ import annotations
from typing     import TYPE_CHECKING

import re

# From this project
from ...services.bg_helpers import fire_and_log
from  ..avatar              import send_avatar_plan
from  ..cues                import KeywordCue, SilenceWatcher
from   .behaviors           import glance_plan
from   .config              import PLANNING_MAX_NUDGES, PLANNING_NUDGE_AFTER_SEC

if TYPE_CHECKING:
    from ..base    import FinalUtterance
    from  .harness import CooperativePlanningHarness


# --------------------------------------------------------------------------------
# Item Glance
# --------------------------------------------------------------------------------
# Glance at an item's line on the card the moment the user names the item (never while a reply owns the avatar)
class ItemGlance(KeywordCue):
    harness              : CooperativePlanningHarness
    QUIET_WHILE_REPLYING = True

    # Listen for every name of every item ("main course", "entree"), longest first
    def __init__(self, harness: CooperativePlanningHarness) -> None:
        super().__init__(harness)
        self.PATTERNS = {
            item.id: re.compile(r"\b(" + "|".join(re.escape(name) for name in sorted(item.names, key=len, reverse=True)) + r")\b", re.IGNORECASE)
            for item in harness.scenario.items
        }
        self._glances = 0  # Glances so far (in each plan's id)

    # Glance at the named item's line
    def on_match(self, name: str, match: re.Match[str]) -> None:
        self._glances += 1
        plan = glance_plan(self.harness.scenario, name, self._glances)
        fire_and_log(send_avatar_plan(self.harness.consumer, plan), name="cooperative_planning::item_glance")


# --------------------------------------------------------------------------------
# Quiet Nudge
# --------------------------------------------------------------------------------
# Invite the user to keep going after a long silence on their turn (a few times in a row at most)
class QuietNudge(SilenceWatcher):
    harness        : CooperativePlanningHarness
    THRESHOLDS_SEC = (PLANNING_NUDGE_AFTER_SEC,)

    # Start with no nudges given
    def __init__(self, harness: CooperativePlanningHarness) -> None:
        super().__init__(harness)
        self._nudges = 0  # Nudges since the user last spoke

    # The user spoke: the count starts over
    def on_final(self, utterance: FinalUtterance) -> None:
        super().on_final(utterance)
        self._nudges = 0

    # Ask for a nudge turn (none once the plan is approved, or after too many in a row)
    def on_silence(self, seconds: float) -> None:
        if (self._nudges >= PLANNING_MAX_NUDGES) or (self.harness.state.stage == "approved"): return
        if self.harness.request_turn(): self._nudges += 1
