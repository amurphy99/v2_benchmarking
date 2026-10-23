"""
Verify that startup fixture seeding is idempotent and preserves linked data.
--------------------------------------------------------------------------------
`backend.chat_app.tests.test_seed_data_safety`

These tests replace the analyzed-chat LLM call with a local async mock version.

"""
from django.contrib.auth    import get_user_model
from django.core.management import call_command
from django.test            import TestCase
from datetime            import date
from unittest            import mock

# From this project
from chat_app.management.commands.seed_demo             import Command
from chat_app.management.seed_data.analyzed             import ANALYZED_SOURCE, seed_analyzed_chats
from chat_app.management.seed_data.sample               import seed_chats, seed_images, seed_reminders
from chat_app.management.seed_data.transcript           import seed_transcript_chat
from chat_app.management.seed_data.transcript_data.data import DEMO_IMAGES
from chat_app.models                                    import AlbumImage, ChatSession, SessionAudio


# ================================================================================
# Non-Destructive Account Setup
# ================================================================================
class SeedAccountSafetyTests(TestCase):

    # Preserve chats while refreshing environment-managed account fields
    def test_ensure_user_preserves_linked_chat_data(self) -> None:
        command = Command()
        user    = command.ensure_user(
            username         = "persistent_user",
            password         = "initial-password",
            refresh_password = True,
            first_name       = "Initial",
        )
        profile = command.ensure_patient_profile(user, date(2026, 1, 1))
        session = ChatSession.objects.create(profile=profile, source="webapp", is_active=False)

        refreshed_user = command.ensure_user(
            username         = "persistent_user",
            password         = "updated-password",
            refresh_password = True,
            first_name       = "Updated",
        )

        self.assertEqual(refreshed_user.id, user.id)
        self.assertEqual(refreshed_user.first_name, "Updated")
        self.assertTrue(refreshed_user.check_password("updated-password"))
        self.assertTrue(ChatSession.objects.filter(id=session.id, profile=profile).exists())

    # Preserve an orphaned session while moving restart recovery out of seed_demo
    def test_close_stale_sessions_marks_rows_inactive_without_deleting(self) -> None:
        command = Command()
        user    = command.ensure_user(username="active_user", password="test-password")
        profile = command.ensure_patient_profile(user, date(2026, 1, 1))
        session = ChatSession.objects.create(profile=profile, source="webapp", is_active=True)

        call_command("close_stale_sessions")
        session.refresh_from_db()

        self.assertFalse(session.is_active)
        self.assertIsNotNone(session.end_ts)
        self.assertTrue(ChatSession.objects.filter(id=session.id).exists())


# ================================================================================
# Idempotent Fixture Datasets
# ================================================================================
class SeedFixtureIdempotencyTests(TestCase):

    # Create one otherwise-empty patient profile for each fixture test
    def setUp(self) -> None:
        user         = get_user_model().objects.create_user(username="fixture_owner", password="test-password")
        self.profile = Command().ensure_patient_profile(user, date(2026, 1, 1))

    # Preserve unrelated images while safely refreshing known fixture topics
    def test_seed_images_preserves_unrelated_rows(self) -> None:
        custom_image = AlbumImage.objects.create(
            topic            = "Researcher Custom Topic",
            url              = "https://example.com/custom.jpg",
            photographer     = "Researcher",
            photographer_url = "https://example.com",
        )

        seed_images()
        seed_images()

        self.assertTrue(AlbumImage.objects.filter(id=custom_image.id).exists())
        self.assertEqual(AlbumImage.objects.count(), len(DEMO_IMAGES) + 1)

    # Avoid duplicate random chats and reminders across repeated startup runs
    def test_ui_sample_seeders_create_missing_data_once(self) -> None:
        seed_images()

        self.assertEqual(seed_chats(self.profile, days_back=1), 2)
        self.assertEqual(seed_chats(self.profile, days_back=1), 0)
        self.assertEqual(ChatSession.objects.filter(profile=self.profile, source="demo").count(), 2)

        self.assertEqual(seed_reminders(self.profile, num_reminders=2), 3)
        self.assertEqual(seed_reminders(self.profile, num_reminders=2), 0)
        self.assertEqual(self.profile.reminder_user.count(), 3)

    # Recognize one imported recording before storage or analysis work begins
    @mock.patch("chat_app.management.seed_data.transcript.store_recording")
    @mock.patch("chat_app.management.seed_data.transcript._file_sha256", return_value="fixture-checksum")
    def test_transcript_seed_skips_existing_audio_checksum(
        self,
        checksum_call : mock.Mock,  # Stable test replacement for hashing the source WAV
        storage_call  : mock.Mock,  # Must remain unused when the fixture already exists
    ) -> None:
        session = ChatSession.objects.create(profile=self.profile, source="transcript", is_active=False)
        SessionAudio.objects.create(
            session         = session,
            storage_backend = "local",
            object_key      = "recordings/existing.wav",
            sha256          = "fixture-checksum",
        )

        seeded_session = seed_transcript_chat(self.profile, self.profile.account.user, test_dir="test_02")

        self.assertIsNone(seeded_session)
        checksum_call.assert_called_once()
        storage_call.assert_not_called()

    # Keep analyzed fixtures distinct from real webapp sessions and avoid LLM calls
    @mock.patch("chat_app.management.seed_data.analyzed.ChatService.save_session_fields")
    @mock.patch("chat_app.management.seed_data.analyzed.post_chat_analysis", new_callable=mock.AsyncMock)
    def test_analyzed_chats_use_dedicated_source_and_seed_once(
        self,
        analysis_call       : mock.AsyncMock,  # Local replacement for post-chat analysis
        save_session_fields : mock.Mock,       # Avoid unrelated image/session enrichment
    ) -> None:
        analysis_call.return_value = {
            "summary"     : "",
            "sentiment"   : "",
            "emotion"     : "",
            "topics"      : [],
            "risk_rating" : 0,
            "risk_reason" : "",
            "risk_quotes" : [],
        }
        user = self.profile.account.user

        created = seed_analyzed_chats(self.profile, user)

        self.assertGreater(created, 0)
        self.assertEqual(seed_analyzed_chats(self.profile, user), 0)
        self.assertEqual(ChatSession.objects.filter(profile=self.profile, source=ANALYZED_SOURCE).count(), created)
        self.assertFalse(ChatSession.objects.filter(profile=self.profile, source="webapp").exists())
        self.assertEqual(analysis_call.await_count, created)
        self.assertEqual(save_session_fields.call_count, created)
