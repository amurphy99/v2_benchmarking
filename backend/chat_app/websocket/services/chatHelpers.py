""" 
Utilities for processing chat messages & getting LLM responses. 
--------------------------------------------------------------------------------
`backend.chat_app.websocket.services.chatHelpers`

Process the users message & reply with the LLM ASAP.

TODO: Rejoining a chat needs to be handled differently...
TODO: I'll delete everything we had here for it and then add it back in from a separate branch later

"""
from __future__ import annotations

import json, logging
logger = logging.getLogger(__name__)

from time     import time as now_ts
from datetime import datetime, timezone

# From this project
from   .speech.tts_streaming        import synthesize_and_stream_tts
from   .bg_helpers                  import fire_and_log, trace_await
from ...services.logging_utils      import RESET, BOLD, UNBOLD, LLM_MAIN, USER_MSG
from ...services.llm.chat_utilities import get_LLM_response

# Import the class for type checking
from typing import TYPE_CHECKING
if TYPE_CHECKING: from ..consumers.consumers import ChatConsumer


# ================================================================================
# ChatHandler
# ================================================================================
class ChatHandler:
    """
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
        data,                    # JSON from chat WS client OR from backend STT result
        consumer: ChatConsumer,  # ChatConsumer object for this chat
        *,
        relay_user_utt=False,    # If using backend STT, the client might want the user's utterances
        response_fn=None,        # Optionally provide a custom function for generating the LLM response (e.g. for RAG)
        response_fn_kwargs=None, # Optional kwargs for the custom response function
    ):
        # 1) Process the input
        user_text = data["data"] 
        user_ts   = now_ts()

        # 2) If this is using STT from the backend, also send the utterance back to the frontend
        if relay_user_utt: await consumer.send(json.dumps({'type': 'user_utt', 'data': user_text, 'time': user_ts}))

        # 3) Update context and DB for the new *user* message
        context_buffer = await consumer.handle_chat_messages(role="user", text=user_text, ts=user_ts)

        # Log an update
        logger.info((f"{lu.ORANGE}[ChatHandler] auto_reply={BOLD}{consumer.reply_on_user_utt}{UNBOLD}, " 
                     f"backend_TTS={BOLD}{consumer.use_backend_TTS}{UNBOLD}. {RESET}"))

        # 4) Get the LLMs response if the consumer is on "auto reply" mode
        system_resp = ""

        if consumer.reply_on_user_utt:
            if response_fn is None:
                system_resp = await ChatHandler.respond_to_user(context_buffer, consumer)
            else:
                system_resp = await ChatHandler.respond_to_user(
                    context_buffer, consumer, response_fn=response_fn, response_fn_kwargs=response_fn_kwargs,
                )
            return system_resp
            
        
        return "" # I don't know how this works totally yet
    
    # --------------------------------------------------------------------------------
    # Part 2 of `handle_transcription`
    # --------------------------------------------------------------------------------
    @staticmethod
    async def respond_to_user(context_buffer, consumer: ChatConsumer, *, use_response=None, response_fn=None, response_fn_kwargs=None):
        # Get the LLMs response
        if   use_response is not None:
            system_resp = use_response # directly use the provided response instead of calling the LLM
        elif response_fn  is not None: 
            system_resp = await response_fn(context_buffer, **(response_fn_kwargs or {})) # use a custom response function (e.g. for RAG)
        else:                          
            system_resp = await get_LLM_response(context_buffer) # use the default response function

         # Normalize string vs structured dict response from RAG pipeline
        if isinstance(system_resp, dict):
            response_text = system_resp.get("text", "")
        else:
            response_text = system_resp

        if not isinstance(response_text, str):
            response_text = str(response_text or "")


        system_ts = now_ts() 
        consumer.last_response = response_text

        # Immediately send the response back through the websocket & update the DB + chat context
        await consumer.send(json.dumps({'type': 'llm_response', 'data': system_resp, 'time': system_ts}))
        await consumer.handle_chat_messages(role="assistant", text=response_text, ts=system_ts)

        # On-utterance Biomarkers: fire-and-forget so long jobs don't block the next turn (could also use the context buffer here)
        fire_and_log(consumer.on_utterance_biomarkers(), name="respond_to_user::bio_callback")

        # Synthesize speech with TTS if specified
        # TODO: Pass the consumer again?
        if consumer.use_backend_TTS and response_text: 
            await synthesize_and_stream_tts(response_text, consumer.send)

        return system_resp









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
    
