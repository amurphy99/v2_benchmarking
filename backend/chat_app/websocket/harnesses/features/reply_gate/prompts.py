"""
The reply check's prompt: what each check looks for, and the turn it reads.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.features.reply_gate.prompts`

The prompt is put together from the checks switched on, each followed by any
notes its chat type adds, and it describes every field the response fills in.
The check reads only the last few messages, ending with the user's turn. When
that turn runs to more than one sentence, its last sentence is quoted on its
own, since that is where a thought shows whether it is finished.

"""
from __future__ import annotations
from typing     import Sequence, TYPE_CHECKING

import re

# From this project
from .config import REPLY_CHECK_CONTEXT_MESSAGES

if TYPE_CHECKING: from .gate import GateCheck

# Where one sentence of a punctuated transcript ends
SENTENCE_END = re.compile(r"(?<=[.!?])\s+")


# --------------------------------------------------------------------------------
# Prompt Templates
# --------------------------------------------------------------------------------
# What the check is for (every check shares it)
CHECK_INTRO = """
You are listening in on a spoken conversation between a user and an avatar. Before the avatar
replies to the user's latest message, you decide what it does next. The user's words come from
a speech recognizer, which stops at short pauses, so their latest message may be only part of
what they mean to say. The recognizer also sometimes swaps a word for one that sounds alike.
Return only the requested structured object.
""".strip()

# What each check looks for, by its name (a chat type's notes follow its section)
CHECK_SECTIONS = {
    "turn_end": """
IS THE USER DONE?
- wait: they seem to be partway through a thought and likely to keep talking. Their last
  sentence trails off or breaks off (it ends on "and", "but", "so", "because", "like", "um", or
  a half-finished phrase), or they are partway through a story or a list and haven't reached
  its point yet.
- reply: their thought sounds finished. A short answer to the avatar's question is finished,
  and so is a question for the avatar.
- Judge by how their message ends, above all its last sentence. Earlier sentences in a long
  message don't decide it.
""".strip(),
    "misheard": """
WAS ANYTHING MISHEARD?
- clarify: a word the recognizer likely got wrong hides what they meant, and the conversation
  can't tell you what they meant. For example, the avatar asked "Are you a cat person, a dog
  person, or a plant person?" and the transcript says "I'm a tad person."
- An unexpected or odd answer is not a mishearing. Choose clarify only when the words
  themselves look wrong.
- When the conversation makes the intended words obvious (the transcript says "watching the
  dishes" while they talk about chores), choose reply: the avatar can answer what they meant.
""".strip(),
}

# Which check wins when both apply
CHECK_WAIT_FIRST = "If they are still mid-thought, choose wait over clarify: the rest of what they say often settles what a word was."

# Every field the response fills in, by step (the reply step's fields depend on the misheard check)
FIELDS_INTRO       = "Fill in:\n- basis: a few words on why.\n- verdict: next_step, and that step's fields:"
FIELDS_REPLY       = "  - reply: nothing else."
FIELDS_REPLY_HEARD = "  - reply: likely_said, the words they most likely said when a slip was easy to read through, otherwise null."
FIELDS_WAIT        = "  - wait: a sign of listening while the avatar waits. sound: one that fits what they are saying ({sounds}), or none. gesture: one of {gestures}."
FIELDS_CLARIFY     = "  - clarify: misheard, the words that seem wrong, and message, one short, friendly question that checks them, such as \"Sorry, did you say 'tad person'?\" or \"Sorry, did you mean 'cat person'?\". Never blame them or the recognizer."

# How the user's last sentence is quoted, when their turn has more than one
LAST_SENTENCE = 'THEIR LAST SENTENCE: "{sentence}"'


# ================================================================================
# Build Messages
# ================================================================================
# The check's messages: what to look for and the fields to fill in, then the last few messages
def build_check_messages(
    checks    : Sequence[GateCheck],   # The checks switched on, in the order the chat type lists them
    sounds    : dict[str, str],        # The chat type's sounds: name -> the words the avatar says
    gestures  : tuple[str, ...],       # The gestures the chat type allows, "none" among them
    history   : list[dict[str, str]],  # The conversation, ending with the user's turn
    user_text : str,                   # The user's turn (every utterance staged since the last reply)
) -> list[dict[str, str]]:
    names = {check.NAME for check in checks}

    # 1) What each check looks for, with its chat type's notes
    sections = [CHECK_SECTIONS[check.NAME] + (f"\n{check.notes}" if check.notes else "") for check in checks]
    if {"turn_end", "misheard"} <= names: sections.append(CHECK_WAIT_FIRST)

    # 2) Every field the response fills in
    fields = [FIELDS_INTRO, FIELDS_REPLY_HEARD if ("misheard" in names) else FIELDS_REPLY]
    if "turn_end" in names: fields.append(FIELDS_WAIT.format(sounds=", ".join(f'{name} for "{words}"' for name, words in sounds.items()), gestures=", ".join(gestures)))
    if "misheard" in names: fields.append(FIELDS_CLARIFY)

    # 3) The turn's last sentence on its own, when it has more than one
    sentences = SENTENCE_END.split(user_text.strip())
    last      = [LAST_SENTENCE.format(sentence=sentences[-1])] if (len(sentences) > 1) else []

    system = "\n\n".join([CHECK_INTRO, *sections, "\n".join(fields), *last])
    return [{"role": "system", "content": system}, *history[-REPLY_CHECK_CONTEXT_MESSAGES:]]
