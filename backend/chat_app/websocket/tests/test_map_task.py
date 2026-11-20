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
from dataclasses   import replace
from datetime      import datetime, timezone
from pathlib       import Path
from types         import SimpleNamespace
from typing        import get_args
from unittest.mock import AsyncMock, Mock, patch

import asyncio, json, math, shutil, tempfile, unittest

from pydantic import ValidationError

# From this project
from chat_app.websocket.consumers.consumers                           import ChatConsumer
from chat_app.websocket.harnesses.base                                import FinalUtterance, InterimSpeech, TurnAttempt
from chat_app.websocket.harnesses.features.intro.flow                 import IntroState
from chat_app.websocket.harnesses.features.intro.intro_api            import IntroReading
from chat_app.websocket.harnesses.features.intro.prompts              import INTRO_QUESTION, INTRO_READY
from chat_app.websocket.harnesses.features.reply_gate.response_models import CheckResult, Reply, check_model
from chat_app.websocket.harnesses.map_task.behaviors                  import MAP_TASK_SOUNDS
from chat_app.websocket.harnesses.map_task.cues                       import DirectionGlance, LandmarkGlance, MapTaskBackchannels
from chat_app.websocket.harnesses.map_task.finish                     import MSG_FINISH_CONFIRMED, MSG_REACHED_FINISH, at_finish, finish_step, where_am_i
from chat_app.websocket.harnesses.map_task.geometry                   import approach, beside, direction, distance_band, region, step
from chat_app.websocket.harnesses.map_task.harness                    import MAP_TASK_MAPS, MSG_SAY_AGAIN, MapTaskHarness, MapTaskState
from chat_app.websocket.harnesses.map_task.map_task_api               import MapTaskAPIError
from chat_app.websocket.harnesses.map_task.maps                       import MAP_TASK_MAPS_DIR, follower_view, giver_view, load_map, map_file_previews
from chat_app.websocket.harnesses.map_task.pipelines                  import assess_then_reply, draft_and_check, draft_answer, single_call
from chat_app.websocket.harnesses.map_task.prompts                    import FOLLOW_TASK, MAP_TASK_INTRO, MAP_TASK_REACTION_WHEN, REPLY_TASK, facts_block
from chat_app.websocket.harnesses.map_task.response_models            import NO_MOVE, AlongPath, DraftCheck, FollowerTurn, MapTaskReaction, SpokenReply, ToLandmark, TurnAssessment, models_for_map
from chat_app.websocket.harnesses.map_task.understanding              import read_turn
from chat_app.websocket.harnesses.reactions                           import REACTIONS
from chat_app.websocket.harnesses.registry                            import build_harness

# The demo map every turn is read against, where the avatar starts on it, and its paper's proportions
DEMO_MAP    = MAP_TASK_MAPS["demo"]
DEMO_START  = DEMO_MAP.start
DEMO_FINISH = DEMO_MAP.giver.route[-1]  # Just below the bridge, in the top left corner
DEMO_SCALE = DEMO_MAP.scale

# Logger the harness writes each turn's line to
HARNESS_LOGGER = "chat_app.websocket.harnesses.map_task.harness"

# A move to just left of the bus, which ends at (0.66, 0.66) on the demo map
LEFT_OF_BUS = ToLandmark(kind="to_landmark", landmark="bus", side="left_of")

# Where the map files are looked up (tests point it at a folder of their own)
MAPS_DIR_SETTING = "chat_app.websocket.harnesses.map_task.maps.MAP_TASK_MAPS_DIR"

# Where the signs of listening synthesize their sound, and the clip the stand-in returns
SYNTHESIZE_SOUNDS = "chat_app.websocket.harnesses.features.backchannels.cue.synthesize_sounds"
SOUNDS            = {"mm_hm": {"audio": "AAA=", "sample_rate": 24_000}}

# Where the reply gate looks its check client up, and the logger it writes each verdict to
GET_REPLY_CHECK = "chat_app.websocket.harnesses.features.reply_gate.gate.get_reply_check_api"
GATE_LOGGER     = "chat_app.websocket.harnesses.features.reply_gate.gate"

# The intro's switch (patched to `()` where a test is about the task itself), and its call
INTRO_SWITCH = "chat_app.websocket.harnesses.features.intro.flow.FEATURE_INTRO_CONDITIONS"
GET_INTRO    = "chat_app.websocket.harnesses.features.intro.flow.get_intro_api"

# Where every harness module logs (the intro, the reply gate, and the Map Task's own)
HARNESSES_LOGGER = "chat_app.websocket.harnesses"

# A check that finds the user done, so every reply goes out as usual
CHECK_DONE = CheckResult(basis="done", verdict=Reply(next_step="reply"))


# A connection that records what the harness sends it
def make_consumer() -> SimpleNamespace:
    return SimpleNamespace(send_json=AsyncMock(), broadcast_task_monitor=AsyncMock(), streaming_active=True)

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
            if model is models.follower_turn: base.update(reaction="none", message="Okay.")
            else:                             base.update(meaning="Move", conflict=None)
            valid = model.model_validate({**base, "move": {"kind": "path", "points": [[0.4, 0.6], [0.5, 0.6]]}})
            self.assertEqual(valid.move.points, [(0.4, 0.6), (0.5, 0.6)])
            for points in ([], [[-0.1, 0.5]], [[0.5, 1.1]], [[True, 0.5]], [[float("nan"), 0.5]], [[0.5]], [[0.5, 0.5]] * 33):
                with self.subTest(model=model.__name__, points=points):
                    with self.assertRaises(ValidationError): model.model_validate({**base, "move": {"kind": "path", "points": points}})
            with self.assertRaises(ValidationError): model.model_validate({**base, "move": {"kind": "to_landmark", "landmark": "castle", "side": "at"}})

    # The reply calls offer shared reactions in the Map Task's words, no hand (the map hides it)
    # and no animation (the reply's first moment already holds a face)
    def test_the_reply_calls_offer_shared_reactions_in_their_own_words(self) -> None:
        menu = get_args(MapTaskReaction)
        self.assertEqual(menu[0], "none")
        self.assertLessEqual(set(menu) | set(MAP_TASK_REACTION_WHEN), set(REACTIONS))
        self.assertLessEqual(set(MAP_TASK_REACTION_WHEN), set(menu))
        self.assertFalse({"giggle", "gasp"} & set(menu))
        self.assertFalse([name for name in menu if "animation" in REACTIONS[name].actions])
        for task in (FOLLOW_TASK, REPLY_TASK):
            for name in menu: self.assertIn(f"  - {name}: ", task)
        self.assertIn(f"  - grimace: a grimace, {MAP_TASK_REACTION_WHEN['grimace']}.", FOLLOW_TASK)


# ================================================================================
# Ending the Task
# ================================================================================
class FinishTests(unittest.TestCase):
    # The finish is the route's last point, and the avatar is there within the radius around it
    def test_the_finish_counts_within_its_radius(self) -> None:
        self.assertTrue (at_finish(DEMO_MAP, DEMO_FINISH ))
        self.assertTrue (at_finish(DEMO_MAP, (0.19, 0.25)))
        self.assertFalse(at_finish(DEMO_MAP, (0.14, 0.40)))

    # Where the avatar is, from its own map: the part of the map, and a landmark close by
    def test_the_avatar_says_where_it_is_from_its_own_map(self) -> None:
        self.assertEqual(where_am_i(DEMO_MAP, DEMO_FINISH ), "in the top left corner, right by the bridge")
        self.assertEqual(where_am_i(DEMO_MAP, (0.14, 0.40)), "on the left side, below the bridge")
        self.assertEqual(where_am_i(DEMO_MAP, DEMO_START  ), "on the left side, above and to the left of the tree")
        self.assertEqual(where_am_i(DEMO_MAP, (0.05, 0.60)), "on the left side")

    # At the finish, the reply ends the task with a closing line after its own words
    def test_reaching_the_finish_ends_the_task(self) -> None:
        step = finish_step(DEMO_MAP, DEMO_FINISH, "acknowledge", "Okay, up past the bridge.", asked=False, ended=None)
        self.assertEqual((step.message, step.ended, step.asked), (f"Okay, up past the bridge. {MSG_REACHED_FINISH}", "reached_finish", False))

    # The user's word: the avatar first says where it is and asks, and a yes to that ends the task
    def test_the_users_word_ends_the_task_once_the_avatar_has_checked(self) -> None:
        check = finish_step(DEMO_MAP, (0.14, 0.40), "finish", "Okay.", asked=False, ended=None)
        yes   = finish_step(DEMO_MAP, (0.14, 0.40), "finish", "Okay.", asked=True,  ended=None)
        self.assertEqual((check.message, check.ended, check.asked), ("Alright, I'm on the left side, below the bridge. Is that the finish?", None, True))
        self.assertEqual((yes.message,   yes.ended,   yes.asked  ), (MSG_FINISH_CONFIRMED, "giver_confirmed", False))

    # Anything else after the check carries on, and drops the question
    def test_a_reply_about_something_else_drops_the_check(self) -> None:
        step = finish_step(DEMO_MAP, (0.14, 0.40), "acknowledge", "Going down a bit.", asked=True, ended=None)
        self.assertEqual((step.message, step.ended, step.asked), ("Going down a bit.", None, False))

    # A task already over (its closing line was cut off before the close) closes again on the next reply
    def test_a_task_already_over_closes_again(self) -> None:
        step = finish_step(DEMO_MAP, (0.14, 0.40), "acknowledge", "Wait, what?", asked=False, ended="giver_confirmed")
        self.assertEqual((step.message, step.ended), (MSG_FINISH_CONFIRMED, "giver_confirmed"))


# ================================================================================
# Pipelines
# ================================================================================
class PipelineTests(unittest.IsolatedAsyncioTestCase):
    # A drafted answer the check confirms is said as drafted, with no move and no reaction
    async def test_draft_and_check_keeps_a_confirmed_draft(self) -> None:
        api     = SimpleNamespace(check_draft=AsyncMock(return_value=DraftCheck(ok=True)))
        reading = read_turn("Do you have a bus?", DEMO_MAP, DEMO_START)
        reply   = await draft_and_check(api, reading, [])

        self.assertEqual((reply.message, reply.move, reply.reaction), ("Yes, I have the bus, a long way to my right.", NO_MOVE, "none"))
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

    # One call's words, move, and reaction pass straight through
    async def test_single_call_passes_the_move_through(self) -> None:
        turn  = FollowerTurn(basis="Go left of the bus.", act="acknowledge", move=LEFT_OF_BUS, reaction="smile", message="Okay, left of the bus.")
        api   = SimpleNamespace(follow=AsyncMock(return_value=turn))
        reply = await single_call(api, read_turn("Go to the left of the bus", DEMO_MAP, DEMO_START), [])
        self.assertEqual((reply.message, reply.act, reply.move, reply.reaction), ("Okay, left of the bus.", "acknowledge", LEFT_OF_BUS, "smile"))

    # The assessment decides the act and the move; the second call writes the words and the reaction
    async def test_assess_then_reply_moves_by_the_assessment(self) -> None:
        assessment = TurnAssessment(basis="No castle here.", meaning="Go up to the castle.", conflict="I have no castle.", act="report_missing", move=NO_MOVE)
        spoken     = SpokenReply(reaction="surprised", message="A castle? I don't have one. There's a bridge up there.")
        api        = SimpleNamespace(assess=AsyncMock(return_value=assessment), reply=AsyncMock(return_value=spoken))
        reading    = read_turn("Go up to the castle", DEMO_MAP, DEMO_START)
        reply      = await assess_then_reply(api, reading, [])

        self.assertEqual((reply.message, reply.act, reply.move, reply.reaction), (spoken.message, "report_missing", NO_MOVE, "surprised"))
        api.reply.assert_awaited_once_with(reading, [], assessment)


# ================================================================================
# Map Task Harness
# ================================================================================
class MapTaskHarnessTests(unittest.IsolatedAsyncioTestCase):
    # A Map Task harness on the default map and condition, with the LLM client replaced (and no intro)
    def setUp(self) -> None:
        self.api   = SimpleNamespace(follow=AsyncMock(), check_draft=AsyncMock(), assess=AsyncMock(), reply=AsyncMock())
        self.check = SimpleNamespace(check=AsyncMock(return_value=CHECK_DONE))
        for replaced in (patch("chat_app.websocket.harnesses.map_task.harness.get_map_task_api", return_value=self.api), patch(SYNTHESIZE_SOUNDS, AsyncMock(return_value=SOUNDS)), patch(GET_REPLY_CHECK, Mock(return_value=self.check)), patch(INTRO_SWITCH, ())):
            replaced.start()
            self.addCleanup(replaced.stop)
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

    # The chat starts with the avatar's setup (with its listening sound), the avatar picking up its map, and the participant's map on screen
    async def test_the_start_sends_the_setup_the_map_and_the_participants_map(self) -> None:
        await self.harness.start()
        frames = [call.args[0] for call in self.consumer.send_json.await_args_list]
        self.assertEqual([frame["type"] for frame in frames], ["avatar_setup", "avatar_plan", "task_card"])
        self.assertEqual(frames[0]["data"]["sounds"], SOUNDS)
        self.assertEqual(frames[1]["data"]["steps"][0]["prop"], {"hold": "map"})
        self.assertEqual(frames[2]["data"], {"kind": "map_task", **giver_view(DEMO_MAP)})

    # The reply proposes the move, traced on the map, and the avatar moves (and the listeners see it) only once the reply is saved
    async def test_the_move_applies_once_the_reply_is_saved(self) -> None:
        self.api.follow.return_value = FollowerTurn(basis="Go left of the bus.", act="acknowledge", move=LEFT_OF_BUS, reaction="none", message="Okay.")
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

    # The reaction goes on top of the act's look (a smile keeps the nod; a laugh bounces instead)
    async def test_the_reaction_goes_on_top_of_the_acts_look(self) -> None:
        for reaction, move in (("smile", "Nod"), ("laugh", "Bounce")):
            with self.subTest(reaction):
                self.api.follow.return_value = FollowerTurn(basis="Go left of the bus.", act="acknowledge", move=LEFT_OF_BUS, reaction=reaction, message="Ha, okay.")
                with self.assertLogs(HARNESS_LOGGER, level="INFO"): outcome = await self.harness.generate(self.attempt("Go to the left of the bus"))
                last = outcome.avatar_plan["steps"][-1]
                self.assertEqual((last["face"], last["move"]["name"], last["gaze"]["on"]), (REACTIONS[reaction].actions["face"], move, "user"))

    # Bends and loops survive in the state, gaze trace, and monitor after commit
    async def test_a_path_preserves_bends_and_a_return_to_the_start(self) -> None:
        points = [DEMO_START, (0.4, 0.66), (0.4, 0.66), (0.4, 0.5), DEMO_START]
        self.api.follow.return_value = FollowerTurn(basis="Trace a loop.", act="acknowledge", move=AlongPath(kind="path", points=points), reaction="none", message="Back at the start.")
        with self.assertLogs(HARNESS_LOGGER, level="INFO"): outcome = await self.harness.generate(self.attempt("Go right, up, then back to the start"))
        expected = (DEMO_START, (0.4, 0.66), (0.4, 0.5), DEMO_START)
        self.assertEqual(self.harness.state.path, (DEMO_START,))
        self.assertEqual(outcome.state.path, expected)
        self.assertEqual(outcome.avatar_plan["steps"][0]["gaze"]["trace"], [list(point) for point in expected])

        self.harness.on_reply_saved(outcome)
        await asyncio.sleep(0)
        self.assertEqual(self.harness.monitor_view()["path"], [list(point) for point in expected])
        self.assertEqual(self.harness.state.position, DEMO_START)

    # A path that never leaves the current spot moves nothing (the reply is still recorded, with no waypoints)
    async def test_a_stationary_path_moves_nothing(self) -> None:
        self.api.follow.return_value = FollowerTurn(basis="Already there.", act="acknowledge", move=AlongPath(kind="path", points=[DEMO_START, DEMO_START]), reaction="none", message="I'm there.")
        with self.assertLogs(HARNESS_LOGGER, level="INFO"): outcome = await self.harness.generate(self.attempt("Stay there"))
        self.assertEqual((outcome.state.position, outcome.state.path, outcome.state.replies[-1].waypoints), (DEMO_START, (DEMO_START,), 0))
        self.assertNotIn("trace", outcome.avatar_plan["steps"][0]["gaze"])

    # A landmark destination reaches its edge instead of its center
    async def test_a_landmark_destination_respects_its_radius(self) -> None:
        self.api.follow.return_value = FollowerTurn(basis="Reach the bus.", act="acknowledge", move=ToLandmark(kind="to_landmark", landmark="bus", side="at"), reaction="none", message="At the bus.")
        with self.assertLogs(HARNESS_LOGGER, level="INFO"): outcome = await self.harness.generate(self.attempt("Go to the bus"))
        self.assertAlmostEqual(outcome.state.position[0], 0.70)
        self.assertAlmostEqual(outcome.state.position[1], 0.66)

    # A question about the map is answered from a draft, locking onto the landmark, and the avatar stays where it is
    async def test_a_simple_question_stays_put(self) -> None:
        self.api.check_draft.return_value = DraftCheck(ok=True)
        with self.assertLogs(HARNESS_LOGGER, level="INFO"): outcome = await self.harness.generate(self.attempt("Do you have a bus?"))
        self.assertEqual((outcome.message, outcome.state.path), ("Yes, I have the bus, a long way to my right.", (DEMO_START,)))
        self.assertEqual(outcome.avatar_plan["steps"][0]["gaze"]["at"], [0.74, 0.66])
        self.assertEqual(outcome.avatar_plan["steps"][1]["face"]["name"], "Wide-Eyed")
        self.api.follow.assert_not_awaited()

    # A move that ends where the avatar already is changes nothing (no new stop on its path)
    async def test_a_move_to_where_it_is_adds_no_stop(self) -> None:
        bridge = DEMO_MAP.landmarks["bridge"].at
        self.harness.state = MapTaskState(position=bridge, path=(DEMO_START, bridge))
        self.api.follow.return_value = FollowerTurn(basis="Already there.", act="acknowledge", move=ToLandmark(kind="to_landmark", landmark="bridge", side="at"), reaction="none", message="I'm there.")
        with self.assertLogs(HARNESS_LOGGER, level="INFO"): outcome = await self.harness.generate(self.attempt("Go to the bridge"))
        self.assertEqual((outcome.state.position, outcome.state.path), (bridge, (DEMO_START, bridge)))
        self.assertNotIn("trace", outcome.avatar_plan["steps"][0]["gaze"])

    # A landmark it doesn't have: a search while thinking, then a last sweep and a head shake
    async def test_a_missing_landmark_is_searched_for(self) -> None:
        self.api.assess.return_value = TurnAssessment(basis="No castle.", meaning="Go to the castle.", conflict="No castle here.", act="report_missing", move=NO_MOVE)
        self.api.reply.return_value  = SpokenReply(reaction="none", message="I don't have a castle.")
        attempt = self.attempt("Go up to the castle")
        with self.assertLogs(HARNESS_LOGGER, level="INFO"): outcome = await self.harness.generate(attempt)

        self.assertEqual(attempt.publish_plan.await_args.args[0]["steps"][0]["face"]["name"], "Furrowed Brow")
        self.assertEqual(outcome.avatar_plan["steps"][1]["move"]["name"], "Shake No")

    # A call that failed every attempt gets the scripted line, and the avatar doesn't move but lowers its map, puzzled
    async def test_a_failed_call_asks_again_without_moving(self) -> None:
        self.api.follow.side_effect = MapTaskAPIError("Map Task follow failed after all attempts")
        with self.assertLogs(HARNESS_LOGGER, level="ERROR"): outcome = await self.harness.generate(self.attempt("Go right a bit"))
        self.assertEqual((outcome.message, outcome.state.path, outcome.state.replies[-1].act), (MSG_SAY_AGAIN, (DEMO_START,), "clarify"))
        self.assertEqual((outcome.avatar_plan["steps"][-1]["prop"], outcome.avatar_plan["steps"][-1]["face"]["name"]), ({"raise": 0}, "Face with Raised Eyebrow"))

    # A move that leaves the avatar at the finish ends the chat after the reply, delighted
    async def test_reaching_the_finish_ends_the_chat(self) -> None:
        self.api.follow.return_value = FollowerTurn(basis="Up to the bridge.", act="acknowledge", move=AlongPath(kind="path", points=[DEMO_FINISH]), reaction="none", message="Okay, up to just below the bridge.")
        with self.assertLogs(HARNESS_LOGGER, level="INFO"): outcome = await self.harness.generate(self.attempt("Go up to just below the bridge"))
        self.assertEqual(outcome.message, f"Okay, up to just below the bridge. {MSG_REACHED_FINISH}")
        self.assertEqual((outcome.close_after, outcome.state.ended, outcome.task_snapshot["ended"]), (True, "reached_finish", "reached_finish"))
        self.assertEqual(outcome.avatar_plan["steps"][-1]["face"], REACTIONS["delighted"].actions["face"])

    # The user's word ends the chat after the avatar checks where it is (curious, then delighted)
    async def test_the_users_word_ends_the_chat_after_the_avatar_checks(self) -> None:
        self.api.follow.return_value = FollowerTurn(basis="They say I'm there.", act="finish", move=NO_MOVE, reaction="smile", message="Okay.")
        with self.assertLogs(HARNESS_LOGGER, level="INFO"): check = await self.harness.generate(self.attempt("I think you're at the finish"))
        self.assertEqual(check.message, f"Alright, I'm {where_am_i(DEMO_MAP, DEMO_START)}. Is that the finish?")
        self.assertEqual((check.close_after, check.state.finish_asked, check.state.replies[-1].act), (False, True, "finish"))
        self.assertEqual(check.avatar_plan["steps"][-1]["move"], REACTIONS["curious"].actions["move"])

        self.harness.on_reply_saved(check)
        with self.assertLogs(HARNESS_LOGGER, level="INFO"): done = await self.harness.generate(self.attempt("Yes"))
        self.assertEqual((done.message, done.close_after, done.state.ended), (MSG_FINISH_CONFIRMED, True, "giver_confirmed"))
        self.assertEqual(done.avatar_plan["steps"][-1]["face"], REACTIONS["delighted"].actions["face"])

    # A direction after the avatar's check carries on, and drops the question
    async def test_a_direction_after_the_check_carries_on(self) -> None:
        self.harness.state = replace(self.harness.state, finish_asked=True)
        self.api.follow.return_value = FollowerTurn(basis="Go left of the bus.", act="acknowledge", move=LEFT_OF_BUS, reaction="none", message="Okay, left of the bus.")
        with self.assertLogs(HARNESS_LOGGER, level="INFO"): outcome = await self.harness.generate(self.attempt("No, go to the left of the bus"))
        self.assertEqual((outcome.message, outcome.close_after, outcome.state.finish_asked), ("Okay, left of the bus.", False, False))

    # A likely misheard landmark name gets the reply check's question instead: no move, and a puzzled look as it asks
    # (the reply worked out beside the check is dropped)
    async def test_a_misheard_name_gets_a_question_instead(self) -> None:
        question = "Sorry, did you say the boulder?"
        verdict  = {"next_step": "clarify", "misheard": "the bolder", "message": question}
        self.check.check.return_value = check_model(tuple(MAP_TASK_SOUNDS), MapTaskBackchannels.GESTURES, turn_end=True, misheard=True).model_validate({"basis": "b", "verdict": verdict})
        self.api.follow.return_value  = FollowerTurn(basis="No bolder here.", act="clarify", move=NO_MOVE, reaction="none", message="Which way round?")
        with self.assertLogs(GATE_LOGGER, level="INFO"): outcome = await self.harness.generate(self.attempt("Go round the bolder"))
        self.assertEqual((outcome.message, outcome.state.path, outcome.state.replies[-1].act), (question, (DEMO_START,), "clarify"))
        self.assertEqual(outcome.avatar_plan["steps"][-1]["face"]["name"], "Face with Raised Eyebrow")

    # Each saved reply joins the task history: the kind of turn it answered, what it did, and the waypoints it added
    async def test_each_saved_reply_is_recorded_in_the_history(self) -> None:
        self.api.follow.return_value      = FollowerTurn(basis="Go left of the bus.", act="acknowledge", move=LEFT_OF_BUS, reaction="none", message="Okay.")
        self.api.check_draft.return_value = DraftCheck(ok=True)
        for text in ("Go to the left of the bus", "Do you have a bus?"):
            with self.assertLogs(HARNESS_LOGGER, level="INFO"): outcome = await self.harness.generate(self.attempt(text))
            self.harness.on_reply_saved(outcome)
        await asyncio.sleep(0)

        expected = [{"route": "instruction", "act": "acknowledge", "waypoints": 1}, {"route": "simple_question", "act": "answer", "waypoints": 0}]
        self.assertEqual(self.harness.history_view()["replies"], expected)
        self.assertEqual(outcome.task_snapshot["replies"], expected)

    # Once the chat ends, the participant is shown the avatar's map and the path it took
    def test_the_reveal_shows_the_avatars_map_and_its_path(self) -> None:
        self.harness.state = MapTaskState(position=(0.4, 0.5), path=(DEMO_START, (0.4, 0.5)))
        self.assertEqual(self.harness.reveal_view(), {"kind": "map_task", **follower_view(DEMO_MAP), "path": [list(DEMO_START), [0.4, 0.5]]})

    # Both checks run with cues, the misheard one knowing every landmark name on either map; neither runs without cues
    def test_the_reply_gate_checks_only_with_cues(self) -> None:
        plain = build_harness(make_consumer(), "map_task", "no_cues", None)
        self.assertEqual([check.on for check in self.harness.reply_gate.checks], [True, True])
        self.assertEqual([check.on for check in plain.reply_gate.checks], [False, False])
        for name in DEMO_MAP.lexicon: self.assertIn(name, self.harness.reply_gate.checks[1].notes)

    # Without cues the participant still gets their map, but the avatar holds none and is sent no plans
    # (the setup still carries the sound, and every shared feature is there, switched off, for a command to switch on)
    async def test_no_cues_sends_only_the_participants_map(self) -> None:
        harness = build_harness(self.consumer, "map_task", "no_cues", None)
        await harness.start()
        self.assertEqual([call.args[0]["type"] for call in self.consumer.send_json.await_args_list], ["avatar_setup", "task_card"])
        self.assertEqual(self.consumer.send_json.await_args_list[0].args[0]["data"]["sounds"], SOUNDS)
        self.assertEqual([type(cue) for cue in harness.cues], [MapTaskBackchannels])
        self.assertEqual({name: feature.on for name, feature in harness.features.items()}, {"backchannels": False, "turn_end": False, "misheard": False})

        self.api.follow.return_value = FollowerTurn(basis="Go left of the bus.", act="acknowledge", move=LEFT_OF_BUS, reaction="none", message="Okay.")
        attempt = self.attempt("Go to the left of the bus")
        with self.assertLogs(HARNESS_LOGGER, level="INFO"): outcome = await harness.generate(attempt)
        self.assertIsNone(outcome.avatar_plan)
        attempt.publish_plan.assert_not_awaited()


# --------------------------------------------------------------------------------
# The Intro
# --------------------------------------------------------------------------------
class MapTaskIntroTests(unittest.IsolatedAsyncioTestCase):
    # A Map Task chat that opens with the intro, its reading and the Map Task's calls replaced
    def setUp(self) -> None:
        self.api     = SimpleNamespace(follow=AsyncMock(), check_draft=AsyncMock(), assess=AsyncMock(), reply=AsyncMock())
        self.reading = SimpleNamespace(read=AsyncMock())
        for replaced in (patch("chat_app.websocket.harnesses.map_task.harness.get_map_task_api", return_value=self.api), patch(GET_INTRO, Mock(return_value=self.reading)), patch(SYNTHESIZE_SOUNDS, AsyncMock(return_value=SOUNDS)), patch(GET_REPLY_CHECK, Mock(return_value=SimpleNamespace(check=AsyncMock(return_value=CHECK_DONE))))):
            replaced.start()
            self.addCleanup(replaced.stop)
        self.consumer = SimpleNamespace(send_json=AsyncMock(), broadcast_task_monitor=AsyncMock(), streaming_active=True, request_harness_turn=Mock(return_value=Mock()))
        self.harness  = build_harness(self.consumer, "map_task", None, None)

    # The user's answer to the intro's question
    def answer(self, text: str) -> TurnAttempt:
        return TurnAttempt(context=[("assistant", "Have you done one of these before?", 0.0), ("user", text, 0.0)], user_text=text, trigger="automatic", publish_mood=AsyncMock(), publish_plan=AsyncMock())

    # The avatar opens the chat once the map is out: its own turn says hello, what the task is, and asks
    async def test_the_avatar_opens_with_the_intro(self) -> None:
        await self.harness.start()
        self.consumer.request_harness_turn.assert_called_once_with()

        outcome = await self.harness.generate(TurnAttempt(context=[], user_text="", trigger="harness", publish_mood=AsyncMock(), publish_plan=AsyncMock()))
        self.assertEqual(outcome.message, f"Hi! {MAP_TASK_INTRO.about} {INTRO_QUESTION}")
        self.assertEqual((outcome.state.path, outcome.state.replies, outcome.state.intro.stage), ((DEMO_START,), (), "asked"))
        self.assertEqual(outcome.task_snapshot["intro"], {"knew_task": None, "explained": False, "questions": 0, "finished": False})
        self.assertEqual((outcome.avatar_plan["steps"][0]["gaze"]["on"], outcome.avatar_plan["steps"][0]["face"]), ("user", REACTIONS["smile"].actions["face"]))

    # Someone new to the task hears how it works, and the avatar stays at the start
    async def test_someone_new_hears_how_it_works(self) -> None:
        self.harness.state = replace(self.harness.state, intro=IntroState(stage="asked"))
        self.reading.read.return_value = IntroReading(basis="Never played.", knows_task=False, next_step="explain", answer=None)
        with self.assertLogs(HARNESSES_LOGGER, level="INFO"): outcome = await self.harness.generate(self.answer("No, what is it?"))
        self.assertEqual(outcome.message, f"{MAP_TASK_INTRO.rules} {INTRO_READY}")
        self.assertEqual((outcome.state.path, outcome.state.replies, outcome.state.intro.explained), ((DEMO_START,), (), True))
        self.api.follow.assert_not_awaited()

    # An answer that already gives a direction goes to the task: the avatar moves, and the intro is over
    async def test_an_answer_with_a_direction_goes_to_the_task(self) -> None:
        self.harness.state = replace(self.harness.state, intro=IntroState(stage="asked"))
        self.reading.read.return_value = IntroReading(basis="Gave a direction.", knows_task=True, next_step="task", answer=None)
        self.api.follow.return_value   = FollowerTurn(basis="Go left of the bus.", act="acknowledge", move=LEFT_OF_BUS, reaction="none", message="Okay, left of the bus.")
        with self.assertLogs(HARNESSES_LOGGER, level="INFO"): outcome = await self.harness.generate(self.answer("Yes. Go to the left of the bus."))
        self.assertEqual(outcome.message, "Okay, left of the bus.")
        self.assertEqual((len(outcome.state.path), len(outcome.state.replies)), (2, 1))
        self.assertEqual(outcome.state.intro, IntroState(stage="done", knew_task=True))


# --------------------------------------------------------------------------------
# Cues
# --------------------------------------------------------------------------------
class MapTaskCueTests(unittest.IsolatedAsyncioTestCase):
    # A Map Task harness with cues (and no intro), and a connection that records what they send
    def setUp(self) -> None:
        no_intro = patch(INTRO_SWITCH, ())
        no_intro.start()
        self.addCleanup(no_intro.stop)
        self.consumer = make_consumer()
        self.harness  = build_harness(self.consumer, "map_task", "cues", None)
        self.addCleanup(self.harness.stop)

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
    # Chats without the intro (its record is tested with it)
    def setUp(self) -> None:
        no_intro = patch(INTRO_SWITCH, ())
        no_intro.start()
        self.addCleanup(no_intro.stop)

    # A listener that joins gets both maps and the avatar's path from the primary connection
    async def test_a_joining_listener_gets_the_view(self) -> None:
        consumer = SimpleNamespace(channel_layer=SimpleNamespace(send=AsyncMock()))
        consumer.harness = build_harness(consumer, "map_task", None, None)
        await ChatConsumer.ws_listener_joined(consumer, {"reply_channel": "listener-1"})

        channel, event = consumer.channel_layer.send.await_args.args
        self.assertEqual((channel, event["type"]), ("listener-1", "ws.task_monitor"))
        self.assertEqual(event["data"], {"kind": "map_task", "giver": giver_view(DEMO_MAP), "follower": follower_view(DEMO_MAP), "position": list(DEMO_START), "path": [list(DEMO_START)], "replies": [], "intro": None, "ended": None})

    # A chat type without a view sends nothing
    async def test_a_chat_type_without_a_view_sends_nothing(self) -> None:
        consumer = SimpleNamespace(channel_layer=SimpleNamespace(send=AsyncMock()))
        consumer.harness = build_harness(consumer, None, None, None)
        await ChatConsumer.ws_listener_joined(consumer, {"reply_channel": "listener-1"})
        consumer.channel_layer.send.assert_not_awaited()
