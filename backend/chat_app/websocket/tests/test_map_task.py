"""
Map Task maps, geometry, turn reading, and the follower's replies.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.tests.test_map_task`

Every test reads turns against the demo map (`map_task/maps/demo.json`). The LLM
client is replaced with stand-ins that return fixed structured responses, so
these tests check what code decides: which names were heard, which pipeline
replies, and where the avatar ends up.

"""
from pathlib       import Path
from types         import SimpleNamespace
from unittest.mock import AsyncMock, patch

import json, math, tempfile, unittest

# From this project
from chat_app.websocket.harnesses.base                     import TurnAttempt
from chat_app.websocket.harnesses.map_task.geometry        import beside, direction, distance_band, region, step
from chat_app.websocket.harnesses.map_task.harness         import MAP_TASK_MAPS, MSG_SAY_AGAIN, MapTaskHarness
from chat_app.websocket.harnesses.map_task.map_task_api    import MapTaskAPIError
from chat_app.websocket.harnesses.map_task.maps            import MAP_TASK_MAPS_DIR, load_map
from chat_app.websocket.harnesses.map_task.pipelines       import assess_then_reply, draft_and_check, draft_answer, single_call
from chat_app.websocket.harnesses.map_task.prompts         import facts_block
from chat_app.websocket.harnesses.map_task.response_models import NO_MOVE, DraftCheck, FollowerTurn, SpokenReply, ToLandmark, TurnAssessment
from chat_app.websocket.harnesses.map_task.understanding   import read_turn
from chat_app.websocket.harnesses.registry                 import build_harness

# The demo map every turn is read against, and where the avatar starts on it
DEMO_MAP   = MAP_TASK_MAPS["demo"]
DEMO_START = DEMO_MAP.start

# Logger the harness writes each turn's line to
HARNESS_LOGGER = "chat_app.websocket.harnesses.map_task.harness"

# A move to just left of the bus, which ends at (0.66, 0.66) on the demo map
LEFT_OF_BUS = ToLandmark(kind="to_landmark", landmark="bus", side="left_of")


# ================================================================================
# Map Files and Geometry
# ================================================================================
class MapFileTests(unittest.TestCase):
    """
    Map files are entered by hand, so each one is checked when the backend starts.
    """
    # The demo map loads with its landmarks, their other names, and the giver's extra name
    def test_demo_map_loads_with_every_name_to_listen_for(self) -> None:
        self.assertEqual(DEMO_START, (0.30, 0.66))
        self.assertEqual(list(DEMO_MAP.landmarks), ["bridge", "lake", "rock", "bus", "tree"])
        self.assertEqual(DEMO_MAP.landmarks["lake"].names, ("lake", "pond"))
        self.assertIn("castle", DEMO_MAP.lexicon)
        self.assertEqual(DEMO_MAP.lexicon[0], "boulder")

    # A broken map file is refused, naming the file and the field at fault
    def test_broken_map_files_are_refused_by_field(self) -> None:
        breakages = {
            "follower.start"   : lambda data: data["follower"].update(start=[1.2, 0.5]),
            "every id must be" : lambda data: data["follower"]["landmarks"].append(dict(data["follower"]["landmarks"][0])),
            "unknown colour"   : lambda data: data["follower"]["landmarks"][0].update(colour="red"),
            r"\[1\]\.radius"   : lambda data: data["follower"]["landmarks"][1].update(radius=0),
        }
        with tempfile.TemporaryDirectory() as folder, patch("chat_app.websocket.harnesses.map_task.maps.MAP_TASK_MAPS_DIR", Path(folder)):
            for fault, breaks in breakages.items():
                with self.subTest(fault):
                    data = json.loads((MAP_TASK_MAPS_DIR / "demo.json").read_text(encoding="utf-8"))
                    breaks(data)
                    (Path(folder) / "broken.json").write_text(json.dumps(data), encoding="utf-8")
                    with self.assertRaisesRegex(ValueError, f"broken.json.*{fault}"): load_map("broken")


class GeometryTests(unittest.TestCase):
    # Directions are the map's own: up is toward the top edge
    def test_directions_from_the_avatar_spot(self) -> None:
        expected = {"bus": "right", "bridge": "up", "rock": "up_right", "lake": "up_right", "tree": "down_right"}
        for landmark_id, way in expected.items():
            with self.subTest(landmark_id): self.assertEqual(direction(DEMO_START, DEMO_MAP.landmarks[landmark_id].at), way)
        self.assertIsNone(direction(DEMO_START, (0.31, 0.67)))

    # Distance is measured to a landmark's edge, so a big landmark is reached sooner
    def test_distance_bands_reach_the_landmark_edge(self) -> None:
        self.assertEqual(distance_band(DEMO_START,   DEMO_MAP.landmarks["bus" ]), "far" )
        self.assertEqual(distance_band((0.60, 0.50), DEMO_MAP.landmarks["rock"]), "near")
        self.assertEqual(distance_band((0.84, 0.27), DEMO_MAP.landmarks["lake"]), "here")  # 0.11 from its center, 0.04 from its edge

    # The map is named by thirds, and a point on the far edge is in the last third
    def test_regions_by_thirds(self) -> None:
        self.assertEqual(region((0.0, 0.0)),                   "in the top left corner"    )
        self.assertEqual(region((0.5, 0.5)),                   "in the middle"             )
        self.assertEqual(region((1.0, 1.0)),                   "in the bottom right corner")
        self.assertEqual(region(DEMO_MAP.landmarks["bus"].at), "on the right side"         )

    # A move to a landmark stops on it or just beside it, and a step stops at the map's edge
    def test_moves_stop_beside_landmarks_and_at_the_edges(self) -> None:
        bus = DEMO_MAP.landmarks["bus"]
        self.assertEqual(beside(bus, "at"), bus.at)
        self.assertAlmostEqual(beside(bus, "left_of")[0], 0.66)
        self.assertEqual(step(DEMO_START, "left", "large"), (0.0, 0.66))
        self.assertAlmostEqual(math.dist(DEMO_START, step(DEMO_START, "up_right", "small")), 0.08)


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
        self.assertEqual([fact.landmark.id for fact in reading.facts], ["tree", "rock", "bus", "bridge", "lake"])
        self.assertEqual([fact.mentioned   for fact in reading.facts], [True, False, False, False, False])

    # The model gets the map in words: directions, distances, other names, and the names it lacks
    def test_facts_block_describes_the_map_in_words(self) -> None:
        block = facts_block(read_turn("Do you have a bus or a castle?", DEMO_MAP, DEMO_START))
        self.assertIn("- bus [id: bus]: far away, to your right; it's on the right side; the giver just named it", block)
        self.assertIn("- lake (also called: pond) [id: lake]: ", block)
        self.assertIn("NOT ON YOUR MAP (the giver named these, but your map doesn't have them): castle", block)
        self.assertNotIn("0.", block)


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
    # A Map Task harness on the default map, with the LLM client replaced
    def setUp(self) -> None:
        self.api = SimpleNamespace(follow=AsyncMock(), check_draft=AsyncMock(), assess=AsyncMock(), reply=AsyncMock())
        client   = patch("chat_app.websocket.harnesses.map_task.harness.get_map_task_api", return_value=self.api)
        client.start()
        self.addCleanup(client.stop)
        self.harness = build_harness(SimpleNamespace(), "map_task", None, None)

    # One automatic reply attempt for a single user turn
    def attempt(self, text: str) -> TurnAttempt:
        return TurnAttempt(context=[("user", text, 0.0)], user_text=text, trigger="automatic", publish_mood=AsyncMock())

    # A client that names no map gets the demo map, with the avatar at its start
    def test_defaults_to_the_demo_map(self) -> None:
        self.assertIsInstance(self.harness, MapTaskHarness)
        self.assertEqual((self.harness.variant, self.harness.condition), ("demo", ""))
        self.assertEqual(self.harness.state.path, (DEMO_START,))

    # The reply proposes the move, and the avatar moves only once the reply is saved
    async def test_the_move_applies_once_the_reply_is_saved(self) -> None:
        self.api.follow.return_value = FollowerTurn(basis="Go left of the bus.", act="acknowledge", move=LEFT_OF_BUS, message="Okay.")
        with self.assertLogs(HARNESS_LOGGER, level="INFO"): outcome = await self.harness.generate(self.attempt("Go to the left of the bus"))
        self.assertEqual(self.harness.state.position, DEMO_START)

        self.harness.on_reply_saved(outcome)
        self.assertEqual(len(self.harness.state.path), 2)
        self.assertAlmostEqual(self.harness.state.position[0], 0.66)
        self.assertAlmostEqual(self.harness.state.position[1], 0.66)

    # A question about the map is answered from a draft, and a reply that stays proposes no new state
    async def test_a_simple_question_stays_put(self) -> None:
        self.api.check_draft.return_value = DraftCheck(ok=True)
        with self.assertLogs(HARNESS_LOGGER, level="INFO"): outcome = await self.harness.generate(self.attempt("Do you have a bus?"))
        self.assertEqual((outcome.message, outcome.state), ("Yes, I have the bus, a long way to my right.", None))
        self.api.follow.assert_not_awaited()

    # A call that failed every attempt gets the scripted line, and the avatar doesn't move
    async def test_a_failed_call_asks_again_without_moving(self) -> None:
        self.api.follow.side_effect = MapTaskAPIError("Map Task follow failed after all attempts")
        with self.assertLogs(HARNESS_LOGGER, level="ERROR"): outcome = await self.harness.generate(self.attempt("Go right a bit"))
        self.assertEqual((outcome.message, outcome.state), (MSG_SAY_AGAIN, None))
