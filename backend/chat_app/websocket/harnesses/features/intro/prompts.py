"""
The intro's lines every chat type shares, and the prompt for reading an answer.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.features.intro.prompts`

A chat type's own lines (what the task is, how it works, and the task's first
line) come in its `IntroScript`; these fixed lines join them, so every
participant hears the same words. The reading gets the task's description and
rules, where the intro is, and the conversation so far, which holds only the
intro's own exchanges.

"""
from __future__ import annotations
from typing     import TYPE_CHECKING

if TYPE_CHECKING: from .flow import IntroScript, IntroStage

# The fixed lines around a chat type's own
INTRO_HELLO     = "Hi!"
INTRO_QUESTION  = "Have you done one of these before?"
INTRO_READY     = "Ready to start?"
INTRO_BEGIN     = "Great, let's begin!"
INTRO_WAIT      = "No problem. Just tell me when you're ready."
INTRO_SAY_AGAIN = "Sorry, could you say that again?"

# Where the intro is, in the reading's words (the stages that wait for an answer)
INTRO_WHERE = {
    "asked"       : "You have just asked whether they have done one of these before.",
    "ready_check" : "You have told them about the task and asked if they are ready to start.",
}

# The reading's instructions (`about`, `rules`, and `starts_task` come from the chat type's script)
INTRO_SYSTEM = """
You are an avatar about to do a task with a user. Before it starts, you make sure they know
how it works. {where}

THE TASK: {about}

HOW IT WORKS (what you tell someone new to it): {rules}

The user's words come from a speech recognizer, which sometimes gets a word wrong. Decide what
to do with their latest message. Fill in:
- basis: a few words on why.
- knows_task: true if they said they have done one of these before or know how it works, false
  if they said they haven't or don't, null if they didn't say.
- next_step:
  - start: they are ready to begin. They know how it works, or they said they are ready after
    hearing how it works.
  - explain: they haven't done one, aren't sure, ask how it works, or ask to hear it again.
  - answer: they asked a question about the task.
  - wait: they are not ready yet, or asked for a moment.
  - task: their message already starts the task itself ({starts_task}), so the task should
    answer it.
- answer: for answer, one or two short, friendly sentences that answer their question from HOW
  IT WORKS (when it doesn't say, say you aren't sure); otherwise null.
Return only the requested structured object.
""".strip()


# The reading's messages: what the task is, where the intro is, then the conversation so far
def build_intro_messages(script: IntroScript, stage: IntroStage, history: list[dict[str, str]]) -> list[dict[str, str]]:
    system = INTRO_SYSTEM.format(where=INTRO_WHERE[stage], about=script.about, rules=script.rules, starts_task=script.starts_task)
    return [{"role": "system", "content": system}, *history]
