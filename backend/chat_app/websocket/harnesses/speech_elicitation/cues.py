"""
Speech elicitation cues: signs of listening, and speaking up after a silence.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.speech_elicitation.cues`

* `ElicitationBackchannels` gives a sign of listening when the user pauses in the
  middle of what they are saying: a nod or a tilt of the head, most of them with
  a short sound in the avatar's voice ("mm-hm", "yeah"). It is the shared
  feature (`features/backchannels/`) with this chat's sounds and signs
  (`behaviors.py`), on in the conditions its switch lists (with cues).
* `QuietPrompt` asks for a turn of the avatar's own after a long silence on the
  user's turn, a few times in a row at most. It runs in both conditions: it
  changes what the avatar says, and the conditions differ only in how it acts.

"""
from __future__ import annotations
from typing     import TYPE_CHECKING

# From this project
from ..cues                      import SilenceWatcher
from ..features.backchannels.cue import Backchannels
from  .behaviors                 import ELICITATION_SIGNS, ELICITATION_SOUNDS
from  .config                    import ELICITATION_MAX_QUIET_PROMPTS, ELICITATION_QUIET_AFTER_SEC

if TYPE_CHECKING:
    from ..base    import FinalUtterance
    from  .harness import SpeechElicitationHarness


# Signs of listening at pauses, with this chat's sounds (the reply check picks from them too)
class ElicitationBackchannels(Backchannels):
    SOUNDS = ELICITATION_SOUNDS
    SIGNS  = ELICITATION_SIGNS


# --------------------------------------------------------------------------------
# Quiet Prompt
# --------------------------------------------------------------------------------
# Speak up again after a long silence on the user's turn (a few times in a row at most)
class QuietPrompt(SilenceWatcher):
    harness        : SpeechElicitationHarness
    THRESHOLDS_SEC = (ELICITATION_QUIET_AFTER_SEC,)

    # Start with no prompts given
    def __init__(self, harness: SpeechElicitationHarness) -> None:
        super().__init__(harness)
        self._prompts = 0  # Prompts since the user last spoke

    # The user spoke: the count starts over
    def on_final(self, utterance: FinalUtterance) -> None:
        super().on_final(utterance)
        self._prompts = 0

    # Ask for a turn (none once the user has said they want to stop, or after too many in a row)
    def on_silence(self, seconds: float) -> None:
        if (self._prompts >= ELICITATION_MAX_QUIET_PROMPTS) or self.harness.state.wound_down: return
        if self.harness.request_turn(): self._prompts += 1
