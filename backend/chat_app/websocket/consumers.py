# =======================================================================
# Processes incoming messages, scores them, and responds
# =======================================================================
from django.apps import apps

import json, asyncio, logging, base64, threading
logger = logging.getLogger(__name__)

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db                import database_sync_to_async

from time     import time
from datetime import datetime, timezone

# From this project
from ..                      import config as cf
from ..services.db_services  import ChatService
from .services.chatHelpers  import generate_LLM_response
from .services.audioHelpers import extract_audio_biomarkers, extract_text_biomarkers
from .services.speechProvider import SpeechToTextProvider, TextToSpeechProvider

# ------------------------------------------------------------------
# Helper: Start a background task and log any exception it raises --- put into another file
# ------------------------------------------------------------------
def fire_and_log(coro):
    async def _runner():
        try: await coro
        except Exception: logger.exception("Background task crashed")
    return asyncio.create_task(_runner())

SECOND = 32_000 # How big a chunk of audio of one second is, in bytes
CHUNK_SIZE = 4096 # How many bytes of audio we can send at a time


# ======================================================================= ===================================
# ChatConsumer 
# ======================================================================= ===================================
class ChatConsumer(AsyncJsonWebsocketConsumer):
    """
    Have the ability here to add optional ASR/TTS in the frontend or backend by using different endpoints. If
    a text message is received, assume ASR/TTS was done in the frontend and just reply with a message (could
    also base this on the "source" field). If audio of a shorter length is received (would be every ~100 ms
    or so), then we know we should be doing ASR/TTS in the backend here. The longer, 5 second, audio data we
    receive is for the opensmile biomarkers, so a different "type" would be used for shorter audio.

    * ToDo: send_json or do json.dumps inside send ?

    """
    MAX_CONTEXT = 10  # (how many recent messages to keep for the LLM)
    SECONDS = 3 # How often we want to send audio to calculate biomarkers

    # =======================================================================
    # Open WebSocket Connection
    # =======================================================================
    async def connect(self):
        """
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
        # -----------------------------------------------------------------------
        # 1) Authentication Block 
        # -----------------------------------------------------------------------
        # Authenticate before accepting connection (uses custom "unauth" code)
        if not self.scope["user"].is_authenticated: 
            await self.close(code=4001)
            return
        self.user   = self.scope["user"]
        self.source = self.scope.get("source", "unknown")
        await self.accept()

        logger.info(f"{cf.RLINE_1}{cf.RED}[WS] ChatSession opened for {self.user} from {self.source} {cf.RESET}{cf.RLINE_2}")
        

        # I don't think any frontend uses these during the chat right now, but I'll leave this option in
        self.return_biomarkers = False # (self.source in ["webapp"])

        # -----------------------------------------------------------------------
        # 2) Load or create an active session
        # -----------------------------------------------------------------------
        self.session = await database_sync_to_async(ChatService.get_or_create_active_session)(self.user, source=self.source)
        recent = await database_sync_to_async(lambda: list(self.session.messages.all().order_by("-start_ts")[: self.MAX_CONTEXT])[::-1])()

        # ToDo: Check if the incoming source matches or doesn't match the source of the loaded session
        # if not, do something....

        # ToDo: I added the timestamps in just now for biomarker scores, but I actually don't really like how this works at the moment...
        self.context_buffer = [(m.role, m.content, m.ts.timestamp()) for m in recent]

        # Other misc. setup
        self.overlapped_speech_count  = 0.0
        self.audio_windows_count      = 0.0
        self.overlapped_speech_events = []  # List of timestamps (ToDo: Add this to the DB somehow)
        # Create new speech provider instances
        loop_stt = asyncio.get_event_loop()
        self.stt_provider = SpeechToTextProvider(on_transcription_callback=self._handle_transcription, loop=loop_stt)
        self.tts_provider = TextToSpeechProvider()
        self.audio_buffer = bytearray()

        # -----------------------------------------------------------------------
        # 3) Send misc information to the frontend (ToDo: biomarkers, etc)
        # -----------------------------------------------------------------------
        # This is where we could potentially have a connection on the robot and web app and monitor the conversation in real time
        if self.return_biomarkers: await self.send_json({"type": "history", "messages": self.context_buffer})
                

    # -----------------------------------------------------------------------
    # Close Connection 
    # -----------------------------------------------------------------------
    async def disconnect(self, code):
        """
        # DO NOT close the session -- just clean local state.
        """
        # 1) Close the ChatSession in the DB
        

        # Cancel background tasks (if any -- none right now)
        for task in getattr(self, "_bg_tasks", []): task.cancel()
        await asyncio.gather(*getattr(self, "_bg_tasks", []), return_exceptions=True)

        # Reset some properties for the next connection
        self.context_buffer = []
        self.overlapped_speech_count  = 0.0
        self.audio_windows_count      = 0.0
        self.overlapped_speech_events = []
        
        self.stt_provider.stop()

        logger.info(f"Client disconnected:  {code}") 


    # ======================================================================= ===================================
    # Handle Incoming Data
    # ======================================================================= ===================================
    async def receive_json(self, data, **kwargs):
        # Overlapped Speech
        if data["type"] == "overlapped_speech": 
            self.overlapped_speech_count += 1
            self.overlapped_speech_events.append(time())
            logger.info(f"{cf.YELLOW}Overlapped speech detected. Count: {self.overlapped_speech_count} {cf.RESET}")
    
        # Audio data or text transcription
        elif data["type"] == "audio_data"   : await self._handle_audio_data   (data)
        elif data["type"] == "transcription": await self._handle_transcription(data)
        elif data["type"] == "end_chat"     : await database_sync_to_async(ChatService.close_session)(self.user, self.session, source=self.source)
        elif data["type"] == "toggle_stream": self._toggle_stream(data)
 
    # =======================================================================
    # Text Transcriptions
    # =======================================================================
    # On-Utterance Biomarkers (saves them to the DB as soon as we get them)
    async def _on_utterance_biomarkers(self):
        utterance_biomarkers = await extract_text_biomarkers(self.context_buffer)
        fire_and_log(database_sync_to_async(ChatService.add_biomarkers_bulk)(self.session, utterance_biomarkers))
        if self.return_biomarkers: await self.send(json.dumps({"type": "biomarker_scores", "data": utterance_biomarkers}))
    
    # Process and respond to the users utterance text
    async def _handle_transcription(self, data):
        t0 = time()
        text = data["data"].lower()
        logger.info(f"{cf.YELLOW}[LLM] User utt received {text}  {cf.RESET}")

        # -----------------------------------------------------------------------
        # 1) Process the users message & reply with the LLM ASAP
        # -----------------------------------------------------------------------
        # Fire-and-forget DB write for the user message
        fire_and_log(database_sync_to_async(ChatService.add_message)(self.session, "user", text))

        # Update in-memory context
        self.context_buffer.append(("user", text, time()))
        if len(self.context_buffer) > self.MAX_CONTEXT: self.context_buffer.pop(0)

        # Get the LLMs response (awaited since it is the most important/longest process)
        system_utt = await generate_LLM_response(self.context_buffer)
        
        # Immediately send the response back through the websocket
        await self.send(json.dumps({'type': 'llm_response', 'data': system_utt, 'time': datetime.now(timezone.utc).strftime("%H:%M:%S")}))
        
        # Synthesize the speech 
        # speech = self.tts_provider.synthesize_speech(system_utt)
        speech = self.tts_provider.synthesize_speech_gemini(system_utt)
        fire_and_log(self._handle_speech(speech))
        
        # -----------------------------------------------------------------------
        # 2) Background persistence & biomarkers
        # -----------------------------------------------------------------------
        # LLM/Assistant message
        fire_and_log(database_sync_to_async(ChatService.add_message)(self.session, "assistant", system_utt))

        # Update the in-memory buffer again
        self.context_buffer.append(("assistant", system_utt, time()))
        if len(self.context_buffer) > self.MAX_CONTEXT: self.context_buffer.pop(0)

        # On-utterance biomarker scores (run in a thread so we don't block the loop)
        fire_and_log(self._on_utterance_biomarkers())
        
    async def _handle_speech(self, audio_bytes: bytes) -> None:
        # Splits audio data into chunks so we can send it to the frontend
        for i in range(0, len(audio_bytes), CHUNK_SIZE):
            chunk = audio_bytes[i:i + CHUNK_SIZE]
            await self.send(bytes_data=chunk)
        

    # =======================================================================
    # Audio Data
    # =======================================================================
    async def _handle_audio_data(self, data):
        
         # Generate the transcript from the audio data
        self.stt_provider.send_audio(data)
                            
        # # Generate the audio-related biomarker scores
        # self.audio_buffer.extend(base64.b64decode(data['data']))
        # if len(self.audio_buffer) >= (self.SECONDS * SECOND):
        #     audio_data = {"data": bytes(self.audio_buffer), "sampleRate": data['sampleRate']}
        #     audio_biomarkers = await extract_audio_biomarkers(audio_data, self.overlapped_speech_count)
        #     self.audio_buffer.clear()

        #     # Save biomarkers to the DB
        #     fire_and_log(database_sync_to_async(ChatService.add_biomarkers_bulk)(self.user, audio_biomarkers))
        #     if self.return_biomarkers: await self.send(json.dumps({"type": "audio_scores", "data": audio_biomarkers}))

        # # Update turntaking (12 audio windows for 1 minute of data)
        # self.audio_windows_count += 1
        # self.overlapped_speech_count = self.overlapped_speech_count / (self.audio_windows_count / 12)
        
        
    def _toggle_stream(self, data):
        cmd = data["data"]
        if cmd == "start":
            self.stt_provider.start()
        elif cmd == "stop":
            self.stt_provider.stop()
