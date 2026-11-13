"""
The speech elicitation harness's cues: signs of listening, and speaking up after a silence.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.speech_elicitation.cues`

* `ListeningSigns` gives a sign of listening when the user pauses in the middle
  of what they are saying: a nod or a tilt of the head, most of them with a
  short sound in the avatar's voice ("mm-hm", "yeah"; `behaviors.py`). Only
  with the `cues` condition, with the shared `BackToListening`
  (`harnesses/cues.py`).
* `QuietPrompt` asks for a turn of the avatar's own after a long silence on the
  user's turn, a few times in a row at most. It runs in both conditions: it
  changes what the avatar says, and the conditions differ only in how it acts.

A sign is an avatar plan, not a reply: the sound is a clip the client already
holds, played beside any reply's audio, so newer speech can't cancel it and it
is never saved as a message.

"""
from __future__ import annotations
from typing     import TYPE_CHECKING

import time

# From this project
from ...services.bg_helpers import fire_and_log
from  ..avatar              import send_avatar_plan
from  ..cues                import SilenceWatcher
from   .behaviors           import backchannel_plan
from   .config              import ELICITATION_MAX_QUIET_PROMPTS, ELICITATION_PAUSE_SEC, ELICITATION_QUIET_AFTER_SEC, ELICITATION_SIGN_MIN_GAP_SEC, ELICITATION_SIGN_MIN_WORDS

if TYPE_CHECKING:
    from ..base    import FinalUtterance, InterimSpeech
    from  .harness import SpeechElicitationHarness


# --------------------------------------------------------------------------------
# Listening Signs
# --------------------------------------------------------------------------------
# Give a sign of listening when the user pauses partway through what they are saying
class ListeningSigns(SilenceWatcher):
    """
    The pause is measured from the end of the speech recognized so far, and only
    inside an utterance: once it is finished the reply is on its way, and the
    reply is the answer. A sign also waits for the utterance to have a few words
    (a short answer gets a reply instead) and for a gap since the last sign.

    NOTE: How often a pause is caught depends on the speech recognizer, which ends
          an utterance by its own rules. If it usually ends one before
          `ELICITATION_PAUSE_SEC` has passed, the signs will be rare.
    """
    harness        : SpeechElicitationHarness
    THRESHOLDS_SEC = (ELICITATION_PAUSE_SEC,)

    # Start with nothing heard, and no sign given
    def __init__(self, harness: SpeechElicitationHarness) -> None:
        super().__init__(harness)
        self._words     = 0                    # Words in the utterance so far
        self._signs     = 0                    # Signs so far (in each plan's id, and picking which one plays)
        self._last_sign : float | None = None  # When the last sign was given, on the monotonic clock

    # The utterance has grown: count its words, and time the pause from where the speech ends
    def on_interim(self, speech: InterimSpeech) -> None:
        self._words = len(speech.text.split())
        super().on_interim(speech)

    # The utterance is finished: no sign for the pause that ended it
    def on_final(self, utterance: FinalUtterance) -> None:
        self._words = 0
        self._clear()

    # A pause inside a long enough utterance: give the next sign, unless one was just given
    def on_silence(self, seconds: float) -> None:
        now = time.monotonic()
        if self._words < ELICITATION_SIGN_MIN_WORDS: return
        if (self._last_sign is not None) and ((now - self._last_sign) < ELICITATION_SIGN_MIN_GAP_SEC): return

        self._last_sign = now
        self._signs    += 1
        fire_and_log(send_avatar_plan(self.harness.consumer, backchannel_plan(self._signs)), name="speech_elicitation::listening_sign")


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
