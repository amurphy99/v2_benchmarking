"""
Routing for backend WebSocket connections
--------------------------------------------------------------------------------
backend.chat_app.websocket.routing

We have three active WebSocket endpoints:
* `ws/chat/$`                        : The standard chat WebSocket connection
* `ws/chat/activity/$`               : Structured chat activity 
* `ws/chat/<int:session_id>/listen/` : Admin chat monitoring & control view

"""

from django.urls import re_path

# Consumer classes
from .consumers.consumers       import ChatConsumer
from .consumers.chat_activities import ActivityChatConsumer
from .consumers.chat_listener   import ChatListenerConsumer

# Define URL patterns for each WebSocket/Consumer type we use
websocket_urlpatterns = [
    re_path(r"ws/chat/$",                            ChatConsumer        .as_asgi()),
    re_path(r"ws/chat/activity/$",                   ActivityChatConsumer.as_asgi()),
    re_path(r"ws/chat/(?P<session_id>\d+)/listen/$", ChatListenerConsumer.as_asgi()),
]
