"""
Routing for backend WebSocket connections
--------------------------------------------------------------------------------
`backend.chat_app.websocket.routing`

We have three active WebSocket endpoints:
* `ws/chat/$`                        : The primary chat connection
* `ws/chat/activity/$`               : Older route for the "activity" chat type
* `ws/chat/<int:session_id>/listen/` : Admin chat monitoring & control view

A primary connection picks its chat type with the `chat_type` query parameter.

Two more are experimental (see `experimental/buddy/README.md`):
* `ws/buddy-media/$`                 : Buddy's camera and telemetry socket
* `ws/chat/<int:session_id>/media/`  : Admin view of that camera and telemetry

"""

from django.urls import re_path

# Consumer classes
from .consumers.consumers     import ChatConsumer
from .consumers.chat_listener import ChatListenerConsumer

# Experimental Buddy media (see websocket/experimental/buddy/README.md)
from .experimental.buddy.media_consumer  import BuddyMediaConsumer
from .experimental.buddy.viewer_consumer import MediaViewerConsumer

# Define URL patterns for each WebSocket/Consumer type we use
# (the older activity route captures its path segment as `chat_type`)
websocket_urlpatterns = [
    re_path(r"ws/chat/$",                            ChatConsumer        .as_asgi()),
    re_path(r"ws/chat/(?P<chat_type>activity)/$",    ChatConsumer        .as_asgi()),
    re_path(r"ws/chat/(?P<session_id>\d+)/listen/$", ChatListenerConsumer.as_asgi()),

    # Experimental Buddy media (see websocket/experimental/buddy/README.md)
    re_path(r"ws/buddy-media/$",                     BuddyMediaConsumer  .as_asgi()),
    re_path(r"ws/chat/(?P<session_id>\d+)/media/$",  MediaViewerConsumer .as_asgi()),
]
