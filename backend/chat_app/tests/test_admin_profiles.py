"""
Access and validation tests for the admin participant settings endpoint.
--------------------------------------------------------------------------------
`backend.chat_app.tests.test_admin_profiles`

Staff and caregivers change a participant's recording default, language, and web
avatar through `/api/admin/profiles/`. These tests check that staff reach every
participant, a caregiver reaches only the participants linked to them, and a
patient reaches none. They also check that a change is what the participant's
next chat and chat page actually read, and that values outside the model
choices are refused.

"""
from django.contrib.auth import get_user_model
from django.test         import TestCase, override_settings
from django.urls         import reverse

from rest_framework.test import APIClient

# From this project
from chat_app.models               import Access, Account, ChatSession, Profile, UserSettings
from chat_app.services.db_services import ChatService


# ================================================================================
# Admin Participant Settings
# ================================================================================
# Staff reach every participant, caregivers only their linked ones, patients none
class AdminProfileSettingsTests(TestCase):
    # A linked participant with two real chats and one demo chat, an unlinked participant, a caregiver, and staff
    def setUp(self) -> None:
        User = get_user_model()
        self.patient   = User.objects.create_user(username="settings_patient")
        self.other     = User.objects.create_user(username="settings_other")
        self.caregiver = User.objects.create_user(username="settings_caregiver")
        self.staff     = User.objects.create_user(username="settings_staff", is_staff=True)

        # Only patients own profiles; the caregiver reaches the first one through `Access`
        patient_account   = Account.objects.create(user=self.patient,   role="patient")
        other_account     = Account.objects.create(user=self.other,     role="patient")
        caregiver_account = Account.objects.create(user=self.caregiver, role="caregiver")
        Account.objects.create(user=self.staff)

        self.profile       = Profile.objects.create(account=patient_account)
        self.other_profile = Profile.objects.create(account=other_account)
        UserSettings.objects.create(profile=self.profile)
        UserSettings.objects.create(profile=self.other_profile)
        Access.objects.create(account=caregiver_account, profile=self.profile)

        # Finished chats (a profile may hold only one active session)
        for source in ("webapp", "webapp", "demo"): ChatSession.objects.create(profile=self.profile, source=source, is_active=False)

        self.api          = APIClient()
        self.list_url     = reverse("admin_profile-list")
        self.detail_url   = reverse("admin_profile-detail", kwargs={"pk": self.profile.id      })
        self.other_detail = reverse("admin_profile-detail", kwargs={"pk": self.other_profile.id})

    # Usernames in one list response
    def listed_usernames(self) -> set[str]:
        return {row["user"]["username"] for row in self.api.get(self.list_url).data}

    # A caregiver lists and changes only their linked participant
    def test_caregiver_reaches_only_linked_participants(self) -> None:
        self.api.force_authenticate(user=self.caregiver)
        self.assertEqual(self.listed_usernames(), {"settings_patient"})

        self.assertEqual(self.api.patch(self.detail_url,   {"modelChoice": "qt"}, format="json").status_code, 200)
        self.assertEqual(self.api.patch(self.other_detail, {"modelChoice": "qt"}, format="json").status_code, 404)
        self.assertEqual(UserSettings.objects.get(profile=self.other_profile).modelChoice, "smiley")

    # A patient monitors nobody, including themselves
    def test_patient_reaches_no_participants(self) -> None:
        self.api.force_authenticate(user=self.patient)
        self.assertEqual(self.listed_usernames(), set())
        self.assertEqual(self.api.patch(self.detail_url, {"save_audio_by_default": True}, format="json").status_code, 404)

        self.profile.refresh_from_db()
        self.assertFalse(self.profile.save_audio_by_default)

    # Staff see every participant without any links
    def test_staff_reach_every_participant(self) -> None:
        self.api.force_authenticate(user=self.staff)
        self.assertEqual(self.listed_usernames(), {"settings_patient", "settings_other"})

    # A staff change is what the participant's next chat and chat page read
    def test_staff_change_reaches_the_participant(self) -> None:
        self.api.force_authenticate(user=self.staff)
        response = self.api.patch(self.detail_url, {"save_audio_by_default": True, "modelChoice": "talkinghead", "language": "de-DE"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["modelChoice"], "talkinghead")
        self.assertEqual(response.data["language"   ], "de-DE")
        self.assertTrue (response.data["save_audio_by_default"])

        # The next chat starts with its audio set to be saved
        next_chat = ChatSession.objects.create(profile=self.profile, source="webapp")
        self.assertTrue(ChatService.get_audio_recording_default(next_chat.id))

        # The participant's own settings (what the chat page loads) show the new avatar
        self.api.force_authenticate(user=self.patient)
        self.assertEqual(self.api.get(reverse("settings")).data["modelChoice"], "talkinghead")

    # Refuse an avatar or language outside the model choices and change nothing
    def test_unknown_avatar_or_language_is_refused(self) -> None:
        self.api.force_authenticate(user=self.staff)
        for body in ({"save_audio_by_default": True, "modelChoice": "smiley-brows"}, {"save_audio_by_default": True, "language": "xx-XX"}):
            self.assertEqual(self.api.patch(self.detail_url, body, format="json").status_code, 400)

        self.profile.refresh_from_db()
        self.assertFalse(self.profile.save_audio_by_default)
        self.assertEqual(self.profile.language, "en-US")
        self.assertEqual(UserSettings.objects.get(profile=self.profile).modelChoice, "smiley")

    # A password staff set is the one the participant logs in with
    def test_staff_set_password_works_at_login(self) -> None:
        self.api.force_authenticate(user=self.staff)
        self.assertEqual(self.api.patch(self.detail_url, {"password": "new-password"}, format="json").status_code, 200)

        self.api.force_authenticate(user=None)
        login = self.api.post(reverse("token"), {"username": "settings_patient", "password": "new-password"}, format="json")
        self.assertEqual(login.status_code, 200)

    # A caregiver changes settings but never a password
    def test_caregiver_cannot_set_password(self) -> None:
        self.api.force_authenticate(user=self.caregiver)
        self.assertEqual(self.api.patch(self.detail_url, {"password": "new-password"}, format="json").status_code, 403)

        self.patient.refresh_from_db()
        self.assertFalse(self.patient.check_password("new-password"))

    # A login whose password startup reapplies from the .env is flagged and cannot be changed here
    @override_settings(DEMO_USERNAME_0="settings_patient")
    def test_env_managed_password_is_read_only(self) -> None:
        self.api.force_authenticate(user=self.staff)
        rows = {row["user"]["username"]: row for row in self.api.get(self.list_url).data}
        self.assertTrue (rows["settings_patient"]["password_from_env"])
        self.assertFalse(rows["settings_other"  ]["password_from_env"])

        self.assertEqual(self.api.patch(self.detail_url, {"password": "new-password"}, format="json").status_code, 400)
        self.patient.refresh_from_db()
        self.assertFalse(self.patient.check_password("new-password"))

    # Count real chats only (caregivers and staff own no profile, so they never appear)
    def test_list_shows_participants_with_real_chat_counts(self) -> None:
        self.api.force_authenticate(user=self.caregiver)
        [row] = self.api.get(self.list_url).data
        self.assertEqual(row["user"]["username"], "settings_patient")
        self.assertEqual(row["chat_count"], 2)
        self.assertIsNotNone(row["last_chat_at"])
