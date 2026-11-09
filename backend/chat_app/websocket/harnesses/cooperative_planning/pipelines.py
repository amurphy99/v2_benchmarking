"""
Interchangeable ways to answer a planning turn, and the table that names them.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.cooperative_planning.pipelines`

Every pipeline takes the same inputs (the client and the turn) and returns a
`PlanningReply`: what the avatar says and how it acts, and every change the
exchange proposes, in order (the user's, then the avatar's). They differ in how
many calls run before the avatar speaks:

* `track_then_reply`: one call works out how the user's message changes the plan,
  then a second writes the reply from the updated plan. Two calls before the reply.
* `single_call`: one call does both, from the plan as it was before the user's
  message. One call, doing more work.
* `reply_then_track`: one call replies from the plan as it was, and a second
  works out the whole exchange's changes once the reply has gone out
  (`follow_up`). One short call before the reply, but the plan the reply sees
  doesn't include the user's latest message.

`config.PLANNING_PIPELINE` picks the one the harness uses.

"""
from __future__  import annotations
from dataclasses import dataclass
from typing      import Awaitable, Callable, TYPE_CHECKING

# From this project
from .plan_state import apply_changes
from .prompts    import directive_for

if TYPE_CHECKING:
    from .plan_state      import PlanningState, Side
    from .planning_api    import PlanningAPI
    from .prompts         import Directive
    from .response_models import Behavior, Change, PlanningModels
    from .scenarios       import Scenario

# Proposed changes and who proposed each, in the order they apply
ProposedChanges = tuple[tuple["Side", "Change"], ...]


# --------------------------------------------------------------------------------
# Pipeline Types
# --------------------------------------------------------------------------------
# Everything a pipeline knows about one turn
@dataclass(frozen=True, slots=True)
class PlanningTurn:
    scenario : Scenario              # The scenario being planned
    models   : PlanningModels        # Its responses (`models_for_scenario`)
    state    : PlanningState         # The plan before this turn
    history  : list[dict[str, str]]  # The conversation, ending with the user's latest message
    nudge    : bool                  # A turn of the avatar's own, with nothing new from the user

# What every pipeline returns: the words and the behavior, and the changes the exchange proposes
@dataclass(frozen=True, slots=True)
class PlanningReply:
    message   : str                                                     # What the avatar says
    behavior  : Behavior                                                # How it acts while saying it
    about     : str | None                                              # The item the behavior is about
    changes   : ProposedChanges                                         # The exchange's changes worked out so far
    directive : Directive | None                                        # What code asked of the reply (a read-back starts the final check)
    basis     : str                                                     # Why (for the turn's log)
    follow_up : Callable[[], Awaitable[ProposedChanges]] | None = None  # More changes to work out once the reply has gone out

# One way of answering a turn
Pipeline = Callable[["PlanningAPI", PlanningTurn], Awaitable[PlanningReply]]


# ================================================================================
# Pipelines
# ================================================================================
# Work out how the user's message changes the plan, then reply from the plan it leaves
async def track_then_reply(api: PlanningAPI, turn: PlanningTurn) -> PlanningReply:
    # A nudge has nothing new from the user to work out
    user_changes : ProposedChanges = ()
    basis = ""
    if not turn.nudge:
        update       = await api.track(turn)
        user_changes = tuple(("user", change) for change in update.user_changes)
        basis        = update.basis

    # An approved plan ends the chat with the scenario's closing line, so it needs no reply call
    tracked, _ = apply_changes(turn.state, user_changes)
    if tracked.stage == "approved": return PlanningReply(message=turn.scenario.closing_line, behavior="excited", about=None, changes=user_changes, directive=None, basis=basis)

    # Reply from the updated plan
    directive = directive_for(tracked, nudge=turn.nudge)
    spoken    = await api.reply(turn, tracked, directive)
    return PlanningReply(
        message   = spoken.message,
        behavior  = spoken.behavior,
        about     = spoken.about,
        changes   = (*user_changes, *(("avatar", change) for change in spoken.avatar_changes)),
        directive = directive,
        basis     = " / ".join(part for part in (basis, spoken.basis) if part),
    )

# Reply and work out both sides' changes in one call
async def single_call(api: PlanningAPI, turn: PlanningTurn) -> PlanningReply:
    directive = directive_for(turn.state, nudge=turn.nudge)
    combined  = await api.combined(turn, directive)
    return PlanningReply(
        message   = combined.message,
        behavior  = combined.behavior,
        about     = combined.about,
        changes   = (*(("user", change) for change in combined.user_changes), *(("avatar", change) for change in combined.avatar_changes)),
        directive = directive,
        basis     = combined.basis,
    )

# Reply from the plan as it was, then work out the exchange's changes once the reply has gone out
async def reply_then_track(api: PlanningAPI, turn: PlanningTurn) -> PlanningReply:
    directive = directive_for(turn.state, nudge=turn.nudge)
    quick     = await api.quick_reply(turn, directive)

    # Run by the harness once the reply is saved (a nudge brings nothing new from the user)
    async def follow_up() -> ProposedChanges:
        update = await api.track_exchange(turn, quick.message)
        return (*(("user", change) for change in update.user_changes), *(("avatar", change) for change in update.avatar_changes))

    return PlanningReply(
        message   = quick.message,
        behavior  = quick.behavior,
        about     = quick.about,
        changes   = (),
        directive = directive,
        basis     = quick.basis,
        follow_up = None if turn.nudge else follow_up,
    )


# Every pipeline, by the name `config.PLANNING_PIPELINE` uses
PIPELINES: dict[str, Pipeline] = {
    "track_then_reply" : track_then_reply,
    "single_call"      : single_call,
    "reply_then_track" : reply_then_track,
}
