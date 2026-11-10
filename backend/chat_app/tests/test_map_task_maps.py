"""
The staff preview of the Map Task map files.
--------------------------------------------------------------------------------
`backend.chat_app.tests.test_map_task_maps`

`/api/map-task/maps/` draws both maps of every map file for the staff preview
page. The avatar's map is part of it, so a participant must never get it.

"""
from django.contrib.auth import get_user_model
from django.test         import TestCase
from django.urls         import reverse

from rest_framework.test import APIClient


# ================================================================================
# Map File Preview
# ================================================================================
# Who may read the map files, and what a staff member gets
class MapTaskMapsTests(TestCase):
    # A staff member and a participant, each with a client of their own
    def setUp(self) -> None:
        User = get_user_model()
        self.staff       = APIClient()
        self.participant = APIClient()
        self.staff      .force_authenticate(user=User.objects.create_user(username="maps_staff", is_staff=True))
        self.participant.force_authenticate(user=User.objects.create_user(username="maps_participant"))

    # Staff get every map file, the demo map first with both of its maps
    def test_staff_get_both_maps_of_every_file(self) -> None:
        response = self.staff.get(reverse("map_task_maps"))
        self.assertEqual(response.status_code, 200)

        demo = response.data[0]
        self.assertEqual((demo["variant"], demo["registered"], demo["error"]), ("demo", True, None))
        self.assertIn("castle", [landmark["id"] for landmark in demo["giver"   ]["landmarks"]])
        self.assertIn("lake",   [landmark["id"] for landmark in demo["follower"]["landmarks"]])

    # A participant is refused (the preview shows the avatar's map)
    def test_participants_are_refused(self) -> None:
        self.assertEqual(self.participant.get(reverse("map_task_maps")).status_code, 403)
