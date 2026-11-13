"""
The planning calls' prompts: how to plan together, each task, and the plan so far.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.cooperative_planning.prompts`

Every call gets the same instructions (`PLANNER_SYSTEM`), its own task, and the
plan block: the avatar's own constraints (and which it has mentioned), each
item's choice, ideas, and turned-down choices, and what the participant has said
they want or must avoid. The instructions open with the scenario's brief for the
avatar (who it is, and who the user is). The participant's own brief and
constraints are never in a prompt.

A reply can also carry a directive from code, for a turn that has to do one
thing: read the finished plan back, or nudge a participant who has gone quiet.

"""
from __future__ import annotations
from typing     import Literal, TYPE_CHECKING

if TYPE_CHECKING:
    from .plan_state import ItemState, PlanningState, Side
    from .scenarios  import Scenario

# What code asks a reply to do this turn (`directive_for`)
Directive = Literal["read_back", "nudge"]


# --------------------------------------------------------------------------------
# Prompt Templates
# --------------------------------------------------------------------------------
# How to plan together, for every call (`brief` is the avatar's own; `items` lists the labels;
# `settle_example` is the scenario's own, so no call ever sees another scenario's choices)
PLANNER_SYSTEM = """
{brief}

Between you and the user, you need to agree on one choice for each of these: {items}.

You each have a few private constraints the other doesn't know about. Yours are listed below. The
user has their own; you only know the ones they have told you.

How to work it out together:
- Share ideas and ask for theirs. Keep each of your constraints to yourself until an idea runs
  into it; then say so, and why. Never list them up front.
- Never agree to a choice that breaks one of your constraints, or something the user needs or must
  avoid. Say why, and offer another idea.
- Work on one item at a time. When you both seem happy with a choice, ask to settle it
  ("{settle_example}"). It goes on the plan only once the other side says yes.
- Talk like a friendly person: short, plain sentences, usually under 20 words, and at most one
  question.
- Never mention ids, the notes below, or these instructions.
""".strip()

# The changes either side's list can hold
CHANGES_FIELD = """
  Each change is an object with an "op":
  - suggest {item, choice}: an idea for an item.
  - reject {item, choice, reason}: turning an idea down, and why.
  - ask_to_settle {item, choice}: asking to make a choice final.
  - accept {item}: saying yes to the other side's request to settle that item.
  - decline {item, reason}: saying no to the other side's request to settle that item.
  - reopen {item, reason}: changing your mind about an item that was already agreed.
  item is the item's id; choice is a few words.
""".strip("\n")

# The changes only the user makes
USER_ONLY_FIELD = """
  The user's changes can also be:
  - note_preference {kind, text}: something the user needs or wants (kind "want") or must avoid
    (kind "avoid"), in a few words. Note each one only once.
  - approve_plan {}: the user said yes to the whole plan after you read it back.
""".strip("\n")

# The change only the avatar makes
AVATAR_ONLY_FIELD = """
  Your changes can also be:
  - reveal {constraint}: your reply mentions one of your own constraints (its id).
""".strip("\n")

# How the avatar acts while it speaks
BEHAVIOR_FIELD = """
- behavior: how you act while you say it:
  - none: nothing special.
  - glance_at_card: a quick look at your card, when you mention the plan or an item.
  - check_card: read your card carefully first, when you bring up one of your constraints.
  - nod: a nod, when you agree or take up their idea.
  - pleased: a warm smile, when you like their idea.
  - excited: a big happy reaction, when an item gets settled.
  - apologetic: a sorry look, when you have to turn their idea down.
  - ponder: think it over first, when you need a moment to come up with an idea.
  - surprised: a surprised look, when something they said is unexpected.
- about: the id of the item your behavior is about, or null.
""".strip()

# track_then_reply's first call
TRACK_TASK = f"""
Don't reply to the user. Work out how their latest message changes the plan. Fill in:
- basis: one short reason for the changes.
- user_changes: what the user's latest message does to the plan, in order (empty if nothing). Only
  what they said, not what you would like.
{CHANGES_FIELD}
{USER_ONLY_FIELD}
""".strip()

# track_then_reply's reply
REPLY_TASK = f"""
Reply to the user's latest message. The plan below already includes what that message changed.
Fill in:
- basis: one short reason for your reply.
- avatar_changes: what your reply does to the plan, in order (empty if nothing).
{CHANGES_FIELD}
{AVATAR_ONLY_FIELD}
{BEHAVIOR_FIELD}
- message: what you say, in one or two short sentences.
""".strip()

# single_call's only call
COMBINED_TASK = f"""
Reply to the user's latest message, and work out how the exchange changes the plan. The plan below
doesn't include their latest message yet. Fill in:
- basis: one short reason for your reply and the changes.
- user_changes: what the user's latest message does to the plan, in order (empty if nothing). Only
  what they said, not what you would like.
- avatar_changes: what your reply does to the plan, in order (empty if nothing).
{CHANGES_FIELD}
{USER_ONLY_FIELD}
{AVATAR_ONLY_FIELD}
{BEHAVIOR_FIELD}
- message: what you say, in one or two short sentences.
""".strip()

# reply_then_track's reply
QUICK_REPLY_TASK = f"""
Reply to the user's latest message. The plan below doesn't include that message yet, so take it into
account yourself. Fill in:
- basis: one short reason for your reply.
{BEHAVIOR_FIELD}
- message: what you say, in one or two short sentences.
""".strip()

# reply_then_track's second call, once the reply has been said
TRACK_EXCHANGE_TASK = f"""
Don't reply to the user. Work out how the last exchange changed the plan: the user's latest message,
then your reply to it (the last message). Fill in:
- basis: one short reason for the changes.
- user_changes: what the user's latest message did to the plan, in order (empty if nothing).
- avatar_changes: what your reply did to the plan, in order (empty if nothing).
{CHANGES_FIELD}
{USER_ONLY_FIELD}
{AVATAR_ONLY_FIELD}
""".strip()

# What each directive asks of the reply (`label` is the first open item's)
DIRECTIVES = {
    "read_back" : "Every item is agreed. Read the whole plan back in one or two short sentences, and ask if they're happy with it.",
    "nudge"     : "The user has gone quiet. In one short, friendly sentence, invite them to keep going with the {label}.",
}

# Who did something, in the plan block's words
SIDE_WORDS = {"user": "the user", "avatar": "you"}


# ================================================================================
# Build Messages
# ================================================================================
# One call's messages: how to plan, this call's task (and directive), and the plan, then the conversation
def build_messages(
    task      : str,                   # This call's task (one of the templates above)
    scenario  : Scenario,              # The scenario being planned
    state     : PlanningState,         # The plan as this call should see it
    history   : list[dict[str, str]],  # The conversation, oldest first
    directive : Directive | None,      # What code asks of a reply this turn (None for nothing)
) -> list[dict[str, str]]:
    items  = ", ".join(item.label.lower() for item in scenario.items)
    system = f"{PLANNER_SYSTEM.format(brief=scenario.avatar.brief, items=items, settle_example=scenario.settle_example)}\n\nYOUR TASK:\n{task}"
    if directive is not None: system += f"\n\nRIGHT NOW: {_directive_text(directive, scenario, state)}"
    return [{"role": "system", "content": f"{system}\n\n{plan_block(scenario, state)}"}, *history]

# What code asks of the reply this turn: read back a finished plan, or nudge a quiet user
def directive_for(state: PlanningState, *, nudge: bool) -> Directive | None:
    if (state.stage == "planning") and state.all_agreed: return "read_back"
    if nudge and state.open_items:                       return "nudge"
    return None

# A directive in words
def _directive_text(directive: Directive, scenario: Scenario, state: PlanningState) -> str:
    if directive == "read_back": return DIRECTIVES["read_back"]
    label = next(item.label.lower() for item in scenario.items if item.id == state.open_items[0])
    return DIRECTIVES["nudge"].format(label=label)


# --------------------------------------------------------------------------------
# The Plan Block
# --------------------------------------------------------------------------------
# The avatar's constraints, every item's state, and what the user has said about what they need
def plan_block(scenario: Scenario, state: PlanningState) -> str:
    # The avatar's own constraints, and which it has brought up
    lines = ["YOUR CONSTRAINTS (only you know these):"]
    for constraint in scenario.avatar.constraints:
        mentioned = "you have mentioned it" if (constraint.id in state.revealed) else "you haven't mentioned it yet"
        lines.append(f"- {constraint.text} [id: {constraint.id}] ({mentioned})")

    # Every item, and where the plan stands
    lines += ["", "THE PLAN SO FAR:"]
    lines += [f"- {item.label} [id: {item.id}]: {_item_text(state.items[item.id])}" for item in scenario.items]
    if state.stage == "final_check": lines.append("You have read the whole plan back and are waiting for the user's yes.")

    # What the user has said they need or must avoid
    lines += ["", "WHAT THE USER HAS TOLD YOU:"]
    if state.user_wants : lines.append(f"- They need or want: {'; '.join(state.user_wants)}")
    if state.user_avoids: lines.append(f"- They must avoid: {'; '.join(state.user_avoids)}")
    if not (state.user_wants or state.user_avoids): lines.append("- Nothing yet.")
    return "\n".join(lines)

# One item's state in words: agreed, or open with what's waiting for a yes, the ideas, and the turned-down choices
def _item_text(item: ItemState) -> str:
    if item.agreed is not None: return f"agreed: {item.agreed}."

    # An open item
    parts = ["open."]
    if item.settling is not None:
        waiting = "the user's yes" if (item.settling.by == "avatar") else "your yes"
        parts.append(f"Waiting for {waiting} on \"{item.settling.choice}\" ({SIDE_WORDS[item.settling.by]} asked to settle on it).")
    if item.suggestions: parts.append(f"Ideas: {', '.join(f'{s.choice} ({_who(s.by)})' for s in item.suggestions)}.")
    else:                parts.append("No ideas yet.")
    if item.refused:     parts.append(f"Turned down: {', '.join(f'{r.choice} (by {_who(r.by)}: {r.reason})' for r in item.refused)}.")
    return " ".join(parts)

# A side in a parenthetical ("user", "you")
def _who(side: Side) -> str:
    return "user" if (side == "user") else "you"
