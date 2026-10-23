"""
Verify audible ChatMessage bounds from words and assistant playback reports.
--------------------------------------------------------------------------------
`backend.chat_app.tests.test_chat_message_timestamps`

Message creation time remains separate from the optional interval during which the
message was spoken or played.

"""
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.test         import TestCase
from django.utils        import timezone

# From this project
from chat_app.models               import Account, ChatMessage, ChatSession, Profile
from chat_app.services.db_services import ChatService


# ================================================================================
# Chat Message Timestamp Tests
# ================================================================================
class ChatMessageTimestampTests(TestCase):
    # Create one session shared by each isolated test transaction
    def setUp(self) -> None:
        user    = get_user_model().objects.create_user(username="timestamp_user")
        account = Account.objects.create(user=user)
        profile = Profile.objects.create(account=account)

        self.session = ChatSession.objects.create(profile=profile, source="webapp")

    # Derive message bounds from all related words without relying on input order
    def test_word_timestamps_set_message_bounds(self) -> None:
        message = ChatMessage.objects.create(session=self.session, role="user", content="First second")
        base_ts = timezone.now()

        ChatService.add_words_bulk(message.id, [
            {
                "word"       : "second",
                "start"      : base_ts + timedelta(seconds=2),
                "end"        : base_ts + timedelta(seconds=3),
                "confidence" : 0.9,
            },
            {
                "word"       : "First",
                "start"      : base_ts,
                "end"        : base_ts + timedelta(seconds=1),
                "confidence" : 0.8,
            },
        ])

        message.refresh_from_db()
        self.assertEqual(message.start_ts, base_ts)
        self.assertEqual(message.end_ts,   base_ts + timedelta(seconds=3))

    # Store frontend playback reports in the assistant message's normal interval
    def test_assistant_playback_sets_idempotent_message_bounds(self) -> None:
        message  = ChatMessage.objects.create(session=self.session, role="assistant", content="Hello")
        start_ts = timezone.now()
        end_ts   = start_ts + timedelta(seconds=2)

        with mock.patch("chat_app.services.db_services.timezone.now", return_value=start_ts):
            self.assertTrue(ChatService.mark_assistant_playback(self.session.id, message.id, "started"))

        # A repeated start event must not replace the first accepted boundary
        with mock.patch("chat_app.services.db_services.timezone.now", return_value=end_ts):
            self.assertTrue(ChatService.mark_assistant_playback(self.session.id, message.id, "started"))
            self.assertTrue(ChatService.mark_assistant_playback(self.session.id, message.id, "finished"))

        message.refresh_from_db()
        self.assertEqual(message.start_ts, start_ts)
        self.assertEqual(message.end_ts,   end_ts)

    # Reject playback IDs that do not identify an assistant message in this session
    def test_assistant_playback_rejects_user_message(self) -> None:
        message = ChatMessage.objects.create(session=self.session, role="user", content="Hello")

        updated = ChatService.mark_assistant_playback(self.session.id, message.id, "started")

        self.assertFalse(updated)
        message.refresh_from_db()
        self.assertIsNone(message.start_ts)

