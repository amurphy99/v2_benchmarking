"""
Main WebSocket controller for a live chat session. 
--------------------------------------------------------------------------------
`backend.chat_app.websocket.consumers.consumers`

TODO: Change the config stuff later as the other platforms (robots) get updated (e.g.
      the stuff like `use_backend_STT`, etc.).

"""
import asyncio, collections, logging, time
logger = logging.getLogger(__name__)

# Django
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db                import database_sync_to_async as db_s2a

# From this project
from ...services                           import logging_utils as lu
from ...services.db_services               import ChatService
from  ..harnesses.registry                 import ChatTypeRejected, build_harness
from  ..services.bg_helpers                import fire_and_log
from  ..services.chatHelpers               import ChatHandler
from  ..services.chat_state                import StagedUtteranceBuffer
from  ..services.speech.stt.speechProvider import SpeechToTextProvider

from chat_app.websocket.services.speech.audio_recorder import SessionAudioRecorder
from chat_app.services.session_audio_storage             import delete_recording

# Consumer-specific utilities
from .utils   .logging      import ChatConsumerLogging as log
from .utils   .groups       import claim_primary_connection, join_chat_consumer_groups, leave_all_groups, PRIMARY_REPLACED_CLOSE_CODE
from .handlers.ch_events    import handle_ws_command, forward_payload_to_client
from .handlers.ws_events    import handle_receive_json

# Close code for an unknown `chat_type`, `condition`, or `variant` (`CLIENT_PROTOCOL.md` §1)
CHAT_TYPE_REJECTED_CLOSE_CODE = 4005


# ================================================================================
# ChatConsumer
# ================================================================================
class ChatConsumer(AsyncJsonWebsocketConsumer):
    # How many recent messages to keep for the LLM
    MAX_CONTEXT = 30

    # ================================================================================
    # Connect
    # ================================================================================
    async def connect(self):
        # Initialize all per-session state attributes (also called on disconnect to reset them)
        self._init_response_state()
        self._close_scheduled = False
        self.user             = self.scope.get("user")
        self.source           = self.scope.get("source", "unknown")
        self.harness          = None
        self.session          = None
        self.session_id       = None
        self.context_buffer   = []
        self.stt_provider     = None
        self.primary_group    = None

        # --------------------------------------------------------------------------------
        # 1) Authenticate before accepting connection
        # --------------------------------------------------------------------------------
        # Custom "unauth" code
        if not self.user.is_authenticated:
            await self.close(code=4001); return
        if self.source == "unknown":
            await self.close(code=4002); return

        # Build the requested chat type's harness (the `ws/chat/activity/` route fixes the type)
        chat_type = self.scope["url_route"]["kwargs"].get("chat_type", self.scope["chat_type"])
        try: self.harness = build_harness(self, chat_type, self.scope["condition"], self.scope["variant"])
        except ChatTypeRejected as exc:
            logger.warning(f"{lu.CC_MAIN} Refused a chat connection: {exc}.{lu.RESET}")
            await self.close(code=CHAT_TYPE_REJECTED_CLOSE_CODE); return

        # Get the user information and any additional parameters sent in the URL (e.g. "source" here)
        # Configuration based on the source platform for the chat
        self.use_backend_STT = (self.source == "webapp")  # Send the user text to the frontend so it can see it too
        self.use_backend_TTS = (self.source == "webapp")  # Should the ChatHandler reply with audio bytes as well as text

        # "automatic" replies on every finalized utterance; "manual" waits for an explicit command
        # qtrobot starts manual so the robot itself decides when to reply
        self.response_mode = "manual" if (self.source == "qtrobot") else "automatic"

        # Accept the connection
        await self.accept()
        log.log_connect(self.user, self.source)
        
        # --------------------------------------------------------------------------------
        # 2) Load or create an active session & Prepare the 'context_buffer'
        # --------------------------------------------------------------------------------
        # TODO: Change this back (and fix whatever was wrong) so that we CAN reconnect to old chats
        # Close any currently-active session for this user (to avoid clashes between multiple connections)
        closed_sessions = await db_s2a(ChatService.close_any_active_session)(self.user)
        for closed in closed_sessions:
            fire_and_log(
                ChatService.close_session(self.user.id, closed["id"], username=self.user.username, source=closed["source"]),
                name=f"connect::close-stale-session-{closed['id']}",
            )

        # Load the most recent active session for this user (it records which chat type runs)
        self.session = await db_s2a(ChatService.get_or_create_active_session)(
            self.user,
            source    = self.source,
            chat_type = self.harness.NAME,
            condition = self.harness.condition,
            variant   = self.harness.variant,
        )
        self.session_id = self.session.id

        # Load existing messages
        # TODO: This behavior is for resuming existing chats; doesn't do anything here yet
        recent = await db_s2a(lambda: list(self.session.messages.all().order_by("-ts")[: self.MAX_CONTEXT - 1])[::-1])()

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
        # Contains: (datetime_received, raw_pcm_bytes). Pruned by processing.audio
        self._audio_chunks = collections.deque()

        # Setup the audio recorded and toggle control for audio saving1
        # NOTE: Audio is always recorded for an entire chat, it is either saved or discarded when the
        #       chat ends based on the default setting the user has + whether or not an admin user
        #       changed that toggle mid-chat.
        self.save_audio     = await db_s2a(ChatService.get_audio_recording_default)(self.session_id)
        self.audio_recorder = SessionAudioRecorder(self.session_id)

        # A fully initialized connection takes ownership only after it is ready to receive
        # traffic. Any older primary socket for this user is closed with a dedicated code.
        await claim_primary_connection(self)

        # The chat type's harness starts once its session and STT are ready
        await self.harness.start()

        # Log the successful connection
        log.log_connect_done(self.user, self.session.id,
                             config={"chat_type": self.harness.NAME, "condition": self.harness.condition, "variant": self.harness.variant,
                                     "backend_STT": self.use_backend_STT, "backend_TTS": self.use_backend_TTS, "response_mode": self.response_mode})
    
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
        if getattr(self, "stt_provider", None): self.stt_provider.shutdown()

        # Stop the harness's cues so none of their timers starts a turn during teardown
        harness = getattr(self, "harness", None)
        if harness is not None:
            try: harness.stop()
            except Exception: logger.exception(f"{lu.CC_MAIN} Failed to stop the chat type's harness.{lu.RESET}")

        # Notify listeners that the user has disconnected
        try: await self._broadcast_stream_status("ended")
        except Exception: pass

        # Cancel any pending response task (LLM -> TTS tasks)
        pending = getattr(self, "_pending_response_task", None)
        if pending and not pending.done():
            pending.cancel()
            await asyncio.gather(pending, return_exceptions=True)

        reply_task = getattr(self, "_reply_now_task", None)
        if (reply_task is not None) and (not reply_task.done()):
            reply_task.cancel()
            await asyncio.gather(reply_task, return_exceptions=True)

        manual_task = getattr(self, "_manual_response_task", None)
        if (manual_task is not None) and (not manual_task.done()):
            manual_task.cancel()
            await asyncio.gather(manual_task, return_exceptions=True)

        # Snapshot IDs (don't pass model instances into background tasks)
        user       = getattr(self,    "user",     None)
        session    = getattr(self,    "session",  None)
        user_id    = getattr(user,    "id",       None)
        session_id = getattr(session, "id",       None)
        username   = getattr(user,    "username", None)

        # Flush any staged utterances to DB before post-chat analysis runs
        # (awaited so the message exists before close_session queries for it)
        staged = getattr(self, "_staged_utterances", None)
        if staged:
            try: await ChatHandler.flush_staged_utterances(self)
            except Exception: logger.exception(f"{lu.CC_MAIN} Failed to save staged utterances during disconnect.{lu.RESET}")

        # --------------------------------------------------------------------------------
        # Finalize the user-only recording or discard its temporary WAV
        # --------------------------------------------------------------------------------
        audio_artifact = None
        recorder = getattr(self, "audio_recorder", None)
        if recorder is not None:
            try: audio_artifact = await asyncio.to_thread(recorder.finalize, persist=getattr(self, "save_audio", False))
            except Exception: logger.exception(f"{lu.CC_MAIN} {lu.RED}Warning:{lu.CC_R} Failed to save session recording.{lu.RESET}")

        # Attach stored-object metadata before slower background session analysis
        if audio_artifact and session_id:
            try: await db_s2a(ChatService.attach_session_audio)(session_id, audio_artifact.as_dict())
            except Exception:
                logger.exception(f"{lu.CC_MAIN} {lu.RED}Warning:{lu.CC_R} Failed to attach session recording metadata.{lu.RESET}")
                try: await asyncio.to_thread(delete_recording, audio_artifact.storage_backend, audio_artifact.object_key)
                except Exception: logger.exception(f"{lu.CC_MAIN} Failed to clean up the unattached recording object.{lu.RESET}")

        # --------------------------------------------------------------------------------
        # Close the ChatSession in the DB
        # --------------------------------------------------------------------------------
        if user_id and session_id:
            await db_s2a(ChatService.deactivate_session)(session_id)
            fire_and_log(ChatService.close_session(
                user_id, session_id,
                username = username,
                source   = getattr(self, "source", "unknown"),
            ), name=f"disconnect::close-session-{session_id}")

        # Leave groups while connection attributes are still available
        await leave_all_groups(self, log)

        # Reset all per-session attributes for the next connection
        self.session        = None
        self.context_buffer = []
        self._init_response_state()

        log.log_disconnect(user, session_id, code)


    # ================================================================================
    # Handle incoming & outgoing WebSocket communication
    # ================================================================================
    # Overall communication handler; all incoming messages come through here first
    async def receive_json(self, data: object, **kwargs: object) -> None:
        await handle_receive_json(self, data)

    # --------------------------------------------------------------------------------
    # Group Event Handlers
    # --------------------------------------------------------------------------------
    # Receives commands from listener consumers
    # Forwards payloads to websocket client (catches our own broadcasts and forwards them)
    async def ws_command         (self, event): await handle_ws_command        (self, event)
    async def ws_broadcast       (self, event): await forward_payload_to_client(self, event)
    async def ws_monitor         (self, event): await forward_payload_to_client(self, event)
    async def ws_recording_status(self, event): pass  # Primary consumer echoes its own broadcast; no action needed

    # A newer primary connection for this account has taken ownership of live chat traffic.
    async def ws_session_replaced(self, event):
        if event.get("replacement_channel") == self.channel_name: return
        logger.info(f"{lu.CC_MAIN} Primary chat connection replaced for user {getattr(self.user, 'id', None)}.{lu.RESET}")
        await self.close(code=PRIMARY_REPLACED_CLOSE_CODE)

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

    # Broadcasts the complete canonical control state to every listener
    async def _broadcast_control_state(self, state: dict[str, object]) -> None:
        await self.channel_layer.group_send(self.monitor_group, {"type": "ws.control_state", "data": state})


    # ================================================================================
    # Additional Helpers
    # ================================================================================
    # Request a staged response without blocking the WebSocket receive loop
    def reply_now(self) -> asyncio.Task[str | None]:
        barrier = self.stt_provider.create_audio_barrier()
        return ChatHandler.request_reply_now(self, barrier)

    # --------------------------------------------------------------------------------
    # Persist the literal command before scheduling the response it requested
    # --------------------------------------------------------------------------------
    async def accept_reply_now(self, metadata: dict[str, object]) -> asyncio.Task[str | None]:
        # Add an audio barrier so STT can finish processing relevant user speech while the DB task runs
        barrier = self.stt_provider.create_audio_barrier()
        requested_by_id = metadata.get("requested_by_id")
        if not isinstance(requested_by_id, int):
            requested_by_id = getattr(getattr(self, "user", None), "id", None)

        # Record a row for this `reply_now` command in the database
        await db_s2a(ChatService.add_reply_now_event)(
            self.session_id,
            origin          = metadata.get("origin", "primary_client"),
            received_at     = metadata.get("received_at"),
            response_mode   = self.response_mode,
            requested_by_id = requested_by_id,
            command_id      = metadata.get("command_id"),
        )
        return ChatHandler.request_reply_now(self, barrier)

    # --------------------------------------------------------------------------------
    # Speak supplied text independently of STT/staged-response coordination
    # --------------------------------------------------------------------------------
    def speak_response(self, response: str) -> asyncio.Task:
        # Cancel a pending (generic) response task if there is one
        pending = getattr(self, "_pending_response_task", None)
        if (pending is not None) and (not pending.done()): pending.cancel()

        # Cancel a pending (manual) response task if there is one
        previous = getattr(self, "_manual_response_task", None)
        if (previous is not None) and (not previous.done()): previous.cancel()

        # Begin the new response task
        task = fire_and_log(ChatHandler.respond_to_user(self, response), name="chat::manual_response")
        self._manual_response_task = task
        return task

    # --------------------------------------------------------------------------------
    # Session State Attributes
    # --------------------------------------------------------------------------------
    def _init_response_state(self):
        """
        Initialize (or reset) all per-session state attributes. 
        Called in connect() and disconnect().
        """
        # Conveniently access the LLMs last response (for 'repeat_last_response()')
        self.last_response            = None

        # Turn-taking / overlapped speech (reset per user utterance by audio biomarkers)
        self.overlapped_speech_count  = 0.0    # TODO: Need to track down everywhere this is tracked, probably can delete...
        self.overlapped_speech_events = []     # List of timestamps (TODO: Add this to the DB somehow?)

        # Response task state
        self._staged_utterances        = StagedUtteranceBuffer()    # Utterances received since the last successful assistant response 
        self._pending_response_task    = None                       # Current 'asyncio.Task' for '_execute_response'
        self._pending_response_trigger = None                       # "automatic", "reply_now", or "harness" for cancellation policy
        self._manual_response_task     = None                       # Current admin-supplied or repeated response task
        self._reply_now_task           = None                       # Coordinator retaining a forced-reply request across retries
        self._reply_now_generation     = 0                          # Newer reply requests supersede older queue boundaries
        self._stt_progress_revision    = 0                          # Meaningful interim/final progress (lets a response drop a stale mood update)
        self._stage_lock               = asyncio.Lock()             # Serializes final-transcript scheduling decisions
        self._response_lock            = asyncio.Lock()             # Gives one response task ownership of staged text

        # Chat status tracking (not always used)
        self.streaming_active = False  # True while STT stream is active (paused state)
        self._tts_streaming   = False  # True while audio chunks are actively being sent to the frontend
