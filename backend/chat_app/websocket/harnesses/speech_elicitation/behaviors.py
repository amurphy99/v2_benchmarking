"""
The speech elicitation avatar: its setup, its sounds, and each reply's behavior.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.speech_elicitation.behaviors`

Sent only with the `cues` condition. The avatar holds nothing in this chat, so
the client's own automatic looks run too (`HARNESS_PROTOCOL.md` §2): glances
while idle, the eyes drifting while it thinks and while it speaks, and a sway
while it listens. On top of those, each reply's plan plays the behavior the
reply picked as its audio starts: one of the shared reactions
(`harnesses/reactions.py`). This chat offers the most of them, including the
ones with a hand, since the avatar holds nothing here.

The signs of listening (`features/backchannels/`) use this chat's sounds,
clips in the avatar's own voice sent once in the setup (§2, §3.3). At pauses,
"mm-hm", "yeah", and "right" take turns with silent signs. While the reply check
holds a reply, it can also pick a sound that fits what the user is saying ("oh,
wow", "oh no", "really?").

"""
from __future__ import annotations
from typing     import TYPE_CHECKING

# From this project
from ..features.backchannels.cue import BACKCHANNEL_NOD, BACKCHANNEL_SMILE, BACKCHANNEL_TILT, listening_sound
from ..reactions                 import reaction_steps

if TYPE_CHECKING:
    from ..avatar          import AvatarPlan, AvatarSetup, AvatarSounds
    from  .response_models import Behavior

# Session settings in each condition (with cues, every automatic look the client has)
ELICITATION_SETUP_CUES    = {"rest": "Slightly Smiling Face", "auto": {"idle_glances": True,  "thinking_look": True,  "speech_gaze": True,  "listening_motions": True }}
ELICITATION_SETUP_NO_CUES = {"rest": "Slightly Smiling Face", "auto": {"idle_glances": False, "thinking_look": False, "speech_gaze": False, "listening_motions": False}}

# Holding the user's gaze as a reply starts
ELICITATION_LOOK_BACK_MS = 1_500

# The sounds the avatar makes while listening: the name a sign plays, and the words its voice says
# (the last three fit only some of what a user says, so only the reply check picks them)
ELICITATION_SOUNDS = {
    "mm_hm"  : "Mm-hm.",
    "yeah"   : "Yeah.",
    "right"  : "Right.",
    "oh_wow" : "Oh, wow.",
    "oh_no"  : "Oh no.",
    "really" : "Really?",
}

# The signs of listening at pauses, in turn (some silent, so the sounds don't come like a metronome)
ELICITATION_SIGNS: tuple[dict[str, object], ...] = (
    {"move": BACKCHANNEL_NOD,  "sound": listening_sound("mm_hm")},
    {"move": BACKCHANNEL_NOD,  "face": BACKCHANNEL_SMILE},
    {"move": BACKCHANNEL_NOD,  "sound": listening_sound("yeah")},
    {"move": BACKCHANNEL_TILT},
    {"move": BACKCHANNEL_NOD,  "sound": listening_sound("right"), "face": BACKCHANNEL_SMILE},
)


# --------------------------------------------------------------------------------
# Plans
# --------------------------------------------------------------------------------
# Session settings for the chat's condition, with the signs' sounds in either (each setup replaces the last)
def setup_for(with_cues: bool, sounds: AvatarSounds) -> AvatarSetup:
    setup = ELICITATION_SETUP_CUES if with_cues else ELICITATION_SETUP_NO_CUES
    return {**setup, "sounds": sounds}

# Listen as the chat starts
def start_plan() -> AvatarPlan:
    return {"id": "start", "steps": [{"state": "listening"}]}

# Think while a reply is worked out (the client's own thinking look moves the eyes)
def thinking_plan(turn: int) -> AvatarPlan:
    return {"id": f"t{turn}-think", "turn": turn, "steps": [{"state": "thinking"}]}

# A reply's plan: eyes on the user and its reaction as its audio starts, then listening after
def reply_plan(turn: int, behavior: Behavior) -> AvatarPlan:
    steps = reaction_steps(behavior, {"start_on": "reply_audio", "state": "listening"}, {"on": "user", "hold_ms": ELICITATION_LOOK_BACK_MS})
    return {"id": f"t{turn}-reply", "turn": turn, "feedback": "end", "steps": steps}
