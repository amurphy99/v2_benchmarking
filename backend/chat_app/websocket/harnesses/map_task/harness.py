"""
The Map Task chat type: the avatar follows the user's directions on its own map.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.map_task.harness`

The user is the instruction giver and the avatar is the follower. Each turn is
read in code against the avatar's map (`understanding.py`), the pipeline its
route picks writes the reply (`pipelines.py`), and the move that reply carries
is applied in code (`geometry.py`). The new position takes effect only once the
reply is saved, so a reply cut off by newer speech never moves the avatar. See
this directory's README for the map files and the turn flow.

"""
from __future__  import annotations
from dataclasses import dataclass
from typing      import TYPE_CHECKING

import logging, time
logger = logging.getLogger(__name__)

# From this project
from ....services.llm.chat_utilities import prepare_LLM_messages
from ....services.logging_utils      import RESET, BOLD, UNBOLD, LLM_MAIN
from   ..base                        import ChatHarness, ResponseOutcome, TurnAttempt
from    .geometry                    import beside, step
from    .map_task_api                import MapTaskAPIError, get_map_task_api
from    .maps                        import Point, load_map
from    .pipelines                   import ROUTE_PIPELINES
from    .understanding               import TurnReading, read_turn

if TYPE_CHECKING:
    from ...consumers.consumers import ChatConsumer
    from   .response_models     import FollowerReply, Move

# Maps a client can pick with `variant` (each one is `maps/<variant>.json`)
MAP_TASK_VARIANTS = ("demo",)

# Every map, loaded and checked when the backend starts
MAP_TASK_MAPS = {variant: load_map(variant) for variant in MAP_TASK_VARIANTS}

# What the avatar says when no reply could be made (it stays where it is)
MSG_SAY_AGAIN = "Sorry, could you say that again?"


# Where the avatar is on its map, and every spot it has stopped at
@dataclass(frozen=True, slots=True)
class MapTaskState:
    position : Point              # Where the avatar is now
    path     : tuple[Point, ...]  # Every spot it has stopped at, from the start


# ================================================================================
# Map Task Harness
# ================================================================================
# Follow the user's directions on the avatar's map, one turn at a time
class MapTaskHarness(ChatHarness):
    NAME     = "map_task"
    VARIANTS = MAP_TASK_VARIANTS

    # The chat starts with the user's first direction, not an opener line
    CONTEXT_OPENER = None

    # Where the avatar is (each saved reply that moves it replaces this)
    state : MapTaskState

    # --------------------------------------------------------------------------------
    # Load this connection's map and put the avatar at its start
    # --------------------------------------------------------------------------------
    def __init__(self, consumer: ChatConsumer, *, condition: str, variant: str) -> None:
        super().__init__(consumer, condition=condition, variant=variant)
        self.task_map = MAP_TASK_MAPS[variant]
        self.state    = MapTaskState(position=self.task_map.start, path=(self.task_map.start,))

    # --------------------------------------------------------------------------------
    # Read the turn against the map, reply through its route's pipeline, and propose the move
    # --------------------------------------------------------------------------------
    async def generate(self, attempt: TurnAttempt) -> ResponseOutcome:
        started  = time.monotonic()
        reading  = read_turn(attempt.user_text, self.task_map, self.state.position)
        pipeline = ROUTE_PIPELINES[reading.route]

        # A failed call gets the scripted line and no move (see this directory's README)
        try: reply = await pipeline(get_map_task_api(), reading, prepare_LLM_messages(attempt.context))
        except MapTaskAPIError:
            logger.exception(f"{LLM_MAIN}[Map Task] The {pipeline.__name__} pipeline failed; asking the user to say it again.{RESET}")
            return ResponseOutcome(message=MSG_SAY_AGAIN)

        # Propose where the move takes the avatar (a reply that stays keeps the current state)
        position = self._destination(reply.move)
        _log_turn(reading, pipeline.__name__, reply, position, time.monotonic() - started)
        if reply.move.kind == "stay": return ResponseOutcome(message=reply.message)
        return ResponseOutcome(message=reply.message, state=MapTaskState(position=position, path=(*self.state.path, position)))

    # --------------------------------------------------------------------------------
    # Where a move takes the avatar from its current spot
    # --------------------------------------------------------------------------------
    def _destination(self, move: Move) -> Point:
        if   move.kind == "to_landmark" : return beside(self.task_map.landmarks[move.landmark], move.side)
        elif move.kind == "direction"   : return   step(self.state.position, move.direction, move.size)
        else:                             return        self.state.position


# --------------------------------------------------------------------------------
# Log one turn
# --------------------------------------------------------------------------------
# Log its route, pipeline, and time taken, then what the reply did & where it goes
def _log_turn(
    reading       : TurnReading,    # The turn as read against the map
    pipeline_name : str,            # Pipeline that replied
    reply         : FollowerReply,  # What it replied
    position      : Point,          # Where the move takes the avatar
    elapsed_sec   : float,          # Time from reading the turn to the reply
) -> None:
    named = ", ".join(mention.name for mention in reading.mentions) or "nothing"
    logger.info(
        f"{LLM_MAIN}[Map Task] {BOLD}{reading.route}{UNBOLD} turn replied by {BOLD}{pipeline_name}{UNBOLD} in ({BOLD}{elapsed_sec:.2f}s{UNBOLD}):{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Named: {UNBOLD}{named} (not on the map: {', '.join(reading.missing) or 'none'}){RESET}\n"
        f"    {LLM_MAIN}{BOLD}Basis: {UNBOLD}{reply.basis}{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Act:   {UNBOLD}{reply.act}{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Move:  {UNBOLD}{reply.move.model_dump_json()}, to ({position[0]:.2f}, {position[1]:.2f}){RESET}"
    )
