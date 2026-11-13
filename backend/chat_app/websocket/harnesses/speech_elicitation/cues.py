"""
The speech elicitation harness's cues: nodding along, and speaking up after a silence.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.speech_elicitation.cues`

* `ListeningNods` gives a small sign of listening (a nod, a smile, a tilt of the
  head) every so many words while the user talks. Only with the `cues`
  condition, with the shared `BackToListening` (`harnesses/cues.py`).
* `QuietPrompt` asks for a turn of the avatar's own after a long silence on the
  user's turn, a few times in a row at most. It runs in both conditions: it
  changes what the avatar says, and the conditions differ only in how it acts.

A new plan drops every older plan's waiting steps, so the nods stop while a
reply is being prepared or played (they would cut that reply's plan short).

"""
from __future__ import annotations
from typing     import TYPE_CHECKING

# From this project
from ...services.bg_helpers import fire_and_log
from  ..avatar              import send_avatar_plan
from  ..base                import Cue
from  ..cues                import SilenceWatcher
from   .behaviors           import backchannel_plan
from   .config              import ELICITATION_MAX_QUIET_PROMPTS, ELICITATION_NOD_EVERY_WORDS, ELICITATION_QUIET_AFTER_SEC

if TYPE_CHECKING:
    from ..base    import FinalUtterance, InterimSpeech, ResponseOutcome, TurnAttempt
    from  .harness import SpeechElicitationHarness


# --------------------------------------------------------------------------------
# Listening Nods
# --------------------------------------------------------------------------------
# Give a small sign of listening every so many words while the user talks (never while a reply owns the avatar)
class ListeningNods(Cue):
    """
    Each interim repeats the whole utterance so far, so this counts its words and
    reacts each time the count has grown by `ELICITATION_NOD_EVERY_WORDS` since the
    last sign. A revision that shortens the utterance never brings one back.

    NOTE: Only clients that send `tts_playback` (the web app) report a reply's audio,
          so with any other client the nods resume once the reply's text is saved.
    """
    harness : SpeechElicitationHarness

    # Start with nothing counted, and no reply under way
    def __init__(self, harness: SpeechElicitationHarness) -> None:
        super().__init__(harness)
        self._words_at_last = 0      # Words in the utterance when the last sign was given
        self._signs         = 0      # Signs so far (in each plan's id, and picking which one plays)
        self._preparing     = False  # A reply attempt is running
        self._playing       = False  # A reply's audio is playing

    # The utterance has grown: give a sign once enough new words have been said
    def on_interim(self, speech: InterimSpeech) -> None:
        words = len(speech.text.split())
        if (words - self._words_at_last) < ELICITATION_NOD_EVERY_WORDS: return
        self._words_at_last = words
        if self._preparing or self._playing: return

        self._signs += 1
        fire_and_log(send_avatar_plan(self.harness.consumer, backchannel_plan(self._signs)), name="speech_elicitation::listening_nod")

    # The utterance is finished: the next one counts from its first word
    def on_final(self, utterance: FinalUtterance) -> None:
        self._words_at_last = 0

    # A reply owns the avatar from when it starts being prepared until its audio finishes, or it is cancelled
    def on_reply_started  (self, attempt: TurnAttempt             ) -> None: self._preparing = True
    def on_reply_saved    (self, outcome: ResponseOutcome         ) -> None: self._preparing = False
    def on_playback       (self, response_id: int,     state: str ) -> None: self._playing   = (state == "started")
    def on_reply_cancelled(self, attempt: TurnAttempt, saved: bool) -> None: self._preparing, self._playing = False, False


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
