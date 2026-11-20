"""
The Map Task chat type: the avatar follows the user's directions on its own map.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.map_task.harness`

The user is the instruction giver and the avatar is the follower. Each turn is
read in code against the avatar's map (`understanding.py`), the pipeline its
route picks writes the reply (`pipelines.py`), and the move that reply carries
is applied in code (`geometry.py`). The new position takes effect only once the
reply is saved, so a reply cut off by newer speech never moves the avatar. Each
saved reply is also recorded for the task history: the kind of turn it answered,
what it did, and how far it moved. See this directory's README for the map files
and the turn flow.

Every reply to finished speech goes through the reply gate
(`features/reply_gate/`), which holds it while the user seems mid-direction, or
asks about a likely misheard landmark name instead, in the conditions those
checks run in.

The participant's map goes out as a `task_card` frame when the chat starts. With
the `cues` condition the avatar holds its own map, reads it while it works out
each reply, every reply carries an avatar plan showing what it did on the map
(`behaviors.py`), and the cues run (`cues.py`, and the shared `BackToListening`),
including signs of listening at the user's pauses. With `no_cues` no plan is
sent and the avatar only idles. Admin listeners get both maps and the avatar's
path (`monitor_view`), and once the chat ends the participant's client is shown
the avatar's map and the path it took (`reveal_view`).

"""
from __future__  import annotations
from dataclasses import asdict, dataclass
from functools   import partial
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
from    .config                      import MAP_TASK_HOLD_SEC
from    .cues                        import DirectionGlance, LandmarkGlance, MapTaskBackchannels
from    .geometry                    import approach, beside, step
from    .map_task_api                import MapTaskAPIError, get_map_task_api
from    .maps                        import Point, follower_view, giver_view, load_map
from    .pipelines                   import ROUTE_PIPELINES
from    .prompts                     import MAP_TASK_TURN_END_NOTES, misheard_notes
from    .response_models             import NO_MOVE, FollowerReply
from    .understanding               import TurnReading, read_turn

if TYPE_CHECKING:
    from ...consumers.consumers import ChatConsumer
    from  ..base                import MonitorView, RevealView
    from   .response_models     import FollowerAct, Move
    from   .understanding       import Route

# Maps a client can pick with `variant` (each one is `maps/<variant>.json`; the HCRC ones are the corpus's maps 1-4)
MAP_TASK_VARIANTS = ("demo", "hcrc_1", "hcrc_2", "hcrc_3", "hcrc_4")

# Every map, loaded and checked when the backend starts
MAP_TASK_MAPS = {variant: load_map(variant) for variant in MAP_TASK_VARIANTS}

# What the avatar says when no reply could be made (it stays where it is)
MSG_SAY_AGAIN = "Sorry, could you say that again?"


# One saved reply, for the task history: the kind of turn it answered, what it did, and how far it moved
@dataclass(frozen=True, slots=True)
class MapTaskReply:
    route     : Route        # Which kind of turn the user's words were read as
    act       : FollowerAct  # What the reply did
    waypoints : int          # Waypoints its move added to the path (0 when the avatar stayed put)

# Where the avatar is on its map, every committed waypoint, and every saved reply
@dataclass(frozen=True, slots=True)
class MapTaskState:
    position : Point                          # Where the avatar is now
    path     : tuple[Point,        ...]       # Every committed waypoint, from the start
    replies  : tuple[MapTaskReply, ...] = ()  # Every saved reply, in order


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

    # Where the avatar is, and the replies so far (each saved reply replaces this)
    state : MapTaskState

    # --------------------------------------------------------------------------------
    # Load this connection's map, put the avatar at its start, and build its cues, its reply gate, and their switches
    # --------------------------------------------------------------------------------
    def __init__(self, consumer: ChatConsumer, *, condition: str, variant: str) -> None:
        super().__init__(consumer, condition=condition, variant=variant)
        self.task_map     = MAP_TASK_MAPS[variant]
        self.state        = MapTaskState(position=self.task_map.start, path=(self.task_map.start,))
        self.with_cues    = (condition == "cues")
        self.backchannels = MapTaskBackchannels(self)
        self.cues         = [self.backchannels]
        if self.with_cues: self.cues += [BackToListening(self), LandmarkGlance(self), DirectionGlance(self)]

        # Every reply to finished speech is checked first (each check runs in the conditions its switch lists)
        self.reply_gate = ReplyGate(
            self,
            checks       = (TurnEndCheck(self, MAP_TASK_TURN_END_NOTES), MisheardCheck(self, misheard_notes(self.task_map))),
            backchannels = self.backchannels,
            hold_sec     = MAP_TASK_HOLD_SEC,
        )

        # The shared features a command can switch partway through the chat, by name
        self.features = {feature.NAME: feature for feature in (self.backchannels, *self.reply_gate.checks)}

    # The connection is ready: set the avatar up (with the signs' sound, even while they are off), and show the participant their map
    async def start(self) -> None:
        await send_avatar_setup(self.consumer, setup_for(self.with_cues, await self.backchannels.sounds()))
        if self.with_cues: await send_avatar_plan(self.consumer, start_plan())
        await self.consumer.send_json({"type": "task_card", "data": {"kind": "map_task", **giver_view(self.task_map)}})

    # --------------------------------------------------------------------------------
    # Read the turn against the map, then reply through the reply gate
    # --------------------------------------------------------------------------------
    async def generate(self, attempt: TurnAttempt) -> ResponseOutcome:
        reading = read_turn(attempt.user_text, self.task_map, self.state.position, path=self.state.path)

        # The reply waits while the user seems mid-direction, or gives way to a question about a misheard name
        return await self.reply_gate.run(attempt, partial(self._reply, reading=reading), partial(self._clarify, reading))

    # Reply through the pipeline the turn's route picks, and propose the move
    async def _reply(self, attempt: TurnAttempt, reading: TurnReading) -> ResponseOutcome:
        started  = time.monotonic()
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

    # Ask about a landmark name the reply check thinks was misheard (the avatar stays where it is)
    def _clarify(self, reading: TurnReading, message: str) -> ResponseOutcome:
        return self._outcome(reading, FollowerReply(message=message, act="clarify", move=NO_MOVE, basis="The reply check heard a likely misheard word."), ())

    # Propose the full path, including loops that return to their starting point, with the reply added to the record
    def _outcome(self, reading: TurnReading, reply: FollowerReply, path: tuple[Point, ...]) -> ResponseOutcome:
        plan  = reply_plan(self.turn_number, reading, reply, self.state.position, path) if self.with_cues else None
        state = MapTaskState(
            position = path[-1] if path else self.state.position,
            path     = (*self.state.path, *path),
            replies  = (*self.state.replies, MapTaskReply(route=reading.route, act=reply.act, waypoints=len(path))),
        )
        return ResponseOutcome(message=reply.message, state=state, avatar_plan=plan, task_snapshot=self.history_view(state))

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
    # Task Views
    # --------------------------------------------------------------------------------
    # The admin listener's view: both maps, the avatar's spot, every committed waypoint, and every saved reply
    def monitor_view(self) -> MonitorView:
        return self.history_view()

    # Freeze both maps, the proposed or current path, and the replies for later review
    def history_view(self, state: MapTaskState | None = None) -> dict[str, object]:
        saved = self.state if (state is None) else state
        return {
            "kind"     : "map_task",
            "giver"    : giver_view(self.task_map),
            "follower" : follower_view(self.task_map),
            "position" : list(saved.position),
            "path"     : [list(point) for point in saved.path],
            "replies"  : [asdict(reply) for reply in saved.replies],
        }

    # What the participant is shown once the chat ends: the avatar's map, and the path it took
    def reveal_view(self) -> RevealView:
        return {"kind": "map_task", **follower_view(self.task_map), "path": [list(point) for point in self.state.path]}


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
