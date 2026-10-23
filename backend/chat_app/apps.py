from django.apps import AppConfig


class ChatAppConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'chat_app'

    # NOTE: See `signals.py` for more details
    def ready(self) -> None:
        from . import signals  # Register model lifecycle cleanup handlers
