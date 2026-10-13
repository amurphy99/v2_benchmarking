from django.contrib          import admin
from django.urls             import path, include


# This is for the audio file streaming
from .media_view  import stream_session_audio

urlpatterns = [
    path("cognibot-manage-dashboard/", admin.site.urls), # using a slightly different URL for security purposes (helps avoid bots scanning for /admin)
    path("api/",   include("chat_app.api.router")),

    # Media views
    path("media/session/<int:session_id>/", stream_session_audio, name="session_audio_stream"),
]

