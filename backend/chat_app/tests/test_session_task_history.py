"""
Private task history access and atomic persistence with a committed exchange.
--------------------------------------------------------------------------------
`backend.chat_app.tests.test_session_task_history`

A task chat records its run (condition and variant) as its session starts, and
its task snapshot on that run; any other chat records neither.

"""
from types         import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test         import TestCase
from django.urls         import reverse

from rest_framework.test import APIClient

# From this project
from chat_app.models                                             import Access, Account, ChatRun, ChatSession, Profile, TaskSnapshot
from chat_app.services.db_services                               import ChatService
from chat_app.websocket.harnesses.cooperative_planning.harness    import PLANNING_SCENARIOS
from chat_app.websocket.harnesses.cooperative_planning.plan_state import initial_state, planning_history
from chat_app.websocket.harnesses.map_task.harness                import MapTaskHarness, MapTaskState
from chat_app.websocket.harnesses.speech_elicitation.topics       import ELICITATION_TOPICS


# ================================================================================
# Saved Task History
# ================================================================================
class SessionTaskHistoryTests(TestCase):
    # A participant, linked caregiver, unrelated caregiver, and staff
    def setUp(self) -> None:
        # Users
        User           = get_user_model()
        self.owner     = User.objects.create_user(username="task_owner")
        self.caregiver = User.objects.create_user(username="task_caregiver")
        self.outsider  = User.objects.create_user(username="task_outsider")
        self.staff     = User.objects.create_user(username="task_staff", is_staff=True)

        # Accounts (only the first caregiver is linked to the participant)
        profile   = Profile.objects.create(account=Account.objects.create(user=self.owner, role="patient"))
        caregiver = Account.objects.create(user=self.caregiver, role="caregiver")
        Account.objects.create(user=self.outsider, role="caregiver")
        Access.objects.create(account=caregiver, profile=profile, permissions="view")

        # One completed Map Task session, its run, and its history URL
        self.profile = profile
        self.session = ChatSession.objects.create(profile=profile, chat_type="map_task", is_active=False)
        self.run     = ChatRun.objects.create(session=self.session, condition="cues", variant="demo")
        self.client  = APIClient()
        self.url     = reverse("session_task_history", kwargs={"sessionid": self.session.id})

    # Snapshots are private even when the participant can read their ordinary session
    def test_access_is_limited_to_staff_and_linked_caregivers(self) -> None:
        # Only staff and the linked caregiver read task history
        for user, status in ((self.owner, 403), (self.outsider, 404), (self.caregiver, 200), (self.staff, 200)):
            self.client.force_authenticate(user=user)
            self.assertEqual(self.client.get(self.url).status_code, status)

        # The participant's own session response leaves the snapshot out
        self.client.force_authenticate(user=self.owner)
        self.assertNotIn("task_snapshot", self.client.get(reverse("chatsession", kwargs={"sessionid": self.session.id})).data)

    # Older sessions expose current materials with explicitly unknown results
    def test_legacy_materials_do_not_invent_results(self) -> None:
        # Map Task: current maps, no path or replies
        self.client.force_authenticate(user=self.staff)
        data = self.client.get(self.url).data
        self.assertFalse(data["recorded"])
        self.assertEqual((data["view"]["path"], data["view"]["replies"]), (None, None))
        self.assertIn("giver", data["view"])

        # Cooperative Planning: current scenario, no stage or decisions
        self.session.chat_type = "cooperative_planning"
        self.run.variant       = "dinner_party"
        self.session.save()
        self.run.save()
        view = self.client.get(self.url).data["view"]
        self.assertIsNone(view["stage"])
        self.assertTrue(all(item["state"] is None for item in view["items"]))
        self.assertTrue(view["avatar_constraints"])

        # Speech elicitation: the current topic, no threads
        self.session.chat_type = "speech_elicitation"
        self.run.variant       = "pet_person"
        self.session.save()
        self.run.save()
        view = self.client.get(self.url).data["view"]
        self.assertEqual((view["kind"], view["opening"], view["threads"]), ("speech_elicitation", ELICITATION_TOPICS["pet_person"].opening, None))

    # Archived materials take precedence over later map-file edits
    def test_snapshot_is_saved_with_the_exchange_and_returned_unchanged(self) -> None:
        # Save a two-step path with one exchange
        harness  = MapTaskHarness(SimpleNamespace(), condition="no_cues", variant="demo")
        path     = (harness.state.position, (0.4, 0.5), (0.6, 0.5))
        snapshot = harness.history_view(MapTaskState(position=path[-1], path=path))
        ChatService.add_exchange(self.session.id, "Go right", "Okay", task_snapshot=snapshot)
        self.assertEqual(TaskSnapshot.objects.get(run=self.run).data, snapshot)

        # The endpoint returns the saved maps even after the map files are gone
        self.client.force_authenticate(user=self.staff)
        with patch("chat_app.services.session_task_history.MAP_TASK_MAPS", {}):
            self.assertEqual(self.client.get(self.url).data, {"recorded": True, "view": snapshot})

    # A failure to save task history rolls back both messages as well
    def test_snapshot_failure_cannot_leave_a_partial_exchange(self) -> None:
        with patch.object(ChatService, "save_task_snapshot", side_effect=RuntimeError("write failed")):
            with self.assertRaises(RuntimeError): ChatService.add_exchange(self.session.id, "Go right", "Okay", task_snapshot={"kind": "map_task"})
        self.assertEqual(self.session.messages.count(), 0)

    # Opening replies without a user message also preserve the scenario
    def test_single_reply_keeps_both_sides_of_the_scenario(self) -> None:
        # Save the opening reply with the starting plan
        scenario = PLANNING_SCENARIOS["dinner_party"]
        snapshot = planning_history(scenario, initial_state(scenario))
        ChatService.add_message(self.session.id, "assistant", "Let's plan dinner", task_snapshot=snapshot)

        # Both sides' constraints are kept
        self.assertEqual(TaskSnapshot.objects.get(run=self.run).data, snapshot)
        self.assertEqual(snapshot["stage"], "planning")
        self.assertTrue(snapshot["avatar_constraints"])

    # A chat without a run (not a task chat) has no task history
    def test_a_chat_without_a_run_has_no_task_history(self) -> None:
        other = ChatSession.objects.create(profile=self.profile, chat_type="unguided", is_active=False)
        self.client.force_authenticate(user=self.staff)
        response = self.client.get(reverse("session_task_history", kwargs={"sessionid": other.id}))
        self.assertEqual(response.data, {"recorded": False, "view": None})


# ================================================================================
# Recording a Run
# ================================================================================
class ChatRunRecordingTests(TestCase):
    # A participant with no chats yet
    def setUp(self) -> None:
        self.user = get_user_model().objects.create_user(username="run_owner")
        Profile.objects.create(account=Account.objects.create(user=self.user, role="patient"))

    # A task chat records its run as its session starts, and finds the same session again
    def test_a_task_chat_records_its_run(self) -> None:
        session = ChatService.get_or_create_active_session(self.user, source="webapp", chat_type="map_task", condition="cues", variant="demo")
        self.assertEqual((session.run.condition, session.run.variant), ("cues", "demo"))

        again = ChatService.get_or_create_active_session(self.user, source="webapp", chat_type="map_task", condition="cues", variant="demo")
        self.assertEqual((again.id, ChatRun.objects.count()), (session.id, 1))

    # A chat with no condition or variant (open conversation) records no run
    def test_another_chat_records_none(self) -> None:
        session = ChatService.get_or_create_active_session(self.user, source="webapp", chat_type="unguided", condition="", variant="")
        self.assertIsNone(session.run_or_none)
        self.assertEqual(ChatRun.objects.count(), 0)
