"""
The cooperative planning chat type: the user and the avatar work out a plan together.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.cooperative_planning.harness`

The two sides agree on one choice for each item of a scenario (a starter, a main
course, and a dessert for a dinner party), and each has private constraints the
other learns only by being told. A scenario also gives each side its brief: who
it is and the situation (two friends planning, or a hotel guest and the
receptionist). The avatar opens with the scenario's line, and
each turn is answered by the pipeline `config.PLANNING_PIPELINE` names
(`pipelines.py`). The changes it proposes are applied in code (`plan_state.py`),
and the new plan takes effect only once the reply is saved, so a reply cut off
by newer speech never writes on the card. Once every item is agreed, the avatar
reads the plan back, and the user's yes ends the chat with the scenario's
closing line. When the avatar's own yes settles the last item, it takes a turn
to read the plan back as soon as that reply has been heard.

With the `cues` condition the avatar holds its own card, reads it over while it
works out each reply, every reply carries an avatar plan for the behavior it
picked (`behaviors.py`), and the cues run (`cues.py`, and the shared
`BackToListening`). With `no_cues` the reply calls still pick a behavior (it's
logged), but no plan is sent and the avatar only idles.

The participant's card goes out as a `task_card` frame when the chat starts and
whenever the plan on it changes.

"""
from __future__  import annotations
from dataclasses import dataclass, replace
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
from    .behaviors                   import reply_plan, setup_for, start_plan, thinking_plan, writing_plan
from    .config                      import PLANNING_PIPELINE
from    .cues                        import ItemGlance, QuietNudge
from    .pipelines                   import PIPELINES, PlanningTurn
from    .plan_state                  import ChangeResult, PlanningState, apply_changes, initial_state, planning_history, send_task_card
from    .planning_api                import PlanningAPIError, get_planning_api
from    .response_models             import models_for_scenario
from    .scenarios                   import load_scenario

if TYPE_CHECKING:
    from ...consumers.consumers import ChatConsumer
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
    # Load this connection's scenario, its responses, and its cues
    # --------------------------------------------------------------------------------
    def __init__(self, consumer: ChatConsumer, *, condition: str, variant: str) -> None:
        super().__init__(consumer, condition=condition, variant=variant)
        self.scenario    = PLANNING_SCENARIOS[variant]
        self.models      = models_for_scenario(self.scenario.item_ids, self.scenario.avatar_constraint_ids)
        self.state       = initial_state(self.scenario)
        self.with_cues   = (condition == "cues")
        self._tracking   : asyncio.Task[None] | None = None       # reply_then_track's work on the last saved exchange
        self._read_back  : PlanningState | None      = None       # The finished plan a read-back turn was last asked for
        if self.with_cues: self.cues = [BackToListening(self), ItemGlance(self), QuietNudge(self)]

    # The connection is ready: set the avatar up, show the participant's card, and open the chat
    async def start(self) -> None:
        await send_avatar_setup(self.consumer, setup_for(self.with_cues))
        if self.with_cues: await send_avatar_plan(self.consumer, start_plan())
        await send_task_card(self.consumer, self.scenario, self.state)
        self.request_turn()

    # --------------------------------------------------------------------------------
    # Answer one turn through the pipeline, and propose the plan its changes leave
    # --------------------------------------------------------------------------------
    async def generate(self, attempt: TurnAttempt) -> ResponseOutcome:
        # Wait for the last exchange's tracking (reply_then_track), so this turn sees its plan
        if (self._tracking is not None) and (not self._tracking.done()): await asyncio.wait({self._tracking})

        # Scripted opening line, and the closing line once a later tracking approved the plan
        if not attempt.context:            return self._outcome(self.scenario.opening_line, "pleased", None, self.state, ())
        if self.state.stage == "approved": return self._outcome(self.scenario.closing_line, "excited", None, self.state, ())

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
            return self._outcome(MSG_SAY_AGAIN, "apologetic", None, self.state, ())

        # Apply the changes, and start the final check once the reply has read the finished plan back
        state, results = apply_changes(self.state, reply.changes)
        if (reply.directive == "read_back") and (state.stage == "planning") and state.all_agreed: state = replace(state, stage="final_check")
        _log_turn(reply, results, state, time.monotonic() - started)

        # An approved plan ends the chat with the scenario's closing line
        if state.stage == "approved": return self._outcome(self.scenario.closing_line, "excited", None, state, results)
        follow_up = None if (reply.follow_up is None) else (lambda: self._track_after_reply(reply.follow_up))
        return self._outcome(reply.message, reply.behavior, reply.about, state, results, follow_up)

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

    # Freeze the scenario, private constraints, and proposed or committed decisions
    def history_view(self, state: PlanningState | None = None) -> dict[str, object]:
        return planning_history(self.scenario, self.state if (state is None) else state)

    # --------------------------------------------------------------------------------
    # Once a reply is saved: show the card it changed, and start any tracking it left
    # --------------------------------------------------------------------------------
    def on_reply_saved(self, outcome: ResponseOutcome) -> None:
        before = self.state
        super().on_reply_saved(outcome)
        if self.state != before: fire_and_log(send_task_card(self.consumer, self.scenario, self.state), name="cooperative_planning::card")
        if isinstance(outcome, PlanningOutcome) and (outcome.follow_up is not None): self._tracking = fire_and_log(outcome.follow_up(), name="cooperative_planning::tracking")

    # The reply whose yes settled the last item has been heard: take a turn to read the whole plan back
    def on_playback(self, response_id: int, state: str) -> None:
        """
        A read-back otherwise waits for the user's next words, and only the `cues`
        condition has a nudge to fall back on. Each finished plan is asked for once,
        so a read-back that failed (the plan stays as it was) is not asked for again.
        """
        super().on_playback(response_id, state)
        waiting = (self.state.stage == "planning") and self.state.all_agreed and (self.state is not self._read_back)
        if (state == "finished") and waiting and self.request_turn(): self._read_back = self.state

    # Work out the saved exchange's changes (reply_then_track), apply them, and close the chat once approved
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
        if state.stage == "approved":  self.request_turn()


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
