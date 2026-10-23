"""
Clean up external recording objects when their database metadata is deleted.
--------------------------------------------------------------------------------
`src.chat_app.signals`

NOTE: Registration as a `receiver` makes it so that whenever a `SessionAudio` 
      database row is deleted, Django will run this function.

"""
import logging
logger = logging.getLogger(__name__)

from django.db                import transaction
from django.db.models.signals import post_delete
from django.dispatch          import receiver

# From this project
from .models                         import SessionAudio
from .services.session_audio_storage import delete_recording


# This gets imported by `apps.py` and that completes the registration process
@receiver(post_delete, sender=SessionAudio)
def delete_session_audio_object(sender: type[SessionAudio], instance: SessionAudio, **kwargs: object) -> None:
    storage_backend = instance.storage_backend
    object_key      = instance.object_key
    audio_id        = instance.id

    # External storage cannot participate in the database transaction. Wait for
    # commit so a rolled-back session deletion never loses its recording object.
    def delete_after_commit() -> None:
        shared_object_exists = SessionAudio.objects.filter(
            storage_backend = storage_backend,
            object_key      = object_key,
        ).exists()
        if shared_object_exists: return

        try: delete_recording(storage_backend, object_key)
        except Exception: logger.exception("Failed to delete the stored object for SessionAudio %s.", audio_id)

    transaction.on_commit(delete_after_commit)

