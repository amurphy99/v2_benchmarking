"""
Routing for backend WebSocket connections
--------------------------------------------------------------------------------
`backend.chat_app.websocket.routing`

We have three active WebSocket endpoints:
* `ws/chat/$`                        : The primary chat connection
* `ws/chat/activity/$`               : Older route for the "activity" chat type
* `ws/chat/<int:session_id>/listen/` : Admin chat monitoring & control view

A primary connection picks its chat type with the `chat_type` query parameter.

"""

from django.urls import re_path

# Consumer classes
from .consumers.consumers     import ChatConsumer
from .consumers.chat_listener import ChatListenerConsumer

# Define URL patterns for each WebSocket/Consumer type we use
# (the older activity route captures its path segment as `chat_type`)
websocket_urlpatterns = [
    re_path(r"ws/chat/$",                            ChatConsumer        .as_asgi()),
    re_path(r"ws/chat/(?P<chat_type>activity)/$",    ChatConsumer        .as_asgi()),
    re_path(r"ws/chat/(?P<session_id>\d+)/listen/$", ChatListenerConsumer.as_asgi()),
]
