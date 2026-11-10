"""
Map Task maps, geometry, turn reading, and the follower's replies.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.tests.test_map_task`

Every test reads turns against the demo map (`map_task/maps/demo.json`). The LLM
client is replaced with stand-ins that return fixed structured responses, so
these tests check what code decides: which names were heard, which pipeline
replies, where the avatar ends up, and what the clients are sent (the
participant's map, the avatar's plans, and the admin listener's view).

"""
from datetime      import datetime, timezone
from pathlib       import Path
from types         import SimpleNamespace
from unittest.mock import AsyncMock, patch

import asyncio, json, math, shutil, tempfile, unittest

from pydantic import ValidationError

# From this project
from chat_app.websocket.consumers.consumers                import ChatConsumer
from chat_app.websocket.harnesses.base                     import FinalUtterance, InterimSpeech, TurnAttempt
from chat_app.websocket.harnesses.map_task.cues            import DirectionGlance, LandmarkGlance
from chat_app.websocket.harnesses.map_task.geometry        import approach, beside, direction, distance_band, region, step
from chat_app.websocket.harnesses.map_task.harness         import MAP_TASK_MAPS, MSG_SAY_AGAIN, MapTaskHarness, MapTaskState
from chat_app.websocket.harnesses.map_task.map_task_api    import MapTaskAPIError
from chat_app.websocket.harnesses.map_task.maps            import MAP_TASK_MAPS_DIR, follower_view, giver_view, load_map, map_file_previews
from chat_app.websocket.harnesses.map_task.pipelines       import assess_then_reply, draft_and_check, draft_answer, single_call
from chat_app.websocket.harnesses.map_task.prompts         import facts_block
from chat_app.websocket.harnesses.map_task.response_models import NO_MOVE, AlongPath, DraftCheck, FollowerTurn, SpokenReply, ToLandmark, TurnAssessment, models_for_map
from chat_app.websocket.harnesses.map_task.understanding   import read_turn
from chat_app.websocket.harnesses.registry                 import build_harness

# The demo map every turn is read against, where the avatar starts on it, and its paper's proportions
DEMO_MAP   = MAP_TASK_MAPS["demo"]
DEMO_START = DEMO_MAP.start
DEMO_SCALE = DEMO_MAP.scale

# Logger the harness writes each turn's line to
HARNESS_LOGGER = "chat_app.websocket.harnesses.map_task.harness"

# A move to just left of the bus, which ends at (0.66, 0.66) on the demo map
LEFT_OF_BUS = ToLandmark(kind="to_landmark", landmark="bus", side="left_of")

# Where the map files are looked up (tests point it at a folder of their own)
MAPS_DIR_SETTING = "chat_app.websocket.harnesses.map_task.maps.MAP_TASK_MAPS_DIR"


# A connection that records what the harness sends it
def make_consumer() -> SimpleNamespace:
    return SimpleNamespace(send_json=AsyncMock(), broadcast_task_monitor=AsyncMock())

# What the user has said so far, as an interim STT result
def make_interim(text: str) -> InterimSpeech:
    return InterimSpeech(text=text, new_speech=True, stability=0.9, ended_at=datetime.now(timezone.utc))

# The avatar plans a connection was sent, in order
def sent_plans(consumer: SimpleNamespace) -> list[dict]:
    return [call.args[0]["data"] for call in consumer.send_json.await_args_list if call.args[0]["type"] == "avatar_plan"]


# ================================================================================
# Map Files and Geometry
# ================================================================================
class MapFileTests(unittest.TestCase):
    """
    Map files are entered by hand, so each one is checked when the backend starts.
    """
    # The demo map loads both maps: a castle only the participant has, a lake only the avatar has, and a moved tree
    def test_demo_map_loads_both_maps_with_every_name_to_listen_for(self) -> None:
        self.assertEqual(DEMO_START, (0.30, 0.66))
        self.assertEqual(list(DEMO_MAP.landmarks),           ["bridge", "lake", "rock", "bus", "tree"])
        self.assertEqual(list(DEMO_MAP.giver.landmarks),     ["bridge", "rock", "bus", "tree", "castle"])
        self.assertEqual(DEMO_MAP.giver.route[0], DEMO_START)
        self.assertEqual((DEMO_MAP.landmarks["tree"].at, DEMO_MAP.giver.landmarks["tree"].at), ((0.48, 0.88), (0.36, 0.86)))
        self.assertEqual(DEMO_MAP.landmarks["lake"].names, ("lake", "pond"))
        self.assertIn("castle", DEMO_MAP.lexicon)
        self.assertEqual(DEMO_MAP.lexicon[0], "boulder")

    # A new name on the avatar's map drops the participant's other names, and both maps' names are listened for
    def test_a_landmark_renamed_on_the_avatars_map(self) -> None:
        with tempfile.TemporaryDirectory() as folder, patch(MAPS_DIR_SETTING, Path(folder)):
            data = json.loads((MAP_TASK_MAPS_DIR / "demo.json").read_text(encoding="utf-8"))
            data["landmarks"][2].update(follower={"label": "stone"})
            (Path(folder) / "renamed.json").write_text(json.dumps(data), encoding="utf-8")
            renamed = load_map("renamed")

        self.assertEqual((renamed.giver.landmarks["rock"].names, renamed.landmarks["rock"].names), (("rock", "boulder"), ("stone",)))
        self.assertEqual(read_turn("Go to the boulder", renamed, DEMO_START).missing, ("boulder",))
        self.assertTrue({"rock", "stone"} <= set(renamed.lexicon))

    # A broken map file is refused, naming the file and the field at fault
    def test_broken_map_files_are_refused_by_field(self) -> None:
        breakages = {
            r"route\[0\]"                       : lambda data: data["route"][0].__setitem__(0, 1.2),
            "route: needs at least"               : lambda data: data.update(route=data["route"][:1]),
            "every id must be"                    : lambda data: data["landmarks"].append(dict(data["landmarks"][0])),
            "unknown colour"                      : lambda data: data["landmarks"][0].update(colour="red"),
            r"\[1\]\.radius"                     : lambda data: data["landmarks"][1].update(radius=0),
            r"\[0\]\.icon"                       : lambda data: data["landmarks"][0].update(icon="spaceship"),
            r"\[2\]\.on"                         : lambda data: data["landmarks"][2].update(on="nobody"),
            r"\[5\]\.follower: only a landmark"   : lambda data: data["landmarks"][5].update(follower={"at": [0.5, 0.5]}),
            r"\[4\]\.follower: unknown icon"      : lambda data: data["landmarks"][4]["follower"].update(icon="rock"),
            "avatar's map needs at least one"     : lambda data: data.update(landmarks=[{**{key: value for key, value in landmark.items() if key != "follower"}, "on": "giver"} for landmark in data["landmarks"]]),
        }
        with tempfile.TemporaryDirectory() as folder, patch(MAPS_DIR_SETTING, Path(folder)):
            for fault, breaks in breakages.items():
                with self.subTest(fault):
                    data = json.loads((MAP_TASK_MAPS_DIR / "demo.json").read_text(encoding="utf-8"))
                    breaks(data)
                    (Path(folder) / "broken.json").write_text(json.dumps(data), encoding="utf-8")
                    with self.assertRaisesRegex(ValueError, f"broken.json.*{fault}"): load_map("broken")

    # Clients draw the participant's map with its route, and monitors the avatar's with its start
    def test_each_map_as_clients_draw_it(self) -> None:
        giver, follower = giver_view(DEMO_MAP), follower_view(DEMO_MAP)
        self.assertEqual([landmark["id"] for landmark in giver   ["landmarks"]], ["bridge", "rock", "bus", "tree", "castle"])
        self.assertEqual([landmark["id"] for landmark in follower["landmarks"]], ["bridge", "lake", "rock", "bus", "tree"])
        self.assertEqual(giver["landmarks"][4], {"id": "castle", "label": "castle", "icon": "castle", "at": [0.40, 0.16], "radius": 0.04})
        self.assertEqual((giver["route"][0], giver["route"][-1], follower["start"]), ([0.30, 0.66], [0.14, 0.22], [0.30, 0.66]))

    # The preview reads every file fresh: the chat types' maps first, and a broken one with its error
    def test_previews_list_every_file_with_its_error(self) -> None:
        with tempfile.TemporaryDirectory() as folder, patch(MAPS_DIR_SETTING, Path(folder)):
            shutil.copy(MAP_TASK_MAPS_DIR / "demo.json", Path(folder) / "demo.json")
            (Path(folder) / "another.json").write_text("{ not json", encoding="utf-8")
            previews = map_file_previews(("demo",))

        self.assertEqual([(preview["variant"], preview["registered"]) for preview in previews], [("demo", True), ("another", False)])
        self.assertEqual((previews[0]["error"], len(previews[0]["giver"]["landmarks"])), (None, 5))
        self.assertIsNone(previews[1]["giver"])
        self.assertIn("Expecting property name", previews[1]["error"])


class GeometryTests(unittest.TestCase):
    # Reaching a landmark stops on its boundary in either paper orientation
    def test_approaching_a_region_stops_at_its_nearest_edge(self) -> None:
        for task_map in MAP_TASK_MAPS.values():
            for landmark in task_map.landmarks.values():
                with self.subTest(map=task_map.name, landmark=landmark.id):
                    target = approach(task_map.start, landmark, task_map.scale)
                    initial_distance = math.hypot(*[(task_map.start[i] - landmark.at[i]) * task_map.scale[i] for i in range(2)])
                    if initial_distance <= landmark.radius: self.assertEqual(target, task_map.start)
                    else:
                        edge_distance = math.hypot(*[(target[i] - landmark.at[i]) * task_map.scale[i] for i in range(2)])
                        self.assertAlmostEqual(edge_distance, landmark.radius)
                    self.assertEqual(approach(landmark.at, landmark, task_map.scale), landmark.at)

    # Directions are the map's own (up is toward the top edge), measured in the paper's real proportions
    def test_directions_from_the_avatar_spot(self) -> None:
        expected = {"bus": "right", "bridge": "up_left", "rock": "up_right", "lake": "up_right", "tree": "down_right"}
        for landmark_id, way in expected.items():
            with self.subTest(landmark_id): self.assertEqual(direction(DEMO_START, DEMO_MAP.landmarks[landmark_id].at, DEMO_SCALE), way)
        self.assertIsNone(direction(DEMO_START, (0.31, 0.67), DEMO_SCALE))

    # Distance is measured to a landmark's edge, so a big landmark is reached sooner
    def test_distance_bands_reach_the_landmark_edge(self) -> None:
        self.assertEqual(distance_band(DEMO_START,   DEMO_MAP.landmarks["bus" ], DEMO_SCALE), "far" )
        self.assertEqual(distance_band((0.60, 0.50), DEMO_MAP.landmarks["rock"], DEMO_SCALE), "near")
        self.assertEqual(distance_band((0.84, 0.27), DEMO_MAP.landmarks["lake"], DEMO_SCALE), "here")  # 0.08 map units from its center, inside its edge

    # The map is named by thirds, and a point on the far edge is in the last third
    def test_regions_by_thirds(self) -> None:
        self.assertEqual(region((0.0, 0.0)),                   "in the top left corner"    )
        self.assertEqual(region((0.5, 0.5)),                   "in the middle"             )
        self.assertEqual(region((1.0, 1.0)),                   "in the bottom right corner")
        self.assertEqual(region(DEMO_MAP.landmarks["bus"].at), "on the right side"         )

    # A move to a landmark stops on it or just beside it, and a step stops at the map's edge
    def test_moves_stop_beside_landmarks_and_at_the_edges(self) -> None:
        bus = DEMO_MAP.landmarks["bus"]
        self.assertEqual(beside(bus, "at", DEMO_SCALE), bus.at)
        self.assertAlmostEqual(beside(bus, "left_of", DEMO_SCALE)[0], 0.66)
        self.assertEqual(step(DEMO_START, "left", "large", DEMO_SCALE), (0.0, 0.66))
        moved = step(DEMO_START, "up_right", "small", DEMO_SCALE)
        self.assertAlmostEqual(math.hypot((moved[0] - DEMO_START[0]) * DEMO_SCALE[0], (moved[1] - DEMO_START[1]) * DEMO_SCALE[1]), 0.08)

    # On a tall map a step up and a step right cover the same distance, so a step across is a bigger share of the narrow width
    def test_a_tall_map_measures_in_its_own_proportions(self) -> None:
        tall = MAP_TASK_MAPS["hcrc_1"]
        self.assertEqual((tall.shape, tall.scale[1]), ("portrait", 1.0))
        up, right = step((0.5, 0.5), "up", "small", tall.scale), step((0.5, 0.5), "right", "small", tall.scale)
        self.assertAlmostEqual(0.5 - up[1], 0.08)
        self.assertAlmostEqual(right[0] - 0.5, 0.08 / tall.scale[0])


# ================================================================================
# Reading a Turn
# ================================================================================
class TurnReadingTests(unittest.TestCase):
    # Names match whole words, by any name or plural, each landmark once, in the order said
    def test_mentions_by_other_names_and_plurals_each_once(self) -> None:
        reading = read_turn("Go past the boulders to the pond, then the lake and the bus.", DEMO_MAP, DEMO_START)
        self.assertEqual([mention.name        for mention in reading.mentions], ["boulder", "pond", "bus"])
        self.assertEqual([mention.landmark.id for mention in reading.mentions], ["rock",    "lake", "bus"])
        self.assertEqual(read_turn("I'm a bit busy", DEMO_MAP, DEMO_START).mentions, ())

    # A name only the giver's map has makes the turn a mismatch
    def test_a_name_the_avatar_lacks_is_a_mismatch(self) -> None:
        reading = read_turn("Go up to the castle", DEMO_MAP, DEMO_START)
        self.assertEqual(reading.missing, ("castle",))
        self.assertEqual(reading.route,   "mismatch")

    # Each kind of turn takes its route
    def test_routes(self) -> None:
        expected = {
            "Do you have a bus?"               : "simple_question",
            "Where's the tree"                 : "simple_question",
            "Is there a bus near the tree?"    : "instruction",
            "Go right until you reach the bus" : "instruction",
            "Turn left a bit"                  : "instruction",
            "Okay"                             : "other",
        }
        for text, route in expected.items():
            with self.subTest(text): self.assertEqual(read_turn(text, DEMO_MAP, DEMO_START).route, route)

    # Every landmark is described from the avatar's spot, the named ones first, then nearest first
    def test_facts_list_named_landmarks_first_then_nearest(self) -> None:
        reading = read_turn("Do you have a tree?", DEMO_MAP, DEMO_START)
        self.assertEqual([fact.landmark.id for fact in reading.facts], ["tree", "rock", "bridge", "bus", "lake"])
        self.assertEqual([fact.mentioned   for fact in reading.facts], [True, False, False, False, False])

    # The model gets its own geometry, but no giver-only coordinates or route
    def test_facts_block_describes_the_map_in_words(self) -> None:
        block = facts_block(read_turn("Do you have a bus or a castle?", DEMO_MAP, DEMO_START))
        self.assertIn("- bus [id: bus]: far away, to your right; it's on the right side; the giver just named it", block)
        self.assertIn("- lake (also called: pond) [id: lake]: ", block)
        self.assertIn("NOT ON YOUR MAP (the giver named these, but your map doesn't have them): castle", block)
        self.assertIn("Your position: [0.3, 0.66]", block)
        self.assertIn("center: [0.74, 0.66]; radius: 0.04", block)
        self.assertNotIn(str(list(DEMO_MAP.giver.landmarks["castle"].at)), block)
        self.assertNotIn(str([list(point) for point in DEMO_MAP.giver.route]), block)

    # Continuing a direction uses the committed trail, not the giver's hidden route
    def test_facts_include_the_committed_trail(self) -> None:
        path = (DEMO_START, (0.4, 0.66), (0.4, 0.5))
        block = facts_block(read_turn("Keep going", DEMO_MAP, path[-1], path=path))
        self.assertIn("Recent committed trail: [[0.3, 0.66], [0.4, 0.66], [0.4, 0.5]]", block)

    # Invalid model-generated paths are rejected at the structured-response boundary
    def test_path_schema_validates_points_in_each_map_model(self) -> None:
        models = models_for_map(tuple(DEMO_MAP.landmarks))
        for model in (models.follower_turn, models.assessment):
            base = {"basis": "Follow the directions", "act": "acknowledge"}
            if model is models.follower_turn: base.update(message="Okay.")
            else:                             base.update(meaning="Move", conflict=None)
            valid = model.model_validate({**base, "move": {"kind": "path", "points": [[0.4, 0.6], [0.5, 0.6]]}})
            self.assertEqual(valid.move.points, [(0.4, 0.6), (0.5, 0.6)])
            for points in ([], [[-0.1, 0.5]], [[0.5, 1.1]], [[True, 0.5]], [[float("nan"), 0.5]], [[0.5]], [[0.5, 0.5]] * 33):
                with self.subTest(model=model.__name__, points=points):
                    with self.assertRaises(ValidationError): model.model_validate({**base, "move": {"kind": "path", "points": points}})
            with self.assertRaises(ValidationError): model.model_validate({**base, "move": {"kind": "to_landmark", "landmark": "castle", "side": "at"}})


# ================================================================================
# Pipelines
# ================================================================================
class PipelineTests(unittest.IsolatedAsyncioTestCase):
    # A drafted answer the check confirms is said as drafted, with no move
    async def test_draft_and_check_keeps_a_confirmed_draft(self) -> None:
        api     = SimpleNamespace(check_draft=AsyncMock(return_value=DraftCheck(ok=True)))
        reading = read_turn("Do you have a bus?", DEMO_MAP, DEMO_START)
        reply   = await draft_and_check(api, reading, [])

        self.assertEqual((reply.message, reply.move), ("Yes, I have the bus, a long way to my right.", NO_MOVE))
        api.check_draft.assert_awaited_once_with(reading, [], reply.message)

    # A drafted answer the check rejects is replaced by its correction
    async def test_draft_and_check_says_the_correction(self) -> None:
        api   = SimpleNamespace(check_draft=AsyncMock(return_value=DraftCheck(ok=False, message="Yes, but mine is on the right side.")))
        reply = await draft_and_check(api, read_turn("Is the bus in the top right?", DEMO_MAP, DEMO_START), [])
        self.assertEqual(reply.message, "Yes, but mine is on the right side.")

    # A "where" question gets the landmark's place; one beside the avatar is "right next to me"
    def test_drafted_answers(self) -> None:
        self.assertEqual(draft_answer(read_turn("Where's the bus?",   DEMO_MAP, DEMO_START                  )), "The bus is a long way to my right.")
        self.assertEqual(draft_answer(read_turn("Do you have a bus?", DEMO_MAP, DEMO_MAP.landmarks["bus"].at)), "Yes, I have the bus, right next to me.")

    # One call's words and move pass straight through
    async def test_single_call_passes_the_move_through(self) -> None:
        turn  = FollowerTurn(basis="Go left of the bus.", act="acknowledge", move=LEFT_OF_BUS, message="Okay, left of the bus.")
        api   = SimpleNamespace(follow=AsyncMock(return_value=turn))
        reply = await single_call(api, read_turn("Go to the left of the bus", DEMO_MAP, DEMO_START), [])
        self.assertEqual((reply.message, reply.act, reply.move), ("Okay, left of the bus.", "acknowledge", LEFT_OF_BUS))

    # The assessment decides the act and the move, and the second call only writes the words
    async def test_assess_then_reply_moves_by_the_assessment(self) -> None:
        assessment = TurnAssessment(basis="No castle here.", meaning="Go up to the castle.", conflict="I have no castle.", act="report_missing", move=NO_MOVE)
        spoken     = SpokenReply(message="I don't have a castle. There's a bridge up there.")
        api        = SimpleNamespace(assess=AsyncMock(return_value=assessment), reply=AsyncMock(return_value=spoken))
        reading    = read_turn("Go up to the castle", DEMO_MAP, DEMO_START)
        reply      = await assess_then_reply(api, reading, [])

        self.assertEqual((reply.message, reply.act, reply.move), (spoken.message, "report_missing", NO_MOVE))
        api.reply.assert_awaited_once_with(reading, [], assessment)


# ================================================================================
# Map Task Harness
# ================================================================================
class MapTaskHarnessTests(unittest.IsolatedAsyncioTestCase):
    # A Map Task harness on the default map and condition, with the LLM client replaced
    def setUp(self) -> None:
        self.api = SimpleNamespace(follow=AsyncMock(), check_draft=AsyncMock(), assess=AsyncMock(), reply=AsyncMock())
        client   = patch("chat_app.websocket.harnesses.map_task.harness.get_map_task_api", return_value=self.api)
        client.start()
        self.addCleanup(client.stop)
        self.consumer = make_consumer()
        self.harness  = build_harness(self.consumer, "map_task", None, None)

    # One automatic reply attempt for a single user turn
    def attempt(self, text: str) -> TurnAttempt:
        return TurnAttempt(context=[("user", text, 0.0)], user_text=text, trigger="automatic", publish_mood=AsyncMock(), publish_plan=AsyncMock())

    # A client that names no map or condition gets the demo map with cues, the avatar at its start
    def test_defaults_to_the_demo_map_with_cues(self) -> None:
        self.assertIsInstance(self.harness, MapTaskHarness)
        self.assertEqual((self.harness.variant, self.harness.condition), ("demo", "cues"))
        self.assertEqual(self.harness.state.path, (DEMO_START,))

    # The chat starts with the avatar's setup, the avatar picking up its map, and the participant's map on screen
    async def test_the_start_sends_the_setup_the_map_and_the_participants_map(self) -> None:
        await self.harness.start()
        frames = [call.args[0] for call in self.consumer.send_json.await_args_list]
        self.assertEqual([frame["type"] for frame in frames], ["avatar_setup", "avatar_plan", "task_card"])
        self.assertEqual(frames[1]["data"]["steps"][0]["prop"], {"hold": "map"})
        self.assertEqual(frames[2]["data"], {"kind": "map_task", **giver_view(DEMO_MAP)})

    # The reply proposes the move, traced on the map, and the avatar moves (and the listeners see it) only once the reply is saved
    async def test_the_move_applies_once_the_reply_is_saved(self) -> None:
        self.api.follow.return_value = FollowerTurn(basis="Go left of the bus.", act="acknowledge", move=LEFT_OF_BUS, message="Okay.")
        attempt = self.attempt("Go to the left of the bus")
        with self.assertLogs(HARNESS_LOGGER, level="INFO"): outcome = await self.harness.generate(attempt)
        self.assertEqual(self.harness.state.position, DEMO_START)

        # Read around its own spot while thinking, then trace the move and nod as the reply starts
        thinking = attempt.publish_plan.await_args.args[0]
        self.assertEqual(thinking["steps"][0]["gaze"]["scan"]["around"], list(DEMO_START))
        trace = outcome.avatar_plan["steps"][0]["gaze"]["trace"]
        self.assertEqual(trace[0], list(DEMO_START))
        self.assertAlmostEqual(trace[1][0], 0.66)
        self.assertEqual(outcome.avatar_plan["steps"][-1]["move"]["name"], "Nod")

        self.harness.on_reply_saved(outcome)
        await asyncio.sleep(0)
        self.assertEqual(len(self.harness.state.path), 2)
        self.assertAlmostEqual(self.harness.state.position[0], 0.66)
        self.assertAlmostEqual(self.harness.state.position[1], 0.66)
        view = self.consumer.broadcast_task_monitor.await_args.args[0]
        self.assertEqual((view["kind"], len(view["path"]), view["position"]), ("map_task", 2, list(self.harness.state.position)))

    # Bends and loops survive in the state, gaze trace, and monitor after commit
    async def test_a_path_preserves_bends_and_a_return_to_the_start(self) -> None:
        points = [DEMO_START, (0.4, 0.66), (0.4, 0.66), (0.4, 0.5), DEMO_START]
        self.api.follow.return_value = FollowerTurn(basis="Trace a loop.", act="acknowledge", move=AlongPath(kind="path", points=points), message="Back at the start.")
        with self.assertLogs(HARNESS_LOGGER, level="INFO"): outcome = await self.harness.generate(self.attempt("Go right, up, then back to the start"))
        expected = (DEMO_START, (0.4, 0.66), (0.4, 0.5), DEMO_START)
        self.assertEqual(self.harness.state.path, (DEMO_START,))
        self.assertEqual(outcome.state.path, expected)
        self.assertEqual(outcome.avatar_plan["steps"][0]["gaze"]["trace"], [list(point) for point in expected])

        self.harness.on_reply_saved(outcome)
        await asyncio.sleep(0)
        self.assertEqual(self.harness.monitor_view()["path"], [list(point) for point in expected])
        self.assertEqual(self.harness.state.position, DEMO_START)

    # A path that never leaves the current spot has no movement effect
    async def test_a_stationary_path_proposes_no_state(self) -> None:
        self.api.follow.return_value = FollowerTurn(basis="Already there.", act="acknowledge", move=AlongPath(kind="path", points=[DEMO_START, DEMO_START]), message="I'm there.")
        with self.assertLogs(HARNESS_LOGGER, level="INFO"): outcome = await self.harness.generate(self.attempt("Stay there"))
        self.assertIsNone(outcome.state)
        self.assertNotIn("trace", outcome.avatar_plan["steps"][0]["gaze"])

    # A landmark destination reaches its edge instead of its center
    async def test_a_landmark_destination_respects_its_radius(self) -> None:
        self.api.follow.return_value = FollowerTurn(basis="Reach the bus.", act="acknowledge", move=ToLandmark(kind="to_landmark", landmark="bus", side="at"), message="At the bus.")
        with self.assertLogs(HARNESS_LOGGER, level="INFO"): outcome = await self.harness.generate(self.attempt("Go to the bus"))
        self.assertAlmostEqual(outcome.state.position[0], 0.70)
        self.assertAlmostEqual(outcome.state.position[1], 0.66)

    # A question about the map is answered from a draft, locking onto the landmark, and a reply that stays proposes no new state
    async def test_a_simple_question_stays_put(self) -> None:
        self.api.check_draft.return_value = DraftCheck(ok=True)
        with self.assertLogs(HARNESS_LOGGER, level="INFO"): outcome = await self.harness.generate(self.attempt("Do you have a bus?"))
        self.assertEqual((outcome.message, outcome.state), ("Yes, I have the bus, a long way to my right.", None))
        self.assertEqual(outcome.avatar_plan["steps"][0]["gaze"]["at"], [0.74, 0.66])
        self.assertEqual(outcome.avatar_plan["steps"][1]["face"]["name"], "Wide-Eyed")
        self.api.follow.assert_not_awaited()

    # A move that ends where the avatar already is changes nothing (no new stop on its path)
    async def test_a_move_to_where_it_is_proposes_nothing(self) -> None:
        bridge = DEMO_MAP.landmarks["bridge"].at
        self.harness.state = MapTaskState(position=bridge, path=(DEMO_START, bridge))
        self.api.follow.return_value = FollowerTurn(basis="Already there.", act="acknowledge", move=ToLandmark(kind="to_landmark", landmark="bridge", side="at"), message="I'm there.")
        with self.assertLogs(HARNESS_LOGGER, level="INFO"): outcome = await self.harness.generate(self.attempt("Go to the bridge"))
        self.assertIsNone(outcome.state)
        self.assertNotIn("trace", outcome.avatar_plan["steps"][0]["gaze"])

    # A landmark it doesn't have: a search while thinking, then a last sweep and a head shake
    async def test_a_missing_landmark_is_searched_for(self) -> None:
        self.api.assess.return_value = TurnAssessment(basis="No castle.", meaning="Go to the castle.", conflict="No castle here.", act="report_missing", move=NO_MOVE)
        self.api.reply.return_value  = SpokenReply(message="I don't have a castle.")
        attempt = self.attempt("Go up to the castle")
        with self.assertLogs(HARNESS_LOGGER, level="INFO"): outcome = await self.harness.generate(attempt)

        self.assertEqual(attempt.publish_plan.await_args.args[0]["steps"][0]["face"]["name"], "Furrowed Brow")
        self.assertEqual(outcome.avatar_plan["steps"][1]["move"]["name"], "Shake No")

    # A call that failed every attempt gets the scripted line, and the avatar doesn't move but lowers its map, puzzled
    async def test_a_failed_call_asks_again_without_moving(self) -> None:
        self.api.follow.side_effect = MapTaskAPIError("Map Task follow failed after all attempts")
        with self.assertLogs(HARNESS_LOGGER, level="ERROR"): outcome = await self.harness.generate(self.attempt("Go right a bit"))
        self.assertEqual((outcome.message, outcome.state), (MSG_SAY_AGAIN, None))
        self.assertEqual((outcome.avatar_plan["steps"][-1]["prop"], outcome.avatar_plan["steps"][-1]["face"]["name"]), ({"raise": 0}, "Face with Raised Eyebrow"))

    # Without cues the participant still gets their map, but the avatar holds none and is sent no plans
    async def test_no_cues_sends_only_the_participants_map(self) -> None:
        harness = build_harness(self.consumer, "map_task", "no_cues", None)
        await harness.start()
        self.assertEqual([call.args[0]["type"] for call in self.consumer.send_json.await_args_list], ["avatar_setup", "task_card"])
        self.assertEqual(harness.cues, [])

        self.api.follow.return_value = FollowerTurn(basis="Go left of the bus.", act="acknowledge", move=LEFT_OF_BUS, message="Okay.")
        attempt = self.attempt("Go to the left of the bus")
        with self.assertLogs(HARNESS_LOGGER, level="INFO"): outcome = await harness.generate(attempt)
        self.assertIsNone(outcome.avatar_plan)
        attempt.publish_plan.assert_not_awaited()


# --------------------------------------------------------------------------------
# Cues
# --------------------------------------------------------------------------------
class MapTaskCueTests(unittest.IsolatedAsyncioTestCase):
    # A Map Task harness with cues, and a connection that records what they send
    def setUp(self) -> None:
        self.consumer = make_consumer()
        self.harness  = build_harness(self.consumer, "map_task", "cues", None)

    # The cue of one type
    def cue(self, cue_type: type) -> object:
        return next(cue for cue in self.harness.cues if isinstance(cue, cue_type))

    # Naming a landmark glances at it, and naming one the avatar lacks searches the map
    async def test_naming_a_landmark_glances_at_it_or_searches(self) -> None:
        glance = self.cue(LandmarkGlance)
        glance.on_interim(make_interim("go to the boulder"))
        glance.on_interim(make_interim("go to the boulder and the castle"))
        await asyncio.sleep(0)
        plans = sent_plans(self.consumer)
        self.assertEqual((plans[0]["id"], plans[0]["steps"][0]["gaze"]["at"]), ("glance-rock-1", [0.60, 0.36]))
        self.assertEqual((plans[1]["id"], plans[1]["steps"][0]["face"]["name"]), ("search-2", "Furrowed Brow"))

    # A direction looks from the avatar's spot toward it, but "right" on its own is only "okay"
    async def test_a_direction_looks_that_way_from_its_spot(self) -> None:
        looks = self.cue(DirectionGlance)
        looks.on_interim(make_interim("right, okay, now go left"))
        await asyncio.sleep(0)
        plans = sent_plans(self.consumer)
        self.assertEqual([plan["id"] for plan in plans], ["look-left-1"])
        self.assertEqual(plans[0]["steps"][0]["gaze"]["at"], list(step(DEMO_START, "left", "medium", DEMO_SCALE)))

    # Nothing is glanced at while a reply owns the avatar, and the shared cue lowers the map when newer speech cancels it
    async def test_quiet_while_replying_and_back_to_listening_when_cancelled(self) -> None:
        attempt = TurnAttempt(context=[], user_text="go up", trigger="automatic", publish_mood=AsyncMock(), publish_plan=AsyncMock())
        self.harness.on_reply_started(attempt)
        self.harness.on_interim(make_interim("go up to the bridge"))
        self.harness.on_reply_cancelled(attempt, False)
        await asyncio.sleep(0)
        plans = sent_plans(self.consumer)
        self.assertEqual([plan["id"] for plan in plans], ["t1-listen"])
        self.assertEqual(plans[0]["steps"][0]["prop"], {"raise": 0})

        self.harness.on_final(FinalUtterance(text="go up to the bridge", words=()))
        self.harness.on_interim(make_interim("the bridge"))
        await asyncio.sleep(0)
        self.assertEqual(sent_plans(self.consumer)[-1]["id"], "glance-bridge-1")


# --------------------------------------------------------------------------------
# The Admin Listener's View
# --------------------------------------------------------------------------------
class MapTaskMonitorTests(unittest.IsolatedAsyncioTestCase):
    # A listener that joins gets both maps and the avatar's path from the primary connection
    async def test_a_joining_listener_gets_the_view(self) -> None:
        consumer = SimpleNamespace(channel_layer=SimpleNamespace(send=AsyncMock()))
        consumer.harness = build_harness(consumer, "map_task", None, None)
        await ChatConsumer.ws_listener_joined(consumer, {"reply_channel": "listener-1"})

        channel, event = consumer.channel_layer.send.await_args.args
        self.assertEqual((channel, event["type"]), ("listener-1", "ws.task_monitor"))
        self.assertEqual(event["data"], {"kind": "map_task", "giver": giver_view(DEMO_MAP), "follower": follower_view(DEMO_MAP), "position": list(DEMO_START), "path": [list(DEMO_START)]})

    # A chat type without a view sends nothing
    async def test_a_chat_type_without_a_view_sends_nothing(self) -> None:
        consumer = SimpleNamespace(channel_layer=SimpleNamespace(send=AsyncMock()))
        consumer.harness = build_harness(consumer, None, None, None)
        await ChatConsumer.ws_listener_joined(consumer, {"reply_channel": "listener-1"})
        consumer.channel_layer.send.assert_not_awaited()
