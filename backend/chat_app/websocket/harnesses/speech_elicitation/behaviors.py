"""
The speech elicitation avatar's plans: its setup, its sounds, and each reply's behavior.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.speech_elicitation.behaviors`

Sent only with the `cues` condition. The avatar holds nothing in this chat, so
the client's own automatic looks run too (`HARNESS_PROTOCOL.md` §2): glances
while idle, the eyes drifting while it thinks and while it speaks, and a sway
while it listens. On top of those, each reply's plan plays the behavior the
reply picked as its audio starts, and the listening cue gives a sign of
listening when the user pauses: a nod or a tilt of the head, most of them with
a short sound ("mm-hm", "yeah"). The sounds are clips in the avatar's own voice,
sent once in the setup and played by name (§2, §3.3), on a channel of their
own: they aren't replies, so nothing cancels them, saves them, or puts them in
the conversation the model sees. The faces and movements are the Smiley's names
(§9).

"""
from __future__ import annotations
from typing     import TYPE_CHECKING

# From this project
from .config import ELICITATION_SOUND_VOLUME

if TYPE_CHECKING:
    from ..avatar          import AvatarPlan, AvatarSetup, AvatarSounds
    from  .response_models import Behavior

# Session settings in each condition (with cues, every automatic look the client has)
ELICITATION_SETUP_CUES    = {"rest": "Slightly Smiling Face", "auto": {"idle_glances": True,  "thinking_look": True,  "speech_gaze": True,  "listening_motions": True }}
ELICITATION_SETUP_NO_CUES = {"rest": "Slightly Smiling Face", "auto": {"idle_glances": False, "thinking_look": False, "speech_gaze": False, "listening_motions": False}}

# Holding the user's gaze as a reply starts
ELICITATION_LOOK_BACK_MS = 1_500

# What each behavior adds to the reply's first moment
ELICITATION_BEHAVIOR_ACTIONS: dict[str, dict[str, object]] = {
    "none"        : {},
    "nod"         : {"move": {"name": "Nod", "strength": 0.6}},
    "smile"       : {"face": {"name": "Smiling Face with Smiling Eyes",  "strength": 0.7, "hold_ms": 2_500}},
    "laugh"       : {"face": {"name": "Grinning Face with Smiling Eyes", "strength": 0.8, "hold_ms": 2_000}, "move": {"name": "Bounce",    "strength": 0.4}},
    "surprised"   : {"face": {"name": "Wide-Eyed",                       "strength": 0.7, "hold_ms":   800}},
    "curious"     : {"face": {"name": "Face with Raised Eyebrow",        "strength": 0.4, "hold_ms": 1_200}, "move": {"name": "Head Tilt", "strength": 0.4}},
    "thoughtful"  : {"face": {"name": "Neutral Face",                    "strength": 0.6, "hold_ms": 1_500}, "move": {"name": "Nod",       "strength": 0.3, "speed": 0.6}},
    "sympathetic" : {"face": {"name": "Pensive Face",                    "strength": 0.5, "hold_ms": 2_000}, "move": {"name": "Head Tilt", "strength": 0.3}},
}

# The sounds the avatar makes while listening: the name a plan uses, and the words its voice says
ELICITATION_SOUNDS = {"mm_hm": "Mm-hm.", "yeah": "Yeah.", "right": "Right."}

# The small movements a sign of listening is made of
ELICITATION_LISTEN_NOD   = {"name": "Nod",          "strength": 0.3 }
ELICITATION_LISTEN_TILT  = {"name": "Head Tilt",    "strength": 0.25}
ELICITATION_LISTEN_SMILE = {"name": "Smiling Face", "strength": 0.4, "hold_ms": 900}

# The signs of listening, in turn (some silent, so the sounds don't come like a metronome)
ELICITATION_BACKCHANNELS: tuple[dict[str, object], ...] = (
    {"move": ELICITATION_LISTEN_NOD,  "sound": {"name": "mm_hm", "volume": ELICITATION_SOUND_VOLUME}},
    {"move": ELICITATION_LISTEN_NOD,  "face": ELICITATION_LISTEN_SMILE},
    {"move": ELICITATION_LISTEN_NOD,  "sound": {"name": "yeah",  "volume": ELICITATION_SOUND_VOLUME}},
    {"move": ELICITATION_LISTEN_TILT},
    {"move": ELICITATION_LISTEN_NOD,  "sound": {"name": "right", "volume": ELICITATION_SOUND_VOLUME}, "face": ELICITATION_LISTEN_SMILE},
)


# --------------------------------------------------------------------------------
# Plans
# --------------------------------------------------------------------------------
# Session settings for the chat's condition: with cues, the automatic looks and the listening sounds (None: no cues)
def setup_for(sounds: AvatarSounds | None) -> AvatarSetup:
    return ELICITATION_SETUP_NO_CUES if (sounds is None) else {**ELICITATION_SETUP_CUES, "sounds": sounds}

# Listen as the chat starts
def start_plan() -> AvatarPlan:
    return {"id": "start", "steps": [{"state": "listening"}]}

# Think while a reply is worked out (the client's own thinking look moves the eyes)
def thinking_plan(turn: int) -> AvatarPlan:
    return {"id": f"t{turn}-think", "turn": turn, "steps": [{"state": "thinking"}]}

# One reply's plan: eyes on the user and its behavior as its audio starts, and listening once it stops talking
def reply_plan(turn: int, behavior: Behavior) -> AvatarPlan:
    step = {"start_on": "reply_audio", "state": "listening", "gaze": {"on": "user", "hold_ms": ELICITATION_LOOK_BACK_MS}, **ELICITATION_BEHAVIOR_ACTIONS[behavior]}
    return {"id": f"t{turn}-reply", "turn": turn, "feedback": "end", "steps": [step]}

# One small sign of listening at a pause in the user's speech (they take turns, so two in a row never match)
def backchannel_plan(count: int) -> AvatarPlan:
    return {"id": f"listen-{count}", "steps": [ELICITATION_BACKCHANNELS[(count - 1) % len(ELICITATION_BACKCHANNELS)]]}
