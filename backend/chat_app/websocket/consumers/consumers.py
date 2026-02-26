"""
Main controller for a live chat session. 
--------------------------------------------------------------------------------
`backend.chat_app.websocket.consumers.consumers`

TODO: Change the config stuff later as the other platforms (robots) get updated (e.g.
      the stuff like `use_backend_STT`, etc.).

"""
import asyncio, logging, time
logger = logging.getLogger(__name__)

# Django
from django.apps                import apps
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db                import database_sync_to_async as db_s2a

# From this project
from ...services                   import logging_utils as lu 
from ...services.db_services       import ChatService
from  ..services.bg_helpers        import fire_and_log
from  ..services.chatHelpers       import ChatHandler
from  ..services.speechProvider    import SpeechToTextProvider

# Consumer-specific utilities
from .utils   .logging      import ChatConsumerLogging as log
from .utils   .groups       import join_chat_consumer_groups, leave_all_groups, format_actions_command
from .handlers.ch_events    import handle_ws_command, forward_payload_to_client
from .handlers.ws_events    import handle_receive_json

# Delegation / passthroughs
from .handlers.cc_callbacks import handle_chat_messages    as _handle_chat_messages
from .handlers.cc_callbacks import on_utterance_biomarkers as _on_utterance_biomarkers
from .handlers.cc_callbacks import handle_audio_data       as _handle_audio_data


# ================================================================================
# ChatConsumer 
# ================================================================================
class ChatConsumer(AsyncJsonWebsocketConsumer):
    MAX_CONTEXT =  8  # How many recent messages to keep for the LLM
    
    # ================================================================================
    # Connect
    # ================================================================================
    async def connect(self):
        # Miscellaneous setup
        self.overlapped_speech_count  = 0.0
        self.audio_windows_count      = 0.0
        self.overlapped_speech_events = []  # List of timestamps (ToDo: Add this to the DB somehow)
        self.last_response            = None

        # --------------------------------------------------------------------------------
        # 1) Authenticate before accepting connection
        # --------------------------------------------------------------------------------
        # Custom "unauth" code
        if not self.scope["user"].is_authenticated: 
            await self.close(code=4001); return
        
        # Get the user information and any additional parameters sent in the URL (e.g. "source" here)
        self.user   = self.scope["user"]
        self.source = self.scope.get("source", "unknown")
        
        # Configuration based on the source platform for the chat
        self.use_backend_STT   = (self.source == "webapp")
        self.use_backend_TTS   = (self.source == "webapp") # Should the ChatHandler reply with audio bytes as well as text 
        self.reply_on_user_utt = True                      # Should the ChatHandler reply instantly when receiving a user utterance

    

        # Accept the connection
        await self.accept()
        log.log_connect(self.user, self.source)
        
        # --------------------------------------------------------------------------------
        # 2) Load or create an active session & Prepare the 'context_buffer'
        # --------------------------------------------------------------------------------
        # TODO: Change this back (and fix whatever was wrong) so that we CAN reconnect to old chats
        # Close any currently-active session for this user (to avoid clashes between multiple connections)
        await db_s2a(ChatService.close_any_active_session)(self.user)

        # Load the most recent active session for this user
        self.session = await db_s2a(ChatService.get_or_create_active_session)(self.user, source=self.source)
        recent = await db_s2a(lambda: list(self.session.messages.all().order_by("-start_ts")[: self.MAX_CONTEXT])[::-1])()

        # TODO: I added the timestamps in just now for biomarker scores, but I actually don't really like how this works at the moment...
        # Actually since I want to remove the "resume" chat thing, probably don't need to do this with the context buffer (loading in old data)
        self.context_buffer = [(m.role, m.content, m.ts.timestamp()) for m in recent]
        
        # Adding one default message at the start of the chat every time (so I have a reference timestamp before every user message)
        self.context_buffer = [("assistant", "How can I help you today?", time.time())] + self.context_buffer


        # --------------------------------------------------------------------------------
        # 3) Finish setup (groups & STT)
        # --------------------------------------------------------------------------------
        # Define group ("room") names & join them
        await join_chat_consumer_groups(self)

        # Create new audio buffer & speech provider instances
        self.audio_buffer = bytearray()
    
        # TODO: Define a function for ts_callback to perform when we receive word-level timestamps
        self.stt_provider = SpeechToTextProvider(
            consumer               = self,
            loop                   = asyncio.get_running_loop(),
            on_timestamps_callback = None, 
        )

        # Log the successful connection
        log.log_connect_done(self.user, self.session.id, config={"backend_STT": self.use_backend_STT, "backend_TTS": self.use_backend_TTS, "auto_reply": self.reply_on_user_utt})
        
    
    # ================================================================================
    # Disconnect
    # ================================================================================
    async def disconnect(self, code):
        """
        TODO: Originally had pausing/resuming in here, but for now disconnects always end the chat.
        """
        # Guard for double calls when we are already closing
        if getattr(self, "_close_scheduled", False): return
        self._close_scheduled = True

        # Shut down the STT provider
        if getattr(self, "stt_provider", None): self.stt_provider.stop()

        # Snapshot IDs (don't pass model instances into background tasks)
        user_id    = getattr(self.user,    "id",    None)
        session_id = getattr(self.session, "id",    None)
        username   = getattr(self.user, "username", None)

        # Close the ChatSession in the DB
        if user_id and session_id:
            fire_and_log(ChatService.close_session(user_id, session_id, username=username, source=self.source), 
                         name=f"disconnect::close-session-{session_id}")

        # Cancel background tasks (only connection-based ones; not the close_session task)
        for task in           getattr(self, "_bg_tasks", []): task.cancel()
        await asyncio.gather(*getattr(self, "_bg_tasks", []), return_exceptions=True)

        # Reset some properties for the next connection
        self.session                  = None
        self.context_buffer           = []
        self.overlapped_speech_count  = 0.0
        self.audio_windows_count      = 0.0
        self.overlapped_speech_events = []

        leave_all_groups(self, log) # TODO: I don't think I've EVER seen this in the logs btw...
        log.log_disconnect(self.user, code)


    # ================================================================================
    # Group Event Handlers
    # ================================================================================
    # Receives commands from listener consumers
    # Forwards payloads to websocket client (catches our own broadcasts and forwards them)
    async def ws_command  (self, event): await handle_ws_command        (self, event)
    async def ws_broadcast(self, event): await forward_payload_to_client(self, event)
    async def ws_monitor  (self, event): await forward_payload_to_client(self, event)

    # --------------------------------------------------------------------------------
    # Broadcast Helpers
    # --------------------------------------------------------------------------------
    # Relays chat messages
    async def _broadcast_room(self, payload):
        await self.channel_layer.group_send(self.room_group, {"type": "ws.broadcast", "payload": payload})

    # Relays biomarker scores
    async def _broadcast_monitor(self, payload):
        await self.channel_layer.group_send(self.monitor_group, {"type": "ws.monitor", "payload": payload})

    # ================================================================================
    # Handle Incoming Data (processing "callbacks" used to maintain the chat)
    # ================================================================================
    async def receive_json(self, data, **kwargs):
        await handle_receive_json(self, data)
 
    # Add messages to the database & update the local context (role must be "user" or "assistant")
    # TODO: Working on replacing _add_message_CB
    async def _add_message_CB(self, role, text, ts): return await _handle_chat_messages(self, role, text, ts)
    async def handle_chat_messages(self, role, text, ts): return await _handle_chat_messages(self, role, text, ts)

    # Handle on-utterance biomarkers
    async def _utt_bio(self): await _on_utterance_biomarkers(self)
    async def on_utterance_biomarkers(self): await _on_utterance_biomarkers(self)

    # Handle "streamed" audio data from the frontend client
    async def _handle_audio_data(self, data): await _handle_audio_data(self, data)
    async def  handle_audio_data(self, data): await _handle_audio_data(self, data)


    # ================================================================================
    # Additional Helpers
    # ================================================================================

    # Reply to the user immediately. Can pass a message, otherwise will query the LLM.
    async def reply_now(self, use_response=None):
        return await ChatHandler.respond_to_user(self.context_buffer, self, use_response=use_response)

