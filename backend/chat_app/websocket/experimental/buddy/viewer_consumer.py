"""
Admin viewer socket: one chat session's robot camera, telemetry, and state.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.experimental.buddy.viewer_consumer`

The admin robot page opens this (`ws/chat/<session_id>/media/`) beside the usual
listener socket. It uses the listener's access rules (who may see a participant's
camera), joins the session's viewer group, and forwards what Buddy's media socket
broadcasts: images as binary messages (Buddy's unchanged `BMV1` bytes), and
`media_session`, `media_status`, and `telemetry` as JSON. The page sends only
`ping`, which also keeps the proxy from closing a quiet socket.

"""
from __future__ import annotations

import json, logging, time
logger = logging.getLogger(__name__)

from channels.db                import database_sync_to_async as db_s2a
from channels.generic.websocket import AsyncWebsocketConsumer

# From this project
from ....api.mixins    import can_access_chat_session
from ....models        import ChatSession
from ....services      import logging_utils as lu
from    .config        import BM_H, BM_R, BUDDY_TAG, MEDIA_VIEWER_GROUP, UNAUTHENTICATED_CLOSE_CODE, VIEWER_FORBIDDEN_CLOSE_CODE, VIEWER_NOT_FOUND_CLOSE_CODE
from    .primary_hooks import media_channel_of, primary_for_session


# ================================================================================
# Media Viewer Consumer
# ================================================================================
# One admin page watching one chat session's robot media
class MediaViewerConsumer(AsyncWebsocketConsumer):
    # Accept staff, the session's owner, and linked caregivers (the listener's rule)
    async def connect(self) -> None:
        self.user         = self.scope["user"]
        self.session_id   = int(self.scope["url_route"]["kwargs"]["session_id"])
        self.viewer_group = None

        # Same checks and close codes as the admin listener
        if not self.user.is_authenticated:                                            await self.close(code=UNAUTHENTICATED_CLOSE_CODE);  return
        if not await db_s2a(ChatSession.objects.filter(id=self.session_id).exists)(): await self.close(code=VIEWER_NOT_FOUND_CLOSE_CODE); return
        if not await db_s2a(can_access_chat_session)(self.user, self.session_id):     await self.close(code=VIEWER_FORBIDDEN_CLOSE_CODE); return

        # Join before accepting (group events wait until `connect` returns)
        self.viewer_group = MEDIA_VIEWER_GROUP.format(session_id=self.session_id)
        await self.channel_layer.group_add(self.viewer_group, self.channel_name)
        await self.accept()

        # Buddy's media socket sends the camera state; with none attached, say so
        primary = primary_for_session(self.session_id)
        channel = media_channel_of(primary) if (primary is not None) else None
        if channel is not None: await self.channel_layer.send(channel, {"type": "buddy.snapshot", "reply_channel": self.channel_name})
        else:                   await self.send(text_data=json.dumps({"type": "media_session", "data": {"status": "none", "media_session_id": None}}))
        logger.info(f"{BUDDY_TAG} Viewer {BM_H}{self.user.username}{BM_R} connected to session {BM_H}{self.session_id}{BM_R}.{lu.RESET}")

    # Leave the viewer group (a viewer never owns the chat or the robot's media)
    async def disconnect(self, code: int) -> None:
        if self.viewer_group is not None: await self.channel_layer.group_discard(self.viewer_group, self.channel_name)

    # Answer the page's latency ping
    async def receive(self, text_data: str | None = None, bytes_data: bytes | None = None) -> None:
        message = json.loads(text_data)
        if message["type"] == "ping": await self.send(text_data=json.dumps({"type": "pong", "client_ts": message["client_ts"], "server_ts": time.time()}))

    # --------------------------------------------------------------------------------
    # Forward Robot Media
    # --------------------------------------------------------------------------------
    # One camera image, as Buddy sent it
    async def buddy_image(self, event: dict[str, object]) -> None:
        await self.send(bytes_data=event["bytes"])

    # One JSON frame (session, state, or telemetry), already serialized
    async def buddy_json(self, event: dict[str, object]) -> None:
        await self.send(text_data=event["text"])
