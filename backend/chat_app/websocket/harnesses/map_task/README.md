# Speech System // Map Task <br> `backend/chat_app/websocket/harnesses/map_task/..`

The Map Task is a game for two people with slightly different maps. The participant is the
**instruction giver**: their map has a route drawn on it, and they describe it. The avatar is
the **instruction follower**: it has its own map, where some landmarks are missing, extra, or
in a different place. It follows the directions, answers questions about its map, and says
when something doesn't match ("No, but I have a bus in the top right corner").

A client picks it with the `chat_type` query parameter, and the map with `variant`
(`CLIENT_PROTOCOL.md` §1):

```text
wss://<host>/ws/chat/?token=<access token>&source=webapp&chat_type=map_task&variant=demo
```

Both maps come from one hand-written file per variant: every landmark at an x,y spot, with a
picture and a name, and which map has it. The participant's map is drawn from it on the chat
page, and the harness keeps the avatar's map as coordinates, and where the avatar is on it.
Code describes the map for each turn. The LLM also receives its own position, landmark
centers and radii, paper proportions, and recent committed trail so it can draw paths through
open space. It never receives the giver's route or landmark coordinates.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Turn Flow                                                                        -->
<!-- -------------------------------------------------------------------------------- -->
## Turn flow

```text
finalized user text
    READ THE TURN (understanding.py, code only)
    -> spot landmark names: ones on the avatar's map, and ones only the giver's map has
    -> spot a question ("do you have", "is there", "where is", a "?") and move verbs
    -> describe every landmark from the avatar's spot: direction, distance, part of the map
    -> pick the route: simple_question, instruction, mismatch, or other

    REPLY (pipelines.py, the pipeline ROUTE_PIPELINES gives the route)
    -> with cues, the avatar raises its map and reads it while this runs
    -> FollowerReply: the words, what they do (act), and the move
    -> with cues, the reply carries a plan showing what it did on the map

    MOVE (geometry.py)
    -> to a landmark's nearest edge (or above, below, left of, or right of it),
       one direction by a small, medium, or large step, or a path through open space
    -> proposed in ResponseOutcome.state, and entered only once the reply is saved
```

Newer speech can cancel a reply at any point, like in every chat type. The move is entered
only when the reply's exchange is saved, so the avatar never moves for a reply the user never
heard. Consecutive repeated points are removed. A path that never leaves the current spot
proposes no new state; a loop returning to its start still records all its bends.

`path` moves carry 1–32 normalized `[x, y]` waypoints, excluding the current position.
The response schema rejects empty paths, nonfinite coordinates, and points outside the
paper. Every bend is kept in the committed trail, the avatar's gaze trace, and the admin
monitor. For example, “right a little, then up a little” traces two legs instead of a
diagonal jump. The prompt asks for multiple points around a landmark and clearance from
its radius; there is no automatic obstacle avoidance or collision correction. Interpreting
spoken directions and choosing those points remains the model's responsibility.

Each turn logs one block: its route, the pipeline, the time taken, the names heard, the
reply's reason and act, and the move with the spot it reaches.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Routes and Pipelines                                                             -->
<!-- -------------------------------------------------------------------------------- -->
## Routes and pipelines

| Route | When | Pipeline |
|---|---|---|
| `mismatch` | The giver named a landmark the avatar's map doesn't have | `assess_then_reply` |
| `simple_question` | A question about exactly one landmark the avatar has, with no move verb | `draft_and_check` |
| `instruction` | A move verb, or any landmark named | `single_call` |
| `other` | Anything else ("okay", "right") | `single_call` |

The routes are checked in that order. Every pipeline takes the same inputs and returns a
`FollowerReply`, so changing which pipeline a route uses is a one-line edit to
`ROUTE_PIPELINES` in `pipelines.py`:

- **`draft_and_check`**: code drafts the answer from the map ("Yes, I have the bus, a long
  way to my right." or "The bus is a long way to my right."), and one short call confirms it
  or writes a correction. It never moves the avatar.
- **`single_call`**: one call writes the reply and picks the move.
- **`assess_then_reply`**: one call works out what the giver means, what doesn't match, and
  the move; a second call writes the reply from that assessment. It takes longer, which is
  why it is kept for mismatches.

Each call gets the follower instructions, its own task, and the map facts for this turn
(`prompts.py`). Every landmark is listed with its id, other names, direction and distance
from the avatar, and the part of the map it is in, with the ones just named first. Names the
avatar's map lacks are listed separately.
The last eight committed points establish the direction for “keep going”; without an
established direction the follower is instructed to ask. Questions and clarification replies
are instructed to stay put. Coordinates are internal and are never read aloud.

Each call's temperature and whether it lets the model think first are set in this directory's `config.py`
(`MAP_TASK_*_TEMP`, `MAP_TASK_*_THINKING`). Thinking is on only for the mismatch assessment.

A move's landmark can only be one of this map's ids: `response_models.models_for_map` builds
the move-carrying responses once per map, and the endpoint decodes against that schema. In
instructor's JSON_SCHEMA mode the model never sees the schema's field descriptions, so each
task in `prompts.py` describes the fields it fills in.

**When a call fails.** If a call still fails after its retries (`MapTaskAPIError`), the
avatar says "Sorry, could you say that again?" and stays where it is. Each failed attempt
logs a warning, and the final failure logs once with its traceback.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Map Files                                                                        -->
<!-- -------------------------------------------------------------------------------- -->
## Map files

Each variant is one file, `maps/<variant>.json`. Clients can pick it once its name is in
`MAP_TASK_VARIANTS`, both in `harness.py` and in `frontend/src/pages/chat/chatModes.ts` (the
chat page's copy). The first one listed is the default. Every listed file is loaded and
checked when the backend starts, so a broken file stops startup with the file and the field
at fault.

A file lists every landmark once, with the maps that have it. The route runs from the start
(on both maps) to the finish (only on the participant's).

```json
{
    "description": "Where the map comes from",
    "shape": "portrait",
    "route": [[0.30, 0.66], [0.66, 0.60], [0.36, 0.30], [0.14, 0.22]],
    "landmarks": [
        {"id": "bridge", "label": "bridge", "icon": "rope_bridge", "at": [0.14, 0.14], "also_called": ["rope bridge"]},
        {"id": "lake",   "label": "lake",   "icon": "lake",        "at": [0.84, 0.16], "radius": 0.07, "on": "follower"},
        {"id": "castle", "label": "castle", "icon": "castle",      "at": [0.40, 0.16], "on": "giver"},
        {"id": "tree",   "label": "tree",   "icon": "tree",        "at": [0.36, 0.86], "follower": {"at": [0.48, 0.88]}},
        {"id": "mill",   "label": "old mill", "icon": "windmill",  "at": [0.70, 0.30], "follower": {"label": "windmill"}}
    ]
}
```

| Field | What it is |
|---|---|
| `description` | Where the map comes from (credit the source here) |
| `shape` | Optional. The paper: `"landscape"` (the default, 210 wide by 148 tall, like the avatar's held map) or `"portrait"` (148 by 210, like the HCRC maps) |
| `route` | The route on the participant's map, at least two points: the first is the start (on both maps, and where the avatar starts), the last is the finish. Clients join the points with straight segments, so trace every bend and sample curves with enough points |
| `landmarks[].id` | Stable id the moves and the cues use: lowercase letters, digits, and underscores. It names the same landmark on both maps |
| `landmarks[].label` | What the participant's map calls it, written under its picture ("rope bridge") |
| `landmarks[].icon` | Its picture: one of the names in `map_icons.py` |
| `landmarks[].at` | Its center |
| `landmarks[].also_called` | Optional. Other names the participant might use: a head noun ("bridge" for "rope bridge"), a synonym, a likely speech-recognition spelling |
| `landmarks[].radius` | Optional. How far it reaches from its center, in lengths of the paper's longer side (default `0.04`). Distances and `to_landmark` moves with side `at` reach this edge. The shaded circular footprint is drawn at this exact radius, independently of the symbol's size |
| `landmarks[].on` | Optional. `"both"` (the default), `"giver"` (only the participant's map), or `"follower"` (only the avatar's) |
| `landmarks[].follower` | Optional, for a landmark on both maps. What is different on the avatar's copy: `at` (somewhere else), `label` (called something else), or `also_called`. A new `label` drops the participant's `also_called` unless it gives its own |

**Points** are `[x, y]`, each from 0 to 1, measured across and down from the top-left corner
of the paper. Up is a smaller `y`. This is the frame avatar gaze plans use
(`consumers/HARNESS_PROTOCOL.md` §8.2), so a plan can look at a landmark with no conversion.
**Distances and directions** are measured in the paper's real proportions, in map units where
1 is the paper's longer side (`TaskMap.scale`, `geometry.py`): a step up is as long as a step
right, on wide and tall maps alike.

Names are matched as whole words, ignoring case, longest first ("rope bridge" before
"bridge"). A plural `s` or `es` is matched without listing it. Every name on either map is
listened for: a name only the participant's map has (a landmark the avatar lacks, or one it
calls something else) is what makes a turn a mismatch.

**Icons.** `map_icons.py` lists every picture name a file may use (about 160: water, land,
plants, buildings, places, vehicles, animals, and things). The web app draws each with an icon
from the game-icons set (`frontend/src/components/map_task/mapTaskIcons.ts`). To add one, add
its name to both.

**Checking a map.** The staff **Map Task Maps** page (in the Monitor pages' header)
draws both maps of every file in `maps/`, rings the landmarks that differ, and lists the
differences. The backend reads the files fresh for it (`maps.map_file_previews`, behind
`/api/map-task/maps/`), so saving a file and switching back to the browser shows the edit, and
a file that doesn't load shows the error that would stop startup. A file that isn't in
`MAP_TASK_VARIANTS` yet is shown too, marked as not offered to clients.

**The HCRC maps.** `hcrc_1` to `hcrc_4` are maps 1 to 4 of the HCRC Map Task Corpus
(Human Communication Research Centre, University of Edinburgh), whose maps are published under
CC BY 4.0 at https://groups.inf.ed.ac.uk/maptask/ (the giver and follower scans `map0g`/`map0f`
to `map3g`/`map3f`). They keep the corpus's portrait paper, every landmark's spot and name, the
route, and its designed differences: landmarks only one map has, landmarks named differently
on the follower's map (`white water` is `rapids`, `cliffs` is `sandstone cliffs`), and the
"2:1" landmarks the participant has twice (one by the route, one far off) while the avatar has
only the far one (`parked_van_2`, `poisoned_stream_2`, `stone_creek_2`, `wheatfields_2`). The
icons stand in for the original line drawings. Shaded circular footprints represent the
stored radii; lakes, bays, and coastlines do not reproduce the originals' irregular outlines.

They were traced from the corpus's full-size scans with scripts, not by eye: the route's thick
dashes were found and chained from the START cross to the FINISH cross, every landmark's
drawing was found as one blob of ink, the follower scan was lined up with the giver scan on
the shared landmarks, and each result was checked by drawing it back over both scans. The
scripts are in the `generation-tests` repository (`src/hcrc_maps/`), ready for maps 5 to 16.

**Entering a map by hand.** For each landmark, measure its center as a fraction of the
paper's width and height, pick the nearest icon, and give big landmarks a `radius`. Mark the
landmarks only one map has with `on`, and the ones placed or named differently with
`follower`. Trace the route as points at each bend. Then check it on the preview page, and add
the variant to `MAP_TASK_VARIANTS` here and in `chatModes.ts`.

`demo.json` is made up for testing. The avatar's map is the avatar demo page's map; the
participant's has a castle the avatar lacks, lacks the avatar's lake, and has the tree further
left.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Conditions, Plans, and Cues                                                      -->
<!-- -------------------------------------------------------------------------------- -->
## Conditions, plans, and cues

`condition` is `cues` (the default) or `no_cues`.

**With cues** the avatar holds its own map (`behaviors.py`):

- **As the chat starts,** it gets the Map Task's `avatar_setup` (its own idle glances on, the
  thinking look, speech gaze, and listening sway off) and picks up its map.
- **While a reply is worked out,** it raises the map and reads it: all over with a slight frown
  for a landmark it was asked about or doesn't have, or around its own spot for a direction.
  This plan goes out through `publish_plan`, before any LLM call.
- **Each reply's plan** shows what the reply did, as soon as its text arrives: it traces its
  move from the old spot to the new one, locks onto a landmark it found (eyes widening), or
  makes one last sweep and shakes its head for one it doesn't have. As the reply's audio
  starts, the map comes down and it looks at the user, with a nod for a direction it took or a
  raised eyebrow for a question back.
- **The cues** (`cues.py`, and the shared `BackToListening`) react while the user speaks:
  `LandmarkGlance` glances at a landmark the moment it is named (or searches the map for one
  the avatar doesn't have), and `DirectionGlance` looks from the avatar's spot toward "up",
  "down", "left", or "to the right" as it is said ("right" on its own is too often "okay" to
  count). Neither fires while a reply owns the avatar. `BackToListening` lowers the map when
  newer speech cancels a reply.

**With `no_cues`** the avatar holds no map, no plans are sent, and it only idles. Everything
else is the same: the same pipelines, the same moves, and the participant's map.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- What the Clients Get                                                             -->
<!-- -------------------------------------------------------------------------------- -->
## What the clients get

- **The participant's map,** as a `task_card` frame of kind `map_task` when the chat starts
  (`consumers/HARNESS_PROTOCOL.md` §13): their landmarks and the route. The chat page draws it
  beside the avatar (`frontend/src/pages/chat/components/MapTaskMapPanel.tsx`). The avatar's
  map never goes to the participant's client.
- **The admin live chat page,** a `task_monitor` view (`monitor_view` in `harness.py`): both
  maps, where the avatar is, and every committed waypoint. It arrives as the page
  connects and after every saved move, and shows in the side column's **Map** tab: the
  avatar's map with its path and the participant's route drawn faintly over it, the
  participant's map, and what differs between them.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Files                                                                            -->
<!-- -------------------------------------------------------------------------------- -->
## Files

```diff
+map_task/
 ├── harness.py               # MapTaskHarness: sends the maps out, reads each turn, replies through its route's pipeline, proposes the move
 ├── maps.py                  # Loads and checks the map files; Landmark, TaskMap, the names to listen for, and each map as clients draw it
 ├── map_icons.py             # Every landmark picture name a map file may use
+├── maps/
 │   ├── demo.json            # A made-up test map (landscape)
 │   └── hcrc_<n>.json        # HCRC Map Task Corpus maps 1-4 (portrait, CC BY 4.0)
 ├── behaviors.py             # The avatar's setup, its map, the plan while thinking, and each reply's plan
 ├── cues.py                  # LandmarkGlance, DirectionGlance
 ├── geometry.py              # Directions, distance bands, parts of the map, and where a move stops
 ├── understanding.py         # Reads a turn in code: names heard, question or move, the facts, and the route
 ├── pipelines.py             # draft_and_check, single_call, assess_then_reply, and ROUTE_PIPELINES
 ├── prompts.py               # The follower instructions, each call's task, and the map facts block
 ├── response_models.py       # Moves, each call's structured response, and the per-map schemas
 ├── map_task_api.py          # MapTaskAPI: one method per call, on the shared StructuredAPI
 └── config.py                # Request limits, and each call's temperature and thinking switch
```

The distances that count as "right next to", "nearby", and "far away", and the step sizes,
are constants at the top of `geometry.py`.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Not Built Yet                                                                    -->
<!-- -------------------------------------------------------------------------------- -->
## Not built yet

- **Scoring** the avatar's path against the route.
- **A per-turn research event log.** Both maps and the accumulated path are saved in
  `ChatSession.task_snapshot` with each committed reply and shown in completed-session history.
  A timeline of moves, cues, and plans is not saved yet.
- **HCRC maps 5 to 16.** Maps 1 to 4 are in; the rest of the corpus's 16 can be traced the same way.
