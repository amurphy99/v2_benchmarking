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

The participant's map goes out as a `task_card` frame when the chat starts. With
the `cues` condition the avatar holds its own map, reads it while it works out
each reply, every reply carries an avatar plan showing what it did on the map
(`behaviors.py`), and the cues run (`cues.py`, and the shared `BackToListening`).
With `no_cues` no plan is sent and the avatar only idles. Admin listeners get
both maps and the avatar's path (`monitor_view`).

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
from    .cues                        import DirectionGlance, LandmarkGlance
from    .geometry                    import approach, beside, step
from    .map_task_api                import MapTaskAPIError, get_map_task_api
from    .maps                        import Point, follower_view, giver_view, load_map
from    .pipelines                   import ROUTE_PIPELINES
from    .response_models             import NO_MOVE, FollowerReply
from    .understanding               import TurnReading, read_turn

if TYPE_CHECKING:
    from ...consumers.consumers import ChatConsumer
    from  ..base                import MonitorView
    from   .response_models     import Move

# Maps a client can pick with `variant` (each one is `maps/<variant>.json`; the HCRC ones are the corpus's maps 1-4)
MAP_TASK_VARIANTS = ("demo", "hcrc_1", "hcrc_2", "hcrc_3", "hcrc_4")

# Every map, loaded and checked when the backend starts
MAP_TASK_MAPS = {variant: load_map(variant) for variant in MAP_TASK_VARIANTS}

# What the avatar says when no reply could be made (it stays where it is)
MSG_SAY_AGAIN = "Sorry, could you say that again?"


# Where the avatar is on its map, and every committed waypoint
@dataclass(frozen=True, slots=True)
class MapTaskState:
    position : Point              # Where the avatar is now
    path     : tuple[Point, ...]  # Every committed waypoint, from the start


# ================================================================================
# Map Task Harness
# ================================================================================
# Follow the user's directions on the avatar's map, one turn at a time
class MapTaskHarness(ChatHarness):
    NAME       = "map_task"
    CONDITIONS = ("cues", "no_cues")
    VARIANTS   = MAP_TASK_VARIANTS

    # The chat starts with the user's first direction, not an opener line
    CONTEXT_OPENER = None

    # Where the avatar is (each saved reply that moves it replaces this)
    state : MapTaskState

    # --------------------------------------------------------------------------------
    # Load this connection's map, put the avatar at its start, and build its cues
    # --------------------------------------------------------------------------------
    def __init__(self, consumer: ChatConsumer, *, condition: str, variant: str) -> None:
        super().__init__(consumer, condition=condition, variant=variant)
        self.task_map  = MAP_TASK_MAPS[variant]
        self.state     = MapTaskState(position=self.task_map.start, path=(self.task_map.start,))
        self.with_cues = (condition == "cues")
        if self.with_cues: self.cues = [BackToListening(self), LandmarkGlance(self), DirectionGlance(self)]

    # The connection is ready: set the avatar up, and show the participant their map
    async def start(self) -> None:
        await send_avatar_setup(self.consumer, setup_for(self.with_cues))
        if self.with_cues: await send_avatar_plan(self.consumer, start_plan())
        await self.consumer.send_json({"type": "task_card", "data": {"kind": "map_task", **giver_view(self.task_map)}})

    # --------------------------------------------------------------------------------
    # Read the turn against the map, reply through its route's pipeline, and propose the move
    # --------------------------------------------------------------------------------
    async def generate(self, attempt: TurnAttempt) -> ResponseOutcome:
        started  = time.monotonic()
        reading  = read_turn(attempt.user_text, self.task_map, self.state.position, path=self.state.path)
        pipeline = ROUTE_PIPELINES[reading.route]

        # With cues, the avatar raises its map and reads it while it works out the reply
        # (published from here, not from a cue, so it always goes out before the reply's own plan)
        if self.with_cues: await attempt.publish_plan(thinking_plan(self.turn_number, reading))

        # A failed call gets the scripted line and no move (see this directory's README)
        try: reply = await pipeline(get_map_task_api(), reading, prepare_LLM_messages(attempt.context))
        except MapTaskAPIError:
            logger.exception(f"{LLM_MAIN}[Map Task] The {pipeline.__name__} pipeline failed; asking the user to say it again.{RESET}")
            return self._outcome(reading, FollowerReply(message=MSG_SAY_AGAIN, act="clarify", move=NO_MOVE, basis="Every call failed."), ())

        # Propose where the move takes the avatar
        path     = self._movement_path(reply.move)
        position = path[-1] if path else self.state.position
        _log_turn(reading, pipeline.__name__, reply, position, time.monotonic() - started)
        return self._outcome(reading, reply, path)

    # Propose the full path, including loops that return to their starting point
    def _outcome(self, reading: TurnReading, reply: FollowerReply, path: tuple[Point, ...]) -> ResponseOutcome:
        plan  = reply_plan(self.turn_number, reading, reply, self.state.position, path) if self.with_cues else None
        state = MapTaskState(position=path[-1], path=(*self.state.path, *path)) if path else None
        return ResponseOutcome(message=reply.message, state=state, avatar_plan=plan)

    # Resolve a move to its actual waypoints, removing only consecutive repeated points
    def _movement_path(self, move: Move) -> tuple[Point, ...]:
        if move.kind == "stay": return ()
        if move.kind == "path": points = move.points
        elif move.kind == "direction":
            points = [step(self.state.position, move.direction, move.size, self.task_map.scale)]
        else:
            landmark = self.task_map.landmarks[move.landmark]
            target   = approach(self.state.position, landmark, self.task_map.scale) if (move.side == "at") else beside(landmark, move.side, self.task_map.scale)
            points   = [target]

        path, previous = [], self.state.position
        for point in points:
            if point != previous: path.append(point)
            previous = point
        return tuple(path)

    # --------------------------------------------------------------------------------
    # Monitoring
    # --------------------------------------------------------------------------------
    # The admin listener's view: both maps, the avatar's spot, and every committed waypoint
    def monitor_view(self) -> MonitorView:
        return {
            "kind"     : "map_task",
            "giver"    : giver_view(self.task_map),
            "follower" : follower_view(self.task_map),
            "position" : list(self.state.position),
            "path"     : [list(point) for point in self.state.path],
        }


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
