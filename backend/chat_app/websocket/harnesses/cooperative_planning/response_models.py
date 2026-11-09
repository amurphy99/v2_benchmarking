"""
Planning calls' structured outputs: plan changes, the reply, and its behavior.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.cooperative_planning.response_models`

A call never edits the plan. It proposes changes, each one of a few shapes told
apart by its `op`, and `plan_state.apply_changes` makes the ones the rules allow.
The participant's and the avatar's changes come in separate lists, so code knows
who made each one, and each side's list has only the changes that side can make:
only the participant approves the plan, and only the avatar reveals its own
constraints.

The responses are built once per scenario (`models_for_scenario`), with every
item and constraint limited to that scenario's ids, so the schema the endpoint
decodes against only allows names the plan has.

NOTE: In instructor's JSON_SCHEMA mode the model never sees the field
      descriptions; the schema only constrains its output. The prompts
      (`prompts.py`) describe every field the model fills in.

"""
from __future__  import annotations
from dataclasses import dataclass
from typing      import Annotated, Literal, Union

import functools

from pydantic import BaseModel, ConfigDict, Field, create_model

# How the avatar acts while it says a reply (`behaviors.py` turns each one into an avatar plan)
Behavior = Literal["none", "glance_at_card", "check_card", "nod", "pleased", "excited", "apologetic", "ponder", "surprised"]

# The most changes one side makes in a turn
PLANNING_MAX_CHANGES = 8

# The short texts the responses carry
Choice  = Annotated[str, Field(min_length=1, max_length=80 )]   # A choice for an item, or a preference, in a few words
Reason  = Annotated[str, Field(min_length=1, max_length=200)]   # Why a choice was turned down
Basis   = Annotated[str, Field(min_length=1, max_length=300)]   # One short reason for a call's output (for the logs)
Message = Annotated[str, Field(min_length=1, max_length=300)]   # What the avatar says


# --------------------------------------------------------------------------------
# Plan Changes
# --------------------------------------------------------------------------------
# Every change is fixed once made, trims its text, and refuses fields it doesn't have
class _Change(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, str_strip_whitespace=True)

# An idea for an item
class Suggest(_Change):
    op     : Literal["suggest"]
    item   : str     # Item id (`models_for_scenario` limits it to one scenario's)
    choice : Choice

# Turning an idea down, and why
class Reject(_Change):
    op     : Literal["reject"]
    item   : str
    choice : Choice
    reason : Reason

# Asking to make a choice final ("So, breadsticks for the starter?")
class AskToSettle(_Change):
    op     : Literal["ask_to_settle"]
    item   : str
    choice : Choice

# Saying yes to the other side's request to settle an item
class Accept(_Change):
    op   : Literal["accept"]
    item : str

# Saying no to the other side's request to settle an item, and why
class Decline(_Change):
    op     : Literal["decline"]
    item   : str
    reason : Reason

# Changing one's mind about an item already agreed, and why
class Reopen(_Change):
    op     : Literal["reopen"]
    item   : str
    reason : Reason

# Something the participant needs, wants, or must avoid (one of their constraints, or a preference)
class NotePreference(_Change):
    op   : Literal["note_preference"]
    kind : Literal["want", "avoid"]
    text : Choice

# The participant said yes to the whole plan when the avatar read it back
class ApprovePlan(_Change):
    op : Literal["approve_plan"]

# The avatar mentioned one of its own constraints
class Reveal(_Change):
    op         : Literal["reveal"]
    constraint : str  # Constraint id (`models_for_scenario` limits it to the avatar's own)

# Any one change
Change = Suggest | Reject | AskToSettle | Accept | Decline | Reopen | NotePreference | ApprovePlan | Reveal


# --------------------------------------------------------------------------------
# LLM Responses
# --------------------------------------------------------------------------------
# Every response trims its text and refuses fields it doesn't have
class _Response(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

# track_then_reply's first call: how the participant's latest message changes the plan
class PlanUpdate(_Response):
    basis        : Basis
    user_changes : list[Change]

# reply_then_track's second call: how the whole last exchange changed it
class ExchangeUpdate(_Response):
    basis          : Basis
    user_changes   : list[Change]
    avatar_changes : list[Change]

# track_then_reply's reply: what the avatar's words change, how it acts, and what it says
class SpokenTurn(_Response):
    basis          : Basis
    avatar_changes : list[Change]
    behavior       : Behavior
    about          : str | None   # Item id the behavior is about (null for none)
    message        : Message

# reply_then_track's reply (its changes are worked out once it has been said)
class QuickReply(_Response):
    basis    : Basis
    behavior : Behavior
    about    : str | None
    message  : Message

# single_call's response: both sides' changes and the reply, in one call
class CombinedTurn(_Response):
    basis          : Basis
    user_changes   : list[Change]
    avatar_changes : list[Change]
    behavior       : Behavior
    about          : str | None
    message        : Message


# ================================================================================
# Responses for One Scenario
# ================================================================================
# Every response, with its items and constraints limited to one scenario's ids
@dataclass(frozen=True, slots=True)
class PlanningModels:
    plan_update     : type[PlanUpdate]
    exchange_update : type[ExchangeUpdate]
    spoken_turn     : type[SpokenTurn]
    quick_reply     : type[QuickReply]
    combined_turn   : type[CombinedTurn]

# Build every response for one scenario's item and avatar constraint ids (once per scenario)
@functools.cache
def models_for_scenario(item_ids: tuple[str, ...], constraint_ids: tuple[str, ...]) -> PlanningModels:
    # 1) The changes that name an item or a constraint, limited to this scenario's
    item    = (Literal[item_ids], ...)
    suggest = create_model("Suggest",     __base__=Suggest,     item=item)
    reject  = create_model("Reject",      __base__=Reject,      item=item)
    settle  = create_model("AskToSettle", __base__=AskToSettle, item=item)
    accept  = create_model("Accept",      __base__=Accept,      item=item)
    decline = create_model("Decline",     __base__=Decline,     item=item)
    reopen  = create_model("Reopen",      __base__=Reopen,      item=item)
    reveal  = create_model("Reveal",      __base__=Reveal,      constraint=(Literal[constraint_ids], ...))

    # 2) Each side's changes (only the participant approves the plan; only the avatar reveals its constraints)
    user_change    = Annotated[Union[suggest, reject, settle, accept, decline, reopen, NotePreference, ApprovePlan], Field(discriminator="op")]
    avatar_change  = Annotated[Union[suggest, reject, settle, accept, decline, reveal],                            Field(discriminator="op")]
    user_changes   = (list[user_change],   Field(max_length=PLANNING_MAX_CHANGES))
    avatar_changes = (list[avatar_change], Field(max_length=PLANNING_MAX_CHANGES))
    about          = (Literal[item_ids] | None, ...)

    # 3) The responses
    return PlanningModels(
        plan_update     = create_model("PlanUpdate",     __base__=PlanUpdate,     user_changes=user_changes),
        exchange_update = create_model("ExchangeUpdate", __base__=ExchangeUpdate, user_changes=user_changes, avatar_changes=avatar_changes),
        spoken_turn     = create_model("SpokenTurn",     __base__=SpokenTurn,     avatar_changes=avatar_changes, about=about),
        quick_reply     = create_model("QuickReply",     __base__=QuickReply,     about=about),
        combined_turn   = create_model("CombinedTurn",   __base__=CombinedTurn,   user_changes=user_changes, avatar_changes=avatar_changes, about=about),
    )
