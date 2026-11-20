"""
Shared reactions: named looks a reply can show, and when each one fits.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.reactions`

A reaction is a face, a movement, or an animation from the Smiley's catalog
(`consumers/HARNESS_PROTOCOL.md` §9), played as a reply's audio starts. Each
chat type that drives the avatar with plans offers its reply call a menu of
these, hand-picked for its task (in its `response_models.py`), and can word
when one fits its own way where the line here doesn't suit it. Every menu
starts with `none`, and the prompt asks for a reaction only when one fits, so a
plain reply shows none.

The reply's plan puts the reaction on the chat type's opening step, beside its
look at the user. Ponder moves the eyes itself, so its step lets go of that
look, and the eyes come back to the user once it is done. An animation can't
share a step with a face or a movement, so one goes only on an opening step
that has neither.

Hands fade while the avatar holds its map or card, so the reactions with a hand
(giggle, gasp, and Ponder's hand on the chin) show it only in a chat where the
avatar holds nothing.

"""
from __future__  import annotations
from dataclasses import dataclass
from typing      import Literal, Mapping, Sequence

# Every shared reaction's name (each chat type's menu is a subset)
ReactionName = Literal[
    "none", "nod", "thoughtful", "curious", "ponder", "recall", "smile", "laugh", "giggle", "delighted",
    "dreamy", "touched", "love_it", "surprised", "amazed", "gasp", "sympathetic", "sorry", "grimace", "disagree",
]


# One reaction: how a prompt describes it, and what it adds to the reply's opening step
@dataclass(frozen=True, slots=True)
class Reaction:
    look       : str                        # What it looks like, in the prompt ("a warm smile")
    when       : str                        # When it fits, in the prompt (a chat type can word it its own way)
    actions    : dict[str, object]          # What it adds to the opening step (the Smiley's names, §9)
    looks_away : bool              = False  # It moves the eyes itself, so its step lets go of the look at the user


# ================================================================================
# Reactions
# ================================================================================
# Every shared reaction, by name
REACTIONS: dict[ReactionName, Reaction] = {
    # Calm, agreeing, and thinking
    "none"       : Reaction("nothing special",                 "when nothing else clearly fits",           {}),
    "nod"        : Reaction("a nod",                           "when you agree",                           {"move": {"name": "Nod", "strength": 0.6}}),
    "thoughtful" : Reaction("a slow nod",                      "when they make a serious point",           {"face": {"name": "Neutral Face",             "strength": 0.6, "hold_ms": 1_500}, "move": {"name": "Nod",       "strength": 0.3, "speed": 0.6}}),
    "curious"    : Reaction("a tilt of the head",              "when you want to hear more",               {"face": {"name": "Face with Raised Eyebrow", "strength": 0.4, "hold_ms": 1_200}, "move": {"name": "Head Tilt", "strength": 0.4}}),
    "ponder"     : Reaction("your hand on your chin, eyes up", "when you think over something they asked", {"animation": {"name": "Ponder", "strength": 0.8, "hold_ms": 1_500}}, looks_away=True),
    "recall"     : Reaction("a glance up and away",            "when you remember something",              {"animation": {"name": "Glance Up Right"}}),

    # Happy
    "smile"     : Reaction("a warm smile",                    "when you like what they said",                      {"face": {"name": "Smiling Face with Smiling Eyes",  "strength": 0.7, "hold_ms": 2_500}}),
    "laugh"     : Reaction("a big grin and a bounce",         "when something is funny",                           {"face": {"name": "Grinning Face with Smiling Eyes", "strength": 0.8, "hold_ms": 2_000}, "move": {"name": "Bounce", "strength": 0.4}}),
    "giggle"    : Reaction("a giggle behind your hand",       "when something is cheeky or a little embarrassing", {"face": {"name": "Face with Hand Over Mouth",       "strength": 0.8, "hold_ms": 1_500}}),
    "delighted" : Reaction("a big, happy bounce",             "when something great happens",                      {"face": {"name": "Grinning Face with Big Eyes",     "strength": 0.8, "hold_ms": 2_000}, "move": {"name": "Bounce", "strength": 0.5}}),
    "dreamy"    : Reaction("a happy sway",                    "when you picture something lovely",                 {"face": {"name": "Smiling Face with Smiling Eyes",  "strength": 0.6, "hold_ms": 2_000}, "move": {"name": "Sway",   "strength": 0.5}}),
    "touched"   : Reaction("a soft smile with little hearts", "when they share something sweet or touching",       {"face": {"name": "Smiling Face with Hearts",        "strength": 0.8, "hold_ms": 2_500}}),
    "love_it"   : Reaction("heart eyes",                      "when they mention something you love",              {"face": {"name": "Smiling Face with Heart-Eyes",    "strength": 0.8, "hold_ms": 2_000}}),

    # Surprised
    "surprised" : Reaction("a surprised look",        "when you didn't expect it",           {"face": {"name": "Wide-Eyed",                               "strength": 0.7, "hold_ms":   800}}),
    "amazed"    : Reaction("a jaw drop",              "when something is really impressive", {"face": {"name": "Astonished Face",                         "strength": 0.7, "hold_ms": 1_200}}),
    "gasp"      : Reaction("a gasp behind your hand", "when something is shocking",          {"face": {"name": "Face with Open Eyes and Hand Over Mouth", "strength": 0.8, "hold_ms": 1_200}}),

    # Sorry, uneasy, and disagreeing
    "sympathetic" : Reaction("a soft, sad look",   "when something was sad or hard for them",  {"face": {"name": "Pensive Face",   "strength": 0.5, "hold_ms": 2_000}, "move": {"name": "Head Tilt", "strength": 0.3}}),
    "sorry"       : Reaction("a sorry look",       "when you have to say no or let them down", {"face": {"name": "Pensive Face",   "strength": 0.5, "hold_ms": 2_000}, "move": {"name": "Head Tilt", "strength": 0.4}}),
    "grimace"     : Reaction("a grimace",          "when something sounds awkward or painful", {"face": {"name": "Grimacing Face", "strength": 0.6, "hold_ms": 1_200}}),
    "disagree"    : Reaction("a small head shake", "when you disagree",                        {"move": {"name": "Shake No", "strength": 0.4}}),
}


# --------------------------------------------------------------------------------
# Prompt Lines and Plan Steps
# --------------------------------------------------------------------------------
# One prompt line per reaction on a chat type's menu, in order (`when`: its own words for some)
def reaction_lines(names: Sequence[ReactionName], when: Mapping[ReactionName, str]) -> str:
    lines = [f"  - {name}: {REACTIONS[name].look}, {when[name] if (name in when) else REACTIONS[name].when}." for name in names]
    return "\n".join(lines)

# A reply's opening steps: the reaction on the chat type's opening step, beside its look at the user
# (a reaction that moves the eyes itself lets go of that look, and the look comes back after it)
def reaction_steps(name: ReactionName, opening: dict[str, object], look: dict[str, object]) -> list[dict[str, object]]:
    reaction = REACTIONS[name]
    if reaction.looks_away: return [{**opening, "gaze": "release", **reaction.actions}, {"gaze": look}]
    return [{**opening, "gaze": look, **reaction.actions}]
