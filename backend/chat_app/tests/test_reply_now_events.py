"""Persistence tests for received `reply_now` commands."""
from datetime import datetime, timezone as datetime_timezone

from django.contrib.auth import get_user_model
from django.test         import TestCase
from django.utils        import timezone

from chat_app.models               import Account, ChatSession, Profile, ReplyNowEvent
from chat_app.services.db_services import ChatService


class ReplyNowEventTests(TestCase):
    def setUp(self) -> None:
        User = get_user_model()
        self.owner = User.objects.create_user(username="reply_owner")
        self.admin = User.objects.create_user(username="reply_admin", is_staff=True)
        account = Account.objects.create(user=self.owner)
        profile = Profile.objects.create(account=account)
        self.session = ChatSession.objects.create(profile=profile, source="webapp")

    def test_event_preserves_transport_metadata(self) -> None:
        received_at = 1_700_000_000.25
        event = ChatService.add_reply_now_event(
            self.session.id,
            origin          = "admin_listener",
            received_at     = received_at,
            response_mode   = "manual",
            requested_by_id = self.admin.id,
            command_id      = "command-17",
        )

        expected_received_at = datetime.fromtimestamp(received_at, tz=datetime_timezone.utc)
        self.assertEqual(event.received_at, expected_received_at)
        self.assertGreaterEqual(event.created_at, expected_received_at)
        self.assertEqual(event.origin, "admin_listener")
        self.assertEqual(event.requested_by, self.admin)
        self.assertEqual(event.command_id, "command-17")
        self.assertEqual(event.response_mode, "manual")

    def test_consecutive_commands_are_separate_events(self) -> None:
        for command_id in ("first", "second"):
            ChatService.add_reply_now_event(
                self.session.id,
                origin          = "primary_client",
                received_at     = timezone.now(),
                response_mode   = "manual",
                requested_by_id = self.owner.id,
                command_id      = command_id,
            )

        self.assertEqual(
            list(ReplyNowEvent.objects.values_list("command_id", flat=True)),
            ["first", "second"],
        )
