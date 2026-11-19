"""
The speech elicitation chat type: one light question, then keep them talking.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.speech_elicitation.harness`

The avatar opens with the topic's question (`topics.py`), and every reply after
it reacts to what the user said and ends with a question of its own, so the turn
always goes back to them (`prompts.py`; the response schema refuses a reply that
doesn't). Each answer opens a thread, and the state counts how far the current
one has gone, so the reply digs into it before moving on. Code tells the reply
when the conversation is flagging: after short answers, or when the user has
gone quiet (`QuietPrompt`, in both conditions). There is nothing to finish: the
participant ends the chat from the client when they feel done. When they say so
out loud, the avatar thanks them, asks nothing, and stops speaking up after
silences.

Every reply to finished speech goes through the reply gate
(`features/reply_gate/`), which holds it while the user seems mid-thought, or
asks about a likely misheard word instead, in the conditions those checks run in.

With the `cues` condition the client's automatic looks run, every reply carries
an avatar plan for the behavior it picked (`behaviors.py`), and the avatar gives
signs of listening when the user pauses, most of them with a short sound in its
own voice (`cues.py`; the clips are synthesized once and sent in the setup).
With `no_cues` the reply still picks a behavior (it's logged), but no plan is
sent and the avatar only idles.

A reply call that fails every attempt gets a scripted line that asks the user to
say more.

"""
from __future__  import annotations
from dataclasses import dataclass
from typing      import TYPE_CHECKING

import logging, time
logger = logging.getLogger(__name__)

# From this project
from ....services.llm.chat_utilities import prepare_LLM_messages
from ....services.logging_utils      import RESET, BOLD, UNBOLD, LLM_MAIN
from   ..avatar                      import send_avatar_plan, send_avatar_setup
from   ..base                        import ChatHarness, ResponseOutcome, TurnAttempt
from   ..cues                        import BackToListening
from   ..features.reply_gate.gate    import MisheardCheck, ReplyGate, TurnEndCheck
from    .behaviors                   import reply_plan, setup_for, start_plan, thinking_plan
from    .config                      import ELICITATION_HOLD_SEC
from    .cues                        import ElicitationBackchannels, QuietPrompt
from    .elicitation_api             import ElicitationAPIError, get_elicitation_api
from    .prompts                     import ELICITATION_TURN_END_NOTES, directive_for, offer_angles
from    .topics                      import ELICITATION_TOPICS, ELICITATION_VARIANTS

if TYPE_CHECKING:
    from ...consumers.consumers import ChatConsumer
    from   .prompts             import Directive
    from   .response_models     import Behavior, ElicitationTurn, ReplyMove

# What the avatar says when no reply could be made (it still hands the turn back with a question)
MSG_SAY_MORE = "Sorry, I lost my train of thought for a second. Could you tell me a little more about that?"


# Where the conversation stands: how far the current thread has gone, and whether the user wants to stop
@dataclass(frozen=True, slots=True)
class ElicitationState:
    wound_down    : bool = False  # The user has said they want to stop (the avatar stops speaking up after silences)
    follow_ups    : int  = 0      # Replies on the current thread (the opening question and each new angle start one)
    short_answers : int  = 0      # The user's short answers in a row


# One reply, with what it decided beyond the base outcome (for the logs and the notebook view)
@dataclass(frozen=True, slots=True)
class ElicitationOutcome(ResponseOutcome):
    behavior : Behavior | None = None  # The behavior the reply picked (a plan is sent only with cues)


# ================================================================================
# Speech Elicitation Harness
# ================================================================================
# Open with the topic's question, and answer every turn with a reaction and another question
class SpeechElicitationHarness(ChatHarness):
    NAME       = "speech_elicitation"
    CONDITIONS = ("cues", "no_cues")
    VARIANTS   = ELICITATION_VARIANTS

    # The avatar opens the chat itself, so the context starts empty
    CONTEXT_OPENER = None

    # Every chat starts with the user still talking (each saved reply replaces this)
    state : ElicitationState = ElicitationState()

    # Load this connection's topic, and build its cues and its reply gate
    def __init__(self, consumer: ChatConsumer, *, condition: str, variant: str) -> None:
        super().__init__(consumer, condition=condition, variant=variant)
        self.topic        = ELICITATION_TOPICS[variant]
        self.with_cues    = (condition == "cues")
        self.backchannels = ElicitationBackchannels(self)
        self.cues         = [QuietPrompt(self), self.backchannels]
        if self.with_cues: self.cues += [BackToListening(self)]

        # Every reply to finished speech is checked first (each check runs in the conditions its switch lists)
        self.reply_gate = ReplyGate(
            self,
            checks       = (TurnEndCheck(self, ELICITATION_TURN_END_NOTES), MisheardCheck(self)),
            backchannels = self.backchannels,
            hold_sec     = ELICITATION_HOLD_SEC,
        )

    # The connection is ready: set the avatar up (with the signs' sounds when they are on), and open the chat
    async def start(self) -> None:
        await send_avatar_setup(self.consumer, setup_for(self.with_cues, await self.backchannels.sounds()))
        if self.with_cues: await send_avatar_plan(self.consumer, start_plan())
        self.request_turn()

    # --------------------------------------------------------------------------------
    # Replies
    # --------------------------------------------------------------------------------
    # Open with the topic's question, then answer each turn through the reply gate
    async def generate(self, attempt: TurnAttempt) -> ResponseOutcome:
        # Scripted opening question (it starts the first thread)
        if not attempt.context: return self._outcome(self.topic.opening, "smile", ElicitationState())

        # The reply waits while the user seems mid-thought, or gives way to a question about a misheard word
        return await self.reply_gate.run(attempt, self._reply, self._clarify)

    # Answer the turn with one call, digging into the current thread until it runs dry
    async def _reply(self, attempt: TurnAttempt) -> ElicitationOutcome:
        # With cues, the avatar thinks while it works out the reply
        # (published from here, not from a cue, so it always goes out before the reply's own plan)
        if self.with_cues: await attempt.publish_plan(thinking_plan(self.turn_number))

        # What code asks of the reply, and whether it may change direction
        directive = directive_for(attempt.user_text, self.state.short_answers)
        angles    = offer_angles(self.state.follow_ups, directive)

        # Answer the turn (a failed call says the scripted line, which asks them to say more)
        started = time.monotonic()
        try: turn = await get_elicitation_api().reply(self.topic, prepare_LLM_messages(attempt.context), directive, angles)
        except ElicitationAPIError:
            logger.exception(f"{LLM_MAIN}[Elicitation] The reply call failed; asking the user to say more.{RESET}")
            return self._outcome(MSG_SAY_MORE, "curious", _next_state(self.state, directive, "follow_up"))

        _log_turn(turn, directive, angles, time.monotonic() - started)
        return self._outcome(turn.message, turn.behavior, _next_state(self.state, directive, turn.move))

    # Ask about a word the reply check thinks was misheard (the thread stays where it was)
    def _clarify(self, message: str) -> ElicitationOutcome:
        return self._outcome(message, "curious", self.state)

    # The outcome for a reply: the state it leaves, and its avatar plan (with cues)
    def _outcome(self, message: str, behavior: Behavior, state: ElicitationState) -> ElicitationOutcome:
        plan = reply_plan(self.turn_number, behavior) if self.with_cues else None
        return ElicitationOutcome(message=message, state=state, avatar_plan=plan, behavior=behavior)


# The conversation once a reply is saved: a new angle starts a fresh thread, and short answers add up until a longer one
def _next_state(state: ElicitationState, directive: Directive | None, move: ReplyMove) -> ElicitationState:
    if move == "new_angle": return ElicitationState()
    if   directive == "quiet":                        short_answers = state.short_answers
    elif directive in ("short_answer", "thread_dry"): short_answers = state.short_answers + 1
    else:                                             short_answers = 0
    return ElicitationState(wound_down=(move == "wind_down"), follow_ups=(state.follow_ups + 1), short_answers=short_answers)

# Log the time taken, what code asked of the reply, and what the reply decided
def _log_turn(
    turn        : ElicitationTurn,   # The reply call's response
    directive   : Directive | None,  # What code asked of the reply
    angles      : bool,              # Whether the reply was offered the fresh angles
    elapsed_sec : float,             # How long the call took
) -> None:
    logger.info(
        f"{LLM_MAIN}[Elicitation] Turn answered in ({BOLD}{elapsed_sec:.2f}s{UNBOLD}):{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Basis:    {UNBOLD}{turn.basis}{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Move:     {UNBOLD}{turn.move} (directive: {directive}, fresh angles offered: {angles}){RESET}\n"
        f"    {LLM_MAIN}{BOLD}Behavior: {UNBOLD}{turn.behavior}{RESET}"
    )
