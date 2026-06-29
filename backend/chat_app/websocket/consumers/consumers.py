"""
Main controller for a live chat session. 
--------------------------------------------------------------------------------
`backend.chat_app.websocket.consumers.consumers`

TODO: Change the config stuff later as the other platforms (robots) get updated (e.g.
      the stuff like `use_backend_STT`, etc.).

"""
import asyncio, collections, logging, time
logger = logging.getLogger(__name__)

# Django
from django.apps                import apps
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db                import database_sync_to_async as db_s2a

# From this project
from ...services                           import logging_utils as lu 
from ...services.db_services               import ChatService
from ...services.llm.chat_utilities        import get_LLM_response
from  ..services.bg_helpers                import fire_and_log
from  ..services.chatHelpers               import ChatHandler
from  ..services.speech.stt.speechProvider import SpeechToTextProvider

# Proper import paths...
from chat_app.websocket.services.speech.audio_recorder import save_stereo_wav

# Consumer-specific utilities
from .utils   .logging      import ChatConsumerLogging as log
from .utils   .groups       import join_chat_consumer_groups, leave_all_groups, format_send_actions_command
from .handlers.ch_events    import handle_ws_command, forward_payload_to_client
from .handlers.ws_events    import handle_receive_json, _toggle_stream

# Delegation / passthroughs
from .handlers.cc_callbacks import handle_chat_messages    as _handle_chat_messages
from .handlers.cc_callbacks import on_utterance_biomarkers as _on_utterance_biomarkers
from .handlers.cc_callbacks import on_audio_biomarkers     as _on_audio_biomarkers
from .handlers.cc_callbacks import handle_audio_data       as _handle_audio_data


# --------------------------------------------------------------------------------
# TODO: TEMPORARILY PLACING HERE
# --------------------------------------------------------------------------------
from ...services.llm.live_chat.cognibot_api import CognibotResponse
from   .utils.groups                        import format_send_actions_command

# ================================================================================
# ChatConsumer 
# ================================================================================
class ChatConsumer(AsyncJsonWebsocketConsumer):
    # Helps us decide what behavior to use in other areas ("standard" | "activity")
    # TODO: Could probably just use this as an argument in close_session for the DB save
    CHAT_TYPE = "standard"

    # How many recent messages to keep for the LLM
    MAX_CONTEXT = 30  

    # --------------------------------------------------------------------------------
    # TODO: TEMPORARILY PLACING HERE
    # --------------------------------------------------------------------------------
    # Send emotion command to the client & return the string response
    async def response_method(self, context_buffer) -> str:
        # Get structured response
        response: CognibotResponse = await get_LLM_response(context_buffer)

        # Send emotion command to client
        payload = {"data": {"action": response.response_mood.upper()}}
        await format_send_actions_command(self, payload)
        
        # Return just the string message value
        return response.message

    # ================================================================================
    # Connect
    # ================================================================================
    async def connect(self):
        # Initialize all per-session state attributes (also called on disconnect to reset them)
        self._init_response_state()

        # Define the response generation method to be used in the chat
        self.response_method = self.response_method

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
        self.use_backend_STT   = (self.source == "webapp") # Send the user text to the frontend so it can see it too
        self.use_backend_TTS   = (self.source == "webapp") # Should the ChatHandler reply with audio bytes as well as text 

        self.reply_on_user_utt = True  # Robot uses the staged utterances, won't reply immediately
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
        self.session    = await db_s2a(ChatService.get_or_create_active_session)(self.user, source=self.source)
        self.session_id = self.session.id

        # Load existing messages
        # TODO: This behavior is for resuming existing chats; doesn't do anything here yet
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

        # Create speech provider instance
        self.stt_provider     = SpeechToTextProvider(consumer=self, loop=asyncio.get_running_loop())
        self.streaming_active = True

        # Rolling timestamped audio chunk buffer for audio biomarkers
        # Contains: (datetime_received, raw_pcm_bytes). Pruned to last AUDIO_CHUNKS_RETAIN_SEC seconds in handle_audio_data
        self._audio_chunks = collections.deque()

        # Session recording buffers (NOT in _init_response_state -- must survive until disconnect saves them)
        self.save_audio        = False             # Should we save the audio bytes on chat end?
        self._rec_user         = bytearray()       # Continuous user mic PCM (16 kHz, 16-bit, mono)
        self._rec_tts          = bytearray()       # TTS right-channel PCM (silence-padded, 16 kHz)
        self._session_start_ts = time.monotonic()  # Legacy monotonic reference (kept for fallback)
        self._audio_start_mono = None              # Monotonic time when user first clicked "Start Chat"
        self._audio_start_dt   = None              # Wall-clock equivalent (saved to DB for frontend seeking)

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

        # Notify listeners that the user has disconnected
        try: await self._broadcast_stream_status("ended")
        except Exception: pass

        # Cancel any pending response task (LLM -> TTS tasks)
        pending = getattr(self, "_pending_response_task", None)
        if pending and not pending.done():
            pending.cancel()
            await asyncio.gather(pending, return_exceptions=True)

        # Snapshot IDs (don't pass model instances into background tasks)
        user_id    = getattr(self.user,    "id",    None)
        session_id = getattr(self.session, "id",    None)
        username   = getattr(self.user, "username", None)

        # Flush any staged utterances to DB before post-chat analysis runs
        # (awaited so the message exists before close_session queries for it)
        staged = getattr(self, "_staged_utterances", [])
        if staged:
            try: await db_s2a(ChatService.add_message)(session_id, "user", (" ".join(staged)))
            except Exception: pass
            self._staged_utterances.clear()
            self._staged_words     .clear()

        # --------------------------------------------------------------------------------
        # Save session audio recording (stereo WAV: left = user mic, right = TTS)
        # --------------------------------------------------------------------------------
        audio_path = None
        if self.save_audio and session_id and (getattr(self, "_rec_user", None) or getattr(self, "_rec_tts", None)):
            try:
                audio_path = await asyncio.to_thread(
                    save_stereo_wav, session_id,
                    bytes(getattr(self, "_rec_user", b"")),
                    bytes(getattr(self, "_rec_tts",  b"")),
                )
            except Exception:
                logger.exception(f"{lu.CC_MAIN} {lu.RED}Warning:{lu.CC_R} Failed to save session recording.{lu.RESET}")

        # --------------------------------------------------------------------------------
        # Close the ChatSession in the DB
        # --------------------------------------------------------------------------------
        if user_id and session_id:
            fire_and_log(ChatService.close_session(
                user_id, session_id,
                username        = username,
                source          = self.source,
                audio_path      = audio_path,
                audio_start_ts  = getattr(self, "_audio_start_dt", None),
            ), name=f"disconnect::close-session-{session_id}")

        # Cancel background tasks (only connection-based ones; not the close_session task)
        for task in           getattr(self, "_bg_tasks", []): task.cancel()
        await asyncio.gather(*getattr(self, "_bg_tasks", []), return_exceptions=True)

        # Reset all per-session attributes for the next connection
        self.session        = None
        self.context_buffer = []
        self._init_response_state()

        leave_all_groups(self, log) # TODO: I don't think I've EVER seen this in the logs btw...
        log.log_disconnect(self.user, session_id, code)


    # ================================================================================
    # Handle Incoming Data (processing "callbacks" used to maintain the chat)
    # ================================================================================
    # Overall communication handler; all incoming messages come through here first
    async def receive_json(self, data, **kwargs):
        await handle_receive_json(self, data)
 
    # Add messages to the database & update the local context (role must be "user" or "assistant")
    async def handle_chat_messages(self, role, text, ts): return await _handle_chat_messages(self, role, text, ts)

    # Handle on-utterance biomarkers (fires per committed user utterance)
    async def on_utterance_biomarkers(self, message, recent_text, words):
        return await _on_utterance_biomarkers(self, message, recent_text, words)

    # Handle on-audio biomarkers (fires per committed user utterance)
    async def on_audio_biomarkers(self, message, words):
        return await _on_audio_biomarkers(self, message, words)

    # Handle "streamed" audio data from the frontend client
    async def  handle_audio_data(self, data): return await _handle_audio_data(self, data)


    # ================================================================================
    # Group Event Handlers
    # ================================================================================
    # Receives commands from listener consumers
    # Forwards payloads to websocket client (catches our own broadcasts and forwards them)
    async def ws_command         (self, event): await handle_ws_command        (self, event)
    async def ws_broadcast       (self, event): await forward_payload_to_client(self, event)
    async def ws_monitor         (self, event): await forward_payload_to_client(self, event)
    async def ws_recording_status(self, event): pass  # Primary consumer echoes its own broadcast; no action needed

    # --------------------------------------------------------------------------------
    # Broadcast Helpers
    # --------------------------------------------------------------------------------
    # Relays chat messages
    async def _broadcast_room(self, payload):
        await self.channel_layer.group_send(self.room_group, {"type": "ws.broadcast", "payload": payload})

    # Relays biomarker scores
    async def _broadcast_monitor(self, payload):
        await self.channel_layer.group_send(self.monitor_group, {"type": "ws.monitor", "payload": payload})

    # Broadcasts stream status changes ("active" | "paused" | "ended") to listeners
    async def _broadcast_stream_status(self, status: str):
        await self.channel_layer.group_send(self.monitor_group, {"type": "ws.stream_status", "data": {"status": status}})

    # Broadcasts recording toggle state (True = will save at end) to listeners
    async def _broadcast_recording_state(self, enabled: bool):
        await self.channel_layer.group_send(self.monitor_group, {"type": "ws.recording_status", "data": {"enabled": enabled}})


    # ================================================================================
    # Additional Helpers
    # ================================================================================
    # Reply to the user immediately. Can pass a message, otherwise will query the LLM.
    async def reply_now(self, use_response=None):
        await ChatHandler.flush_staged_utterances(self)
        return await ChatHandler.respond_to_user(self.context_buffer, self, use_response=use_response)

    # Pause/Resume -- Toggle the STT stream (wrapper for '_toggle_stream' in ws_events.py)
    async def toggle_stream(self, data_or_cmd):
        """
        Accepts either a raw command string ("start" | "stop") or a full data dictionary (JSON).
        """
        data = data_or_cmd if isinstance(data_or_cmd, dict) else {"data": data_or_cmd}
        await _toggle_stream(self, data)

    # Session State Attributes
    def _init_response_state(self):
        """
        Initialize (or reset) all per-session state attributes. 
        Called in connect() and disconnect().
        """
        # Conveniently access the LLMs last response (for 'repeat_last_response()')
        self.last_response            = None

        # Turn-taking / overlapped speech (reset per user utterance by on_audio_biomarkers)
        self.overlapped_speech_count  = 0.0    # TODO: Need to track down everywhere this is tracked, probably can delete...
        self.overlapped_speech_events = []     # List of timestamps (TODO: Add this to the DB somehow?)

        # Response task state
        self._staged_utterances       = []     # Raw STT transcripts waiting to be committed
        self._staged_words            = []     # Parallel list of word-timestamp lists (per utterance)
        self._pending_response_task   = None   # Current 'asyncio.Task' for '_execute_response'

        # Chat status tracking
        self.streaming_active         = False  # True while STT stream is active (paused state)
        self._tts_streaming           = False  # True while audio chunks are actively being sent to the frontend
        self._pending_action          = None   # Tracks pending user-initiated action ("end_chat" | None)

