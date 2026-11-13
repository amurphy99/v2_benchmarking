"""
The speech elicitation chat type: one light question, then keep the user talking.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.speech_elicitation.harness`

The avatar opens with the topic's question (`topics.py`), and every reply after
it reacts to what the user said and ends with a question of its own, so the turn
always goes back to them (`prompts.py`; the response schema refuses a reply that
doesn't). Code tells the reply when the conversation is flagging: after a very
short answer, or when the user has gone quiet (`QuietPrompt`, in both
conditions). There is nothing to finish: the participant ends the chat from the
client when they feel done. When they say so out loud, the avatar thanks them,
asks nothing, and stops speaking up after silences.

With the `cues` condition the client's automatic looks run, every reply carries
an avatar plan for the behavior it picked (`behaviors.py`), and the avatar nods
along while the user talks (`cues.py`). With `no_cues` the reply still picks a
behavior (it's logged), but no plan is sent and the avatar only idles.

A reply call that fails every attempt gets a scripted line that asks the user
to say more.

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
from    .behaviors                   import reply_plan, setup_for, start_plan, thinking_plan
from    .cues                        import ListeningNods, QuietPrompt
from    .elicitation_api             import ElicitationAPIError, get_elicitation_api
from    .prompts                     import directive_for
from    .topics                      import ELICITATION_TOPICS, ELICITATION_VARIANTS

if TYPE_CHECKING:
    from ...consumers.consumers import ChatConsumer
    from   .response_models     import Behavior, ElicitationTurn

# What the avatar says when no reply could be made (it still hands the turn back with a question)
MSG_SAY_MORE = "Sorry, I lost my train of thought for a second. Could you tell me a little more about that?"


# Whether the user has said they want to stop (the avatar then stops speaking up after silences)
@dataclass(frozen=True, slots=True)
class ElicitationState:
    wound_down : bool = False


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

    # Load this connection's topic, and build its cues
    def __init__(self, consumer: ChatConsumer, *, condition: str, variant: str) -> None:
        super().__init__(consumer, condition=condition, variant=variant)
        self.topic     = ELICITATION_TOPICS[variant]
        self.with_cues = (condition == "cues")
        self.cues      = [QuietPrompt(self)]
        if self.with_cues: self.cues += [BackToListening(self), ListeningNods(self)]

    # The connection is ready: set the avatar up, and open the chat
    async def start(self) -> None:
        await send_avatar_setup(self.consumer, setup_for(self.with_cues))
        if self.with_cues: await send_avatar_plan(self.consumer, start_plan())
        self.request_turn()

    # --------------------------------------------------------------------------------
    # Open with the topic's question, then answer each turn with one call
    # --------------------------------------------------------------------------------
    async def generate(self, attempt: TurnAttempt) -> ResponseOutcome:
        # Scripted opening question
        if not attempt.context: return self._outcome(self.topic.opening, "smile", wound_down=False)

        # With cues, the avatar thinks while it works out the reply
        # (published from here, not from a cue, so it always goes out before the reply's own plan)
        if self.with_cues: await attempt.publish_plan(thinking_plan(self.turn_number))

        # Answer the turn (a failed call says the scripted line, which asks them to say more)
        started   = time.monotonic()
        directive = directive_for(attempt.user_text)
        try: turn = await get_elicitation_api().reply(self.topic, prepare_LLM_messages(attempt.context), directive)
        except ElicitationAPIError:
            logger.exception(f"{LLM_MAIN}[Elicitation] The reply call failed; asking the user to say more.{RESET}")
            return self._outcome(MSG_SAY_MORE, "curious", wound_down=False)

        _log_turn(turn, directive, time.monotonic() - started)
        return self._outcome(turn.message, turn.behavior, wound_down=(turn.move == "wind_down"))

    # The outcome for a reply: its avatar plan (with cues), and whether the user wants to stop
    def _outcome(self, message: str, behavior: Behavior, *, wound_down: bool) -> ElicitationOutcome:
        plan = reply_plan(self.turn_number, behavior) if self.with_cues else None
        return ElicitationOutcome(message=message, state=ElicitationState(wound_down=wound_down), avatar_plan=plan, behavior=behavior)


# Log the time taken, the directive, and what the reply decided
def _log_turn(turn: ElicitationTurn, directive: str | None, elapsed_sec: float) -> None:
    logger.info(
        f"{LLM_MAIN}[Elicitation] Turn answered in ({BOLD}{elapsed_sec:.2f}s{UNBOLD}):{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Basis:    {UNBOLD}{turn.basis}{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Move:     {UNBOLD}{turn.move} (directive: {directive}){RESET}\n"
        f"    {LLM_MAIN}{BOLD}Behavior: {UNBOLD}{turn.behavior}{RESET}"
    )
