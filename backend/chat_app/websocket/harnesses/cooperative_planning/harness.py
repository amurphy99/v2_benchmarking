"""
The cooperative planning chat type: the user and the avatar work out a plan together.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.cooperative_planning.harness`

The two sides agree on one choice for each item of a scenario (a starter, a main
course, and a dessert for a dinner party), and each has private constraints the
other learns only by being told. A scenario also gives each side its brief: who
it is and the situation (two friends planning, or a hotel guest and the
receptionist). The chat opens with the shared intro (`features/intro/`): what
the task is in the scenario's own words, and how planning works for anyone new
to it, then the scenario's first line; without the intro, the avatar opens with
the scenario's opening line. An answer to the intro that already offers an idea
goes straight to the planning. Each turn is answered by the pipeline
`config.PLANNING_PIPELINE` names (`pipelines.py`). The changes it proposes are
applied in code (`plan_state.py`): a yes to the other side's idea puts it on the
card at once, and the new plan takes effect only once the reply is saved, so a
reply cut off by newer speech never writes on the card. The reply that agrees
the last open item reads the whole plan back with a fixed recap question
(`prompts.recap_line`), and the user's yes to it ends the chat with the
scenario's closing line.

Every reply to finished speech goes through the reply gate
(`features/reply_gate/`), which holds it while the user seems mid-thought, or
asks about a likely misheard word instead, in the conditions those checks run
in.

With the `cues` condition the avatar holds its own card, reads it over while it
works out each reply, every reply carries an avatar plan for the behavior it
picked (`behaviors.py`), and the cues run (`cues.py`, and the shared
`BackToListening`), including signs of listening at the user's pauses. With
`no_cues` the reply calls still pick a behavior (it's logged), but no plan is
sent and the avatar only idles.

The participant's card goes out as a `task_card` frame when the chat starts and
whenever the plan on it changes. Once the chat ends, their client is shown the
avatar's brief and constraints, marking the ones it mentioned (`reveal_view`).

"""
from __future__  import annotations
from dataclasses import dataclass, replace
from functools   import partial
from typing      import Awaitable, Callable, TYPE_CHECKING

import asyncio, logging, time
logger = logging.getLogger(__name__)

from channels.db import database_sync_to_async as db_s2a

# From this project
from ....services.db_services        import ChatService
from ....services.llm.chat_utilities import prepare_LLM_messages
from ....services.logging_utils      import RESET, BOLD, UNBOLD, LLM_MAIN
from  ...services.bg_helpers         import fire_and_log
from   ..avatar                      import send_avatar_plan, send_avatar_setup
from   ..base                        import ChatHarness, ResponseOutcome, TurnAttempt
from   ..cues                        import BackToListening
from   ..features.intro.flow         import Intro, intro_record
from   ..features.reply_gate.gate    import MisheardCheck, ReplyGate, TurnEndCheck
from    .behaviors                   import PLANNING_INTRO_BEHAVIORS, reply_plan, setup_for, start_plan, thinking_plan, writing_plan
from    .config                      import PLANNING_HOLD_SEC, PLANNING_PIPELINE
from    .cues                        import ItemGlance, PlanningBackchannels, QuietNudge
from    .pipelines                   import PIPELINES, PlanningTurn
from    .plan_state                  import ChangeResult, PlanningState, apply_changes, initial_state, planning_history, planning_reveal, send_task_card
from    .planning_api                import PlanningAPIError, get_planning_api
from    .prompts                     import PLANNING_TURN_END_NOTES, intro_script, misheard_notes, recap_line
from    .response_models             import models_for_scenario
from    .scenarios                   import load_scenario

if TYPE_CHECKING:
    from ...consumers.consumers import ChatConsumer
    from  ..base                import RevealView
    from  ..features.intro.flow import IntroState
    from   .pipelines           import PlanningReply, ProposedChanges
    from   .response_models     import Behavior

# Scenarios a client can pick with `variant` (each one is `scenarios/<variant>.json`)
PLANNING_VARIANTS = ("dinner_party", "day_trip", "birthday_party", "movie_night", "hotel_room", "weekend_activity", "club_event", "house_party", "apartment_hunt", "camping_trip", "flight_rebooking")

# Every scenario, loaded and checked when the backend starts
PLANNING_SCENARIOS = {variant: load_scenario(variant) for variant in PLANNING_VARIANTS}

# What the avatar says when no reply could be made (the plan stays as it was)
MSG_SAY_AGAIN = "Sorry, could you say that again?"

# Work to start once a reply is saved
FollowUp = Callable[[], Awaitable[None]]


# One planning reply, with what the turn decided beyond the base outcome (for the logs and the notebook view)
@dataclass(frozen=True, slots=True)
class PlanningOutcome(ResponseOutcome):
    behavior  : Behavior | None          = None  # The behavior the reply picked (a plan is sent only with cues)
    results   : tuple[ChangeResult, ...] = ()    # Every change the exchange proposed, applied or refused
    follow_up : FollowUp | None          = None  # Tracking to start once the reply is saved (reply_then_track)


# ================================================================================
# Cooperative Planning Harness
# ================================================================================
# Plan an event with the user, one item at a time, and keep the participant's card up to date
class CooperativePlanningHarness(ChatHarness):
    NAME       = "cooperative_planning"
    CONDITIONS = ("cues", "no_cues")
    VARIANTS   = PLANNING_VARIANTS

    # The avatar opens the chat itself, so the context starts empty
    CONTEXT_OPENER = None

    # The plan so far (each saved reply that changes it replaces this)
    state : PlanningState

    # --------------------------------------------------------------------------------
    # Load the scenario, its responses, intro, cues, reply gate, and their switches
    # --------------------------------------------------------------------------------
    def __init__(self, consumer: ChatConsumer, *, condition: str, variant: str) -> None:
        super().__init__(consumer, condition=condition, variant=variant)
        self.scenario     = PLANNING_SCENARIOS[variant]
        self.models       = models_for_scenario(self.scenario.item_ids, self.scenario.avatar_constraint_ids)
        self.intro        = Intro(self, intro_script(self.scenario))
        self.state        = replace(initial_state(self.scenario), intro=self.intro.initial_state())
        self.with_cues    = (condition == "cues")
        self.backchannels = PlanningBackchannels(self)
        self._tracking    : asyncio.Task[None] | None = None       # reply_then_track's work on the last saved exchange
        self.cues         = [self.backchannels]
        if self.with_cues: self.cues += [BackToListening(self), ItemGlance(self), QuietNudge(self)]

        # Every reply to finished speech is checked first (each check runs in its switch's conditions;
        # the misheard one reads the ideas on the table as it runs)
        self.reply_gate = ReplyGate(
            self,
            checks       = (TurnEndCheck(self, PLANNING_TURN_END_NOTES), MisheardCheck(self, lambda: misheard_notes(self.scenario, self.state))),
            backchannels = self.backchannels,
            hold_sec     = PLANNING_HOLD_SEC,
        )

        # The shared features a command can switch partway through the chat, by name
        self.features = {feature.NAME: feature for feature in (self.backchannels, *self.reply_gate.checks)}

    # The connection is ready: set the avatar up (with the signs' sound, even while they are off), show the participant's card, and open the chat
    async def start(self) -> None:
        await send_avatar_setup(self.consumer, setup_for(self.with_cues, await self.backchannels.sounds()))
        if self.with_cues: await send_avatar_plan(self.consumer, start_plan())
        await send_task_card(self.consumer, self.scenario, self.state)
        self.request_turn()

    # --------------------------------------------------------------------------------
    # Answer one turn through the reply gate and the pipeline, and propose the plan its changes leave
    # --------------------------------------------------------------------------------
    async def generate(self, attempt: TurnAttempt) -> ResponseOutcome:
        # Wait for the last exchange's tracking (reply_then_track), so this turn sees its plan
        if (self._tracking is not None) and (not self._tracking.done()): await asyncio.wait({self._tracking})

        # The intro answers until the user is ready (an answer offering an idea goes on to the planning)
        intro = self.state.intro
        if (intro is not None) and intro.running:
            turn = await self.intro.take_turn(attempt, intro)
            if turn.message is not None: return self._outcome(turn.message, PLANNING_INTRO_BEHAVIORS[turn.move], None, replace(self.state, intro=turn.state), ())
            intro = turn.state

        # The opening line (without the intro), and the closing line once later tracking approved the plan
        if not attempt.context:            return self._outcome(self.scenario.opening_line, "smile", None, self.state, ())
        if self.state.stage == "approved": return self._outcome(self.scenario.closing_line, "delighted", None, self.state, ())

        # A turn of the avatar's own with every item agreed (a nudge, or after tracking) reads the plan back
        if (not attempt.user_text) and self.state.all_agreed: return self._read_back()

        # The reply waits while the user seems mid-thought, or gives way to a question about a misheard word
        return await self.reply_gate.run(attempt, partial(self._reply, intro=intro), self._clarify)

    # Answer through the pipeline and propose the plan it leaves (the intro over, if it handed on)
    async def _reply(self, attempt: TurnAttempt, intro: IntroState | None) -> PlanningOutcome:
        # With cues, the avatar raises its card and reads it over while it works out the reply
        # (published from here, not from a cue, so it always goes out before the reply's own plan)
        if self.with_cues: await attempt.publish_plan(thinking_plan(self.turn_number))

        # Answer the turn (a failed call says the scripted line, whose plan still lowers the card)
        started  = time.monotonic()
        turn     = PlanningTurn(self.scenario, self.models, self.state, prepare_LLM_messages(attempt.context), nudge=not attempt.user_text)
        pipeline = PIPELINES[PLANNING_PIPELINE]
        try: reply = await pipeline(get_planning_api(), turn)
        except PlanningAPIError:
            logger.exception(f"{LLM_MAIN}[Planning] The {PLANNING_PIPELINE} pipeline failed; asking the user to say it again.{RESET}")
            return self._outcome(MSG_SAY_AGAIN, "sorry", None, replace(self.state, intro=intro), ())

        # Apply the changes; a plan they complete is read back after the reply, and the final check starts
        state, results = apply_changes(replace(self.state, intro=intro), reply.changes)
        message        = reply.message
        if (state.stage == "planning") and state.all_agreed:
            message = f"{message} {recap_line(self.scenario, state)}"
            state   = replace(state, stage="final_check")
        _log_turn(reply, results, state, time.monotonic() - started)

        # An approved plan ends the chat with the scenario's closing line
        if state.stage == "approved": return self._outcome(self.scenario.closing_line, "delighted", None, state, results)
        follow_up = None if (reply.follow_up is None) else (lambda: self._track_after_reply(reply.follow_up))
        return self._outcome(message, reply.behavior, reply.about, state, results, follow_up)

    # The whole plan read back on a turn of the avatar's own (it waits for the user's yes, or a change)
    def _read_back(self) -> PlanningOutcome:
        return self._outcome(recap_line(self.scenario, self.state), "glance_at_card", None, replace(self.state, stage="final_check"), ())

    # Ask about a word the reply check thinks was misheard, head tilted (the plan stays as it was)
    def _clarify(self, message: str) -> PlanningOutcome:
        return self._outcome(message, "curious", None, self.state, ())

    # The outcome for a reply: the plan it proposes, its avatar plan (with cues), and the chat's end once approved
    def _outcome(
        self,
        message   : str,                       # What the avatar says
        behavior  : Behavior,                  # How it acts while saying it
        about     : str | None,                # The item the behavior is about
        state     : PlanningState,             # The plan once the reply is saved
        results   : tuple[ChangeResult, ...],  # Every change the exchange proposed
        follow_up : FollowUp | None = None,    # Tracking to start once the reply is saved
    ) -> PlanningOutcome:
        plan = reply_plan(self.scenario, self.turn_number, behavior, about, _settled(self.state, state)) if self.with_cues else None
        return PlanningOutcome(
            message       = message,
            task_snapshot = self.history_view(state),
            state         = state,
            close_after   = (state.stage == "approved"),
            avatar_plan   = plan,
            behavior      = behavior,
            results       = results,
            follow_up     = follow_up,
        )

    # Freeze the scenario, private constraints, proposed or committed decisions, and the intro's record
    def history_view(self, state: PlanningState | None = None) -> dict[str, object]:
        saved = self.state if (state is None) else state
        return {**planning_history(self.scenario, saved), "intro": intro_record(saved.intro)}

    # What the participant is shown once the chat ends: the avatar's brief and constraints, marking the ones it mentioned
    def reveal_view(self) -> RevealView:
        return planning_reveal(self.scenario, self.state)

    # --------------------------------------------------------------------------------
    # Once a reply is saved: show the card it changed, and start any tracking it left
    # --------------------------------------------------------------------------------
    def on_reply_saved(self, outcome: ResponseOutcome) -> None:
        # The card shows the plan, so the intro's progress alone doesn't send it again
        before = self.state
        super().on_reply_saved(outcome)
        if replace(self.state, intro=None) != replace(before, intro=None): fire_and_log(send_task_card(self.consumer, self.scenario, self.state), name="cooperative_planning::card")
        if isinstance(outcome, PlanningOutcome) and (outcome.follow_up is not None): self._tracking = fire_and_log(outcome.follow_up(), name="cooperative_planning::tracking")

    # Apply the saved exchange's changes once worked out (reply_then_track), then read back or close
    async def _track_after_reply(self, follow_up: Callable[[], Awaitable[ProposedChanges]]) -> None:
        started        = time.monotonic()
        state, results = apply_changes(self.state, await follow_up())
        _log_tracking(results, state, time.monotonic() - started)
        if state == self.state: return

        # The exchange has been heard already, so its changes apply at once
        settled    = _settled(self.state, state)
        await db_s2a(ChatService.save_task_snapshot)(self.consumer.session_id, self.history_view(state))
        self.state = state
        await send_task_card(self.consumer, self.scenario, state)
        if self.with_cues and settled: await send_avatar_plan(self.consumer, writing_plan(self.scenario, self.turn_number, settled))

        # A turn of the avatar's own: the closing line once approved, or the read-back once finished
        if (state.stage == "approved") or ((state.stage == "planning") and state.all_agreed): self.request_turn()


# The items whose choice went on the card between two plans, in order
def _settled(before: PlanningState, after: PlanningState) -> list[str]:
    return [item_id for item_id, item in after.items.items() if (item.agreed is not None) and (item.agreed != before.items[item_id].agreed)]


# --------------------------------------------------------------------------------
# Log a Turn
# --------------------------------------------------------------------------------
# Log the pipeline and its time, the reply's basis and behavior, each change, and the card
def _log_turn(reply: PlanningReply, results: tuple[ChangeResult, ...], state: PlanningState, elapsed_sec: float) -> None:
    logger.info(
        f"{LLM_MAIN}[Planning] Turn answered by {BOLD}{PLANNING_PIPELINE}{UNBOLD} in ({BOLD}{elapsed_sec:.2f}s{UNBOLD}):{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Basis:    {UNBOLD}{reply.basis}{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Behavior: {UNBOLD}{reply.behavior} (about: {reply.about}){RESET}\n"
        f"{_changes_lines(results)}"
        f"    {LLM_MAIN}{BOLD}Card:     {UNBOLD}{_card_line(state)}{RESET}"
    )

# Log the changes worked out after a reply went out (reply_then_track)
def _log_tracking(results: tuple[ChangeResult, ...], state: PlanningState, elapsed_sec: float) -> None:
    logger.info(
        f"{LLM_MAIN}[Planning] Exchange tracked after its reply in ({BOLD}{elapsed_sec:.2f}s{UNBOLD}):{RESET}\n"
        f"{_changes_lines(results)}"
        f"    {LLM_MAIN}{BOLD}Card:     {UNBOLD}{_card_line(state)}{RESET}"
    )

# One log line per proposed change, with why a refused one was refused
def _changes_lines(results: tuple[ChangeResult, ...]) -> str:
    lines = [f"    {LLM_MAIN}{BOLD}Change:   {UNBOLD}{result.by} {result.change.model_dump_json()}{f' (refused: {result.refused})' if result.refused else ''}{RESET}\n" for result in results]
    return "".join(lines) or f"    {LLM_MAIN}{BOLD}Change:   {UNBOLD}none{RESET}\n"

# The card as one line ("starter: breadsticks, main: -, dessert: -; planning")
def _card_line(state: PlanningState) -> str:
    return ", ".join(f"{item_id}: {item.agreed or '-'}" for item_id, item in state.items.items()) + f"; {state.stage}"
