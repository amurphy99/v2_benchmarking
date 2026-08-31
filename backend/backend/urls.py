from django.contrib          import admin
from django.urls             import path, include
from django.conf             import settings
from django.conf.urls.static import static

# This is for the audio file streaming, still not sure if this is the right way
from django.urls import re_path
from .media_view import stream_media

urlpatterns = [
    path("cognibot-manage-dashboard/", admin.site.urls), # using a slightly different URL for security purposes (helps avoid bots scanning for /admin)
    path("api/",   include("chat_app.api.router")),

    # Media views
    re_path(r'^media/(?P<path>.*)$', stream_media),
]

# Serve media files in development (audio recordings, etc.)
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
