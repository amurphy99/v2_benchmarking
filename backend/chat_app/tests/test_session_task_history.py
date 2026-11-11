"""
Private task history access and atomic persistence with a committed exchange.
--------------------------------------------------------------------------------
`backend.chat_app.tests.test_session_task_history`

"""
from types         import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test         import TestCase
from django.urls         import reverse

from rest_framework.test import APIClient

# From this project
from chat_app.models                                             import Access, Account, ChatSession, Profile
from chat_app.services.db_services                               import ChatService
from chat_app.websocket.harnesses.cooperative_planning.harness    import PLANNING_SCENARIOS
from chat_app.websocket.harnesses.cooperative_planning.plan_state import initial_state, planning_history
from chat_app.websocket.harnesses.map_task.harness                import MapTaskHarness, MapTaskState


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

        # One completed Map Task session and its history URL
        self.session = ChatSession.objects.create(profile=profile, chat_type="map_task", variant="demo", is_active=False)
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

    # Older maps expose current materials with an explicit unknown path
    def test_legacy_materials_do_not_invent_results(self) -> None:
        # Map Task: current maps, no path
        self.client.force_authenticate(user=self.staff)
        data = self.client.get(self.url).data
        self.assertFalse(data["recorded"])
        self.assertIsNone(data["view"]["path"])
        self.assertIn("giver", data["view"])

        # Cooperative Planning: current scenario, no stage or decisions
        self.session.chat_type = "cooperative_planning"
        self.session.variant   = "dinner_party"
        self.session.save()
        view = self.client.get(self.url).data["view"]
        self.assertIsNone(view["stage"])
        self.assertTrue(all(item["state"] is None for item in view["items"]))
        self.assertTrue(view["avatar_constraints"])

    # Archived materials take precedence over later map-file edits
    def test_snapshot_is_saved_with_the_exchange_and_returned_unchanged(self) -> None:
        # Save a two-step path with one exchange
        harness  = MapTaskHarness(SimpleNamespace(), condition="no_cues", variant="demo")
        path     = (harness.state.position, (0.4, 0.5), (0.6, 0.5))
        snapshot = harness.history_view(MapTaskState(position=path[-1], path=path))
        ChatService.add_exchange(self.session.id, "Go right", "Okay", task_snapshot=snapshot)
        self.session.refresh_from_db()
        self.assertEqual(self.session.task_snapshot, snapshot)

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
        self.session.refresh_from_db()

        # Both sides' constraints are kept
        self.assertEqual(self.session.task_snapshot, snapshot)
        self.assertEqual(snapshot["stage"], "planning")
        self.assertTrue(snapshot["avatar_constraints"])
