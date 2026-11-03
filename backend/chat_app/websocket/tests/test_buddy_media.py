"""
Buddy's experimental input-mode switch, media socket, and admin viewer socket.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.tests.test_buddy_media`

Each test opens a real primary chat socket as Buddy, with Google STT, the session
recorder, and post-chat analysis replaced, and drives the sockets in
`websocket/experimental/buddy/` around it. Deleting that package means deleting
this file too.

"""
from unittest.mock import AsyncMock, Mock, patch

import json

from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator

from django.contrib.auth        import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.test                import TransactionTestCase

# From this project
from chat_app.models                         import Account, Profile, UserSettings
from chat_app.services.db_services           import ChatService
from chat_app.websocket.routing              import websocket_urlpatterns
from chat_app.websocket.services.chatHelpers import ChatHandler

# Long enough for a socket to answer or report its close code
SOCKET_TIMEOUT_SEC = 5

# Stand-in JPEG bytes (the backend never decodes the image)
FAKE_JPEG = b"\xff\xd8 test image \xff\xd9"

# The `media_start` body Buddy sends
MEDIA_START = {"protocol_version": 1}


# State Buddy reports in every ack
def robot_state(media_session_id: str) -> dict:
    return {
        "media_session_id" : media_session_id,
        "video"            : {"requested_fps": 5.0, "effective_fps": 5.0, "measured_fps": None, "width": None, "height": None, "frames_sent": 0, "frames_dropped": 0},
        "head"             : {"available": True, "busy": False, "pitch_deg": 0.0, "yaw_deg": 0.0},
        "last_error"       : None,
    }


# Build one `BMV1` image message
def image_message(media_session_id: str) -> bytes:
    header = json.dumps({"media_session_id": media_session_id, "seq": 1, "encoding": "jpeg", "width": 640, "height": 480, "rotation_deg": None, "mirrored": None}).encode()
    return b"BMV1" + len(header).to_bytes(4, "big") + header + FAKE_JPEG


# ================================================================================
# Shared Setup
# ================================================================================
# A participant whose robot opens a primary chat socket, with STT, recording, and analysis replaced
class BuddyChatTestCase(TransactionTestCase):
    def setUp(self) -> None:
        User = get_user_model()
        self.robot_user = User.objects.create_user(username="buddy_robot")
        self.staff      = User.objects.create_user(username="buddy_staff", is_staff=True)
        self.outsider   = User.objects.create_user(username="buddy_outsider")
        profile = Profile.objects.create(account=Account.objects.create(user=self.robot_user, role="patient"))
        UserSettings.objects.create(profile=profile)
        Account.objects.create(user=self.outsider, role="caregiver")

        # Every recognizer built by the chat consumer or the hooks, in order
        self.providers = []
        provider_class = Mock(side_effect=self._new_provider)
        recorder_class = Mock()
        recorder_class.return_value.finalize.return_value = None

        # Replace them where they are looked up; staged speech never reaches an LLM
        for replacement in (
            patch("chat_app.websocket.consumers.consumers.SpeechToTextProvider",              new=provider_class),
            patch("chat_app.websocket.experimental.buddy.primary_hooks.SpeechToTextProvider", new=provider_class),
            patch("chat_app.websocket.consumers.consumers.SessionAudioRecorder",              new=recorder_class),
            patch.object(ChatService, "close_session",      new=AsyncMock(return_value=None)),
            patch.object(ChatHandler, "stage_and_schedule", new=AsyncMock()),
        ):
            replacement.start()
            self.addCleanup(replacement.stop)

    # One stand-in recognizer
    def _new_provider(self, **_: object) -> Mock:
        provider = Mock(name=f"provider-{len(self.providers)}")
        self.providers.append(provider)
        return provider

    # --------------------------------------------------------------------------------
    # Sockets
    # --------------------------------------------------------------------------------
    # Open the robot's primary chat socket
    async def open_primary(self, source: str = "buddyrobot") -> WebsocketCommunicator:
        primary = WebsocketCommunicator(URLRouter(websocket_urlpatterns), "/ws/chat/")
        primary.scope.update({"user": self.robot_user, "source": source, "chat_type": None, "condition": None, "variant": None})
        accepted, _ = await primary.connect(timeout=SOCKET_TIMEOUT_SEC)
        self.assertTrue(accepted)
        return primary

    # Open a primary and send Buddy's probe; return the socket, its connection ID, and its session ID
    async def open_probed_primary(self) -> tuple[WebsocketCommunicator, str, int]:
        primary = await self.open_primary()
        ack     = await self.command(primary, "get_control_state", command_id="probe")
        return primary, ack["session"]["primary_connection_id"], int(ack["session"]["chat_session_id"])

    # Open a media socket (it is returned even when refused, with the close code)
    async def open_media(self, connection_id: str, user: object) -> tuple[WebsocketCommunicator, bool, object]:
        media = WebsocketCommunicator(URLRouter(websocket_urlpatterns), f"/ws/buddy-media/?primary_connection_id={connection_id}")
        media.scope.update({"user": user, "source": "buddyrobot"})
        accepted, code = await media.connect(timeout=SOCKET_TIMEOUT_SEC)
        return media, accepted, code

    # Open an admin viewer socket for one session
    async def open_viewer(self, session_id: int, user: object) -> tuple[WebsocketCommunicator, bool, object]:
        viewer = WebsocketCommunicator(URLRouter(websocket_urlpatterns), f"/ws/chat/{session_id}/media/")
        viewer.scope.update({"user": user, "source": "webapp"})
        accepted, code = await viewer.connect(timeout=SOCKET_TIMEOUT_SEC)
        return viewer, accepted, code

    # Close every socket a test opened
    async def close_all(self, *sockets: WebsocketCommunicator) -> None:
        for socket in sockets: await socket.disconnect(timeout=SOCKET_TIMEOUT_SEC)

    # --------------------------------------------------------------------------------
    # Frames
    # --------------------------------------------------------------------------------
    # Send one command and return its ack's body
    async def command(self, socket: WebsocketCommunicator, name: str, data: object = None, command_id: str = "c-1") -> dict:
        await socket.send_json_to({"type": "command", "data": {"id": command_id, "name": name, "data": data}})
        return await self.next_ack(socket, command_id)

    # Read until the ack for one command ID arrives
    async def next_ack(self, socket: WebsocketCommunicator, command_id: str) -> dict:
        while True:
            ack = await self.next_frame(socket, "command_ack")
            if ack["id"] == command_id: return ack

    # Read until a JSON frame of one type arrives, skipping images and other frames
    async def next_frame(self, socket: WebsocketCommunicator, frame_type: str) -> dict:
        while True:
            message = await socket.receive_from(timeout=SOCKET_TIMEOUT_SEC)
            if isinstance(message, bytes): continue
            frame = json.loads(message)
            if frame["type"] == frame_type: return frame.get("data")

    # Read until the backend sends one named command
    async def next_command(self, socket: WebsocketCommunicator, name: str) -> dict:
        while True:
            command = await self.next_frame(socket, "command")
            if command["name"] == name: return command

    # Read until an image arrives
    async def next_image(self, socket: WebsocketCommunicator) -> bytes:
        while True:
            message = await socket.receive_from(timeout=SOCKET_TIMEOUT_SEC)
            if isinstance(message, bytes): return message

    # Read until the server closes the socket; return the close code
    async def close_code(self, socket: WebsocketCommunicator) -> int:
        while True:
            output = await socket.receive_output(timeout=SOCKET_TIMEOUT_SEC)
            if output["type"] == "websocket.close": return output["code"]

    # Start media on an open media socket; return the new media session ID
    async def start_media(self, media: WebsocketCommunicator) -> str:
        ack = await self.command(media, "media_start", MEDIA_START, command_id="start")
        self.assertTrue(ack["ok"], ack["message"])
        self.assertEqual(ack["state"]["status"], "ready")
        return ack["state"]["media_session_id"]


# ================================================================================
# Input Mode
# ================================================================================
class InputModeTests(BuddyChatTestCase):
    # The probe ack carries the capabilities, the connection identity, and the starting `sdk` mode
    async def test_probe_ack_carries_capabilities_and_session(self) -> None:
        primary = await self.open_primary()
        ack     = await self.command(primary, "get_control_state")
        await self.close_all(primary)

        self.assertEqual(ack["capabilities"], ["buddy_input_mode_v1", "buddy_media_v1"])
        self.assertEqual((ack["state"]["input_mode"], ack["state"]["input_mode_revision"]), ("sdk", 0))
        self.assertTrue(ack["session"]["primary_connection_id"])
        self.assertTrue(ack["session"]["chat_session_id"].isdigit())

    # A connection that never probes gets today's ack, field for field
    async def test_acks_are_unchanged_without_the_probe(self) -> None:
        primary = await self.open_primary(source="webapp")
        ack     = await self.command(primary, "set_response_mode", {"mode": "manual"})
        await self.close_all(primary)

        self.assertEqual(set(ack),          {"id", "name", "ok", "message", "state"})
        self.assertEqual(set(ack["state"]), {"listening", "response_mode", "recording_enabled"})

    # A stale revision changes nothing; a change increments; asking for the current mode keeps the revision
    async def test_revision_rules(self) -> None:
        primary, _, _ = await self.open_probed_primary()
        stale    = await self.command(primary, "set_input_mode", {"mode": "backend", "expected_revision": 3}, command_id="stale")
        switched = await self.command(primary, "set_input_mode", {"mode": "backend", "expected_revision": 0}, command_id="switch")
        repeated = await self.command(primary, "set_input_mode", {"mode": "backend", "expected_revision": 1}, command_id="repeat")
        back     = await self.command(primary, "set_input_mode", {"mode": "sdk",     "expected_revision": 1}, command_id="back")
        await self.close_all(primary)

        self.assertFalse(stale["ok"])
        self.assertEqual((stale   ["state"]["input_mode"], stale   ["state"]["input_mode_revision"]), ("sdk",     0))
        self.assertEqual((switched["state"]["input_mode"], switched["state"]["input_mode_revision"]), ("backend", 1))
        self.assertEqual((repeated["state"]["input_mode"], repeated["state"]["input_mode_revision"]), ("backend", 1))
        self.assertEqual((back    ["state"]["input_mode"], back    ["state"]["input_mode_revision"]), ("sdk",     2))
        self.assertTrue(switched["ok"] and repeated["ok"] and back["ok"])

    # Leaving backend mode shuts the recognizer down and installs a fresh, stopped one
    async def test_switch_to_sdk_replaces_the_recognizer(self) -> None:
        primary, _, _ = await self.open_probed_primary()
        await self.command(primary, "set_input_mode", {"mode": "backend", "expected_revision": 0}, command_id="on")
        await self.command(primary, "set_input_mode", {"mode": "sdk",     "expected_revision": 1}, command_id="off")
        await self.close_all(primary)

        original, replacement = self.providers
        original   .start   .assert_called_once()
        original   .shutdown.assert_called()
        replacement.stop    .assert_called_once()

    # An admin listener's `set_input_mode` is an unknown command (only the robot switches its microphone)
    async def test_listener_cannot_set_input_mode(self) -> None:
        primary, _, session_id = await self.open_probed_primary()
        listener = WebsocketCommunicator(URLRouter(websocket_urlpatterns), f"/ws/chat/{session_id}/listen/")
        listener.scope["user"] = self.staff
        accepted, _ = await listener.connect(timeout=SOCKET_TIMEOUT_SEC)
        self.assertTrue(accepted)

        ack = await self.command(listener, "set_input_mode", {"mode": "backend", "expected_revision": 0}, command_id="admin")
        await self.close_all(listener, primary)
        self.assertFalse(ack["ok"])
        self.assertEqual(ack["message"], "Unknown command: set_input_mode")


# ================================================================================
# Media and Viewer Sockets
# ================================================================================
class MediaSocketTests(BuddyChatTestCase):
    # --------------------------------------------------------------------------------
    # Connecting
    # --------------------------------------------------------------------------------
    # An unauthenticated media socket is refused with 4001
    async def test_unauthenticated_media_socket_is_refused(self) -> None:
        primary, connection_id, _ = await self.open_probed_primary()
        media, accepted, code = await self.open_media(connection_id, AnonymousUser())
        await self.close_all(media, primary)
        self.assertEqual((accepted, code), (False, 4001))

    # A connection ID that names no open chat connection is refused with 4004
    async def test_unknown_primary_connection_is_refused(self) -> None:
        primary, _, _ = await self.open_probed_primary()
        media, accepted, code = await self.open_media("not-a-connection", self.robot_user)
        await self.close_all(media, primary)
        self.assertEqual((accepted, code), (False, 4004))

    # Ending the chat closes its media socket with 4004
    async def test_ending_the_chat_closes_the_media_socket(self) -> None:
        primary, connection_id, _ = await self.open_probed_primary()
        media, accepted, _ = await self.open_media(connection_id, self.robot_user)
        self.assertTrue(accepted)

        await primary.disconnect(timeout=SOCKET_TIMEOUT_SEC)
        self.assertEqual(await self.close_code(media), 4004)
        await self.close_all(media)

    # A caregiver not linked to the participant cannot open the viewer socket
    async def test_unlinked_caregiver_viewer_is_refused(self) -> None:
        primary, _, session_id = await self.open_probed_primary()
        viewer, accepted, code = await self.open_viewer(session_id, self.outsider)
        await self.close_all(viewer, primary)
        self.assertEqual((accepted, code), (False, 4003))

    # --------------------------------------------------------------------------------
    # Media Flow
    # --------------------------------------------------------------------------------
    # A valid image reaches a viewer byte-for-byte
    async def test_image_reaches_viewer_unchanged(self) -> None:
        primary, connection_id, session_id = await self.open_probed_primary()
        media,  _, _ = await self.open_media (connection_id, self.robot_user)
        viewer, _, _ = await self.open_viewer(session_id,    self.staff)
        self.assertEqual((await self.next_frame(viewer, "media_session"))["status"], "connected")

        media_session_id = await self.start_media(media)
        message          = image_message(media_session_id)
        await media.send_to(bytes_data=message)
        received = await self.next_image(viewer)
        await self.close_all(viewer, media, primary)
        self.assertEqual(received, message)

    # The heartbeat goes out after `media_start`, and the state in its ack reaches viewers
    async def test_heartbeat_state_reaches_viewer(self) -> None:
        primary, connection_id, session_id = await self.open_probed_primary()
        media,  _, _ = await self.open_media (connection_id, self.robot_user)
        viewer, _, _ = await self.open_viewer(session_id,    self.staff)
        await self.next_frame(viewer, "media_session")

        media_session_id = await self.start_media(media)
        heartbeat        = await self.next_frame(media, "command")
        state            = robot_state(media_session_id)
        await media.send_json_to({"type": "command_ack", "data": {"id": heartbeat["id"], "name": "get_media_state", "ok": True, "message": None, "state": state}})
        status = await self.next_frame(viewer, "media_status")
        await self.close_all(viewer, media, primary)

        self.assertEqual(heartbeat["name"], "get_media_state")
        self.assertEqual(status["state"], state)

    # --------------------------------------------------------------------------------
    # Head Moves
    # --------------------------------------------------------------------------------
    # A viewer's head move reaches Buddy, and Buddy's ack returns under the viewer's ID
    async def test_head_move_round_trip(self) -> None:
        primary, connection_id, session_id = await self.open_probed_primary()
        media,  _, _ = await self.open_media (connection_id, self.robot_user)
        viewer, _, _ = await self.open_viewer(session_id,    self.staff)
        media_session_id = await self.start_media(media)

        await viewer.send_json_to({"type": "command", "data": {"id": "move-1", "name": "move_head", "data": {"direction": "left"}}})
        move = await self.next_command(media, "move_head")
        await media.send_json_to({"type": "command_ack", "data": {"id": move["id"], "name": "move_head", "ok": False, "message": "Head is busy", "state": robot_state(media_session_id)}})
        ack = await self.next_ack(viewer, "move-1")
        await self.close_all(viewer, media, primary)

        self.assertEqual(move["data"], {"direction": "left"})
        self.assertEqual((ack["ok"], ack["message"]), (False, "Head is busy"))

    # With Video off there is no media socket, so the viewer's head move is refused
    async def test_head_move_without_video_is_refused(self) -> None:
        primary, _, session_id = await self.open_probed_primary()
        viewer, _, _ = await self.open_viewer(session_id, self.staff)
        await viewer.send_json_to({"type": "command", "data": {"id": "move-1", "name": "move_head", "data": {"direction": "up"}}})
        ack = await self.next_ack(viewer, "move-1")
        await self.close_all(viewer, primary)

        self.assertEqual((ack["ok"], ack["message"]), (False, "Robot video is off"))
