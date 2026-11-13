"""
The speech elicitation reply's prompt: how to keep the user talking, and the topic.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.speech_elicitation.prompts`

The one call gets the instructions, its task, and the topic's fresh angles. A
reply can also carry a directive from code, for a turn where the conversation
is flagging: the user has gone quiet, or their last answer was only a few words.

"""
from __future__ import annotations
from typing     import Literal, TYPE_CHECKING

# From this project
from .config import ELICITATION_SHORT_ANSWER_WORDS

if TYPE_CHECKING: from .topics import Topic

# What code asks of a reply this turn (`directive_for`)
Directive = Literal["quiet", "short_answer"]


# --------------------------------------------------------------------------------
# Prompt Templates
# --------------------------------------------------------------------------------
# How to keep the user talking (`opening` is the topic's question)
ELICITATION_SYSTEM = """
You are having a relaxed, friendly conversation with the user. You opened it with this question:
"{opening}"

Your one goal is to keep them talking for as long as they are enjoying it. They do most of the
talking, and you keep it going.

How to keep them talking:
- React first, in a few words, to the specific thing they just said, so they know you heard it.
- Then end with exactly one question. Make it open (how, why, what was it like, tell me about),
  about them and their own experience, and easy to answer out loud.
- Have opinions of your own. Take a side, tease gently, or disagree for fun now and then, so
  there is something to push back on. Never lecture, and never give a list.
- Stay with a thread while they have more to say about it. When their answers get short or they
  start repeating themselves, move on: to one of the fresh angles below, or to something they
  mentioned in passing and never got to finish.
- Never ask something they have already answered, and never ask two questions at once.
- Keep it short: one or two plain sentences, under 30 words, written to be spoken aloud.
- If they say they are finished or want to stop, don't push. Thank them warmly, tell them they
  can end the chat whenever they are ready, and ask nothing.
""".strip()

# The call's task, and every field its response fills in
REPLY_TASK = """
Reply to the user's latest message. Fill in:
- basis: one short reason for your reply.
- move: what your reply does:
  - follow_up: digs into what they just said.
  - share: gives your own view or a small story, then asks for theirs.
  - challenge: playfully takes the other side.
  - new_angle: moves the conversation somewhere new.
  - wind_down: they want to stop, so you thank them and ask nothing.
- behavior: how you act while you say it:
  - none: nothing special.
  - nod: a nod, when you agree.
  - smile: a warm smile, when you like what they said.
  - laugh: a big grin, when it was funny.
  - surprised: a surprised look, when you didn't expect it.
  - curious: a tilt of the head, when you want to hear more.
  - thoughtful: a slow nod, when they made a serious point.
  - sympathetic: a soft look, when it was sad or hard for them.
- message: what you say. Unless move is wind_down, it must end with a question mark.
""".strip()

# What each directive asks of the reply
DIRECTIVES = {
    "quiet"        : "The user has gone quiet. Don't repeat your last question. In one short, friendly sentence, offer something easier to answer or a fresh angle, and end with a question.",
    "short_answer" : "Their last answer was only a few words, so this thread may be running dry. Don't press the same point: ask something easier and more concrete, or bring in a fresh angle.",
}


# ================================================================================
# Build Messages
# ================================================================================
# The call's messages: how to keep them talking, the task (and directive), and the angles, then the conversation
def build_messages(topic: Topic, history: list[dict[str, str]], directive: Directive | None) -> list[dict[str, str]]:
    angles = "\n".join(f"- {angle}" for angle in topic.angles)
    system = f"{ELICITATION_SYSTEM.format(opening=topic.opening)}\n\nYOUR TASK:\n{REPLY_TASK}"
    if directive is not None: system += f"\n\nRIGHT NOW: {DIRECTIVES[directive]}"
    return [{"role": "system", "content": f"{system}\n\nFRESH ANGLES (ask about one when a thread runs dry, each at most once):\n{angles}"}, *history]

# What code asks of the reply this turn: speak up after a silence, or ease off after a very short answer
def directive_for(user_text: str) -> Directive | None:
    words = len(user_text.split())
    if words == 0:                              return "quiet"
    if words <= ELICITATION_SHORT_ANSWER_WORDS: return "short_answer"
    return None
