"""
Close chat sessions left active across a backend restart.
--------------------------------------------------------------------------------
`backend.chat_app.management.commands.close_stale_sessions`

Every WebSocket connection is gone when the backend process restarts, so an
active database row at startup represents a session that can no longer continue.
Keeping this recovery separate prevents account and fixture seeding from owning
chat state.

"""
from django.core.management.base import BaseCommand
from django.db                   import transaction
from django.utils                import timezone

# From this project
from chat_app.models           import ChatSession
from ...services.logging_utils import RESET, SEED_DATA, SD_H, SD_R


# ================================================================================
# Close any ChatSessions orphaned by an earlier backend process
# ================================================================================
class Command(BaseCommand):
    help = "Mark sessions left active by an earlier backend process as inactive."

    # Close every row whose WebSocket disappeared with the earlier process
    @transaction.atomic
    def handle(self, *args: object, **options: object) -> None:
        closed = ChatSession.objects.filter(is_active=True).update(is_active=False, end_ts=timezone.now())
        if closed:
            self.stdout.write(self.style.WARNING(
                f"{SEED_DATA} Closed {SD_H}{closed}{SD_R} session(s) left active before startup.{RESET}"
            ))
