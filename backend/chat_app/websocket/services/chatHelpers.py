""" 
Utilities for processing chat messages & getting LLM responses. 
--------------------------------------------------------------------------------
`backend.chat_app.websocket.services.chatHelpers`

Process the users message & reply with the LLM ASAP.

TODO: Rejoining a chat needs to be handled differently...
TODO: I'll delete everything we had here for it and then add it back in from a separate branch later

TODO: We still might commit stuff to the DB even if it barely said most of the response...?

"""
from __future__ import annotations

import json, logging, asyncio
logger = logging.getLogger(__name__)

from channels.db import database_sync_to_async as db_s2a
from time        import time                   as now_ts
from datetime    import datetime, timezone

# From this project
from   .speech.tts.tts_streaming          import synthesize_and_stream_tts
from   .bg_helpers                        import fire_and_log, trace_await
from ..services.behavior.intent_detection import handle_user_intent
from ...services                          import logging_utils as lu
from ...services.logging_utils            import RESET, BOLD, UNBOLD, LLM_MAIN, USER_MSG, ORANGE
from ...services.db_services              import ChatService


# Import the class for type checking
from typing import TYPE_CHECKING
if TYPE_CHECKING: from ..consumers.consumers import ChatConsumer


# ================================================================================
# ChatHandler
# ================================================================================
class ChatHandler:
    """
    Static class with methods for handling chat interactions between the user and system.

    User utterances arrive via two paths:
      (1) Text sent directly from the chat client => `handle_transcription` (wrapper method)
      (2) Backend STT final result                => `stage_and_schedule`   (with word timestamps)

    Both paths go through `stage_and_schedule`, which stages the utterance and creates
    a cancellable asyncio Task (`_execute_response`). Interim STT results cancel that
    task so the user's continued speech can be accumulated before responding.
    """
    # ================================================================================
    # Stage utterance + schedule a cancellable response task
    # ================================================================================
    @staticmethod
    async def stage_and_schedule(
        data     : dict,                      # JSON from chat WS client OR from backend STT result
        consumer : ChatConsumer,              # ChatConsumer object for this chat
        words    : list[dict] | None = None,  # Word-level timestamps object (see speechProvider.py)
    ):
        # 1) Process the input
        user_text = data["data"]

        # 2) If this is using STT from the backend, also send the utterance back to the frontend
        if consumer.use_backend_STT:
            await consumer.send(json.dumps({"type": "user_utt", "data": user_text, "time": data.get("time", now_ts())}))

        # 3) Accumulate staged words/utterances (NOT committed to DB until the response task completes)
        consumer._staged_utterances.append(user_text  )
        consumer._staged_words     .append(words or [])

        # Log an update 
        # TODO: Might want to do this somewhere else with the text content included ?
        logger.info((f"{ORANGE}[ChatHandler] " 
                     f"auto_reply={BOLD}{consumer.reply_on_user_utt}{UNBOLD}, " 
                     f"backend_TTS={BOLD}{consumer.use_backend_TTS}{UNBOLD}. {RESET}"))

        # 4) "Pause & Listen" mode: stage and echo user text, but don't start a response task
        if not consumer.reply_on_user_utt: return

        # 5) Cancel any running response task (it will retry with the newly accumulated staged text)
        task = consumer._pending_response_task
        if task and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)

        # 6) Create new cancellable response task
        consumer._pending_response_task = asyncio.create_task(ChatHandler._execute_response(consumer), name="chat::pending_response")

    # --------------------------------------------------------------------------------
    # Wrapper for the text-input path (ws_events.py calls handle_transcription directly)
    # --------------------------------------------------------------------------------
    @staticmethod
    async def handle_transcription(data, consumer: ChatConsumer):
        await ChatHandler.stage_and_schedule(data, consumer, words=None)

    # --------------------------------------------------------------------------------
    # Flush staged utterances before any admin-triggered or manual response
    # --------------------------------------------------------------------------------
    @staticmethod
    async def flush_staged_utterances(consumer: ChatConsumer):
        """
        Combine any accumulated staged utterances into a single user message and commit
        it to DB + context buffer. Called before admin-triggered responses and at disconnect.

        TODO: I feel like there are a lot of places where we need to look at if the words
              are getting saved before they are cleared...
        """
        if not consumer._staged_utterances: return None
        
        # Concatenate text from all of the users turns
        combined_text = " ".join(consumer._staged_utterances)
        combined_ts   = now_ts()

        # Clear staged words
        consumer._staged_utterances.clear()
        #consumer._staged_words     .clear()
        
        # Update the DB and context buffer
        _, msg = await consumer.handle_chat_messages(role="user", text=combined_text, ts=combined_ts)
        return msg

    # ================================================================================
    # Cancellable Response Task (body)
    # ================================================================================
    @staticmethod
    async def _execute_response(consumer: ChatConsumer):
        try:
            # --------------------------------------------------------------------------------
            # 1) Build LLM Context (using staged text)
            # --------------------------------------------------------------------------------
            # Get a snapshot of the staged text (keep for accumulation if canceled)
            # We do NOT clear it from the consumer until we know the full response was successful
            staged_text    = list(consumer._staged_utterances)
            staged_words   = list(consumer._staged_words)

            # Combine the staged text
            combined_text  = " ".join(staged_text)
            combined_ts    = now_ts()
            combined_words = [w for wlist in staged_words for w in wlist]

            if not combined_text.strip(): return

            # Build LLM context with staged message -- without modifying 'context_buffer' yet
            temp_context = list(consumer.context_buffer) + [("user", combined_text, combined_ts)]

            # --------------------------------------------------------------------------------
            # 2) Get response from the LLM (this is the primary cancellation window)
            # --------------------------------------------------------------------------------
            # Intent detection (may skip the LLM call with a scripted response)
            scripted_resp, close_after = await handle_user_intent(consumer, combined_text)           # 'close_after' checked at method end
            if scripted_resp is not None: system_resp = scripted_resp                                # Scripted response
            else:                         system_resp = await consumer.response_method(temp_context) # LLM call
            system_ts = now_ts()

            # Not cancelled: commit everything to DB + context buffer
            _, user_msg = await consumer.handle_chat_messages(role="user", text=combined_text, ts=combined_ts) # User message
            #logger.info(f"{ORANGE}[ChatHandler] Full user message: {USER_MSG}\"{user_msg}\"{RESET}")

            # We updated the DB and context buffer so we can clear the staged text
            consumer._staged_utterances.clear()
            consumer._staged_words     .clear()
            consumer.last_response = system_resp

            # Immediately send the response back through the websocket & update the DB + chat context
            await consumer.send(json.dumps({"type": "llm_response", "data": system_resp, "time": system_ts}))
            _, _ = await consumer.handle_chat_messages(role="assistant", text=system_resp, ts=system_ts) # LLM message

            # Save word timestamps for the committed user message
            if combined_words and user_msg:
                fire_and_log(
                    db_s2a(ChatService.add_words_bulk)(user_msg.id, combined_words),
                    name="_execute_response::add_words_bulk",
                )

            # On-utterance Biomarkers: fire-and-forget so long jobs don't block the next turn (could also use the context buffer here)
            # We wait until after the LLM is done to avoid causing any more delays
            fire_and_log(consumer.on_utterance_biomarkers(), name="_execute_response::bio_callback")

            # --------------------------------------------------------------------------------
            # 3) Text-to-speech call that guards for cancelations
            # --------------------------------------------------------------------------------
            if consumer.use_backend_TTS:

                # Update the consumer state & start streaming TTS
                consumer._tts_streaming = True
                try: await synthesize_and_stream_tts(system_resp, consumer.send, consumer)

                # Send "cancel_audio" to frontend if interrupted mid TTS stream
                # TODO: I don't know if we want this to work (idea is frontend cancels speaking)
                except asyncio.CancelledError:
                    logger.info(f"{ORANGE}[ChatHandler] Pending response task {lu.RED}{BOLD}canceled{UNBOLD}{ORANGE}.{RESET}")
                    try: await consumer.send(json.dumps({"type": "cancel_audio"})) 
                    except Exception: pass
                    raise

                # Update the consumer state
                finally: consumer._tts_streaming = False

            # Close the WebSocket if the user confirmed they wish to end the chat (disconnect() is called automatically)
            if close_after:
                try: await consumer.send(json.dumps({"type": "chat_ended"}))
                except Exception: pass
                await consumer.close()

        # Staged utterances are intentionally NOT cleared; they accumulate for the next response attempt
        except asyncio.CancelledError: raise


    # ================================================================================
    # Manually Respond (bypasses response staging; used by ch_events.py)
    # ================================================================================
    @staticmethod
    async def respond_to_user(context_buffer, consumer: ChatConsumer, *, use_response=None):
        """
        Not called by handle_transcription anymore.
        Response generation method is defined inside the ChatConsumer instance.
        
        TODO: If kwargs are required, could probably add that in
        """
        # Get the LLMs response if we weren't passed a default response to use
        if use_response is None: system_resp = await consumer.response_method(context_buffer)
        else:                    system_resp = use_response

        system_ts = now_ts()
        consumer.last_response = system_resp

        # Immediately send the response back through the websocket & update the DB + chat context
        await consumer.send(json.dumps({"type": "llm_response", "data": system_resp, "time": system_ts}))
        await consumer.handle_chat_messages(role="assistant", text=system_resp, ts=system_ts)

        # On-utterance Biomarkers: fire-and-forget so long jobs don't block the next turn (could also use the context buffer here)
        fire_and_log(consumer.on_utterance_biomarkers(), name="respond_to_user::bio_callback")

        # Synthesize speech with TTS if specified (pass the consumer to store the audio bytes)
        if consumer.use_backend_TTS: await synthesize_and_stream_tts(system_resp, consumer.send, consumer)

        return system_resp























# --------------------------------------------------------------------------------
# TODO: Stuff from old version that needs to finish being factored out
# --------------------------------------------------------------------------------
class RagParseError(Exception):
    """Raised when the RAG LLM output cannot be parsed into the expected JSON schema."""

import traceback
from time import time


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
    
