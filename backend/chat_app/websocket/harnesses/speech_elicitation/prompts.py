"""
The speech elicitation reply's prompt: keeping the user talking, and the topic.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.speech_elicitation.prompts`

The one call gets the instructions and its task, whose behaviors are the shared
reactions this chat offers, each with its look and when it fits
(`harnesses/reactions.py`). Every answer the user gives opens a thread, and the
reply digs into it before it goes anywhere new: the topic's fresh angles are
only offered once a thread has had a few follow-ups or has run dry. A reply can
also carry a directive from code, for a turn where the conversation is flagging:
the user has gone quiet, or their answers have been short.

The reply check (`features/reply_gate/`) gets this chat's own notes on telling
whether the user is done.

"""
from __future__ import annotations
from typing     import Literal, TYPE_CHECKING, get_args

# From this project
from ..reactions       import reaction_lines
from  .config          import ELICITATION_DRY_AFTER_SHORT, ELICITATION_MIN_FOLLOW_UPS, ELICITATION_SHORT_ANSWER_WORDS
from  .response_models import Behavior

if TYPE_CHECKING: from .topics import Topic

# What code asks of a reply this turn (`directive_for`)
Directive = Literal["quiet", "short_answer", "thread_dry"]


# --------------------------------------------------------------------------------
# Prompt Templates
# --------------------------------------------------------------------------------
# How to keep the user talking (`opening` is the topic's question)
ELICITATION_SYSTEM = """
You are having a relaxed, friendly conversation with the user. You opened it with this question:
"{opening}"

Your one goal is to keep them talking for as long as they are enjoying it. They do most of the
talking, and you keep it going by getting them to tell you more about what they just said.

How to keep them talking:
- React first, in a few words, to the specific thing they just said, so they know you heard it.
- Then end with exactly one question. Make it open (how, why, what was it like, tell me about),
  about them and their own experience, and easy to answer out loud.
- Go deep before you go wide. Every answer opens a thread: stay with it for several turns. Ask
  for a specific example or a story, the details (who, when, where), how it felt, why it
  matters to them, or what happened next.
- Build each question on a word or a detail from their last answer, so it could only follow
  what they just said.
- A short answer is no reason to change the subject. First ask something easier and more
  concrete about the same thread.
- Change direction only when they say they have nothing more to add, or when you are told
  below that the thread has run dry. Then pick up something they mentioned in passing, or one
  of the fresh angles, when some are listed below.
- Have opinions of your own. Take a side, tease gently, or disagree for fun now and then, so
  there is something to push back on. Never lecture, and never give a list.
- Never ask something they have already answered, and never ask two questions at once.
- Keep it short: one or two plain sentences, under 30 words, written to be spoken aloud.
- If they say they are finished or want to stop, don't push. Thank them warmly, tell them they
  can end the chat whenever they are ready, and ask nothing.
""".strip()

# The call's task and its response's fields (each behavior with its look, and when it fits)
REPLY_TASK = f"""
Reply to the user's latest message. Fill in:
- basis: one short reason for your reply.
- move: what your reply does:
  - follow_up: digs deeper into what they just said (most replies do this).
  - share: gives your own view or a small story on the same thread, then asks for theirs.
  - challenge: playfully takes the other side, on the same thread.
  - new_angle: changes direction. Only once the thread has run dry, or they have nothing more to add.
  - wind_down: they want to stop, so you thank them and ask nothing.
- behavior: how you act while you say it. Choose one only when it fits what they just said:
{reaction_lines(get_args(Behavior), {})}
- message: what you say. Unless move is wind_down, it must end with a question mark.
""".strip()

# What each directive asks of the reply
DIRECTIVES = {
    "quiet"        : "The user has gone quiet. Don't repeat your last question. In one short, friendly sentence, offer something easier to answer or a fresh angle, and end with a question.",
    "short_answer" : "Their last answer was short. Stay on the same thread, but make your question easier and more concrete: ask for one example or one small detail.",
    "thread_dry"   : "Their recent answers have all been short, so this thread has run dry. Move on to something they mentioned in passing, or to one of the fresh angles.",
}

# In place of the fresh angles, until a thread has had its follow-ups
ELICITATION_NO_ANGLES_YET = "NO FRESH ANGLES YET: keep digging into this thread, unless they say they have nothing more to add."

# What the reply check should know about this chat when it judges whether the user is done
ELICITATION_TURN_END_NOTES = """
- The user is answering open questions about their own life and opinions, and often thinks out
  loud. A pause partway through a story or an explanation is not the end of it.
""".strip()


# ================================================================================
# Build Messages
# ================================================================================
# The call's messages: how to keep them talking, the task (and directive), and any fresh angles, then the conversation
def build_messages(
    topic     : Topic,                 # The chat's topic: its opening question and fresh angles
    history   : list[dict[str, str]],  # The conversation so far, ending with the user's turn
    directive : Directive | None,      # What code asks of this reply (None for nothing)
    angles    : bool,                  # Whether the reply is offered the topic's fresh angles
) -> list[dict[str, str]]:
    system = f"{ELICITATION_SYSTEM.format(opening=topic.opening)}\n\nYOUR TASK:\n{REPLY_TASK}"
    if directive is not None: system += f"\n\nRIGHT NOW: {DIRECTIVES[directive]}"
    if angles: system += "\n\nFRESH ANGLES (ask about one when a thread runs dry, each at most once):\n" + "\n".join(f"- {angle}" for angle in topic.angles)
    else:      system += f"\n\n{ELICITATION_NO_ANGLES_YET}"
    return [{"role": "system", "content": system}, *history]

# What code asks of the reply this turn: speak up after a silence, or ease off as answers get short
def directive_for(user_text: str, short_answers: int) -> Directive | None:
    words = len(user_text.split())
    if words == 0:                                         return "quiet"
    if words > ELICITATION_SHORT_ANSWER_WORDS:             return None
    if (short_answers + 1) >= ELICITATION_DRY_AFTER_SHORT: return "thread_dry"
    return "short_answer"

# Whether the reply is offered the fresh angles: once its thread has had its follow-ups, or when the chat is flagging
def offer_angles(follow_ups: int, directive: Directive | None) -> bool:
    return (follow_ups >= ELICITATION_MIN_FOLLOW_UPS) or (directive in ("quiet", "thread_dry"))
