"""
Live user chat controller.
--------------------------------------------------------------------------------
backend.chat_app.websocket.consumers.consumers

Processes incoming messages, scores them, and responds.


1) Authentication Block -> user information, chat source
    Later on, when adding functionality for users to connect to the same chat via webapp & robot simultaneously, 
    this is how we will do it. If the current active chat source is "buddyrobot" or "qtrobot" and we are connecting
    from "webapp" or "mobile", disable the chat functionality but send updates for the each utterance so the UI
    can follow along with each message in real time. 
    ToDo: If the current ChatSession source is webapp and we are a robot, close it and remake a new one automatically.

2) Load or create active session
    get_or_create_active_session(user) will return a chat if it's still active. The consumer builds a brand-new 
    context_buffer from those persisted messages so the LLM has context.

"""

from django.apps import apps
from time        import time

import json, asyncio, logging, base64
logger = logging.getLogger(__name__)

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db                import database_sync_to_async

# From this project
from ...services                   import logging_utils as lu 
from ...services.db_services       import ChatService
from  ..services.bg_helpers        import fire_and_log
from  ..services.chatHelpers       import handle_transcription, handle_stt_output
from  ..services.audioHelpers      import extract_audio_biomarkers, extract_text_biomarkers
from  ..services.speechProvider    import SpeechToTextProvider
from    .utils  .logging           import ChatConsumerLogging as log



SECOND = 32_000 # How big a chunk of audio of one second is, in bytes

# ================================================================================
# ChatConsumer 
# ================================================================================
class ChatConsumer(AsyncJsonWebsocketConsumer):
    """
    ChatConsumer
    ------------
    Main controller for a live chat session.
    
    TODO: Much of this needs to be moved to helper classes. 
    
    IDK, stuff that has been here for a while
    * self.return_biomarkers => should we return the biomarkers to the client? (right now, no)

    """
    MAX_CONTEXT =  8  # How many recent messages to keep for the LLM
    SECONDS     = 10  # How often we want to send audio to calculate biomarkers

    # ================================================================================
    # Connect
    # ================================================================================
    async def connect(self):
        # Miscellaneous setup
        self.overlapped_speech_count  = 0.0
        self.audio_windows_count      = 0.0
        self.overlapped_speech_events = []  # List of timestamps (ToDo: Add this to the DB somehow)

        # --------------------------------------------------------------------------------
        # 1) Authenticate before accepting connection
        # --------------------------------------------------------------------------------
        # Custom "unauth" code
        if not self.scope["user"].is_authenticated: 
            await self.close(code=4001); return
        
        # Get the user information and any additional parameters sent in the URL (e.g. "source" here)
        self.user   = self.scope["user"]
        self.source = self.scope.get("source", "unknown")

        # Accept the connection
        await self.accept()
        log.log_connect(self.user, self.source)
        
        # I don't think any frontend uses these during the chat right now, but I'll leave this option in
        self.return_biomarkers = False # (self.source in ["webapp"])

        # --------------------------------------------------------------------------------
        # 2) Load or create an active session & Prepare the 'context_buffer'
        # --------------------------------------------------------------------------------
        # TODO: Change this back (and fix whatever was wrong) so that we CAN reconnect to old chats
        # Close any currently-active session for this user (to avoid clashes between multiple connections)
        await database_sync_to_async(ChatService.close_any_active_session)(self.user)

        # Load the most recent active session for this user
        self.session = await database_sync_to_async(ChatService.get_or_create_active_session)(self.user, source=self.source)
        recent = await database_sync_to_async(lambda: list(self.session.messages.all().order_by("-start_ts")[: self.MAX_CONTEXT])[::-1])()

        # TODO: I added the timestamps in just now for biomarker scores, but I actually don't really like how this works at the moment...
        # Actually since I want to remove the "resume" chat thing, probably don't need to do this with the context buffer (loading in old data)
        self.context_buffer = [(m.role, m.content, m.ts.timestamp()) for m in recent]
        
        # Adding one default message at the start of the chat every time (so I have a reference timestamp before every user message)
        self.context_buffer = [("assistant", "How can I help you today?", time())] + self.context_buffer

        # --------------------------------------------------------------------------------
        # 3) Define group ("room") names & Join them
        # --------------------------------------------------------------------------------
        sid = self.session.id
        self.room_group    = f"chat_{sid}"
        self.monitor_group = f"chat_{sid}_mon"
        self.control_group = f"chat_{sid}_ctl"

        # Join base room & control room (send updates to listeners, receive commands from listeners)
        await self.channel_layer.group_add(self.   room_group, self.channel_name)
        await self.channel_layer.group_add(self.control_group, self.channel_name)

        # --------------------------------------------------------------------------------
        # 4) Handle STT Setup
        # --------------------------------------------------------------------------------
        # Create new speech provider instances
        loop_stt = asyncio.get_event_loop()

        # TODO: Define a function for ts_callback to perform when we receive word-level timestamps
        self.stt_provider = SpeechToTextProvider(handle_stt_output, self._add_message_CB, self.send, self._utt_bio, None, loop_stt)
        self.audio_buffer = bytearray()

        # --------------------------------------------------------------------------------
        # 5) Send misc information to the frontend (ToDo: biomarkers, etc)
        # --------------------------------------------------------------------------------
        # This is where we could potentially have a connection on the robot and web app and monitor the conversation in real time
        if self.return_biomarkers: await self.send_json({"type": "history", "messages": self.context_buffer})
        
        # Log the successful connection
        log.log_connect_done(self.user, self.session.id)
        
    # --------------------------------------------------------------------------------
    # Disconnect
    # --------------------------------------------------------------------------------
    async def disconnect(self, code):
        """
        # DO NOT close the session -- just clean local state.
        --- Originally had pausing in here, but im just changing it so disconnects end the chat. ---
        """
        # 1) Close the ChatSession in the DB
        if self.session.is_active: await database_sync_to_async(ChatService.close_session)(self.user, self.session, source=self.source)

        # Cancel background tasks (if any -- none right now)
        for task in getattr(self, "_bg_tasks", []): task.cancel()
        await asyncio.gather(*getattr(self, "_bg_tasks", []), return_exceptions=True)

        # Reset some properties for the next connection
        self.context_buffer           = []
        self.overlapped_speech_count  = 0.0
        self.audio_windows_count      = 0.0
        self.overlapped_speech_events = []

        log.log_disconnect(self.user, code)

    # ================================================================================
    # Group Event Handlers | Handle all messages send from consumer-to-consumer
    # ================================================================================
    # Receives commands from listener consumers TODO: Actually make this do something
    async def ws_command(self, event):
        # Parse command from payload
        payload = event  .get("payload", {})
        command = payload.get("cmd")
        logger.info(f"{lu.CC_MAIN} Listener command received: {lu.YELLOW} {payload} {lu.RESET}")

        # Act accordingly
        if command == "pause_auto":
            logger.info(f"{lu.CC_MAIN} Command: {lu.BOLD}'pause_auto'{lu.RESET}{lu.GREEN} received. {lu.RESET}")
        
        elif command == "resume_auto":
            self.responses_paused = False
            logger.info(f"{lu.CC_MAIN} Command: {lu.BOLD}'resume_auto'{lu.RESET}{lu.GREEN} received. {lu.RESET}")
        
        elif command == "respond_now":
            logger.info(f"{lu.CC_MAIN} Command: {lu.BOLD}'respond_now'{lu.RESET}{lu.GREEN} received. {lu.RESET}")

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
    # Handle Incoming Data
    # ================================================================================
    async def receive_json(self, data, **kwargs):
        if   data["type"] == "overlapped_speech" : await self._handle_overlap(data=data)
        elif data["type"] == "audio_data"        : await self._handle_audio_data(data)
        elif data["type"] == "transcription"     : await handle_transcription(data, msg_callback=self._add_message_CB, send_callback=self.send, bio_callback=self._utt_bio)
        elif data["type"] == "end_chat"          : 
                    self.stt_provider.stop()
                    await database_sync_to_async(ChatService.close_session)(self.user, self.session, source=self.source)        
        elif data["type"] == "toggle_stream": self._toggle_stream(data)

    # Overlapped Speech
    async def _handle_overlap(self, data=None):
        self.overlapped_speech_count += 1
        self.overlapped_speech_events.append(time())
        logger.info(f"{lu.YELLOW}Overlapped speech detected. Count: {self.overlapped_speech_count} {lu.RESET}")
 
    # --------------------------------------------------------------------------------
    # Text Transcriptions
    # --------------------------------------------------------------------------------
    # TODO: Because altered_grammar specifically is so slow, they will actually go to the db out of order. Need to add a manual time setting argument.
    async def _utt_bio(self):
        """ On-Utterance Biomarkers (saves them to the DB as soon as we get them). """
        utterance_biomarkers = await extract_text_biomarkers(self.context_buffer)

        # Save biomarkers to the DB & send them to any listeners
        fire_and_log(database_sync_to_async(ChatService.add_biomarkers_bulk)(self.session, utterance_biomarkers))
        await self._broadcast_monitor({"type": "biomarker_scores", "data": utterance_biomarkers})
    
    async def _add_message_CB(self, role, text, ts):
        """
        Add messages to the database & update the local context.
            - Role must be "user" or "assistant"
        """
        logger.log(f"{lu.CC_MAIN} _add_message_CB called with: {role}, {text}, {ts}")

        # Fire-and-forget DB write for the user message
        fire_and_log(database_sync_to_async(ChatService.add_message)(self.session, role, text))
        logger.log(f"{lu.CC_MAIN} fire and log")

        # Update in memory context
        self.context_buffer.append((role, text, ts))
        if len(self.context_buffer) > self.MAX_CONTEXT: self.context_buffer.pop(0)
        logger.log(f"{lu.CC_MAIN} context buffer, next is broadcast call")


        # Return the updated context (if the message was from the user, this will be used for the LLM)
        if role == "user": return self.context_buffer

        # Broadcast updates to any listeners
        await self._broadcast_room({"type": "message", "role": role, "text": text, "ts": ts})
        logger.log(f"{lu.CC_MAIN} broadcasted")
        
    # --------------------------------------------------------------------------------
    # Audio Data
    # --------------------------------------------------------------------------------
    async def _handle_audio_data(self, data):
        
         # Send audio to the speech to text provider
        self.stt_provider.send_audio(data)
                            
        # # Generate the audio-related biomarker scores
        self.audio_buffer.extend(base64.b64decode(data['data']))
        if len(self.audio_buffer) >= (self.SECONDS * SECOND):
            audio_data = {"data": bytes(self.audio_buffer), "sampleRate": data['sampleRate']}
            audio_biomarkers = await extract_audio_biomarkers(audio_data, self.overlapped_speech_count)
            self.audio_buffer.clear()

            # Save biomarkers to the DB & send them to any listeners
            fire_and_log(database_sync_to_async(ChatService.add_biomarkers_bulk)(self.session, audio_biomarkers))
            await self._broadcast_monitor({"type": "biomarker_scores", "data": audio_biomarkers})
   
        # Update turntaking (12 audio windows for 1 minute of data)
        self.audio_windows_count += 1
        self.overlapped_speech_count = self.overlapped_speech_count / (self.audio_windows_count / 12)
        
    # Toggle the stream of audio data
    def _toggle_stream(self, data):
        cmd = data["data"]
        if   cmd == "start": self.stt_provider.start()
        elif cmd == "stop" : self.stt_provider.stop()
