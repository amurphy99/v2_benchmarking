"""
Time the steps inside one reply attempt: each model call, and a reply held back.
--------------------------------------------------------------------------------
`backend.chat_app.services.step_timing`

The response pipeline collects one reply attempt's steps (`collect_steps`), and
the code doing a step times it where it runs, however deep inside a chat type
it is: the LLM clients time every model call, and the reply gate times its hold.
A task the attempt starts (the reply check beside the reply) adds to the same
collection, since asyncio copies the context into each new task. Outside a reply
attempt nothing is collected.

The harness notebook bridge imports the LLM clients, so this module stays free
of Django.

"""
from __future__  import annotations
from contextlib  import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing      import Iterator, Literal

import time

# What a timed step was: a model call, or a reply held back on purpose
StepKind = Literal["call", "hold"]


# One timed step of a reply attempt, on the monotonic clock
@dataclass(frozen=True, slots=True)
class TimedStep:
    label   : str       # What the step was (a call's label, such as "reply" or "check"; "hold")
    kind    : StepKind  # A model call, or a held reply
    started : float     # When it started (monotonic seconds)
    ended   : float     # When it ended, finished or not


# The steps of the reply attempt running in this context (None outside one)
_REPLY_STEPS: ContextVar[list[TimedStep] | None] = ContextVar("reply_steps", default=None)


# --------------------------------------------------------------------------------
# Collecting and Timing Steps
# --------------------------------------------------------------------------------
# Collect every step timed until the block ends, in whichever task it runs (the list fills in as each ends)
@contextmanager
def collect_steps() -> Iterator[list[TimedStep]]:
    steps : list[TimedStep] = []
    token = _REPLY_STEPS.set(steps)
    try:     yield steps
    finally: _REPLY_STEPS.reset(token)

# Time one step for the reply attempt being collected, even when it fails (outside an attempt, it isn't kept)
@contextmanager
def timed_step(label: str, kind: StepKind = "call") -> Iterator[None]:
    started = time.monotonic()
    try: yield
    finally:
        steps = _REPLY_STEPS.get()
        if steps is not None: steps.append(TimedStep(label, kind, started, time.monotonic()))
