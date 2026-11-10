"""
The planning avatar's plans: its setup, its card, and each named behavior.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.cooperative_planning.behaviors`

The reply calls pick a behavior by name (`response_models.Behavior`), and code
turns it into an avatar plan built from the Smiley's own names
(`HARNESS_PROTOCOL.md` §9). Every reply's plan starts with the reply's audio: the
card comes down, the avatar looks at the user (and listens again once it stops
talking), and the behavior plays on top. When the exchange settled an item, the
avatar then looks down at that item's line on its card and nods, as if writing
the choice in.

The cues and the harness send these only in the `cues` condition, where the
avatar holds its own card: its constraints at the top, then a line for each item.
Card points are 0-1 across and down the card as the avatar reads it, from its
top-left corner (`HARNESS_PROTOCOL.md` §8.2).

"""
from __future__ import annotations
from typing     import Sequence, TYPE_CHECKING

if TYPE_CHECKING:
    from ..avatar          import AvatarPlan, AvatarSetup
    from  .response_models import Behavior
    from  .scenarios       import Scenario

# Session settings in each condition (with cues, the client's idle glances and listening sway run too)
PLANNING_SETUP_CUES    = {"rest": "Slightly Smiling Face", "auto": {"idle_glances": True,  "thinking_look": False, "speech_gaze": False, "listening_motions": True }}
PLANNING_SETUP_NO_CUES = {"rest": "Slightly Smiling Face", "auto": {"idle_glances": False, "thinking_look": False, "speech_gaze": False, "listening_motions": False}}

# --------------------------------------------------------------------------------
# The Avatar's Card
# --------------------------------------------------------------------------------
PLANNING_CARD_CONSTRAINTS  = (0.50, 0.22)  # The middle of the avatar's constraints, at the top
PLANNING_CARD_LINES_TOP    = 0.56          # The first item's line
PLANNING_CARD_LINES_BOTTOM = 0.86          # The last item's line
PLANNING_CARD_LINE_X       = 0.60          # Where a choice is written along its line
PLANNING_CARD_READ_RADIUS  = 0.35          # How far the eyes wander while reading the card over

# --------------------------------------------------------------------------------
# Plan Timing
# --------------------------------------------------------------------------------
PLANNING_GLANCE_MS            = 700     # A glance at a spot on the card
PLANNING_READ_MS              = 900     # Reading the avatar's constraints before saying one
PLANNING_LOOK_BACK_MS         = 1_500   # Holding the user's gaze after looking away
PLANNING_WRITE_MS             = 900     # Looking at an item's line while "writing" a choice in
PLANNING_REPLY_PLAN_EXPIRE_MS = 45_000  # A reply's plan waits for the end of its audio, which can be long after it arrives

# Raised height of the card while the avatar reads it over (thinking) or reads its constraints
PLANNING_CARD_THINK_RAISE = 0.6
PLANNING_CARD_READ_RAISE  = 1.0

# Where the eyes go while pondering: up and to the viewer's left of the user
PLANNING_PONDER_OFFSET = (-0.45, -0.35)

# What each simple behavior adds to the reply's first moment (Smiley names, `HARNESS_PROTOCOL.md` §9)
PLANNING_BEHAVIOR_ACTIONS: dict[str, dict[str, object]] = {
    "none"       : {},
    "nod"        : {"move": {"name": "Nod", "strength": 0.6}},
    "pleased"    : {"face": {"name": "Smiling Face with Smiling Eyes", "strength": 0.7, "hold_ms": 2_500}},
    "excited"    : {"face": {"name": "Grinning Face with Big Eyes",    "strength": 0.8, "hold_ms": 2_000}, "move": {"name": "Bounce",    "strength": 0.5}},
    "apologetic" : {"face": {"name": "Pensive Face",                   "strength": 0.5, "hold_ms": 2_000}, "move": {"name": "Head Tilt", "strength": 0.4}},
    "surprised"  : {"face": {"name": "Wide-Eyed",                      "strength": 0.7, "hold_ms":   800}},
    "ponder"     : {"face": {"name": "Face with Raised Eyebrow",       "strength": 0.5, "hold_ms": 1_200}},
}

# The nod while "writing" a settled choice in
PLANNING_WRITE_NOD = {"name": "Nod", "strength": 0.3}


# ================================================================================
# Setup and Standing Plans
# ================================================================================
# Session settings for the chat's condition (each one replaces the last)
def setup_for(with_cues: bool) -> AvatarSetup:
    return PLANNING_SETUP_CUES if with_cues else PLANNING_SETUP_NO_CUES

# Pick the card up as the chat starts, and listen
def start_plan() -> AvatarPlan:
    return {"id": "start", "steps": [{"prop": {"hold": "card"}, "state": "listening"}]}

# Raise the card and read it over while a reply is being prepared
def thinking_plan(turn: int) -> AvatarPlan:
    read_over = {"on": "card", "scan": {"around": [0.5, 0.55], "radius": PLANNING_CARD_READ_RADIUS}}
    return {"id": f"t{turn}-think", "turn": turn, "steps": [{"state": "thinking", "prop": {"raise": PLANNING_CARD_THINK_RAISE}, "gaze": read_over}]}

# A quick look at an item's line on the card, the moment the user names it
def glance_plan(scenario: Scenario, item_id: str, count: int) -> AvatarPlan:
    return {"id": f"glance-{item_id}-{count}", "steps": [{"gaze": {"on": "card", "at": item_spot(scenario, item_id), "hold_ms": PLANNING_GLANCE_MS}}]}

# Where an item's choice is written on the avatar's card (its lines run down the card in order)
def item_spot(scenario: Scenario, item_id: str) -> list[float]:
    index = scenario.item_ids.index(item_id)
    count = len(scenario.items)
    share = (index / (count - 1)) if (count > 1) else 0.5
    return [PLANNING_CARD_LINE_X, PLANNING_CARD_LINES_TOP + ((PLANNING_CARD_LINES_BOTTOM - PLANNING_CARD_LINES_TOP) * share)]


# ================================================================================
# Reply Plans
# ================================================================================
# One reply's plan: card down and eyes on the user as it starts, its behavior, then writing in what it settled
def reply_plan(
    scenario : Scenario,       # The scenario (for where each item's line is)
    turn     : int,            # The harness's turn number (in the plan's id, and echoed in feedback)
    behavior : Behavior,       # The behavior the reply picked
    about    : str | None,     # The item it is about (None for none)
    settled  : Sequence[str],  # Items the exchange settled, in order
) -> AvatarPlan:
    # The behavior, then each settled choice written in once the reply has been said
    steps = [*_behavior_steps(scenario, behavior, about), *_writing_steps(scenario, settled, {"start_on": "reply_end"})]
    return {"id": f"t{turn}-reply", "turn": turn, "feedback": "end", "expire_ms": PLANNING_REPLY_PLAN_EXPIRE_MS, "steps": steps}

# Write choices in right away, for items settled after their reply went out (reply_then_track)
def writing_plan(scenario: Scenario, turn: int, settled: Sequence[str]) -> AvatarPlan:
    return {"id": f"t{turn}-write", "turn": turn, "steps": _writing_steps(scenario, settled, {})}

# Look down at each settled item's line and nod as if writing it in, then back at the user (no steps for none)
def _writing_steps(scenario: Scenario, settled: Sequence[str], moment: dict[str, object]) -> list[dict[str, object]]:
    if not settled: return []
    steps = [{"gaze": {"on": "card", "at": item_spot(scenario, item_id), "hold_ms": PLANNING_WRITE_MS}, "move": PLANNING_WRITE_NOD} for item_id in settled]
    steps[0].update(moment)
    return [*steps, {"gaze": {"on": "user", "hold_ms": PLANNING_LOOK_BACK_MS}}]

# The steps a behavior plays from the start of the reply's audio
def _behavior_steps(scenario: Scenario, behavior: Behavior, about: str | None) -> list[dict[str, object]]:
    # Every reply starts the same way: the card comes down, and the avatar listens again once it stops talking
    start   = {"start_on": "reply_audio", "state": "listening"}
    at_user = {"on": "user", "hold_ms": PLANNING_LOOK_BACK_MS}

    # A quick look at the item it is talking about (or the card's lines), then back to the user
    if behavior == "glance_at_card":
        spot = item_spot(scenario, about) if (about is not None) else [0.5, (PLANNING_CARD_LINES_TOP + PLANNING_CARD_LINES_BOTTOM) / 2]
        return [
            {**start, "prop": {"raise": 0}, "gaze": {"on": "user"}, "ms": 400},
            {"gaze": {"on": "card", "at": spot, "hold_ms": PLANNING_GLANCE_MS}},
            {"gaze": at_user},
        ]

    # Raise the card and read its constraints, then lower it and look back at the user
    if behavior == "check_card":
        return [
            {**start, "prop": {"raise": PLANNING_CARD_READ_RAISE}, "gaze": {"on": "card", "at": PLANNING_CARD_CONSTRAINTS, "hold_ms": PLANNING_READ_MS}},
            {"prop": {"raise": 0}, "gaze": at_user},
        ]

    # Look up and away while thinking it over, then back to the user
    if behavior == "ponder":
        return [
            {**start, "prop": {"raise": 0}, "gaze": {"on": "user", "offset": PLANNING_PONDER_OFFSET, "hold_ms": PLANNING_GLANCE_MS}, **PLANNING_BEHAVIOR_ACTIONS["ponder"]},
            {"gaze": at_user},
        ]

    # A face or a movement on top of looking at the user
    return [{**start, "prop": {"raise": 0}, "gaze": at_user, **PLANNING_BEHAVIOR_ACTIONS[behavior]}]
