""" 
Utilities for processing chat messages & getting LLM responses. 
--------------------------------------------------------------------------------
`backend.chat_app.websocket.services.chatHelpers`

Process the users message & reply with the LLM ASAP. This file handles various
methods for doing so -- I should probably update the documentation here a little
bit...

NOTE: Message ID is included so frontends can respond letting us know when 
      playback starts and ends (and we can save timestamps for the message).

TODO: What happens if we implement a way for assistant responses to be canceled
      midway through? Currently, they can only be canceled before audio TTS
      playback begins -- but if they were canceled let's say after only 1-5
      words, we would need a way to know which words were said and which weren't
      so that we could adjust what was saved into the DB (and context/message 
      history).

"""
from __future__  import annotations
from channels.db import database_sync_to_async as db_s2a
from time        import time                   as now_ts

import json, logging, asyncio
logger = logging.getLogger(__name__)

# From this project
from   .speech.tts.tts_streaming           import synthesize_and_stream_tts
from   .speech.stt.audio_queue             import AudioBarrier
from   .bg_helpers                         import fire_and_log, trace_await
from  ..services.behavior.intent_detection import handle_user_intent
from  ..biomarkers.callbacks               import process_audio_biomarkers, process_text_biomarkers
from  ..consumers.processing.messages      import commit_chat_exchange, commit_chat_message
from  ..consumers.processing.stream        import set_streaming_active
from ...services                           import logging_utils as lu
from ...services.logging_utils             import RESET, BOLD, UNBOLD, ORANGE
from ...services.db_services               import ChatService

# Import the class for type checking
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from ...models                                                    import ChatMessage
    from ...services.llm.live_chat.active_listening.response_models   import ResponseOutcome, ResponseTrigger
    from ..consumers.consumers                                        import ChatConsumer

REPLY_BARRIER_TIMEOUT_SEC = 2.0  # Maximum wait for pre-command audio to reach the STT request generator
REPLY_SETTLE_SEC          = 0.2  # Quiet period required after meaningful STT progress
REPLY_EMPTY_WAIT_SEC      = 1.0  # Maximum wait for finalized text before completing an empty reply


# ================================================================================
# ChatHandler
# ================================================================================
class ChatHandler:
    """
    Static class with methods for handling chat interactions between the user and system.

    Direct frontend transcriptions and backend STT final results both enter through
    `stage_and_schedule`. It stages the utterance and creates a cancellable response
    task. Meaningful interim STT progress cancels that task so continued speech can be
    accumulated before responding.
    """
    # ================================================================================
    # Stage utterance + schedule a cancellable response task
    # ================================================================================
    @staticmethod
    async def stage_and_schedule(
        consumer  : ChatConsumer,                    # Active chat that owns staging and response state
        text      : str,                             # Finalized utterance text to stage
        timestamp : float,                           # Source timestamp echoed to the primary frontend
        words     : list[dict[str, object]] | None,  # Google word timing data, absent for direct text
    ) -> None:
        """
        Stage one finalized utterance atomically and choose the response-task owner.
        We use a "forced-reply coordinator" to handle retries while the response-task
        is active. Otherwise (or if we are in automatic mode), we start the normal
        cancellable response task.
        """
        async with consumer._stage_lock:
            if getattr(consumer, "_close_scheduled", False): return

            # 1) Stage text and word metadata atomically, before the first await
            consumer._staged_utterances.append(text=text, words=words, timestamp=now_ts())

            # A final result is always meaningful STT progress. It must invalidate any
            # response attempt whose snapshot did not contain this utterance
            ChatHandler.note_stt_progress(consumer)

            # 2) If this is using STT from the backend, also send the utterance back to the frontend
            if consumer.use_backend_STT:
                await consumer.send(json.dumps({"type": "user_utt", "data": text, "time": timestamp}))

            # Log an update
            # TODO: Might want to do this somewhere else with the text content included ?
            logger.info((f"{ORANGE}[ChatHandler] "
                         f"auto_reply={BOLD}{consumer.reply_on_user_utt}{UNBOLD}, "
                         f"backend_TTS={BOLD}{consumer.use_backend_TTS}{UNBOLD}. {RESET}"))

            # Finish cancelling any response invalidated above before deciding who owns the next attempt
            task = consumer._pending_response_task
            if (task is not None) and (not task.done()):
                await asyncio.gather(task, return_exceptions=True)

            # Disconnect flush owns anything staged while the frontend send was pending
            if getattr(consumer, "_close_scheduled", False): return

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

        manual = getattr(consumer, "_manual_response_task", None)
        if (manual is not None) and (not manual.done()): manual.cancel()

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

        # Define how long an empty request may wait for its first finalized text
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
                ChatHandler._execute_response(consumer, trigger="reply_now"),
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
    # Flush staged utterances before disconnect finishes
    # --------------------------------------------------------------------------------
    @staticmethod
    async def flush_staged_utterances(consumer: ChatConsumer) -> object | None:
        """
        Combine any accumulated staged utterances into a single user message and commit
        it to DB + context buffer before disconnect analysis begins.

        TODO: I feel like there are a lot of places where we need to look at if the words
              are getting saved before they are cleared...
        """
        async with consumer._stage_lock:
            async with consumer._response_lock:
                snapshot = consumer._staged_utterances.snapshot()
                if not snapshot: return None

                # Concatenate text from all of the users turns
                combined_text  = " ".join(item.text for item in snapshot)
                combined_words = [word for item in snapshot for word in item.words]
                combined_ts    = now_ts()

                # Update the DB and context buffer
                msg = await commit_chat_message(consumer, role="user", text=combined_text, timestamp=combined_ts)
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
    async def _execute_response(consumer: ChatConsumer, trigger: ResponseTrigger = "automatic") -> str | None:
        """
        Serialize all response attempts so only one task can own a staged snapshot.
        """
        async with consumer._response_lock:
            return await ChatHandler._execute_response_locked(consumer, trigger)

    # Run one response attempt while the caller holds the response lock
    @staticmethod
    async def _execute_response_locked(consumer: ChatConsumer, trigger: ResponseTrigger) -> str | None:
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
            response_outcome = None
            response_engine  = getattr(consumer, "_turn_response_engine", None)

            # Preserve the original intent and response path unless a standard chat opted in
            if response_engine is None:
                scripted_resp, close_after = await handle_user_intent(consumer, combined_text)            # 'close_after' checked at method end
                if scripted_resp is not None: system_resp = scripted_resp                                 # Scripted response
                else:                         system_resp = await consumer.response_method(temp_context)  # LLM call

            # Let the optional engine propose text and effects without mutating the consumer
            else:
                response_revision = consumer._stt_progress_revision
                response_outcome  = await response_engine.generate(
                    context        = temp_context,
                    trigger        = trigger,
                    dialogue_state = consumer._dialogue_state,
                    publish_mood   = lambda mood: ChatHandler._publish_response_mood(consumer, mood, response_revision),
                )
                system_resp = response_outcome.message
                close_after = response_outcome.close_after

            system_resp = ChatHandler._extract_text(system_resp)  # Extract text if the response is a dict (e.g. from RAG); otherwise use as-is
            system_ts = now_ts()

            # Once commit starts, finish it even if later speech cancels this response task
            commit_task = asyncio.create_task(
                ChatHandler._commit_response(
                    consumer,
                    staged_snapshot,
                    combined_text,
                    combined_words,
                    combined_ts,
                    system_resp,
                    system_ts,
                    response_outcome,
                ),
                name="chat::commit_response",
            )
            try: assistant_message = await asyncio.shield(commit_task)
            except asyncio.CancelledError:
                await commit_task
                raise

            # --------------------------------------------------------------------------------
            # 3) Text-to-speech call that guards for cancelations
            # --------------------------------------------------------------------------------
            if consumer.use_backend_TTS:

                # Update the consumer state & start streaming TTS
                consumer._tts_streaming = True
                try: await synthesize_and_stream_tts(system_resp, consumer.send, assistant_message.id)

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

    # --------------------------------------------------------------------------------
    # Send a mood to the frontend (if we have it before the spoken text result)
    # --------------------------------------------------------------------------------
    @staticmethod
    async def _publish_response_mood(consumer: ChatConsumer, mood: str, response_revision: int) -> None:
        """
        Can still get canceled if the user continues on speaking...
        """
        if response_revision != consumer._stt_progress_revision: return
        await consumer.send_response_mood(mood)

    # --------------------------------------------------------------------------------
    # Commit one completed response without leaving a partially persisted exchange
    # --------------------------------------------------------------------------------
    @staticmethod
    async def _commit_response(
        consumer         : ChatConsumer,             # Active chat that owns response and dialogue state
        staged_snapshot  : tuple,                    # Immutable staged prefix used to generate this response
        combined_text    : str,                      # User text represented by the staged snapshot
        combined_words   : list[dict[str, object]],  # Word timing records paired with the user text
        combined_ts      : float,                    # Timestamp assigned to the combined user turn
        system_resp      : str,                      # Final assistant text selected for this response
        system_ts        : float,                    # Timestamp assigned to the assistant response
        response_outcome : ResponseOutcome | None,   # Optional engine-proposed effects committed with the exchange
    ) -> ChatMessage:
        # Save the matching turn atomically, then publish it before consuming its staged prefix
        user_msg, assistant_msg = await commit_chat_exchange(consumer, combined_text, combined_ts, system_resp, system_ts)
        consumer._staged_utterances.consume(staged_snapshot)
        consumer.last_response = system_resp

        # Commit active-listening state only after its matching exchange is durable
        if response_outcome is not None:
            consumer._dialogue_state = response_outcome.next_dialogue_state

        # Send the already-persisted assistant response to the primary frontend
        await consumer.send(json.dumps({"type": "llm_response", "data": system_resp, "time": system_ts, "responseId": assistant_msg.id}))

        # Apply the reversible stream effect after publishing its acknowledgement message
        if (response_outcome is not None) and (response_outcome.pause_listening):
            await set_streaming_active(consumer, active=False)

        # Save word timestamps and derive biomarkers in supervised session tasks
        if (combined_words) and (user_msg):
            fire_and_log(db_s2a(ChatService.add_words_bulk)(user_msg.id, combined_words), name="_execute_response::add_words_bulk")

        # Text & audio biomarkers
        fire_and_log(process_text_biomarkers (consumer, user_msg, combined_text, combined_words), name="_execute_response::bio_callback")
        fire_and_log(process_audio_biomarkers(consumer, user_msg,                combined_words), name="_execute_response::audio_bio_callback")
        return assistant_msg


    # ================================================================================
    # Manually Respond (bypasses response staging; used by ch_events.py)
    # ================================================================================
    @staticmethod
    async def respond_to_user(context_buffer: list, consumer: ChatConsumer, *, use_response: str | dict[str, object] | None = None) -> str:
        """
        Serialize a manually supplied or generated assistant response with the normal
        staged-response pipeline so their writes and TTS streams cannot overlap.
        """
        async with consumer._response_lock:
            # Get the LLM response if a default response was not supplied
            if use_response is None: system_resp = await consumer.response_method(context_buffer)
            else:                    system_resp = use_response
            system_resp = ChatHandler._extract_text(system_resp)

            # Save and send the assistant response before starting its TTS stream
            system_ts              = now_ts()
            consumer.last_response = system_resp
            assistant_message = await commit_chat_message(consumer, role="assistant", text=system_resp, timestamp=system_ts)
            await consumer.send(json.dumps({"type": "llm_response", "data": system_resp, "time": system_ts, "responseId": assistant_message.id}))

            # Let cancellation stop both backend synthesis and already-buffered frontend audio
            if consumer.use_backend_TTS:
                consumer._tts_streaming = True
                try: await synthesize_and_stream_tts(system_resp, consumer.send, assistant_message.id)
                except asyncio.CancelledError:
                    try: await consumer.send(json.dumps({"type": "cancel_audio"}))
                    except Exception: pass
                    raise
                finally: consumer._tts_streaming = False

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
        if isinstance(response, dict): return response.get("text", "")
        else:                          return response
