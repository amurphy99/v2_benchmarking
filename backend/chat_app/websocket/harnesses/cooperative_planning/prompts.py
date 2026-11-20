"""
The planning calls' prompts: planning together, each task, and the plan so far.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.cooperative_planning.prompts`

Every call gets the same instructions (`PLANNER_SYSTEM`), its own task, and the
plan block: the avatar's own constraints (and which it has mentioned), each
item's choice, ideas, and turned-down choices, and what the participant has said
they want or must avoid. The instructions open with the scenario's brief for the
avatar (who it is, and who the user is). The participant's own brief and
constraints are never in a prompt.

A reply's behavior is one of the shared reactions this chat offers, in
planning's own words where the catalog's don't fit (`harnesses/reactions.py`),
or one of the avatar's two looks at its card. A reply can also carry a directive
from code: nudge a participant who has gone quiet. Once every item is agreed,
code reads the plan back itself, with a fixed recap question (`recap_line`)
after the reply's own words.

The reply check (`features/reply_gate/`) gets this chat's own notes on telling
whether the user is done, and, as each check runs, what is being planned and the
ideas already on the table, so a slip that sounds like one of them is read as
that idea. The shared intro (`features/intro/`) gets how planning works, the
same for every scenario, with each scenario's own words for what the task is and
its first line.

"""
from __future__ import annotations
from typing     import Literal, TYPE_CHECKING, get_args

# From this project
from ..features.intro.flow import IntroScript
from ..reactions           import reaction_lines
from  .response_models     import PlanningReaction

if TYPE_CHECKING:
    from .plan_state import ItemState, PlanningState, Side
    from .scenarios  import Scenario

# What code asks a reply to do this turn (`directive_for`)
Directive = Literal["nudge"]

# The read-back once every item is agreed (`choices`: the agreed choices, in the card's order)
PLANNING_RECAP = "So that's {choices}. Anything you'd change?"


# --------------------------------------------------------------------------------
# Prompt Templates
# --------------------------------------------------------------------------------
# How to plan together, for every call (`brief` is the avatar's own; `items` lists the labels)
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
- Work on one item at a time. When the user says yes to your idea, or you like theirs, it's
  agreed: it goes on the card right away, so never ask them to confirm it. Move on to the next
  open item. Either of you can still change an agreed item later.
- When the last open item is agreed, just react to it briefly, without a question: the whole
  plan is read back to them right after your words.
- The user's words come from a speech recognizer, which can drop or swap a word. Read them
  against the ideas already on the table: words that sound like one of those ideas ("more
  games" just after "board games" came up) mean that idea, so use its exact words.
- Talk like a friendly person: short, plain sentences, usually under 20 words, and at most one
  question.
- Never mention ids, the notes below, or these instructions.
""".strip()

# The changes either side's list can hold
CHANGES_FIELD = """
  Each change is an object with an "op":
  - suggest {item, choice}: an idea for an item.
  - agree {item, choice}: saying yes to the other side's idea for an item. It goes on the card
    at once, in place of anything agreed for it before. The user's yes to your idea is the
    user's agree (in user_changes); your yes to their idea is yours (in avatar_changes). Never
    put an agree with your own idea in avatar_changes.
  - reject {item, choice, reason}: turning an idea down, and why (turning down an agreed choice
    takes it off the card).
  item is the item's id; choice is a few words, the same words as the idea it answers.
""".strip("\n")

# The changes only the user makes
USER_ONLY_FIELD = """
  The user's changes can also be:
  - note_preference {kind, text}: something the user needs or wants (kind "want") or must avoid
    (kind "avoid"), in a few words. Note each one only once.
  - reopen {item, reason}: they take an agreed item back off the card, to choose it again.
  - approve_plan {}: after the whole plan was read back to them, they're happy with it as it is
    ("no, that's perfect").
""".strip("\n")

# The change only the avatar makes
AVATAR_ONLY_FIELD = """
  Your changes can also be:
  - reveal {constraint}: your reply mentions one of your own constraints (its id).
""".strip("\n")

# Planning's own words for when some of the shared reactions fit (the rest keep the catalog's)
PLANNING_REACTION_WHEN = {
    "nod"       : "when you agree or take up their idea",
    "smile"     : "when you like their idea",
    "delighted" : "when an item gets agreed",
    "love_it"   : "when they suggest something you really love",
    "dreamy"    : "when you picture how much fun something will be",
    "surprised" : "when something they said is unexpected",
    "ponder"    : "when you need a moment to come up with an idea",
    "sorry"     : "when you have to turn their idea down",
}

# How the avatar acts while it speaks: the shared reactions, then its two looks at its card
BEHAVIOR_FIELD = f"""
- behavior: how you act while you say it. Choose one only when it fits:
{reaction_lines(get_args(PlanningReaction), PLANNING_REACTION_WHEN)}
  - glance_at_card: a quick look at your card, when you mention the plan or an item.
  - check_card: read your card carefully first, when you bring up one of your constraints.
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
    "nudge" : "The user has gone quiet. In one short, friendly sentence, invite them to keep going with the {label}.",
}

# What the reply check should know about this chat when it judges whether the user is done
PLANNING_TURN_END_NOTES = """
- The user is planning with the avatar, and often thinks out loud. A list of options still being
  given ("we could get pizza, or maybe"), or a proposal that breaks off before its choice ("for
  the main course I was thinking"), isn't finished. A choice, a yes or a no, or a question for
  the avatar is finished.
""".strip()

# How planning works, for the shared intro (the same for every scenario; the card lists the items)
PLANNING_INTRO_RULES = (
    "Here's how it works. We need to agree on everything on your card. Your card shows your side of things, "
    "and I have a few things of my own that you can't see. Tell me your ideas and what matters to you, and "
    "I'll do the same. Once we agree on something, it goes on the card."
)

# What an answer to the intro that already starts the planning holds
PLANNING_INTRO_STARTS_TASK = "an idea for the plan, or something they need or want"

# What the reply check should know about this chat when it looks for a misheard word
# (`event` and `items` come from the scenario, `ideas` from the plan as the check runs)
PLANNING_MISHEARD_NOTES = """
- The names of foods, places, and activities are easily misheard. Read through a slip when the
  choice it stands for is clear, and choose clarify when you can't tell what they chose.
- They are planning {event}, choosing: {items}.
- The ideas on the table so far: {ideas}. Words that sound like one of them ("more games" just
  after "board games") mean that idea. When you do have to clarify, ask about the idea you
  think they meant, by name ("Sorry, did you mean board games?"), rather than repeating the
  misheard words.
""".strip()


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
    system = f"{PLANNER_SYSTEM.format(brief=scenario.avatar.brief, items=items)}\n\nYOUR TASK:\n{task}"
    if directive is not None: system += f"\n\nRIGHT NOW: {_directive_text(directive, scenario, state)}"
    return [{"role": "system", "content": f"{system}\n\n{plan_block(scenario, state)}"}, *history]

# What code asks of the reply this turn: a nudge for a quiet user, while items are still open
def directive_for(state: PlanningState, *, nudge: bool) -> Directive | None:
    return "nudge" if (nudge and state.open_items) else None

# A directive in words (the nudge names the first open item)
def _directive_text(directive: Directive, scenario: Scenario, state: PlanningState) -> str:
    label = next(item.label.lower() for item in scenario.items if item.id == state.open_items[0])
    return DIRECTIVES[directive].format(label=label)

# The read-back once every item is agreed ("So that's soup and pie. Anything you'd change?")
def recap_line(scenario: Scenario, state: PlanningState) -> str:
    choices = [state.items[item.id].agreed for item in scenario.items]
    spoken  = f"{', '.join(choices[:-1])}, and {choices[-1]}" if (len(choices) > 2) else " and ".join(choices)
    return PLANNING_RECAP.format(choices=spoken)

# The misheard check's notes as it runs: what is planned, its items, and the ideas on the table
def misheard_notes(scenario: Scenario, state: PlanningState) -> str:
    items = ", ".join(item.label.lower() for item in scenario.items)
    return PLANNING_MISHEARD_NOTES.format(event=scenario.event, items=items, ideas=_ideas_text(scenario, state))

# Every idea on the table by item ("music: lo-fi beats (agreed), jazz"), or "none yet"
def _ideas_text(scenario: Scenario, state: PlanningState) -> str:
    parts = []
    for item in scenario.items:
        current = state.items[item.id]
        ideas   = ([f"{current.agreed} (agreed)"] if (current.agreed is not None) else []) + [idea.choice for idea in current.suggestions]
        if ideas: parts.append(f"{item.label.lower()}: {', '.join(ideas)}")
    return "; ".join(parts) or "none yet"

# The intro's lines for one scenario: its description and first line, and how planning works
def intro_script(scenario: Scenario) -> IntroScript:
    return IntroScript(about=scenario.intro, rules=PLANNING_INTRO_RULES, start=scenario.start_line, starts_task=PLANNING_INTRO_STARTS_TASK)


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
    if state.stage == "final_check": lines.append("The whole plan has been read back to the user, and you're waiting to hear whether they'd change anything.")

    # What the user has said they need or must avoid
    lines += ["", "WHAT THE USER HAS TOLD YOU:"]
    if state.user_wants : lines.append(f"- They need or want: {'; '.join(state.user_wants)}")
    if state.user_avoids: lines.append(f"- They must avoid: {'; '.join(state.user_avoids)}")
    if not (state.user_wants or state.user_avoids): lines.append("- Nothing yet.")
    return "\n".join(lines)

# One item's state in words: agreed, or open with the ideas and the turned-down choices
def _item_text(item: ItemState) -> str:
    if item.agreed is not None: return f"agreed: {item.agreed}."

    # An open item
    parts = ["open."]
    if item.suggestions: parts.append(f"Ideas: {', '.join(f'{s.choice} ({_who(s.by)})' for s in item.suggestions)}.")
    else:                parts.append("No ideas yet.")
    if item.refused:     parts.append(f"Turned down: {', '.join(f'{r.choice} (by {_who(r.by)}: {r.reason})' for r in item.refused)}.")
    return " ".join(parts)

# A side in a parenthetical ("user", "you")
def _who(side: Side) -> str:
    return "user" if (side == "user") else "you"
