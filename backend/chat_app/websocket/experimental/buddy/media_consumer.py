"""
Robot media socket: relay Buddy's camera, telemetry, and state, and head moves.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.experimental.buddy.media_consumer`

Buddy opens this second socket (`ws/buddy-media/`) when its Video button turns
on, naming the primary chat connection it belongs to, and closes it when Video
turns off. Images and telemetry go to the admin viewers of that chat session as
Buddy sent them. The backend keeps Buddy's newest state so a viewer that joins
late sees it at once.

Buddy turns Video off after 3 s without a command from the backend, so while
media runs the backend sends `get_media_state` every second (the heartbeat).
Every ack Buddy sends carries its state, which the viewers get too. A viewer's
head move goes to Buddy under a backend ID, and Buddy's ack goes back to that
viewer alone.

The socket closes with 4004 when its chat connection ends. It hears that through
the chat connection's existing `stream_status: "ended"` broadcast to the monitor
group, so `ChatConsumer` needs no change.

"""
from __future__   import annotations
from urllib.parse import parse_qs
from uuid         import uuid4

import asyncio, json, logging, weakref
logger = logging.getLogger(__name__)

from channels.generic.websocket import AsyncWebsocketConsumer

# From this project
from ....services            import logging_utils as lu
from  ...services.bg_helpers import fire_and_log
from    .config              import (
    BM_H, BM_R, BUDDY_TAG, MEDIA_HEARTBEAT_INTERVAL_SEC, MEDIA_PARENT_ENDED_CLOSE_CODE, MEDIA_PROTOCOL_VERSION,
    MEDIA_VIEWER_GROUP, UNAUTHENTICATED_CLOSE_CODE,
)
from    .primary_hooks       import attach_media, connection_id_of, detach_media, live_primary


# ================================================================================
# Buddy Media Consumer
# ================================================================================
# One robot's media socket, bound to one primary chat connection
class BuddyMediaConsumer(AsyncWebsocketConsumer):
    # --------------------------------------------------------------------------------
    # Connect and Disconnect
    # --------------------------------------------------------------------------------
    # Accept a media socket that names this user's open chat connection
    async def connect(self) -> None:
        # Everything `disconnect` reads exists before a refusal
        self.user             = self.scope["user"]
        self.primary_ref      = None         # Weak reference to the chat connection's `ChatConsumer`
        self.session_id       = None         # Chat session that connection is running
        self.connection_id    = None         # Opaque `primary_connection_id`
        self.monitor_group    = None         # The chat connection's monitor group (heard only for "ended")
        self.viewer_group     = None         # Admin viewers of this chat session
        self.status           = "connected"  # "ready" after `media_start`
        self.media_session_id = None         # Assigned by each `media_start`
        self.robot_state      = None         # State from Buddy's newest ack
        self.heartbeat_task   = None
        self.heartbeat_count  = 0
        self.head_move_count  = 0
        self.head_moves       = {}           # Backend command ID -> (viewer channel, that viewer's command ID)
        self.images_forwarded = 0

        # Refuse an unknown account, or a chat connection that is not this user's open one
        if not self.user.is_authenticated: await self._refuse(UNAUTHENTICATED_CLOSE_CODE, "not authenticated"); return
        connection_id = parse_qs(self.scope["query_string"].decode())["primary_connection_id"][0]
        primary       = live_primary(connection_id, self.user.id)
        if primary is None: await self._refuse(MEDIA_PARENT_ENDED_CLOSE_CODE, "no open chat connection with that primary_connection_id"); return

        # This socket becomes the chat connection's media socket
        attach_media(primary, self.channel_name)
        self.primary_ref   = weakref.ref(primary)
        self.session_id    = primary.session_id
        self.connection_id = connection_id_of(primary)
        self.monitor_group = f"chat_{self.session_id}_mon"
        self.viewer_group  = MEDIA_VIEWER_GROUP.format(session_id=self.session_id)

        # Hear the chat connection's "ended" broadcast, then tell viewers the robot is here
        await self.channel_layer.group_add(self.monitor_group, self.channel_name)
        await self.accept()
        await self._broadcast_json(self._session_frame(self.status))
        logger.info(f"{BUDDY_TAG} Media socket connected for {BM_H}{self.user.username}{BM_R}, session {BM_H}{self.session_id}{BM_R}.{lu.RESET}")

    # Release the media slot and tell viewers the camera is gone (Buddy closes the socket when Video turns off)
    async def disconnect(self, code: int) -> None:
        if self.heartbeat_task is not None: self.heartbeat_task.cancel()

        # Free the chat connection's media slot (`connect` may have refused before taking it)
        primary = self.primary_ref() if (self.primary_ref is not None) else None
        if primary is not None: detach_media(primary, self.channel_name)

        # Tell viewers, then leave the monitor group
        if self.viewer_group  is not None: await self._broadcast_json(self._session_frame("ended"))
        if self.monitor_group is not None: await self.channel_layer.group_discard(self.monitor_group, self.channel_name)
        logger.info(f"{BUDDY_TAG} Media socket closed for session {BM_H}{self.session_id}{BM_R} (code {code}, {self.images_forwarded} images forwarded).{lu.RESET}")

    # Close before accepting, with one log line naming the reason
    async def _refuse(self, code: int, reason: str) -> None:
        logger.info(f"{BUDDY_TAG} Refused a media socket ({BM_H}{code}{BM_R}): {reason}.{lu.RESET}")
        await self.close(code=code)

    # --------------------------------------------------------------------------------
    # Chat Connection Events
    # --------------------------------------------------------------------------------
    # Of the monitor-group events it shares with the admin listeners, hear only `stream_status`
    async def dispatch(self, message: dict[str, object]) -> None:
        if message["type"].startswith("ws.") and (message["type"] != "ws.stream_status"): return
        await super().dispatch(message)

    # The chat connection ended or was replaced
    async def ws_stream_status(self, event: dict[str, object]) -> None:
        if event["data"]["status"] != "ended": return
        logger.info(f"{BUDDY_TAG} Chat connection for session {BM_H}{self.session_id}{BM_R} ended; closing its media socket.{lu.RESET}")
        await self.close(code=MEDIA_PARENT_ENDED_CLOSE_CODE)

    # --------------------------------------------------------------------------------
    # Receive From Buddy
    # --------------------------------------------------------------------------------
    # Images arrive as binary messages, everything else as JSON text
    async def receive(self, text_data: str | None = None, bytes_data: bytes | None = None) -> None:
        if bytes_data is not None: await self._forward_image(bytes_data)
        else:                      await self._route_json(text_data)

    # Pass one image to viewers exactly as Buddy sent it
    async def _forward_image(self, message: bytes) -> None:
        await self.channel_layer.group_send(self.viewer_group, {"type": "buddy.image", "bytes": message})
        self.images_forwarded += 1
        if self.images_forwarded == 1: logger.info(f"{BUDDY_TAG} First image for session {BM_H}{self.session_id}{BM_R} ({len(message)} bytes).{lu.RESET}")

    # Route one JSON message by its type (telemetry goes to viewers as the text Buddy sent)
    async def _route_json(self, text: str) -> None:
        message  = json.loads(text)
        msg_type = message["type"]
        if   msg_type == "command"     : await self._handle_command(message["data"])
        elif msg_type == "command_ack" : await self._take_ack      (message["data"])
        elif msg_type == "telemetry"   : await self.channel_layer.group_send(self.viewer_group, {"type": "buddy.json", "text": text})
        else: logger.info(f"{BUDDY_TAG} Ignoring a {msg_type} message from Buddy.{lu.RESET}")

    # Keep the state in Buddy's ack, and return a head move's ack to the viewer that asked
    async def _take_ack(self, ack: dict[str, object]) -> None:
        self.robot_state = ack["state"]
        await self._broadcast_json(self._status_frame())

        # Heartbeat acks have no viewer waiting
        head_move = self.head_moves.pop(ack["id"], None)
        if head_move is None: return
        reply_channel, viewer_command_id = head_move
        await self._send_to(reply_channel, {"type": "command_ack", "data": {**ack, "id": viewer_command_id}})

    # --------------------------------------------------------------------------------
    # Media Start and the Heartbeat
    # --------------------------------------------------------------------------------
    # Answer `media_start` (the only command Buddy sends here) by starting a media session
    async def _handle_command(self, envelope: dict[str, object]) -> None:
        name = envelope["name"]
        if name != "media_start":
            await self._send_ack(envelope["id"], name, f"Unknown command: {name}")
            return

        # Each `media_start` gets a fresh media session ID
        self.media_session_id = uuid4().hex
        self.status           = "ready"
        self.robot_state      = None
        logger.info(f"{BUDDY_TAG} Media started for session {BM_H}{self.session_id}{BM_R}.{lu.RESET}")

        # Ack first, so Buddy hears it before the first heartbeat; then tell viewers
        await self._send_ack(envelope["id"], name, None)
        if self.heartbeat_task is None: self.heartbeat_task = fire_and_log(self._heartbeat(), name=f"buddy-media::heartbeat-{self.session_id}")
        await self._broadcast_json(self._session_frame(self.status))

    # Send one ack, carrying the backend's media state
    async def _send_ack(self, command_id: str, name: str, failure: str | None) -> None:
        state = {
            "protocol_version"      : MEDIA_PROTOCOL_VERSION,
            "media_session_id"      : self.media_session_id,
            "chat_session_id"       : str(self.session_id),
            "primary_connection_id" : self.connection_id,
            "status"                : self.status,
        }
        await self._send_json({"type": "command_ack", "data": {"id": command_id, "name": name, "ok": (failure is None), "message": failure, "state": state}})

    # Ask for Buddy's state every second while media runs (Buddy turns Video off after 3 s without a command)
    async def _heartbeat(self) -> None:
        while True:
            self.heartbeat_count += 1  # IDs never repeat on one connection
            await self._send_json({"type": "command", "data": {"id": f"hb-{self.heartbeat_count}", "name": "get_media_state", "data": None}})
            await asyncio.sleep(MEDIA_HEARTBEAT_INTERVAL_SEC)

    # --------------------------------------------------------------------------------
    # Viewers
    # --------------------------------------------------------------------------------
    # A viewer joined: send it the media session and Buddy's newest state
    async def buddy_snapshot(self, event: dict[str, object]) -> None:
        await self._send_to(event["reply_channel"], self._session_frame(self.status))
        if self.robot_state is not None: await self._send_to(event["reply_channel"], self._status_frame())

    # A viewer's head move: send it under a backend ID (viewer IDs can repeat across pages)
    async def buddy_move_head(self, event: dict[str, object]) -> None:
        self.head_move_count += 1
        command_id = f"head-{self.head_move_count}"
        self.head_moves[command_id] = (event["reply_channel"], event["viewer_command_id"])
        await self._send_json({"type": "command", "data": {"id": command_id, "name": "move_head", "data": {"direction": event["direction"]}}})
        logger.info(f"{BUDDY_TAG} Head move {BM_H}{event['direction']}{BM_R} sent for session {BM_H}{self.session_id}{BM_R}.{lu.RESET}")

    # Viewer frame for the media session's lifecycle
    def _session_frame(self, status: str) -> dict[str, object]:
        return {"type": "media_session", "data": {"status": status, "media_session_id": self.media_session_id}}

    # Viewer frame for Buddy's newest state
    def _status_frame(self) -> dict[str, object]:
        return {"type": "media_status", "data": {"state": self.robot_state}}

    # Send JSON to Buddy
    async def _send_json(self, frame: dict[str, object]) -> None:
        await self.send(text_data=json.dumps(frame))

    # Send JSON to every viewer of this session (serialized once for all of them)
    async def _broadcast_json(self, frame: dict[str, object]) -> None:
        await self.channel_layer.group_send(self.viewer_group, {"type": "buddy.json", "text": json.dumps(frame)})

    # Send JSON to one viewer
    async def _send_to(self, channel: str, frame: dict[str, object]) -> None:
        await self.channel_layer.send(channel, {"type": "buddy.json", "text": json.dumps(frame)})
