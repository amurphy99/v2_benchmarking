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

The harness keeps the avatar's map as coordinates, and where the avatar is on it. Code works
out what the map says about each turn, so the LLM only has to understand the giver and word
the reply. It never sees a coordinate.

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
    -> FollowerReply: the words, what they do (act), and the move

    MOVE (geometry.py)
    -> to a landmark (on it, or just above, below, left of, or right of it),
       or one direction by a small, medium, or large step, stopping at the map's edge
    -> proposed in ResponseOutcome.state, and entered only once the reply is saved
```

Newer speech can cancel a reply at any point, like in every chat type. The move is entered
only when the reply's exchange is saved, so the avatar never moves for a reply the user never
heard. A reply that stays where it is proposes no new state.

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

Each variant is one file, `maps/<variant>.json`, listed in `MAP_TASK_VARIANTS` in
`harness.py`. The first one listed is the default. Every file is loaded and checked when the
backend starts, so a broken file stops startup with the file and the field at fault.

```json
{
    "description": "Where the map comes from",
    "follower": {
        "start": [0.30, 0.66],
        "landmarks": [
            {"id": "lake", "label": "lake", "at": [0.84, 0.16], "also_called": ["pond"], "radius": 0.07},
            {"id": "bus",  "label": "bus",  "at": [0.74, 0.66]}
        ]
    },
    "giver": {
        "image": null,
        "landmark_names": ["lake", "bus", "castle"],
        "route": [[0.30, 0.66], [0.66, 0.60]]
    }
}
```

| Field | What it is |
|---|---|
| `follower.start` | Where the avatar starts |
| `follower.landmarks[].id` | Stable id the moves (and later the cues) use: lowercase letters, digits, and underscores |
| `follower.landmarks[].label` | What the avatar calls it ("rope bridge") |
| `follower.landmarks[].at` | Its center |
| `follower.landmarks[].also_called` | Optional. Other names the giver might use: a head noun ("bridge" for "rope bridge"), a synonym, a likely speech-recognition spelling |
| `follower.landmarks[].radius` | Optional. How far it reaches from its center (default `0.04`). Distances are measured to this edge, so a lake is reached before its middle |
| `giver.image` | The participant's map picture, a file in `frontend/public/map_task/` (`null` until there is one) |
| `giver.landmark_names` | Every landmark name on the participant's map. Names only the giver has are what make a turn a mismatch |
| `giver.route` | Optional. The route on the participant's map, for scoring later |

**Points** are `[x, y]`, each from 0 to 1, measured across and down from the top-left corner
of the avatar's map. Up is a smaller `y`. This is the frame avatar gaze plans use
(`backend/chat_app/websocket/consumers/HARNESS_PROTOCOL.md` §8.2), so a plan can look at a landmark
with no conversion.

Names are matched as whole words, ignoring case, longest first ("rope bridge" before
"bridge"). A plural `s` or `es` is matched without listing it.

**Entering an HCRC map by hand.** The corpus has the map images and landmark names, but no
coordinates. For each landmark on the follower's map, measure its center as a fraction of
the image's width and height, and give big landmarks a `radius`. List every name on the
giver's map in `landmark_names`, including the ones the follower doesn't have. Then add the
variant to `MAP_TASK_VARIANTS`.

`demo.json` is made up for testing: it is the avatar demo page's map, plus a castle only the
giver has.

<br>

<!-- -------------------------------------------------------------------------------- -->
<!-- Files                                                                            -->
<!-- -------------------------------------------------------------------------------- -->
## Files

```diff
+map_task/
 ├── harness.py               # MapTaskHarness: reads each turn, replies through its route's pipeline, proposes the move
 ├── maps.py                  # Loads and checks the map files; Landmark, TaskMap, and the names to listen for
+├── maps/
 │   └── demo.json            # A made-up test map
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

- **Conditions and cues.** No cues yet, so the chat type takes no `condition`. The first two
  planned are a direction gaze (look toward "up", "left", ... as the word is heard) and a
  landmark gaze (look at a landmark the moment it is named, or search when it isn't there).
- **The giver's map on screen.** The chat page can pick `map_task`, but shows only what to do
  with the paper map: the map files have no picture yet, and nothing sends one.
- **Avatar plans.** The backend can send plans and the chat page runs them
  (`consumers/HARNESS_PROTOCOL.md`; the cooperative planning harness is the working example),
  but the Map Task sends no setup or plans yet, so its avatar never holds the map.
- **Scoring** the avatar's path against `giver.route`.
