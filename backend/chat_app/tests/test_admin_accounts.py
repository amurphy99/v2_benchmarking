"""
Access and behavior tests for staff account creation and caregiver links.
--------------------------------------------------------------------------------
`backend.chat_app.tests.test_admin_accounts`

There is no public signup: staff create every login through
`/api/admin/accounts/` and decide which participants each caregiver monitors
through `/api/admin/caregivers/`. These tests check that only staff can do either,
that a new participant starts on the model defaults, and that a link update
leaves the caregiver with exactly the participants sent.

"""
from django.contrib.auth import get_user_model
from django.test         import TestCase
from django.urls         import reverse

from rest_framework.test import APIClient

# From this project
from chat_app.models import Access, Account, Goal, Profile, UserSettings


# Shared body for creating one login
def account_body(username: str, role: str) -> dict[str, str]:
    return {"username": username, "password": "new-password", "first_name": "New", "last_name": "Person", "role": role}


# ================================================================================
# Account Creation
# ================================================================================
# Staff create participant and caregiver logins; nobody else can
class AdminCreateAccountTests(TestCase):
    # A staff admin and a caregiver who must not be able to create accounts
    def setUp(self) -> None:
        User = get_user_model()
        self.staff     = User.objects.create_user(username="accounts_staff", is_staff=True)
        self.caregiver = User.objects.create_user(username="accounts_caregiver")
        Account.objects.create(user=self.caregiver, role="caregiver")

        self.api = APIClient()
        self.url = reverse("admin_create_account")

    # A new participant gets a profile, settings, and goal on the defaults, and can log in
    def test_staff_create_participant_with_defaults(self) -> None:
        self.api.force_authenticate(user=self.staff)
        response = self.api.post(self.url, account_body("new_participant", "patient"), format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["role"], "patient")

        profile = Profile.objects.get(account__user__username="new_participant")
        self.assertFalse(profile.save_audio_by_default)
        self.assertEqual(profile.language, "en-US")
        self.assertEqual(UserSettings.objects.get(profile=profile).modelChoice, "smiley")
        self.assertTrue (Goal.objects.filter(profile=profile).exists())

        # The password works at the real login endpoint
        self.api.force_authenticate(user=None)
        login = self.api.post(reverse("token"), {"username": "new_participant", "password": "new-password"}, format="json")
        self.assertEqual(login.status_code, 200)

    # A new caregiver owns no profile
    def test_staff_create_caregiver_without_profile(self) -> None:
        self.api.force_authenticate(user=self.staff)
        self.assertEqual(self.api.post(self.url, account_body("new_caregiver", "caregiver"), format="json").status_code, 201)

        account = Account.objects.get(user__username="new_caregiver")
        self.assertEqual(account.role, "caregiver")
        self.assertFalse(Profile.objects.filter(account=account).exists())

    # Refuse a username that is already taken, and refuse non-staff callers
    def test_duplicate_username_and_non_staff_are_refused(self) -> None:
        self.api.force_authenticate(user=self.staff)
        self.assertEqual(self.api.post(self.url, account_body("accounts_caregiver", "patient"), format="json").status_code, 400)

        self.api.force_authenticate(user=self.caregiver)
        self.assertEqual(self.api.post(self.url, account_body("sneaky_user", "caregiver"), format="json").status_code, 403)
        self.assertFalse(get_user_model().objects.filter(username="sneaky_user").exists())


# ================================================================================
# Caregiver Links
# ================================================================================
# Staff replace a caregiver's set of linked participants
class AdminCaregiverLinkTests(TestCase):
    # Two participants, a caregiver linked to the first, and staff
    def setUp(self) -> None:
        User = get_user_model()
        self.staff          = User.objects.create_user(username="links_staff", is_staff=True)
        self.caregiver_user = User.objects.create_user(username="links_caregiver")
        self.caregiver      = Account.objects.create(user=self.caregiver_user, role="caregiver")
        Account.objects.create(user=self.staff, role="caregiver")

        self.first  = Profile.objects.create(account=Account.objects.create(user=User.objects.create_user(username="links_first" ), role="patient"))
        self.second = Profile.objects.create(account=Account.objects.create(user=User.objects.create_user(username="links_second"), role="patient"))
        Access.objects.create(account=self.caregiver, profile=self.first)

        self.api        = APIClient()
        self.list_url   = reverse("admin_caregiver-list")
        self.detail_url = reverse("admin_caregiver-detail", kwargs={"pk": self.caregiver.id})

    # List caregivers with their links, leaving out staff and patients
    def test_list_shows_non_staff_caregivers_with_links(self) -> None:
        self.api.force_authenticate(user=self.staff)
        [row] = self.api.get(self.list_url).data
        self.assertEqual(row["user"]["username"], "links_caregiver")
        self.assertEqual([participant["id"] for participant in row["participants"]], [self.first.id])

    # The sent list becomes the caregiver's whole set of links
    def test_update_adds_and_removes_links(self) -> None:
        self.api.force_authenticate(user=self.staff)
        response = self.api.put(self.detail_url, {"participant_ids": [self.second.id]}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([participant["id"] for participant in response.data["participants"]], [self.second.id])

        linked = set(Access.objects.filter(account=self.caregiver).values_list("profile_id", flat=True))
        self.assertEqual(linked, {self.second.id})

    # Refuse an unknown participant and non-staff callers, changing nothing
    def test_unknown_participant_and_non_staff_are_refused(self) -> None:
        self.api.force_authenticate(user=self.staff)
        self.assertEqual(self.api.put(self.detail_url, {"participant_ids": [self.second.id + 1_000]}, format="json").status_code, 400)

        self.api.force_authenticate(user=self.caregiver_user)
        self.assertEqual(self.api.get(self.list_url).status_code, 403)
        self.assertEqual(self.api.put(self.detail_url, {"participant_ids": [self.second.id]}, format="json").status_code, 403)

        linked = set(Access.objects.filter(account=self.caregiver).values_list("profile_id", flat=True))
        self.assertEqual(linked, {self.first.id})
