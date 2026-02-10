""" 
Utilities for processing chat messages & getting LLM responses. 
--------------------------------------------------------------------------------
`backend.chat_app.websocket.services.chatHelpers`

Process the users message & reply with the LLM ASAP.

TODO: Rejoining a chat needs to be handled differently...
TODO: I'll delete everything we had here for it and then add it back in from a separate branch later

"""
import json, logging, base64
logger = logging.getLogger(__name__)

from math     import ceil
from time     import time as now_ts
from datetime import datetime, timezone

# From this project
from   .speechProvider              import TextToSpeechProvider
from   .bg_helpers                  import fire_and_log, trace_await
from ...services.logging_utils      import RESET, LLM_MAIN, STT_TTS_MAIN, USER_MSG
from ...services.llm.chat_utilities import get_LLM_response


# Chunk sizes of TTS audio streamed back to frontend client
CHUNK_SIZE = 8_192 # How many bytes of audio we can send at a time


# ================================================================================
# ChatHandler
# ================================================================================
class ChatHandler:
    """
    ChatHandler
    -----------
    Static class with methods for handling chat interactions between the user and system.

    We can receive user utterances in two ways: (1) the text is received directly from the
    chat client, or (2) the chat client is streaming audio to us, and we use our own STT
    to get utterances. `handle_transcription` is called in both scenarios.
    
    TODO: Eventually we might receive timestamps directly within the WS data. Both 
          `handle_transcription` and `handle_stt_output` would need to be updated.

    """
    # ================================================================================
    # Process the users message & reply with the LLM ASAP
    # ================================================================================
    @staticmethod
    async def handle_transcription(
        data,          # JSON from chat WS client OR from backend STT result
        msg_callback,  # Callback to add new messages to the database & update local chat context
        send_callback, # Callback to send data to the chat WebSocket client
        bio_callback,  # On utterance received, calculate audio-biomarkers (we know the user was just speaking)
    ):
        # 1) Process the input TODO: Eventually we might receive timestamps directly within the WS data
        user_text = data["data"] 
        user_ts   = now_ts() # datetime.now(timezone.utc).strftime("%H:%M:%S")

        logger.info(f"{LLM_MAIN}[LLM] User utt received: {USER_MSG}\"{user_text}\"{RESET}")

        # Update context and DB for the new *user* message
        context_buffer = await msg_callback(role="user", text=user_text, ts=user_ts)
        #context_buffer = await trace_await("msg_callback(user)",  msg_callback(role="user", text=user_text, ts=user_ts))

        # 2) Get the LLMs response
        system_resp = await get_LLM_response(context_buffer)
        #system_resp = await trace_await("get_LLM_response", get_LLM_response(context_buffer), timeout=10)
        system_ts   = now_ts() # datetime.now(timezone.utc).strftime("%H:%M:%S")

        # Immediately send the response back through the websocket & update the DB + chat context
        await send_callback(json.dumps({'type': 'llm_response', 'data': system_resp, 'time': system_ts}))
        await msg_callback(role="assistant", text=system_resp, ts=system_ts)
        #await trace_await("send_callback(llm_response)", send_callback(json.dumps({'type': 'llm_response', 'data': system_resp, 'time': system_ts})))
        #await trace_await("msg_callback(assistant)", msg_callback(role="assistant", text=system_resp, ts=system_ts))

        # 3) On-utterance Biomarkers: fire-and-forget so long jobs don't block the next turn (could also use the context buffer here)
        fire_and_log(bio_callback(), name="handle_transcription::bio_callback")
        
        return system_resp

    # ================================================================================
    # Handle Backend STT output
    # ================================================================================
    @staticmethod
    async def handle_stt_output(data, msg_callback, send_callback, bio_callback):
        user_text = data["data"] 
        user_ts   = now_ts() # datetime.now(timezone.utc).strftime("%H:%M:%S")

        # Send the user's utterance to the frontend TODO: IDK if we should really do this?
        await send_callback(json.dumps({'type': 'user_utt', 'data': user_text, 'time': user_ts}))
        
        # Forward the user's utterance to `handle_transcription` (and grab the system's response)
        system_resp = await ChatHandler.handle_transcription(data, msg_callback, send_callback, bio_callback)

        # Synthesize to speech 
        await ChatHandler.synthesize_speech(system_resp, send_callback)

    # --------------------------------------------------------------------------------
    # Synthesize the system's response via Text-to-Speech and stream to the frontend
    # --------------------------------------------------------------------------------
    @staticmethod
    async def synthesize_speech(
        system_resp,   # System's response text (to be vocalized with TTS)
        send_callback, # Callback from the consumer for sending information to the client
    ):
        # Synthesize speech from the system's response
        tts_provider = TextToSpeechProvider()
        speech = tts_provider.synthesize_speech(system_resp)
        
        # Send the response back to the frontend
        fire_and_log(ChatHandler.handle_speech(speech, send_callback), name="synthesize_speech::handle_speech")        
        logger.info(f"{STT_TTS_MAIN}[TTS] Synthesized speech sent to frontend. {RESET}")

    # Splits audio data into smaller chunks so we can send it to the frontend
    @staticmethod
    async def handle_speech(audio_bytes: bytes, send_callback) -> None:
        n_chunks = ceil(len(audio_bytes) / CHUNK_SIZE)
        for i in range(n_chunks):
            chunk = audio_bytes[i * CHUNK_SIZE:(i + 1) * CHUNK_SIZE]
            await send_callback(json.dumps({
                "type": "audio_chunk", 
                "data": json.dumps({"data": base64.b64encode(chunk).decode('utf-8')})
            }))







# --------------------------------------------------------------------------------
# TODO: Stuff from old version that needs to finish being factored out
# --------------------------------------------------------------------------------
class RagParseError(Exception):
    """Raised when the RAG LLM output cannot be parsed into the expected JSON schema."""

import asyncio, traceback
from time import time

from ...services      import logging_utils as lu
from ...services.llm.chat_utilities import generate_LLM_response, classify_llm_text_emotion_async


async def handle_transcription0(data, msg_callback, send_callback, bio_callback, *, response_fn=None, response_fn_kwargs=None):
    # Takes three callbacks from the consumers object
    t0 = time()
    
    # -----------------------------------------------------------------------
    # 1) Process the users message
    # -----------------------------------------------------------------------
    text = data["data"].lower()
    logger.info(f"{lu.YELLOW}[LLM] User utt received: \n{lu.USER_MSG}{text} {lu.RESET}")

    # Fire-and-forget DB write for the "user" message & update in-memory context
    context_buffer = await msg_callback(role="user", text=data['data'], time=time())

    # -----------------------------------------------------------------------
    # 2) Get the LLMs response (awaited since it is the most important/longest process)
    # -----------------------------------------------------------------------
    t1 = time(); logger.info(f"{lu.YELLOW}[LLM] Sending LLM request... {lu.RESET}")
    
    try:
        # Generate assistant response
        if response_fn is None:
            system_utt = await generate_LLM_response(context_buffer)
        else:
            response_fn_kwargs = response_fn_kwargs or {}
            system_utt = await response_fn(context_buffer[:-1], text, **response_fn_kwargs)

    except RagParseError as e:
        # On parsing/structured-output failure, send a signal to frontend;
        logger.warning("[CHAT] RagParseError: %s", repr(e))
        await send_callback(json.dumps({
            "type": "rag_parse_error",
            "data": "RAG_PARSE_ERROR",
            "time": datetime.now(timezone.utc).strftime("%H:%M:%S"),
        }))
        return None

    except Exception as e:
        tb = traceback.format_exc()
        # Safety net to catch other exceptions and not crash the websocket
        logger.error("[CHAT] Unhandled error in handle_transcription: %s", repr(e))
        logger.error("[CHAT] Traceback:\n%s", tb)
        await send_callback(json.dumps({
            "type": "chat_error",
            "data": "CHAT_BACKEND_ERROR",
            "time": datetime.now(timezone.utc).strftime("%H:%M:%S"),
        }))

    t2 = time(); logger.info(f"{lu.YELLOW}[LLM] LLM response received: (in {(t2-t1):.4f}) \n{lu.ROBO_MSG}{system_utt} {lu.RESET}")

    payload = system_utt

    # Normalize for both string and dict responses (RAG output returns a dict)
    if isinstance(payload, dict):
        response_data = payload
        response_text = payload.get("text", "")
    else:
        response_data = payload
        response_text = payload

    emotion = await classify_llm_text_emotion_async(response_text, emo_classifier_type="vader")

    await send_callback(json.dumps({'type': 'llm_response', 'data': response_data, 'emotion': emotion, 'time': datetime.now(timezone.utc).strftime("%H:%M:%S")}))
    t3 = time(); logger.info(f"{lu.YELLOW}[LLM] Response sent {(t3-t2):.4f}s ({(t3-t0):.4f}s total). {lu.RESET}")

    # -----------------------------------------------------------------------
    # 3) Background persistence & biomarkers
    # -----------------------------------------------------------------------
    # Fire-and-forget DB write for the "assistant" message & update in-memory context
    await msg_callback(role="assistant", text=response_text, time=time())

    # On-utterance Biomarkers: fire-and-forget so long jobs don't block the next turn (could also use the context buffer here)
    asyncio.create_task(bio_callback())
    return system_utt
    
