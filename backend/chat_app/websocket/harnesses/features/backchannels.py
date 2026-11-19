"""
Signs of listening at pauses in the user's speech: a cue each chat type styles.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.features.backchannels`

A sign is a nod or a tilt of the head, often with a short sound in the avatar's
own voice ("mm-hm"). It goes out as an avatar plan, not a reply: the sound is a
clip synthesized once and sent in the chat's setup, then played by name beside
any reply's audio (`HARNESS_PROTOCOL.md` §2 and §3.3), so newer speech can't
cancel it and it is never saved as a message.

A chat type styles its signs in a small subclass: the sounds its avatar can make
and the signs it gives at pauses, in the order they take turns (and its own pause
length, word count, or gap, when the defaults in `config.py` don't suit it).
While the reply check holds a reply, it gives the sign it picked through the same
cue (`chosen_sign`), so signs of the two kinds never come close together.

"""
from __future__ import annotations
from typing     import TYPE_CHECKING

import time

# From this project
from ...services.bg_helpers import fire_and_log
from  ..avatar              import send_avatar_plan, synthesize_sounds
from  ..cues                import SilenceWatcher
from   .config              import BACKCHANNEL_MIN_GAP_SEC, BACKCHANNEL_MIN_WORDS, BACKCHANNEL_PAUSE_SEC, BACKCHANNEL_SOUND_VOLUME, FEATURE_BACKCHANNELS_CONDITIONS

if TYPE_CHECKING:
    from ..avatar import AvatarPlan, AvatarSounds
    from ..base   import ChatHarness, FinalUtterance, InterimSpeech

# The movements and the face a sign is made of (the Smiley's names, `HARNESS_PROTOCOL.md` §9)
BACKCHANNEL_NOD   = {"name": "Nod",          "strength": 0.3 }
BACKCHANNEL_TILT  = {"name": "Head Tilt",    "strength": 0.25}
BACKCHANNEL_SMILE = {"name": "Smiling Face", "strength": 0.4, "hold_ms": 900}

# What each gesture the reply check can pick adds to its sign (`reply_gate/response_models.Gesture`)
BACKCHANNEL_GESTURES: dict[str, dict[str, object]] = {
    "nod"   : {"move": BACKCHANNEL_NOD},
    "tilt"  : {"move": BACKCHANNEL_TILT},
    "smile" : {"move": BACKCHANNEL_NOD, "face": BACKCHANNEL_SMILE},
    "none"  : {},
}


# One of the setup's sounds, played softer than the reply voice
def listening_sound(name: str) -> dict[str, object]:
    return {"name": name, "volume": BACKCHANNEL_SOUND_VOLUME}


# ================================================================================
# Backchannels
# ================================================================================
# Give a sign of listening when the user pauses partway through what they are saying
class Backchannels(SilenceWatcher):
    """
    The pause is measured from the end of the speech recognized so far, and only
    inside an utterance: once it is finished the reply is on its way, and the
    reply is the answer. A sign also waits for the utterance to have a few words
    (a short answer gets a reply instead) and for a gap since the last sign.

    The feature runs in the conditions `config.FEATURE_BACKCHANNELS_CONDITIONS`
    lists. Switched off, it gives no signs and the setup carries no sounds.

    NOTE: How often a pause is caught depends on the speech recognizer, which ends
          an utterance by its own rules. If it usually ends one before
          `THRESHOLDS_SEC` has passed, the signs at pauses will be rare.
    """
    SOUNDS         : dict[str, str]                = {}                        # Name a sign plays -> the words the avatar's voice says
    SIGNS          : tuple[dict[str, object], ...] = ()                        # Signs at pauses, in the order they take turns (some silent)
    THRESHOLDS_SEC : tuple[float, ...]             = (BACKCHANNEL_PAUSE_SEC,)  # The pause that gets a sign
    MIN_WORDS      : int                           = BACKCHANNEL_MIN_WORDS     # Words the utterance needs first
    MIN_GAP_SEC    : float                         = BACKCHANNEL_MIN_GAP_SEC   # Shortest time between two signs of either kind

    # Start with nothing heard and no sign given, switched on only in the conditions that use it
    def __init__(self, harness: ChatHarness) -> None:
        super().__init__(harness)
        self.on         = (harness.condition in FEATURE_BACKCHANNELS_CONDITIONS)  # Gives signs (this connection's switch)
        self._words     = 0                                                       # Words in the utterance so far
        self._signs     = 0                                                       # Signs given (in each plan's id, and picking the next pause sign)
        self._last_sign : float | None = None                                     # When the last sign was given, on the monotonic clock

    # The setup's sounds in the avatar's own voice (None while switched off, so the setup carries none)
    async def sounds(self) -> AvatarSounds | None:
        return (await synthesize_sounds(self.SOUNDS)) if self.on else None

    # --------------------------------------------------------------------------------
    # Pauses in the User's Speech
    # --------------------------------------------------------------------------------
    # The utterance has grown: count its words, and time the pause from where the speech ends
    def on_interim(self, speech: InterimSpeech) -> None:
        self._words = len(speech.text.split())
        super().on_interim(speech)

    # The utterance is finished: no sign for the pause that ended it
    def on_final(self, utterance: FinalUtterance) -> None:
        self._words = 0
        self._clear()

    # A pause inside a long enough utterance: give the next sign in turn
    def on_silence(self, seconds: float) -> None:
        if self._words < self.MIN_WORDS: return
        plan = self._sign(self.SIGNS[self._signs % len(self.SIGNS)])
        if plan is not None: fire_and_log(send_avatar_plan(self.harness.consumer, plan), name=f"{self.harness.NAME}::listening_sign")

    # --------------------------------------------------------------------------------
    # Signs
    # --------------------------------------------------------------------------------
    # The sign the reply check picked for a held reply (None when it picked neither a sound nor a gesture, or none is due)
    def chosen_sign(self, sound: str, gesture: str) -> AvatarPlan | None:
        step = {**BACKCHANNEL_GESTURES[gesture], **({} if (sound == "none") else {"sound": listening_sound(sound)})}
        return self._sign(step) if step else None

    # A sign's plan, unless switched off or too soon after the last one (a plan made counts as given)
    def _sign(self, step: dict[str, object]) -> AvatarPlan | None:
        now = time.monotonic()
        if not self.on: return None
        if (self._last_sign is not None) and ((now - self._last_sign) < self.MIN_GAP_SEC): return None

        self._last_sign = now
        self._signs    += 1
        return {"id": f"listen-{self._signs}", "steps": [step]}
