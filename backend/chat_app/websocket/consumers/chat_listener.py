"""
Monitor & control a live chat session. 
--------------------------------------------------------------------------------
backend.chat_app.websocket.consumers.chat_listner

Receives live updates about the current chat's status, including:
- Messages (from user & backend)
- Biomarker scores
- Structured chat elements (e.g. "conversation_state")

How it works:
* TODO: Admin users can see a page that retrieves all "active" chat sessions (with a "refresh" button on the page).
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
* Add biomarkers to the initial history that gets sent to the user as well

* Add functionality for the commands
    - pause/resume automatic responses (STT based responding)
        > this may require a bunch of logic for concatenating consecutive, uninterrupted user utterances
    - manually trigger a response from the system
        > may need a "cooldown" option in the case of rapid successive clicks

* Re-enable the biomarker logging thing, but that might need to wait for until I finish updating the biomarker code...

* Probably some other stuff... need to look back through each file again

"""

import logging
logger = logging.getLogger(__name__)

# Django 
from django.core.exceptions     import ObjectDoesNotExist
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db                import database_sync_to_async
from django.apps                import apps

# Imports from this project
from ...services              import logging_utils as lu
from ...services.db_services  import ChatService
from   .utils  .logging       import ChatListenerLogging as log


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
        try: self.session = await database_sync_to_async(ChatSession.objects.get)(id=self.session_id)
        except ChatSession.DoesNotExist:
            logger.info("[WS] listener connect: invalid session_id=%s user=%s", self.session_id, self.scope["user"])
            await self.close(code=4404); return # custom "not found" code

        # 4) Authorize (session owner can listen, admin users can listen)
        # TODO: Make this so you have to be like the associated user?
        if (not self.user.is_staff):
            logger.info(f"{lu.CL_MAIN} {self.user} not authorized (stage 2) {lu.RESET}")
            await self.close(code=4003); return
        
        # 5) Define group ("room") names
        # Separate rooms for commands, ChatMessages, & ChatBiomarkers
        sid = self.session_id
        self.room_group    = f"chat_{sid}"       # all listeners + primary (message events)
        self.monitor_group = f"chat_{sid}_mon"   # listeners (biomarker events)
        self.control_group = f"chat_{sid}_ctl"   # primaries only (commands)

        # 6) Accept the websocket (must be done before send_json / receiving messages)
        await self.accept()

        # Session info dict with: {"session", "profile", "account", "user"}
        self.session_info = await database_sync_to_async(ChatService.get_session_info)(self.session_id)

        # Log an update about connecting
        log.log_connect(self.user.username, self.session_info["user"].username, self.session_id)

        # 7) Join groups
        # Listener joins: messages & biomarker groups to get updates about those
        # Only the primary consumer will join the control group so it can receive commands
        await self.channel_layer.group_add(self.   room_group, self.channel_name)
        await self.channel_layer.group_add(self.monitor_group, self.channel_name)

        # 8) Send current conversation history to listener immediately
        messages = await database_sync_to_async(
            lambda: list(self.session.messages.all().order_by("start_ts"))
        )()

        # Frontend will expect messages to come in this format
        history = [(m.role, m.content, m.ts.timestamp()) for m in messages]
        await self.send_json({"type": "history", "messages": history})

        logger.info(f"{lu.CL_MAIN} Loaded {lu.BOLD}{len(history)}{lu.RESET}{lu.YELLOW} existing messages{lu.RESET}")

    # --------------------------------------------------------------------------------
    # Disconnect (listener does NOT close the session in DB)
    # --------------------------------------------------------------------------------
    async def disconnect(self, code):
        log.log_disconnect(self.user.username, code)

        # Leave all groups
        for group in [getattr(self, "room_group", None), getattr(self, "monitor_group", None)]:
            if group: await self.channel_layer.group_discard(group, self.channel_name)

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
        await self.send_json(event["payload"])

    # Receives biomarker updates broadcast from the primary consumer.
    async def ws_monitor(self, event):
        await self.send_json(event["payload"])

    # --------------------------------------------------------------------------------
    # Client Event Handler | Handle messages from the client we are connected to
    # --------------------------------------------------------------------------------
    # Handle messages sent from the 'listener' intended for the primary consumer
    async def receive_json(self, data, **kwargs):
        # Listener is only allowed to send commands
        if data.get("type") != "command": return

        # Example command payloads: {"cmd": "pause_auto"} | {"cmd": "resume_auto"}
        payload = data.get("data", {})

        # Route to the primary consumer through the control group
        await self.channel_layer.group_send(
            self.control_group,
            {"type": "ws.command", "payload": payload}
        )

        # Log update
        logger.info(f"{lu.CL_MAIN} Client command relayed: {lu.GREEN} {payload} {lu.RESET}")
