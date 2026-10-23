"""
Access and validation tests for the admin participant settings endpoint.
--------------------------------------------------------------------------------
`backend.chat_app.tests.test_admin_profiles`

Staff change a participant's recording default and web avatar through
`/api/admin/profiles/`. These tests check that nobody else can, that a change
is what the participant's next chat and chat page actually read, and that an
avatar outside `UserSettings.MODEL_CHOICES` is refused.

"""
from django.contrib.auth import get_user_model
from django.test         import TestCase
from django.urls         import reverse

from rest_framework.test import APIClient

# From this project
from chat_app.models               import Access, Account, ChatSession, Profile, UserSettings
from chat_app.services.db_services import ChatService


# ================================================================================
# Admin Participant Settings
# ================================================================================
# Staff list participants and change their settings; patients and caregivers cannot
class AdminProfileSettingsTests(TestCase):
    # One participant with two real chats and one demo chat, a linked caregiver, and a staff admin
    def setUp(self) -> None:
        User = get_user_model()
        self.patient   = User.objects.create_user(username="settings_patient")
        self.caregiver = User.objects.create_user(username="settings_caregiver")
        self.staff     = User.objects.create_user(username="settings_staff", is_staff=True)

        # Only the patient owns a profile; the caregiver reaches it through `Access`
        patient_account   = Account.objects.create(user=self.patient,   role="patient")
        caregiver_account = Account.objects.create(user=self.caregiver, role="caregiver")
        Account.objects.create(user=self.staff)

        self.profile = Profile.objects.create(account=patient_account)
        UserSettings.objects.create(profile=self.profile)
        Access.objects.create(account=caregiver_account, profile=self.profile)

        # Finished chats (a profile may hold only one active session)
        for source in ("webapp", "webapp", "demo"): ChatSession.objects.create(profile=self.profile, source=source, is_active=False)

        self.api        = APIClient()
        self.list_url   = reverse("admin_profile-list")
        self.detail_url = reverse("admin_profile-detail", kwargs={"pk": self.profile.id})

    # Refuse the patient and a linked caregiver, while staff can read the list
    def test_only_staff_can_list_or_change_participants(self) -> None:
        for user in (self.patient, self.caregiver):
            self.api.force_authenticate(user=user)
            self.assertEqual(self.api.get  (self.list_url                                             ).status_code, 403)
            self.assertEqual(self.api.patch(self.detail_url, {"modelChoice": "smiley"}, format="json").status_code, 403)

        self.assertEqual(UserSettings.objects.get(profile=self.profile).modelChoice, "buddy")

        self.api.force_authenticate(user=self.staff)
        self.assertEqual(self.api.get(self.list_url).status_code, 200)

    # A staff change is what the participant's next chat and chat page read
    def test_staff_change_reaches_the_participant(self) -> None:
        self.api.force_authenticate(user=self.staff)
        response = self.api.patch(self.detail_url, {"save_audio_by_default": True, "modelChoice": "smiley"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["modelChoice"], "smiley")
        self.assertTrue (response.data["save_audio_by_default"])

        # The next chat starts with its audio set to be saved
        next_chat = ChatSession.objects.create(profile=self.profile, source="webapp")
        self.assertTrue(ChatService.get_audio_recording_default(next_chat.id))

        # The participant's own settings (what the chat page loads) show the new avatar
        self.api.force_authenticate(user=self.patient)
        self.assertEqual(self.api.get(reverse("settings")).data["modelChoice"], "smiley")

    # Refuse an avatar outside `MODEL_CHOICES` (the demo-only eyebrows face) and change nothing
    def test_unknown_avatar_is_refused(self) -> None:
        self.api.force_authenticate(user=self.staff)
        response = self.api.patch(self.detail_url, {"save_audio_by_default": True, "modelChoice": "smiley-brows"}, format="json")
        self.assertEqual(response.status_code, 400)

        self.profile.refresh_from_db()
        self.assertFalse(self.profile.save_audio_by_default)
        self.assertEqual(UserSettings.objects.get(profile=self.profile).modelChoice, "buddy")

    # List only participants (caregivers and staff own no profile), counting real chats only
    def test_list_shows_participants_with_real_chat_counts(self) -> None:
        self.api.force_authenticate(user=self.staff)
        [row] = self.api.get(self.list_url).data
        self.assertEqual(row["user"]["username"], "settings_patient")
        self.assertEqual(row["chat_count"], 2)
        self.assertIsNotNone(row["last_chat_at"])
