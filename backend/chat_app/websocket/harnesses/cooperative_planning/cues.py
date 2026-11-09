"""
The planning harness's cues: reading the card, glancing at items, and nudging.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.cooperative_planning.cues`

Switched on by the `cues` condition. Each reacts to the turn events with an
avatar plan (`behaviors.py`), or with a turn of the avatar's own:

* `BackToListening` lowers the card and looks back at the user when newer speech
  cancels a reply (the harness itself sends the look that reads the card over while
  a reply is prepared, through `publish_plan`, so it always goes out before the
  reply's own plan).
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
from  ..base                import Cue
from  ..cues                import KeywordCue, SilenceWatcher
from   .behaviors           import glance_plan, listening_plan
from   .config              import PLANNING_MAX_NUDGES, PLANNING_NUDGE_AFTER_SEC

if TYPE_CHECKING:
    from ..avatar  import AvatarPlan
    from ..base    import FinalUtterance, TurnAttempt
    from  .harness import CooperativePlanningHarness


# Send a plan to the harness's client without holding up the turn event
def _send_plan(harness: CooperativePlanningHarness, plan: AvatarPlan, name: str) -> None:
    fire_and_log(send_avatar_plan(harness.consumer, plan), name=f"cooperative_planning::{name}")


# --------------------------------------------------------------------------------
# Back to Listening
# --------------------------------------------------------------------------------
# Lower the card and look back at the user when newer speech cancels a reply
class BackToListening(Cue):
    harness : CooperativePlanningHarness

    # Newer speech cancelled the reply: card down, eyes back on the user
    def on_reply_cancelled(self, attempt: TurnAttempt, saved: bool) -> None:
        _send_plan(self.harness, listening_plan(self.harness.turn_number), "back_to_listening")


# --------------------------------------------------------------------------------
# Item Glance
# --------------------------------------------------------------------------------
# Glance at an item's line on the card the moment the user names the item
class ItemGlance(KeywordCue):
    harness : CooperativePlanningHarness

    # Listen for every name of every item ("main course", "entree"), longest first
    def __init__(self, harness: CooperativePlanningHarness) -> None:
        super().__init__(harness)
        self.PATTERNS = {
            item.id: re.compile(r"\b(" + "|".join(re.escape(name) for name in sorted(item.names, key=len, reverse=True)) + r")\b", re.IGNORECASE)
            for item in harness.scenario.items
        }
        self._replying = False  # A reply is being prepared or played (a glance would cut its plan short)
        self._glances  = 0      # Glances so far (in each plan's id)

    # Glance at the named item's line, unless a reply owns the avatar right now
    def on_match(self, name: str, text: str) -> None:
        if self._replying: return
        self._glances += 1
        _send_plan(self.harness, glance_plan(self.harness.scenario, name, self._glances), "item_glance")

    # A reply owns the avatar from when it starts being prepared until its audio finishes, or it is cancelled
    def on_reply_started  (self, attempt: TurnAttempt             ) -> None: self._replying = True
    def on_reply_cancelled(self, attempt: TurnAttempt, saved: bool) -> None: self._replying = False
    def on_playback       (self, response_id: int,     state: str ) -> None: self._replying = (state == "started")


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
