"""
The plan the two sides are building, the rules for changing it, and the card.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.cooperative_planning.plan_state`

The LLM never edits the plan. Its calls propose changes (`response_models.py`),
and `apply_changes` makes only the ones these rules allow:

* A choice goes on the card as soon as one side says yes to the other side's
  idea (`agree`); nothing waits for a confirmation. A side can't agree to its own
  idea, or to one the other side turned down. Agreeing to a new choice for an
  item already agreed replaces it.
* Turning a choice down, or reopening an agreed item, moves that choice to the
  item's turned-down list, with who turned it down and why. A choice suggested
  again comes back off that list.
* The plan can be approved only during the final check (the whole plan has been
  read back); changing or reopening any item ends the final check.

A change the rules don't allow is kept with the reason it was refused, for the
turn's log and the notebook view. Choices match ignoring case and extra spaces.
Every choice either side puts forward is also kept, with the side that did so
first, so the completed-session history can say who suggested what.

The participant's card shows their own brief and constraints, and the agreed
choices. It goes out as a `task_card` frame (`HARNESS_PROTOCOL.md` §13) whenever
a saved reply changes it. Once the chat ends, their client is shown the avatar's
side too: its brief and constraints, marking the ones it mentioned
(`task_reveal`, §14).

"""
from __future__  import annotations
from dataclasses import asdict, dataclass, replace
from typing      import Literal, Sequence, TYPE_CHECKING

if TYPE_CHECKING:
    from ...consumers.consumers import ChatConsumer
    from  ..features.intro.flow import IntroState
    from   .response_models     import Change
    from   .scenarios           import Scenario

# Who proposed a change: the participant, or the avatar
Side = Literal["user", "avatar"]

# Where the planning is: items still open, the avatar's read-back waiting for a yes, or the plan approved
Stage = Literal["planning", "final_check", "approved"]


# --------------------------------------------------------------------------------
# Plan Types
# --------------------------------------------------------------------------------
# A choice one side put forward for an item
@dataclass(frozen=True, slots=True)
class Suggestion:
    choice : str
    by     : Side

# A choice one side turned down, and why
@dataclass(frozen=True, slots=True)
class Refusal:
    choice : str
    by     : Side
    reason : str

# One item: the choice on the card, and the ideas so far
@dataclass(frozen=True, slots=True)
class ItemState:
    agreed      : str | None             = None  # On the card (None while the item is open)
    suggestions : tuple[Suggestion, ...] = ()    # Ideas under discussion
    refused     : tuple[Refusal, ...]    = ()    # Ideas turned down
    put_forward : tuple[Suggestion, ...] = ()    # Every choice either side has put forward, each with the side that did first (never pruned)

# The whole plan, what the avatar knows about the participant so far, and the intro's progress
@dataclass(frozen=True, slots=True)
class PlanningState:
    items       : dict[str, ItemState]             # Each item by id, in the scenario's order (replaced, never changed in place)
    user_wants  : tuple[str, ...]   = ()           # What the participant needs or wants
    user_avoids : tuple[str, ...]   = ()           # What the participant must avoid
    revealed    : tuple[str, ...]   = ()           # The avatar's own constraints it has mentioned, by id
    stage       : Stage             = "planning"
    intro       : IntroState | None = None         # The shared intro, before the planning starts (None for a chat without one)

    # Every item has a choice on the card
    @property
    def all_agreed(self) -> bool:
        return all(item.agreed is not None for item in self.items.values())

    # The items without a choice yet, in order
    @property
    def open_items(self) -> tuple[str, ...]:
        return tuple(item_id for item_id, item in self.items.items() if item.agreed is None)

# One proposed change, who proposed it, and why the rules refused it ("" when it was applied)
@dataclass(frozen=True, slots=True)
class ChangeResult:
    by      : Side
    change  : Change
    refused : str = ""


# The plan every chat starts with: every item open
def initial_state(scenario: Scenario) -> PlanningState:
    return PlanningState(items={item_id: ItemState() for item_id in scenario.item_ids})


# ================================================================================
# Apply Changes
# ================================================================================
# Apply each proposed change in order, refusing the ones the rules don't allow
def apply_changes(state: PlanningState, proposed: Sequence[tuple[Side, Change]]) -> tuple[PlanningState, tuple[ChangeResult, ...]]:
    results : list[ChangeResult] = []
    for by, change in proposed:
        changed, refused = _apply(state, by, change)
        if not refused: state = changed
        results.append(ChangeResult(by=by, change=change, refused=refused))
    return state, tuple(results)

# One change: the plan it leaves, or the plan unchanged and why it was refused
def _apply(state: PlanningState, by: Side, change: Change) -> tuple[PlanningState, str]:
    # --------------------------------------------------------------------------------
    # Changes to the Whole Plan
    # --------------------------------------------------------------------------------
    # Something the participant needs, wants, or must avoid (each noted once)
    if change.op == "note_preference":
        noted = state.user_wants if (change.kind == "want") else state.user_avoids
        if any(_same(text, change.text) for text in noted): return state, "already noted"
        if change.kind == "want": return replace(state, user_wants =(*state.user_wants,  change.text)), ""
        else:                     return replace(state, user_avoids=(*state.user_avoids, change.text)), ""

    # One of the avatar's own constraints, now mentioned
    if change.op == "reveal":
        if change.constraint in state.revealed: return state, "already mentioned"
        return replace(state, revealed=(*state.revealed, change.constraint)), ""

    # The participant's yes to the whole plan, read back during the final check
    if change.op == "approve_plan":
        if state.stage != "final_check": return state, "the whole plan hasn't been read back yet"
        return replace(state, stage="approved"), ""

    # --------------------------------------------------------------------------------
    # Changes to One Item
    # --------------------------------------------------------------------------------
    item = state.items[change.item]

    # An idea (one turned down before comes back off that list)
    if change.op == "suggest":
        if _same(item.agreed, change.choice):                             return state, "already agreed"
        if any(_same(s.choice, change.choice) for s in item.suggestions): return state, "already suggested"
        return _with_item(state, change.item, replace(item,
            suggestions = (*item.suggestions, Suggestion(change.choice, by)),
            refused     = _without_refusal(item.refused, change.choice),
            put_forward = _with_idea(item.put_forward, change.choice, by),
        )), ""

    # Saying yes to the other side's idea: on the card at once (in place of a choice agreed before)
    if change.op == "agree":
        if _same(item.agreed, change.choice):                                                 return state, "already agreed"
        if any(_same(s.choice, change.choice) and (s.by == by) for s in item.suggestions):    return state, "a side can't agree to its own idea"
        if any(_same(r.choice, change.choice) and (r.by != by) for r in item.refused):        return state, "the other side turned it down"
        changed = _with_item(state, change.item, replace(item,
            agreed      = change.choice,
            suggestions = _without_suggestion(item.suggestions, change.choice),
            refused     = _without_refusal(item.refused, change.choice),
            put_forward = _with_idea(item.put_forward, change.choice, _other(by)),  # An idea agreed to came from the other side
        ))
        return (_end_final_check(changed) if (item.agreed is not None) else changed), ""

    # Turning an idea down (one already agreed comes off the card)
    if change.op == "reject":
        agreed_dropped = _same(item.agreed, change.choice)
        changed = _with_item(state, change.item, replace(item,
            agreed      = None if agreed_dropped else item.agreed,
            suggestions = _without_suggestion(item.suggestions, change.choice),
            refused     = (*item.refused, Refusal(change.choice, by, change.reason)),
        ))
        return (_end_final_check(changed) if agreed_dropped else changed), ""

    # Changing one's mind about an agreed item: it's open again, and the final check ends
    if item.agreed is None: return state, "nothing is agreed for it yet"
    return _end_final_check(_with_item(state, change.item, replace(item,
        agreed  = None,
        refused = (*item.refused, Refusal(item.agreed, by, change.reason)),
    ))), ""


# --------------------------------------------------------------------------------
# Change Helpers
# --------------------------------------------------------------------------------
# Two choices are the same one ignoring case and extra spaces (None matches nothing)
def _same(first: str | None, second: str) -> bool:
    return (first is not None) and (" ".join(first.lower().split()) == " ".join(second.lower().split()))

# The plan with one item replaced
def _with_item(state: PlanningState, item_id: str, item: ItemState) -> PlanningState:
    return replace(state, items={**state.items, item_id: item})

# The side that isn't this one
def _other(side: Side) -> Side:
    return "avatar" if (side == "user") else "user"

# The plan out of its final check (an item changed, or is open again)
def _end_final_check(state: PlanningState) -> PlanningState:
    return replace(state, stage="planning") if (state.stage == "final_check") else state

# The ideas without one choice
def _without_suggestion(suggestions: tuple[Suggestion, ...], choice: str) -> tuple[Suggestion, ...]:
    return tuple(s for s in suggestions if not _same(s.choice, choice))

# The turned-down choices without one choice
def _without_refusal(refused: tuple[Refusal, ...], choice: str) -> tuple[Refusal, ...]:
    return tuple(r for r in refused if not _same(r.choice, choice))

# The choices put forward, with one more unless it was put forward before (the side that did first keeps it)
def _with_idea(put_forward: tuple[Suggestion, ...], choice: str, by: Side) -> tuple[Suggestion, ...]:
    return put_forward if any(_same(idea.choice, choice) for idea in put_forward) else (*put_forward, Suggestion(choice, by))

# The side that first put a choice forward (None for a choice turned down before either side suggested it)
def _first_by(put_forward: tuple[Suggestion, ...], choice: str) -> Side | None:
    return next((idea.by for idea in put_forward if _same(idea.choice, choice)), None)


# ================================================================================
# What the Participant Sees
# ================================================================================
# The card as the `task_card` frame carries it: the participant's brief and constraints, then each item's line
def card_frame(scenario: Scenario, state: PlanningState) -> dict[str, object]:
    return {"type": "task_card", "data": {
        "kind"        : "cooperative_planning",
        "title"       : scenario.title,
        "brief"       : scenario.participant.brief,
        "constraints" : [constraint.text for constraint in scenario.participant.constraints],
        "items"       : [_card_line(item.id, item.label, state.items[item.id]) for item in scenario.items],
        "complete"    : state.stage == "approved",
    }}

# One item's line: its label and agreed choice
def _card_line(item_id: str, label: str, item: ItemState) -> dict[str, object]:
    return {"id": item_id, "label": label, "value": item.agreed}

# Send the participant's card to the primary client
async def send_task_card(consumer: ChatConsumer, scenario: Scenario, state: PlanningState) -> None:
    await consumer.send_json(card_frame(scenario, state))

# The avatar's side, shown to the participant once the chat ends: its brief, and each constraint with whether it mentioned it
def planning_reveal(scenario: Scenario, state: PlanningState) -> dict[str, object]:
    return {
        "kind"        : "cooperative_planning",
        "brief"       : scenario.avatar.brief,
        "constraints" : [{"text": constraint.text, "mentioned": constraint.id in state.revealed} for constraint in scenario.avatar.constraints],
    }


# --------------------------------------------------------------------------------
# Completed Task History
# --------------------------------------------------------------------------------
# Preserve both sides' materials and decisions; None means an older unsaved state
def planning_history(scenario: Scenario, state: PlanningState | None) -> dict[str, object]:
    avatar_texts = {constraint.id: constraint.text for constraint in scenario.avatar.constraints}
    return {
        "kind"                    : "cooperative_planning",
        "title"                   : scenario.title,
        "event"                   : scenario.event,
        "participant_brief"       : scenario.participant.brief,
        "avatar_brief"            : scenario.avatar.brief,
        "participant_constraints" : [constraint.text for constraint in scenario.participant.constraints],
        "avatar_constraints"      : [constraint.text for constraint in scenario.avatar.constraints],
        "stage"                   : None if (state is None) else state.stage,
        "items"                   : [{"id": item.id, "label": item.label, "state": None if (state is None) else _item_history(state.items[item.id])} for item in scenario.items],
        "user_wants"              : [] if (state is None) else list(state.user_wants),
        "user_avoids"             : [] if (state is None) else list(state.user_avoids),
        "avatar_mentioned"        : [] if (state is None) else [avatar_texts[constraint_id] for constraint_id in state.revealed],
    }


# JSON-native collections keep the saved snapshot identical to the API view (who first suggested a choice is looked up here)
def _item_history(item: ItemState) -> dict[str, object]:
    return {
        "agreed"       : item.agreed,
        "suggested_by" : None if (item.agreed is None) else _first_by(item.put_forward, item.agreed),
        "suggestions"  : [asdict(idea) for idea in item.suggestions],
        "refused"      : [{**asdict(idea), "suggested_by": _first_by(item.put_forward, idea.choice)} for idea in item.refused],
        "put_forward"  : [asdict(idea) for idea in item.put_forward],
    }
