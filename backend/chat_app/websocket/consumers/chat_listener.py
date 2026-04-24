"""
Monitor & control a live chat session. 
--------------------------------------------------------------------------------
backend.chat_app.websocket.consumers.chat_listener

Receives live updates about the current chat's status, including:
- Messages (from user & backend)
- Biomarker scores
- Structured chat elements (e.g. "conversation_state")

How it works:
* TODO: The admin user can then click on one of these sessions and it uses the "session_id" field to connect via this consumer.
* Here they can receive updates about the chat, control pausing, etc. 


Frontend sends commands such as:
- Tell backend to stop/resume using STT "utterance ends" to respond with the LLM
    { "type": "command", "data": { "cmd": "pause_auto" } }
    { "type": "command", "data": { "cmd": "resume_auto" } }

- Tell LLM to respond immediately with whatever context it has heard recently (e.g. button control)
    { "type": "command", "data": { "cmd": "respond_now" } } 

    
TODO: Future possibilities:
* Manually trigger conversation state changes
* Manually trigger messages from the LLM (e.g. the "puppet" system they already had at Indiana)
* Manually trigger behaviors (animations, emotions)

--------------------------------------------------------------------------------
TODO: To completely finish this on the backend
--------------------------------------------------------------------------------
* Add functionality for the commands
    - pause/resume automatic responses (STT based responding)
        > this may require a bunch of logic for concatenating consecutive, uninterrupted user utterances
    - manually trigger a response from the system
        > may need a "cooldown" option in the case of rapid successive clicks

* Re-enable the biomarker logging thing, but that might need to wait for until I finish updating the biomarker code...

* Probably some other stuff... need to look back through each file again

* Add the responding mode to the frontend UI

"""

import logging, time
logger = logging.getLogger(__name__)

# Django 
from django.core.exceptions     import ObjectDoesNotExist
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db                import database_sync_to_async as db_s2a
from django.apps                import apps

# Imports from this project
from ...services.db_services import ChatService
from ...services             import logging_utils       as lu
from   .utils.logging        import ChatListenerLogging as log
from   .utils.db_data        import send_initial_data
from   .utils.groups         import leave_all_groups, format_message_broadcast, format_biomarker_broadcast

# ================================================================================
# ChatListenerConsumer
# ================================================================================
class ChatListenerConsumer(AsyncJsonWebsocketConsumer):
    """
    ChatListenerConsumer
    --------------------
    This consumer represents a "listener" client: a second websocket connection that
    attaches to an existing chat session and receives live updates (messages, biomarkers).

    How it works:
    1) On connect, it loads an existing ChatSession from the DB (session ID in the url)
    2) It joins a Channels "group" (or "room")
    3) It receives events the primary consumer class broadcasts to that group
    4) It can send commands that get routed to the primary consumers

    
    In Channels, a "group" is basically a broadcast list.
    Anyone in the group receives any events sent to the group.

    Listener joins: messages & biomarker groups to get updates about those.
    Only the primary consumer will join the control group so it can receive commands.

    """
    # --------------------------------------------------------------------------------
    # Connect
    # --------------------------------------------------------------------------------
    async def connect(self):
        # 1) Authenticate before accepting connection
        if not self.scope["user"].is_authenticated:
            logger.info(f"{lu.CL_MAIN} Not authenticated (stage 1) {lu.RESET}")
            await self.close(code=4001); return
        
        self.user = self.scope["user"]
        
        # 2) Identify which ChatSession this listener is observing
        # Session ID is passed via URL:  "ws/chat/<session_id>/listen/"
        self.session_id = self.scope["url_route"]["kwargs"]["session_id"]

        # 3) Load the session from the DB (wrapped in try-except for if the given ID is not valid)
        ChatSession = apps.get_model("chat_app", "ChatSession")
        try: self.session = await db_s2a(ChatSession.objects.get)(id=self.session_id)
        except ChatSession.DoesNotExist:
            logger.info("[WS] listener connect: invalid session_id=%s user=%s", self.session_id, self.scope["user"])
            await self.close(code=4404); return # custom "not found" code

        # 4) Authorize (session owner can listen, admin users can listen)
        if (not self.user.is_staff):  # TODO: Make this so you have to be like the associated user?
            logger.info(f"{lu.CL_MAIN} {self.user} not authorized (stage 2) {lu.RESET}")
            await self.close(code=4003); return
        
        # 5) Define group ("room") names -- separate rooms for commands, ChatMessages, & ChatBiomarkers
        sid = self.session_id
        self.room_group    = f"chat_{sid}"       # all listeners + primary (message events)
        self.monitor_group = f"chat_{sid}_mon"   # listeners (biomarker events)
        self.control_group = f"chat_{sid}_ctl"   # primaries only (commands)
        self.ack_group     = f"chat_{sid}_ack"   # for relaying command acks to frontend

        # 6) Accept the websocket (must be done before send_json / receiving messages)
        await self.accept()

        # Session info dict with: {"session", "profile", "account", "user"}
        self.session_info = await db_s2a(ChatService.get_session_info)(self.session_id)

        # Log an update about connecting
        log.log_connect(self.user.username, self.session_info["user"].username, self.session_id)

        # 7) Join groups
        await self.channel_layer.group_add(self.   room_group, self.channel_name)
        await self.channel_layer.group_add(self.monitor_group, self.channel_name)
        await self.channel_layer.group_add(self.    ack_group, self.channel_name)

        # 8) Collect and send all data required on-connection by the frontend
        num_messages, num_biomarkers = await send_initial_data(self.session_info, self)
        log.log_connect_done(num_messages, num_biomarkers)

    # --------------------------------------------------------------------------------
    # Disconnect (listener does NOT close the session in DB)
    # --------------------------------------------------------------------------------
    async def disconnect(self, code):      
        leave_all_groups(self, log)
        log.log_disconnect(self.user.username, self.session_id, code)

    # ================================================================================
    # Group Event Handlers | Handle all messages send from consumer-to-consumer
    # ================================================================================
    # When the primary consumer calls channel_layer.group_send(group_name, {"type": "ws.broadcast", ...}),
    # Channels looks for a method on the consumer with the same name as the "type" field converted to a python method.
    #
    # For example:  {"type": "ws.broadcast", "payload": {...}}
    # calls:         async def ws_broadcast(self, event): ...
    #
    # And:          {"type": "ws.monitor", "payload": {...}}
    # calls:        async def ws_monitor(self, event): ...
    # 
    # event is a dict with whatever the sender included (here: {"payload": ...}).
    # Both of these methods relay messages back to the client. 

    # Receives chat message updates (user/assistant) broadcast from the primary consumer.
    async def ws_broadcast(self, event):
        await self.send_json(format_message_broadcast(event))

    # Receives biomarker updates broadcast from the primary consumer.
    async def ws_monitor(self, event):
        await self.send_json(format_biomarker_broadcast(event))

    # ChatConsumer sends acks to us, pass them along
    async def ws_command_acks(self, event):
        await self.send_json(event.get("payload", {}))

    # Receives stream status changes ("active" | "paused" | "ended") from the primary consumer
    async def ws_stream_status(self, event):
        await self.send_json({"type": "stream_status", "data": event.get("data", {})})

    # ================================================================================
    # Client Event Handler | Handle messages from the client we are connected to
    # ================================================================================
    # Handle messages sent from the 'listener' intended for the primary consumer
    async def receive_json(self, data, **kwargs):
        msg_type = data.get("type")

        # --------------------------------------------------------------------------------
        # Allow ping/pong for latency measurement
        # --------------------------------------------------------------------------------
        # Echo back client timestamp so client can compute RTT
        if msg_type == "ping":
            client_ts = data.get("client_ts")
            await self.send_json({"type": "pong", "client_ts": client_ts, "server_ts": time.time()})
            return

        # --------------------------------------------------------------------------------
        # Commands from the listener client
        # --------------------------------------------------------------------------------
        # Listener is only allowed to send commands
        if msg_type == "command": 
            # Example command payloads: {"cmd": "pause_auto"} | {"cmd": "resume_auto"}
            payload = data.get("data", {})

            # Route to the primary consumer through the control group
            await self.channel_layer.group_send(
                self.control_group,
                {"type": "ws.command", "payload": payload}
            )

            # Log update
            logger.info(f"{lu.CL_MAIN} Client command relayed:    {lu.GREEN}{payload}{lu.RESET}")

        # --------------------------------------------------------------------------------
        # Unknown message type received from the client
        # --------------------------------------------------------------------------------
        else:
            logger.info(f"{lu.CL_MAIN} Unknown client message: {lu.GREEN}{payload}{lu.RESET}")
            return
