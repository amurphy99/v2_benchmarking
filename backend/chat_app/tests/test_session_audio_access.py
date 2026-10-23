"""Authorization tests for private session recording metadata and playback."""
import tempfile

from pathlib import Path

from django.contrib.auth import get_user_model
from django.test         import Client, TestCase, override_settings
from django.urls         import reverse
from rest_framework.test import APIClient

from chat_app.models import Access, Account, ChatSession, Goal, Profile, SessionAudio, UserSettings
from chat_app.services.session_audio_storage import local_recording_path


class SessionAudioAccessTests(TestCase):
    def setUp(self) -> None:
        self.temp_directory = tempfile.TemporaryDirectory()
        self.settings = override_settings(
            SESSION_AUDIO_STORAGE="local",
            SESSION_AUDIO_LOCAL_ROOT=Path(self.temp_directory.name),
            SESSION_AUDIO_OBJECT_PREFIX="recordings",
            SESSION_AUDIO_PLAYBACK_URL_TTL_SEC=3_600,
        )
        self.settings.enable()

        User = get_user_model()
        self.owner     = User.objects.create_user(username="audio_owner")
        self.caregiver = User.objects.create_user(username="audio_caregiver")
        self.outsider  = User.objects.create_user(username="audio_outsider")
        self.staff     = User.objects.create_user(username="audio_staff", is_staff=True)

        owner_account     = Account.objects.create(user=self.owner)
        caregiver_account = Account.objects.create(user=self.caregiver)
        Account.objects.create(user=self.outsider)
        Account.objects.create(user=self.staff)

        profile = Profile.objects.create(account=owner_account)
        Goal.objects.create(profile=profile)
        UserSettings.objects.create(profile=profile)
        Access.objects.create(account=caregiver_account, profile=profile, permissions="view")
        session = ChatSession.objects.create(profile=profile, source="webapp")

        object_key = "recordings/private_session.wav"
        recording_path = local_recording_path(object_key)
        recording_path.parent.mkdir(parents=True, exist_ok=True)
        recording_path.write_bytes(b"private recording")
        SessionAudio.objects.create(
            session=session,
            storage_backend="local",
            object_key=object_key,
            size_bytes=recording_path.stat().st_size,
        )

        self.session = session
        self.api     = APIClient()

    def tearDown(self) -> None:
        self.settings.disable()
        self.temp_directory.cleanup()

    # Allow the patient, linked caregiver, and staff while hiding the session from unrelated users
    def test_playback_url_access_matches_session_authorization(self) -> None:
        endpoint = reverse("session_audio_playback", kwargs={"sessionid": self.session.id})

        for user in (self.owner, self.caregiver, self.staff):
            self.api.force_authenticate(user=user)
            response = self.api.get(endpoint)
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.data["url"].startswith(f"/media/session/{self.session.id}/"))

        self.api.force_authenticate(user=self.outsider)
        self.assertEqual(self.api.get(endpoint).status_code, 404)

    # Keep the durable object key private and require the signed, scoped URL to read local bytes
    def test_authorized_details_and_signed_local_stream_hide_storage_key(self) -> None:
        self.api.force_authenticate(user=self.caregiver)
        details_endpoint = reverse("chatsession", kwargs={"sessionid": self.session.id})
        details = self.api.get(details_endpoint)
        self.assertEqual(details.status_code, 200)
        self.assertNotIn("object_key", details.data["audio"])

        playback_endpoint = reverse("session_audio_playback", kwargs={"sessionid": self.session.id})
        playback_url = self.api.get(playback_endpoint).data["url"]
        stream = Client().get(playback_url)
        self.assertEqual(stream.status_code, 200)
        stream.close()

    # Recheck current account state instead of trusting authorization from URL-issuance time
    def test_local_stream_rejects_a_deactivated_token_owner(self) -> None:
        self.api.force_authenticate(user=self.owner)
        endpoint = reverse("session_audio_playback", kwargs={"sessionid": self.session.id})
        playback_url = self.api.get(endpoint).data["url"]

        self.owner.is_active = False
        self.owner.save(update_fields=["is_active"])
        self.assertEqual(Client().get(playback_url).status_code, 403)
