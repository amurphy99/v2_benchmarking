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

# From this project
from   .speech.tts.tts_streaming          import synthesize_and_stream_tts
from   .speech.stt.audio_queue            import AudioBarrier
from   .bg_helpers                        import fire_and_log, trace_await
from ..services.behavior.intent_detection import handle_user_intent
from ...services                          import logging_utils as lu
from ...services.logging_utils            import RESET, BOLD, UNBOLD, ORANGE
from ...services.db_services              import ChatService


# Import the class for type checking
from typing import TYPE_CHECKING
if TYPE_CHECKING: from ..consumers.consumers import ChatConsumer

REPLY_BARRIER_TIMEOUT_SEC = 2.0
REPLY_SETTLE_SEC          = 0.2
REPLY_EMPTY_WAIT_SEC      = 1.0


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
        data     : dict,                                   # Frontend or backend-STT transcription payload
        consumer : ChatConsumer,                           # Chat session receiving the final transcript
        words    : list[dict[str, object]] | None = None,  # Google word-level timestamp records (see speechProvider.py)
    ) -> None:
        """
        Stage one finalized utterance atomically and choose the response-task owner.
        We use a "forced-reply coordinator" to handle retries while the response-task
        is active. Otherwise (or if we are in automatic mode), we start the normal
        cancellable response task.
        """
        # 1) Stage text and word metadata atomically, before the first await
        user_text = data["data"]
        consumer._staged_utterances.append(text=user_text, words=words, timestamp=now_ts())

        # A final result is always meaningful STT progress. It must invalidate any
        # response attempt whose snapshot did not contain this utterance
        ChatHandler.note_stt_progress(consumer)

        # 2) If this is using STT from the backend, also send the utterance back to the frontend
        if consumer.use_backend_STT:
            await consumer.send(json.dumps({"type": "user_utt", "data": user_text, "time": data.get("time", now_ts())}))

        # Log an update 
        # TODO: Might want to do this somewhere else with the text content included ?
        logger.info((f"{ORANGE}[ChatHandler] " 
                     f"auto_reply={BOLD}{consumer.reply_on_user_utt}{UNBOLD}, " 
                     f"backend_TTS={BOLD}{consumer.use_backend_TTS}{UNBOLD}. {RESET}"))

        # Finish cancelling any response invalidated above before deciding who owns the next attempt
        task = consumer._pending_response_task
        if (task is not None) and (not task.done()):
            await asyncio.gather(task, return_exceptions=True)

        # Forced-reply coordinator handles retries while it is active (including when in pause-and-listen mode)
        coordinator = getattr(consumer, "_reply_now_task", None)
        if (coordinator is not None) and (not coordinator.done()): return

        # When in "Pause & Listen" mode, we still stage and echo user text, but we don't auto-respond
        if not consumer.reply_on_user_utt: return

        # Create a new cancellable automatic response task
        consumer._pending_response_task = asyncio.create_task(ChatHandler._execute_response(consumer), name="chat::pending_response")

    # --------------------------------------------------------------------------------
    # STT progress (invalidate outdated response snapshots when we get new speech)
    # --------------------------------------------------------------------------------
    @staticmethod
    def note_stt_progress(consumer: ChatConsumer) -> None:
        consumer._stt_progress_revision += 1
        task = getattr(consumer, "_pending_response_task", None)
        if (task is not None) and (not task.done()):
            task.cancel()

    # --------------------------------------------------------------------------------
    # Forced reply coordination
    # --------------------------------------------------------------------------------
    @staticmethod
    def request_reply_now(consumer: ChatConsumer, barrier: AudioBarrier) -> asyncio.Task[str | None]:
        # Register a forced reply without blocking the consumer's receive loop
        consumer._reply_now_generation += 1
        generation = consumer._reply_now_generation

        # Repeated commands replace the older request with a newer queue boundary
        previous = getattr(consumer, "_reply_now_task", None)
        if (previous is not None) and (not previous.done()): previous.cancel()

        pending = getattr(consumer, "_pending_response_task", None)
        if (pending is not None) and (not pending.done()): pending.cancel()

        task = fire_and_log(
            ChatHandler._coordinate_reply_now(consumer, barrier, generation),
            name=f"chat::reply_now::{generation}",
        )
        consumer._reply_now_task = task
        return task

    # --------------------------------------------------------------------------------
    # Retain forced-reply intent until a stable staged snapshot completes
    # --------------------------------------------------------------------------------
    @staticmethod
    async def _coordinate_reply_now(consumer: ChatConsumer, barrier: AudioBarrier, generation: int) -> str | None:
        # Wait for queued audio and STT to settle; retry if new speech arrives first
        try: await barrier.wait(timeout=REPLY_BARRIER_TIMEOUT_SEC)
        except asyncio.TimeoutError: logger.warning("%s reply_now audio barrier timed out; using finalized text available.", ORANGE)
        except RuntimeError as exc:  logger.warning("%s reply_now audio barrier unavailable: %s", ORANGE, exc)

        # Request versioning is used to supersede any rapid duplicate commands we get
        if generation != consumer._reply_now_generation: return None

        # Dea
        empty_deadline = asyncio.get_running_loop().time() + REPLY_EMPTY_WAIT_SEC
        while generation == consumer._reply_now_generation:
            # Debounce from the latest meaningful interim/final progress. Repeated or
            # same-audio interim revisions do not advance this revision counter.
            revision = consumer._stt_progress_revision
            await asyncio.sleep(REPLY_SETTLE_SEC)
            if revision != consumer._stt_progress_revision: continue

            snapshot = consumer._staged_utterances.snapshot()
            if not snapshot:
                if asyncio.get_running_loop().time() < empty_deadline: continue
                logger.info("%s reply_now completed with no finalized user text.%s", ORANGE, RESET)
                return None

            response_task = asyncio.create_task(
                ChatHandler._execute_response(consumer), 
                name="chat::forced_response",
            )
            consumer._pending_response_task = response_task

            # Let a child cancellation mean "retry" without cancelling the coordinator
            result = (await asyncio.gather(response_task, return_exceptions=True))[0]
            if generation != consumer._reply_now_generation: return None

            if isinstance(result, asyncio.CancelledError           ): continue
            if isinstance(result, BaseException                    ): raise result
            if result:                                                return result
            if (asyncio.get_running_loop().time() >= empty_deadline): return None

        return None

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
    async def flush_staged_utterances(consumer : ChatConsumer) -> object | None:
        """
        Combine any accumulated staged utterances into a single user message and commit
        it to DB + context buffer. Called before admin-triggered responses and at disconnect.

        TODO: I feel like there are a lot of places where we need to look at if the words
              are getting saved before they are cleared...
        """
        snapshot = consumer._staged_utterances.snapshot()
        if not snapshot: return None
        
        # Concatenate text from all of the users turns
        combined_text  = " ".join(item.text for item in snapshot)
        combined_words = [word for item in snapshot for word in item.words]
        combined_ts    = now_ts()
        
        # Update the DB and context buffer
        _, msg = await consumer.handle_chat_messages(role="user", text=combined_text, ts=combined_ts)
        consumer._staged_utterances.consume(snapshot)

        if (combined_words) and (msg):
            fire_and_log(
                db_s2a(ChatService.add_words_bulk)(msg.id, combined_words),
                name="flush_staged_utterances::add_words_bulk",
            )
        return msg

    # ================================================================================
    # Cancellable Response Task (body)
    # ================================================================================
    @staticmethod
    async def _execute_response(
        consumer : ChatConsumer,  # Chat session owning this cancellable response attempt
    ) -> str | None:
        """
        Generate and commit a response from one immutable staged-utterance snapshot.

        Cancellation leaves the snapshot staged so automatic or forced-reply retry logic
        can include it with any speech that arrived later.
        """
        try:
            # --------------------------------------------------------------------------------
            # 1) Build LLM Context (using staged text)
            # --------------------------------------------------------------------------------
            # Get a snapshot of the staged text (keep for accumulation if canceled)
            # We do NOT clear it from the consumer until we know the full response was successful
            staged_snapshot = consumer._staged_utterances.snapshot()

            # Combine the staged text
            combined_text  = " ".join(item.text for item in staged_snapshot)
            combined_ts    = now_ts()
            combined_words = [word for item in staged_snapshot for word in item.words]

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
            system_resp = ChatHandler._extract_text(system_resp)  # Extract text if the response is a dict (e.g. from RAG); otherwise use as-is
            system_ts = now_ts()

            # Not cancelled: commit everything to DB + context buffer
            _, user_msg = await consumer.handle_chat_messages(role="user", text=combined_text, ts=combined_ts)  # User message
            
            # Remove only the snapshot used by this response
            # (any final result appended while the LLM was running remains staged)
            consumer._staged_utterances.consume(staged_snapshot)
            consumer.last_response = system_resp

            # Immediately send the response back through the websocket & update the DB + chat context
            await consumer.send(json.dumps({"type": "llm_response", "data": system_resp, "time": system_ts}))
            _, _ = await consumer.handle_chat_messages(role="assistant", text=system_resp, ts=system_ts) # LLM message

            # Save word timestamps for the committed user message
            if (combined_words) and (user_msg):
                fire_and_log(
                    db_s2a(ChatService.add_words_bulk)(user_msg.id, combined_words),
                    name="_execute_response::add_words_bulk",
                )

            # On-utterance Biomarkers: fire-and-forget so long jobs don't block the next turn
            # We wait until after the LLM is done to avoid causing any more delays.
            # Pass user_msg + words directly to avoid racing with the add_words_bulk fire above.
            fire_and_log(
                consumer.on_utterance_biomarkers(user_msg, combined_text, combined_words),
                name="_execute_response::bio_callback",
            )
            fire_and_log(
                consumer.on_audio_biomarkers(user_msg, combined_words),
                name="_execute_response::audio_bio_callback",
            )

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

            return system_resp

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

        # Admin-triggered path has no STT word timestamps -- text/audio biomarkers
        # are skipped here; the on_*_biomarkers callbacks early-return on empty words.

        # Synthesize speech with TTS if specified (pass the consumer to store the audio bytes)
        if consumer.use_backend_TTS: await synthesize_and_stream_tts(system_resp, consumer.send, consumer)

        return system_resp

    # --------------------------------------------------------------------------------
    # Helper: extract plain text from a response that may be a dict
    # --------------------------------------------------------------------------------
    @staticmethod
    def _extract_text(response) -> str:
        """
        Normalizes the output of response_method.
        If it's a dict (e.g. from rag_response_fn), extract the 'text' field.
        If it's a plain string, return as-is.
        """
        if isinstance(response, dict):
            return response.get("text", "")
        return response
