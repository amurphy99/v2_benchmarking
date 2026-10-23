"""
Route active-listening assessments into safe chat response outcomes.
--------------------------------------------------------------------------------
`backend.chat_app.services.llm.live_chat.active_listening.response_engine`

The 'engine' isn't attached to any specific WebSocket or chat state. A single 
instance is reused across standard chat connections so its API client is not
recreated for every WebSocket.

NOTE: For more information about the design and how it works, check the README
      markdown file in this directory.

TODO: I don't know if I want the "trigger" thing in here for one of the reasons
      we might do a delayed response... I think we should only use the model's
      assessment of the user's turn-completeness for that... (referring to part
      "2b" of `_generate`)

"""
from __future__ import annotations

import asyncio, logging
logger = logging.getLogger(__name__)

from collections.abc import Awaitable, Callable

# From this project
from .....config               import ACTIVE_LISTENING_GRACE_SEC
from   ...chat_utilities       import get_LLM_response, prepare_LLM_messages
from    ..cognibot_api         import DEFAULT_RESPONSE, CognibotResponse, ResponseMood
from     .active_listening_api import ActiveListeningAPI, ActiveListeningAPIError
from     .response_models      import DialogueState, EndConfirmation, ResponseOutcome, ResponseStrategy, ResponseTrigger, TurnAssessment


# --------------------------------------------------------------------------------
# Hardcoded configuration
# --------------------------------------------------------------------------------
# Response types
ChatContext    = list[tuple[str, str, float]]                                # Timestamped role/content turns passed through the live-chat coordinator
MoodPublisher  = Callable[[ResponseMood], Awaitable[None]]                   # Cancellable callback for publishing an early robot expression
LegacyResponse = Callable[[ChatContext], Awaitable[CognibotResponse | str]]  # Existing generator used when turn assessment is unavailable

# Scripted responses and fallbacks
MSG_END_CONFIRM         = "Okay, are you sure that's all for our chat?"                   # Acknowledge the first end-chat request before changing connection state
MSG_END_UNCLEAR         = "I'm not quite sure. Would you like to end our chat?"           # Keep an ambiguous end confirmation safely unresolved
MSG_PAUSE               = "Sure! Press the play button whenever you're ready to resume!"  # Acknowledge a spoken pause request before stopping the STT stream
MSG_DEFAULT_BACKCHANNEL = "Mm-hmm."                                                       # Minimal response after an incomplete turn remains silent
MSG_DEFAULT_CLARIFY     = "I'm not sure I heard that correctly. Could you say it again?"  # Safe fallback when a clarification response cannot be generated
MSG_DEFAULT_RESUME      = "Okay, let's keep talking. What would you like to talk about?"  # Safe fallback after an end request is withdrawn
MSG_DEFAULT_GOODBYE     = "Alright, it was great talking with you. Take care!"            # Safe fallback after an end request is confirmed

# Process-wide engine reused by every standard active-listening chat
_active_listening_engine: ActiveListeningEngine | None = None


# ================================================================================
# Coordinate assessment, optional waiting, confirmation, and final generation
# ================================================================================
class ActiveListeningEngine:
    """
    The `engine` object itself remains stateless across conversations. Callers
    must own their own dialogue states. Dependencies (e.g., `context`, 
    `dialogue_state`, etc.) must be provided on every call explicitly because
    the API client (the WebSocket) and fallback (original single-model mode) are
    "long-lived" runtime services.
    """
    # Store the runtime services used across response attempts
    def __init__(
        self,
        api             : ActiveListeningAPI,                  # Structured client shared by each generation stage
        legacy_response : LegacyResponse,                      # Existing response path used if assessment fails
        grace_sec       : float = ACTIVE_LISTENING_GRACE_SEC,  # Extra silence allowed for an incomplete thought
    ) -> None:
        self.api             = api
        self.legacy_response = legacy_response
        self.grace_sec       = grace_sec

    # ================================================================================
    # Generate Response Outcome
    # ================================================================================
    async def generate(
        self,
        context        : ChatContext,       # Conversation history including the latest staged user turn
        trigger        : ResponseTrigger,   # Why was `generate` called? Automatically via ASR, or from a `reply_now` request?
        dialogue_state : DialogueState,     # Consumer state at the start of this attempt (chat ending/pausing behaviors)
        publish_mood   : MoodPublisher,     # Cancellable callback for an early robot expression
    ) -> ResponseOutcome:
        """
        This is the main "entry point" for callers seeking a response. We will
        return one full response while leaving all persistence requirements up
        to the caller to handle (context history, dialogue state, etc.).
        """
        history = prepare_LLM_messages(context)

        # Route pending end-chat confirmation through its narrow auxiliary model
        if dialogue_state == "awaiting_end_confirmation":
            return await self._resolve_end_confirmation(history, publish_mood)

        # --------------------------------------------------------------------------------
        # 1) Evaluate the chat context using our stage 1 model: "TurnAssessment"
        # --------------------------------------------------------------------------------
        # (falls back to the old, single-stage response model if generation fails)
        try: assessment = await self.api.assess_turn(history)
        except ActiveListeningAPIError:
            logger.exception("Active-listening assessment failed; using the single-stage response fallback.")
            return await self._legacy_fallback(context, publish_mood)

        # 1b) The first stage model returns an expression/mood that we can send to the
        #     robot without needing to wait for the second stage to complete
        await publish_mood(assessment.robot_mood)

        # 1c) If the user's intent was to end or pause the chat => skip the stage 2 model
        #     (control responses are deterministic/hardcoded, no need to generate text)
        if assessment.user_intent == "end_chat":
            return ResponseOutcome(message=MSG_END_CONFIRM, robot_mood=assessment.robot_mood, next_dialogue_state="awaiting_end_confirmation")
        if assessment.user_intent == "pause_chat":
            return ResponseOutcome(message=MSG_PAUSE,       robot_mood=assessment.robot_mood, pause_listening=True)

        # --------------------------------------------------------------------------------
        # 2) Generate a response to the user using our stage 2 model: "SpokenResponse"
        # --------------------------------------------------------------------------------
        # Builds a prompt using the assessment we generated with the stage 1 model
        directive = _build_response_directive(assessment, trigger)
        message   = await self._generate_message(history, assessment, directive)

        # 2b) Because the entire response generation process here (any point while this
        #     function runs) is cancellable, we can add a delay to give the user more time
        #     to cotinue their utterance if we think they may not be done speaking yet.
        # NOTE: Originally this started with: `(trigger == "automatic") and `, so it would
        #       also add a delay for regular responses, but I don't think that makes sense...
        if ((assessment.turn_state == "incomplete") or (assessment.response_strategy == "wait")):
            await asyncio.sleep(self.grace_sec)

        # 2c) Only once the waiting period (and the window to cancel this response) has
        #     passed do we return the response message.
        return ResponseOutcome(message=message, robot_mood=assessment.robot_mood)


    # --------------------------------------------------------------------------------
    # Get the user's confirmation or denial for if we should end the chat
    # --------------------------------------------------------------------------------
    async def _resolve_end_confirmation(self, history: list[dict[str, str]], publish_mood: MoodPublisher) -> ResponseOutcome:
        """
        We reach the state "awaiting_end_confirmation" when the user's previous
        message included intent from them to end the current chat session. To prevent
        false positives, we ask them to confirm one time. This handles processing of
        the user's message: it checks if the confirm they want to end the chat, deny
        and want to resume the chat, or if it was unclear.
        """
        # Assess the user's response to our question (i.e., "Are you sure you wish to end the chat?")
        try: confirmation = await self.api.classify_end_confirmation(history)
        except ActiveListeningAPIError:
            logger.exception("Active-listening end confirmation failed; leaving the request unresolved.")
            await publish_mood("Thinking")
            return ResponseOutcome(message=MSG_END_UNCLEAR, robot_mood="Thinking", next_dialogue_state="awaiting_end_confirmation")

        # It was unclear if the user's response confirmed or denied their desire to end the chat
        if confirmation.decision == "unclear":
            await publish_mood("Thinking")
            return ResponseOutcome(message=MSG_END_UNCLEAR, robot_mood="Thinking", next_dialogue_state="awaiting_end_confirmation")

        # User confirms that they do wish to end the chat, so we reply with one final closing message
        if confirmation.decision == "confirm":
            mood      : ResponseMood = "Love"
            directive = "Give one warm, very short closing message. Do not ask a question or introduce a new topic."
            fallback  = MSG_DEFAULT_GOODBYE
            close     = True

        # User declined to end the chat and wishes to continue
        else:
            mood      = "Happy"
            directive = "Briefly acknowledge that the chat will continue, then naturally return to the recent conversation topic with at most one question."
            fallback  = MSG_DEFAULT_RESUME
            close     = False

        await publish_mood(mood)
        message = await self._generate_message(history, confirmation, directive, fallback=fallback)
        return ResponseOutcome(message=message, robot_mood=mood, close_after=close)

    # --------------------------------------------------------------------------------
    # Fallback response generation using the previous single-stage model
    # --------------------------------------------------------------------------------
    async def _legacy_fallback(self, context: ChatContext, publish_mood: MoodPublisher) -> ResponseOutcome:
        # Generate a response using the original response model from `cognibot_api.py`
        try: response = await self.legacy_response(context)
        except Exception:
            logger.exception("Single-stage fallback also failed during active-listening generation.")
            response = DEFAULT_RESPONSE

        # Cognibot API responses include a mood that we can send to the frontend
        if isinstance(response, CognibotResponse):
            await publish_mood(response.response_mood)
            return ResponseOutcome(message=response.message, robot_mood=response.response_mood)

        # In case we got a response with a different schema
        await publish_mood("Neutral")
        return ResponseOutcome(message=str(response), robot_mood="Neutral")
    
    # --------------------------------------------------------------------------------
    # Generates spoken responses using our stage 2 model: "SpokenResponse"
    # --------------------------------------------------------------------------------
    async def _generate_message(
        self,
        history    : list[dict[str, str]],              # Conversation messages sent to the response model
        assessment : TurnAssessment | EndConfirmation,  # Internal structured context from the preceding stage
        directive  : str,                               # Route-specific response instruction
        fallback   : str | None = None,                 # Safe scripted result if structured generation fails
    ) -> str:
        # Attempt to get a response; only the message text is actually returned -- NOT the entire structured output
        try:
            response = await self.api.generate_response(history, assessment, directive)
            return response.message

        # If there was an error with the response generation model we return a fallback message instead
        except ActiveListeningAPIError:
            logger.exception("Active-listening spoken-response generation failed; using a safe scripted fallback.")
            return fallback or _default_message(assessment)


# --------------------------------------------------------------------------------
# Build a supplemental prompt using an assessment from the stage 1 model
# --------------------------------------------------------------------------------
def _build_response_directive(assessment: TurnAssessment, trigger: ResponseTrigger) -> str:
    """
    Our stage 1 model, "TurnAssessment", returns structured output regarding
    different aspects of the user's previous spoken turn. We use this assessment
    to provide more direction to the model responsible for generating the spoken
    response.
    """
    strategy = assessment.response_strategy

    # If it seems like the user only paused because they can't think of a word
    if strategy == "suggest_word":
        return f"Tentatively offer only the possible missing word {assessment.suggested_word!r}, phrased gently and without claiming certainty."

    # If what the user said last turn seemed "off", perhaps due to an ASR error, try to clarify
    if (strategy == "clarify") or (assessment.transcript_clarity == "likely_error") or (assessment.turn_state == "unclear"):
        return "Briefly say what you think you heard, when possible, and ask one gentle clarification question without blaming the user or the speech recognizer."

    # If it seems like the user's turn is not yet complete or they didn't finish an entire response, we don't need to reply fully
    if (strategy in ("wait", "backchannel")) or (assessment.turn_state == "incomplete"):
        if trigger == "reply_now": return "The user explicitly requested a response. Give one very brief supportive backchannel or invitation to continue."
        else:                      return "The extra listening period ended without more speech. Give one very brief supportive backchannel or invitation to continue."

    # Default case
    return f"Respond normally while following this guidance: {assessment.response_guidance}"


# --------------------------------------------------------------------------------
# Select which default response to use
# --------------------------------------------------------------------------------
def _default_message(assessment: TurnAssessment | EndConfirmation) -> str:
    if isinstance(assessment, EndConfirmation): return MSG_DEFAULT_RESUME

    # We have hardcoded default messages for each of the response strategies
    strategy: ResponseStrategy = assessment.response_strategy
    if strategy in ("wait", "backchannel"): return MSG_DEFAULT_BACKCHANNEL
    if strategy == "clarify":               return MSG_DEFAULT_CLARIFY
    if strategy == "suggest_word":          return f"{assessment.suggested_word}?"
    return DEFAULT_RESPONSE.message


# ================================================================================
# Lazy instantiation of the Active-Listening engine
# ================================================================================
def get_active_listening_engine() -> ActiveListeningEngine:
    global _active_listening_engine
    if _active_listening_engine is None:
        _active_listening_engine = ActiveListeningEngine(api=ActiveListeningAPI(), legacy_response=get_LLM_response)
    return _active_listening_engine
