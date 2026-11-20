"""
The intro: what the task is, its rules for anyone new to it, and then the task.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.features.intro.flow`

A chat type with an intro opens with it. The avatar says hello and what the task
is, in the chat type's own words, and asks whether the user has done one before.
One LLM call reads each answer (`intro_api.py`) and picks what comes next:

* `start`: the user knows how it works, or is ready after hearing it. The avatar
  says "Great, let's begin!" and the task's own first line.
* `explain`: they haven't done one, or ask how it works. The avatar tells them
  how it works and asks if they're ready.
* `answer`: they asked a question about the task. The avatar answers it from the
  rules and asks if they're ready.
* `wait`: they aren't ready yet. The avatar tells them to take their time.
* `task`: their answer already starts the task (a direction, an idea for the
  plan). The task answers it, and the intro is over.

Every line but an answer is fixed, so every participant hears the same words. A
harness turn while the intro waits (a nudge after a silence) asks its question
again. A reading that fails asks the user to say that again, and the intro stays
where it was (a specified fallback, logged once).

The intro's state lives in the chat type's own state (its `intro` field), so it
moves on only once a reply's exchange is saved, like everything else a reply
proposes. Whether the user had done one before, whether they heard how it works,
and how many questions they asked go into the task history (`intro_record`).

"""
from __future__  import annotations
from dataclasses import dataclass, replace
from typing      import Literal, TYPE_CHECKING

import logging, time
logger = logging.getLogger(__name__)

# From this project
from .....services.llm.chat_utilities import prepare_LLM_messages
from .....services.logging_utils      import RESET, BOLD, UNBOLD, LLM_MAIN
from   ..config                       import FEATURE_INTRO_CONDITIONS
from    .intro_api                    import IntroAPIError, get_intro_api
from    .prompts                      import INTRO_BEGIN, INTRO_HELLO, INTRO_QUESTION, INTRO_READY, INTRO_SAY_AGAIN, INTRO_WAIT, build_intro_messages

if TYPE_CHECKING:
    from ...base     import ChatHarness, TurnAttempt
    from  .intro_api import IntroReading

# Where the intro is: nothing said yet, asked if they've done one, asked if they're ready, or over
IntroStage = Literal["opening", "asked", "ready_check", "done"]

# What one intro turn does (the chat type picks how the avatar acts; a `task` turn says nothing)
IntroMove = Literal["opening", "ask_again", "explain", "answer", "wait", "start", "say_again", "task"]


# --------------------------------------------------------------------------------
# Intro Types
# --------------------------------------------------------------------------------
# A chat type's own lines for the intro
@dataclass(frozen=True, slots=True)
class IntroScript:
    about       : str  # What the task is, in plain words ("Today we're going to plan a dinner party together.")
    rules       : str  # How it works, for someone new to it
    start       : str  # The task's own first line, once they're ready
    starts_task : str  # What an answer that already starts the task holds (for the reading)

# Where the intro is, and what it learned (it lives in the chat type's state, as `intro`)
@dataclass(frozen=True, slots=True)
class IntroState:
    stage     : IntroStage  = "opening"  # Where the intro is
    knew_task : bool | None = None       # Whether they said they had done one before (None until they say)
    explained : bool        = False      # They heard how it works
    questions : int         = 0          # Their questions about the task that the avatar answered

    # The task hasn't started yet
    @property
    def running(self) -> bool:
        return self.stage != "done"

# One intro turn: the state it leaves, what the avatar says (None: the task answers), and its move
@dataclass(frozen=True, slots=True)
class IntroTurn:
    state   : IntroState  # The intro once this reply is saved
    message : str | None  # What the avatar says (None: the task answers this turn)
    move    : IntroMove   # What the reply does (the chat type picks how the avatar acts)


# ================================================================================
# Intro
# ================================================================================
# The shared intro a chat type opts into with its own lines
class Intro:
    NAME = "intro"

    # Switch it on where its condition says (`features/config.py`), with the chat type's lines
    def __init__(self, harness: ChatHarness, script: IntroScript) -> None:
        self.on     = (harness.condition in FEATURE_INTRO_CONDITIONS)
        self.script = script

    # Where a chat starts: before the intro's opening (None runs no intro)
    def initial_state(self) -> IntroState | None:
        return IntroState() if self.on else None

    # --------------------------------------------------------------------------------
    # Take One Turn
    # --------------------------------------------------------------------------------
    # The intro's reply to one turn, and where it leaves the intro (newer speech may cancel it)
    async def take_turn(self, attempt: TurnAttempt, state: IntroState) -> IntroTurn:
        # 1) The chat's first words, and a quiet user's question asked again (a nudge brings no words)
        if state.stage == "opening": return IntroTurn(replace(state, stage="asked"), f"{INTRO_HELLO} {self.script.about} {INTRO_QUESTION}", "opening")
        if not attempt.user_text:    return IntroTurn(state, INTRO_QUESTION if (state.stage == "asked") else INTRO_READY, "ask_again")

        # 2) Read their answer (a failed reading asks them to say it again, and the intro stays put)
        started  = time.monotonic()
        messages = build_intro_messages(self.script, state.stage, prepare_LLM_messages(attempt.context))
        try: reading = await get_intro_api().read(messages)
        except IntroAPIError:
            logger.exception(f"{LLM_MAIN}[Intro] The reading failed; asking the user to say that again.{RESET}")
            return IntroTurn(state, INTRO_SAY_AGAIN, "say_again")
        _log_reading(reading, time.monotonic() - started)

        # 3) Reply with the step's fixed lines (what they first say about having done one is kept)
        knew = reading.knows_task if (state.knew_task is None) else state.knew_task
        step = reading.next_step
        if step == "start":   return IntroTurn(replace(state, stage="done", knew_task=knew), f"{INTRO_BEGIN} {self.script.start}", "start")
        if step == "task":    return IntroTurn(replace(state, stage="done", knew_task=knew), None, "task")
        if step == "explain": return IntroTurn(replace(state, stage="ready_check", knew_task=knew, explained=True), f"{self.script.rules} {INTRO_READY}", "explain")
        if step == "answer":  return IntroTurn(replace(state, stage="ready_check", knew_task=knew, questions=state.questions + 1), f"{reading.answer} {INTRO_READY}", "answer")
        return IntroTurn(replace(state, knew_task=knew), INTRO_WAIT, "wait")


# The intro's record in the task history (None for a chat that ran none)
def intro_record(state: IntroState | None) -> dict[str, object] | None:
    if state is None: return None
    return {"knew_task": state.knew_task, "explained": state.explained, "questions": state.questions, "finished": not state.running}


# Log one reading: what comes next, how long it took, what they said about the task, and why
def _log_reading(reading: IntroReading, elapsed_sec: float) -> None:
    logger.info(
        f"{LLM_MAIN}[Intro] {BOLD}{reading.next_step}{UNBOLD} in ({BOLD}{elapsed_sec:.2f}s{UNBOLD}), knows the task: {BOLD}{reading.knows_task}{UNBOLD}{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Basis: {UNBOLD}{reading.basis}{RESET}"
    )
