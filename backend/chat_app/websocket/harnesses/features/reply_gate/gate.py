"""
The reply gate: check a turn beside its reply, then speak, hold, or clarify.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.features.reply_gate.gate`

A chat type's `generate` hands its reply to `ReplyGate.run`. For a reply to
finished speech, one quick LLM call (the reply check) starts at the same moment
as the chat type's own reply, so it usually answers before the reply is ready.
A reply that is ready waits at most `REPLY_CHECK_GRACE_SEC` for a check still
running, then goes out unchecked, so a slow check never leaves the user in a
long silence. The verdict decides what happens:

* `reply`: the reply goes out as usual.
* `wait`: the user seems mid-thought. The avatar gives the sign of listening the
  check picked, and the reply is held for the chat type's hold. Newer speech
  cancels the attempt during the hold, just as it cancels any automatic reply,
  and the staged words are answered later along with the rest of the turn. If
  the user stays quiet, the reply (which kept working meanwhile) goes out when
  the hold ends, and the hold shows in its timing (`services/step_timing.py`).
* `clarify`: a likely misheard word hides what the user meant. The reply is
  dropped, and the avatar asks about it instead: the chat type gets the whole
  verdict (the words that seem wrong, and the check's own short question), and
  either asks the check's question or writes one of its own.

Plans the reply makes before the verdict (its thinking look) are held back until
it may go out, so the avatar keeps listening while the check runs. A `reply_now`
reply, a harness's own turns, and a chat with every check switched off skip the
check. A check that fails lets the reply go out as usual (`harnesses/README.md`).

"""
from __future__  import annotations
from dataclasses import replace
from typing      import Awaitable, Callable, Sequence, TYPE_CHECKING

import asyncio, logging, time
logger = logging.getLogger(__name__)

# From this project
from .....services.llm.chat_utilities import prepare_LLM_messages
from .....services.logging_utils      import RESET, BOLD, UNBOLD, LLM_MAIN, ROBO_MSG, USER_MSG
from .....services.step_timing        import timed_step
from   ..config                       import FEATURE_MISHEARD_CONDITIONS, FEATURE_TURN_END_CONDITIONS
from    .config                       import REPLY_CHECK_GRACE_SEC
from    .prompts                      import build_check_messages
from    .reply_check_api              import ReplyCheckAPIError, get_reply_check_api
from    .response_models              import Reply, ReplyHeard, Wait, check_model

if TYPE_CHECKING:
    from ...avatar           import AvatarPlan
    from ...base             import ChatHarness, PlanPublisher, ResponseOutcome, TurnAttempt
    from  ..backchannels.cue import Backchannels
    from   .response_models  import CheckResult, Clarify


# --------------------------------------------------------------------------------
# Checks
# --------------------------------------------------------------------------------
# One thing the reply check looks for, switched on in the conditions its config lists
class GateCheck:
    NAME       : str              # The check's name in the prompt
    CONDITIONS : tuple[str, ...]  # Conditions it runs in (`features/config.py`)

    # Switch it on where its condition says, with any guidance its chat type adds to the prompt
    def __init__(self, harness: ChatHarness, notes: str | Callable[[], str] | None = None) -> None:
        self.on     = (harness.condition in self.CONDITIONS)  # Runs (this connection's switch)
        self._notes = notes                                   # Extra prompt bullets ("- ..." lines), or what writes them from the chat's state

    # The chat type's notes for this check now (notes from the chat's state are written as it runs)
    @property
    def notes(self) -> str | None:
        return self._notes() if callable(self._notes) else self._notes

# Hold a reply while the user seems to be mid-thought
class TurnEndCheck(GateCheck):
    NAME       = "turn_end"
    CONDITIONS = FEATURE_TURN_END_CONDITIONS

# Ask about a likely misheard word instead of replying
class MisheardCheck(GateCheck):
    NAME       = "misheard"
    CONDITIONS = FEATURE_MISHEARD_CONDITIONS


# ================================================================================
# Reply Gate
# ================================================================================
# Check each reply to finished speech while it is worked out, then let it out, hold it, or ask about a word instead
class ReplyGate:
    # Keep the chat's checks, where its signs of listening come from, and how long it holds a reply
    def __init__(
        self,
        harness      : ChatHarness,          # Chat whose replies go through the gate
        checks       : Sequence[GateCheck],  # Checks the chat type uses, each switched on or off for this connection
        backchannels : Backchannels,         # The chat's signs of listening (the check picks from its sounds)
        hold_sec     : float,                # How long a held reply waits for the user to go on
    ) -> None:
        self.harness      = harness
        self.checks       = tuple(checks)
        self.backchannels = backchannels
        self.hold_sec     = hold_sec

    # Run the check beside the chat type's reply, then act on its verdict (newer speech may cancel either at any await)
    async def run(
        self,
        attempt : TurnAttempt,                                          # The reply attempt
        reply   : Callable[[TurnAttempt], Awaitable[ResponseOutcome]],  # The chat type's own reply to the turn
        clarify : Callable[[Clarify], Awaitable[ResponseOutcome]],      # The chat type's question about the misheard words
    ) -> ResponseOutcome:
        # Only a reply to finished speech is checked
        checks = tuple(check for check in self.checks if check.on)
        if (attempt.trigger != "automatic") or (not checks): return await reply(attempt)

        # The reply starts beside the check, and the plans it makes wait for the verdict
        held = _HeldPlans(attempt.publish_plan)
        async with asyncio.TaskGroup() as group:
            replying = group.create_task(reply(replace(attempt, publish_plan=held.publish)), name=f"{self.harness.NAME}::gated_reply")
            checking = group.create_task(self._check(attempt, checks),                      name=f"{self.harness.NAME}::reply_check")
            verdict  = await _verdict_in_time(checking, replying)

            # A likely misheard word: drop the reply, and ask about it instead
            if verdict.next_step == "clarify":
                replying.cancel()
                return await clarify(verdict)

            # Mid-thought: a sign of listening, then the hold (newer speech cancels the whole attempt here)
            if verdict.next_step == "wait":
                await self._give_sign(attempt, verdict)
                with timed_step("hold", "hold"): await asyncio.sleep(self.hold_sec)
                logger.info(f"{LLM_MAIN}[Reply check] The hold ended without more speech, so the reply goes out.{RESET}")

            # The reply goes out, after the plans it made meanwhile
            await held.release()
            return await replying

    # The verdict on this turn from the checks switched on (a check that fails lets the reply out)
    async def _check(self, attempt: TurnAttempt, checks: tuple[GateCheck, ...]) -> Reply | Wait | Clarify:
        signs    = self.backchannels
        names    = {check.NAME for check in checks}
        model    = check_model(tuple(signs.SOUNDS), signs.GESTURES, turn_end=(TurnEndCheck.NAME in names), misheard=(MisheardCheck.NAME in names))
        messages = build_check_messages(checks, signs.SOUNDS, signs.GESTURES, prepare_LLM_messages(attempt.context), attempt.user_text)

        started = time.monotonic()
        try: result = await get_reply_check_api().check(messages, model)
        except ReplyCheckAPIError:
            logger.exception(f"{LLM_MAIN}[Reply check] The check failed, so the reply goes out unchecked.{RESET}")
            return Reply(next_step="reply")

        _log_verdict(result, time.monotonic() - started)
        return result.verdict

    # The sign of listening the check picked for the hold (dropped if newer speech has already cancelled the attempt)
    async def _give_sign(self, attempt: TurnAttempt, wait: Wait) -> None:
        plan = self.backchannels.chosen_sign(wait.sound, wait.gesture)
        if plan is not None: await attempt.publish_plan(plan)


# The check's verdict, or a plain reply once a ready reply has waited out the grace
async def _verdict_in_time(checking: asyncio.Task[Reply | Wait | Clarify], replying: asyncio.Task[ResponseOutcome]) -> Reply | Wait | Clarify:
    # The check usually answers first; a reply that is ready first gives it a little longer
    await asyncio.wait((checking, replying), return_when=asyncio.FIRST_COMPLETED)
    if not checking.done(): await asyncio.wait((checking,), timeout=REPLY_CHECK_GRACE_SEC)
    if checking.done():     return checking.result()

    # Still running: drop it, and the reply goes out unchecked (the call still shows in its timing)
    checking.cancel()
    logger.info(f"{LLM_MAIN}[Reply check] Still running {BOLD}{REPLY_CHECK_GRACE_SEC:.1f}s{UNBOLD} after the reply was ready, so the reply goes out unchecked.{RESET}")
    return Reply(next_step="reply")


# Log the verdict with what came with it, the time it took, and why
def _log_verdict(result: CheckResult, elapsed_sec: float) -> None:
    verdict = result.verdict
    if   isinstance(verdict, Wait):       detail = f": sound {BOLD}{verdict.sound}{UNBOLD}, gesture {BOLD}{verdict.gesture}{UNBOLD}"
    elif isinstance(verdict, ReplyHeard): detail = f": likely said {USER_MSG}{verdict.likely_said!r}{RESET}{LLM_MAIN}" if (verdict.likely_said is not None) else ""
    elif isinstance(verdict, Reply):      detail = ""
    else:                                 detail = f": misheard {USER_MSG}{verdict.misheard!r}{RESET}{LLM_MAIN}, asking {ROBO_MSG}{verdict.message!r}{RESET}{LLM_MAIN}"
    logger.info(
        f"{LLM_MAIN}[Reply check] {BOLD}{verdict.next_step}{UNBOLD} in ({BOLD}{elapsed_sec:.2f}s{UNBOLD}){detail}{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Basis: {UNBOLD}{result.basis}{RESET}"
    )


# --------------------------------------------------------------------------------
# Held Plans
# --------------------------------------------------------------------------------
# Plans a reply makes before the verdict, kept back until the reply may go out
class _HeldPlans:
    # Hold plans for the attempt's own publisher
    def __init__(self, publish: PlanPublisher) -> None:
        self._publish  = publish
        self._plans    : list[AvatarPlan] = []
        self._released = False

    # Keep a plan back until the verdict lets the reply out, and send it at once after
    async def publish(self, plan: AvatarPlan) -> None:
        if self._released: await self._publish(plan)
        else:              self._plans.append(plan)

    # The reply may go out: send what it made meanwhile, in order
    async def release(self) -> None:
        self._released = True
        for plan in self._plans: await self._publish(plan)
        self._plans = []
