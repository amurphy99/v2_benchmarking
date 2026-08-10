"""
Structured models and internal outcomes for active-listening responses.
--------------------------------------------------------------------------------
`backend.chat_app.services.llm.live_chat.active_listening.response_models`

Here are definitions of the Pydantic models for each generation step.

"""
from __future__  import annotations
from pydantic    import BaseModel, ConfigDict, Field, model_validator
from dataclasses import dataclass
from typing      import Literal, Self

import logging
logger = logging.getLogger(__name__)

# From this project
from   ..cognibot_api  import ResponseMood
from ....logging_utils import RESET, BOLD, UNBOLD, LLM_MAIN


# --------------------------------------------------------------------------------
# Structured response types
# --------------------------------------------------------------------------------
UserIntent        = Literal["none", "pause_chat", "end_chat"]                                                   # User-requested chat control recognized by the planner
UserEmotion       = Literal["neutral", "happy", "sad", "anxious", "confused", "frustrated", "tired", "unwell"]  # Conservative emotional description of the latest turn
TurnState         = Literal["complete", "incomplete", "word_search", "unclear"]                                 # Conversational completeness of the latest turn
TranscriptClarity = Literal["clear", "uncertain", "likely_error"]                                               # Text-only estimate of transcript coherence
ResponseStrategy  = Literal["normal", "wait", "backchannel", "suggest_word", "clarify"]                         # Route used by the spoken-response stage
EndDecision       = Literal["confirm", "cancel", "unclear"]                                                     # Resolution of a pending end-chat request
DialogueState     = Literal["normal", "awaiting_end_confirmation"]                                              # Consumer-owned active-listening state
ResponseTrigger   = Literal["automatic", "reply_now"]                                                           # Event that requested the response attempt


# ================================================================================
# Turn Assessment
# ================================================================================
class TurnAssessment(BaseModel):
    """
    Describe the latest user turn without generating the spoken assistant response.

    The assessment distinguishes observations about the user from the robot behavior
    selected in response. It also constrains word suggestions to an explicit strategy so
    an incidental guess cannot silently influence ordinary response generation.
    """
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    decision_basis     : str                = Field(..., min_length=1, max_length=300, description="One short explanation of the routing decision; do not provide detailed hidden reasoning.")
    user_intent        : UserIntent         = Field(..., description="Whether the user explicitly wants to pause or end the chat; otherwise none.")
    user_emotion       : UserEmotion        = Field(..., description="The apparent emotion in the latest user turn, interpreted conservatively from text and context.")
    robot_mood         : ResponseMood       = Field(..., description="The robot expression that should acknowledge the user's current emotional tone.")
    turn_state         : TurnState          = Field(..., description="Whether the latest thought is complete, still developing, searching for a word, or too unclear to classify.")
    transcript_clarity : TranscriptClarity  = Field(..., description="Whether the transcript is coherent; likely_error is only a cautious possibility, not a claim about the user.")
    response_strategy  : ResponseStrategy   = Field(..., description="The response route that best fits the assessment.")
    suggested_word     : str | None         = Field(None, max_length=80, description="A tentative missing word grounded in conversation context; otherwise null.")
    response_guidance  : str                = Field(..., min_length=1, max_length=500, description="Brief guidance for the response model without drafting the full spoken message.")

    # Keep tentative word guesses isolated to the explicit suggestion route
    @model_validator(mode="after")
    def validate_word_suggestion(self) -> Self:
        """
        Reject a word guess unless the planner deliberately selected its guarded route.
        """
        if (self.response_strategy == "suggest_word") and (not self.suggested_word):
            raise ValueError("suggest_word requires a grounded suggested_word")
        if (self.response_strategy != "suggest_word") and (self.suggested_word is not None):
            raise ValueError("suggested_word must be null outside the suggest_word strategy")
        return self


# --------------------------------------------------------------------------------
# Classify only whether the latest user turn confirms a pending end-chat request
# --------------------------------------------------------------------------------
class EndConfirmation(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    decision_basis : str         = Field(..., min_length=1, max_length=300, description="One short explanation of the confirmation decision.")
    decision       : EndDecision = Field(..., description="Confirm, cancel, or leave the pending request unresolved.")


# --------------------------------------------------------------------------------
# Lighter response for generating the spoken response to the user
# --------------------------------------------------------------------------------
class SpokenResponse(BaseModel):
    """
    Main prompt uses context information provided by the first stage model
    """
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    response_plan : str = Field(..., min_length=1, max_length=300, description="A brief response plan, not detailed hidden reasoning.")
    message       : str = Field(..., min_length=1, max_length=600, description="The concise spoken response to the user.")


# --------------------------------------------------------------------------------
# Return response text and proposed chat effects without mutating consumer state
# --------------------------------------------------------------------------------
@dataclass(frozen=True, slots=True)
class ResponseOutcome:
    """
    The WebSocket response coordinator applies these effects only after the matching
    staged user turn and assistant response have been committed successfully.
    """
    message             : str
    robot_mood          : ResponseMood
    next_dialogue_state : DialogueState = "normal"
    pause_listening     : bool          = False
    close_after         : bool          = False


# ================================================================================
# Formatted response logging utilities (all include the total request duration)
# ================================================================================
# Record the planner's complete structured assessment
def log_turn_assessment(response: TurnAssessment, t0: float, t1: float) -> None:
    log_string = (
        f"{LLM_MAIN}[LLM] Active-listening {BOLD}turn assessment{UNBOLD} generated in ({BOLD}{(t1-t0):.2f}s{UNBOLD}): {RESET}\n"
        f"    {LLM_MAIN}{BOLD}Basis:      {UNBOLD}{response.decision_basis    }{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Intent:     {UNBOLD}{response.user_intent       }{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Emotion:    {UNBOLD}{response.user_emotion      }{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Robot mood: {UNBOLD}{response.robot_mood        }{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Turn state: {UNBOLD}{response.turn_state        }{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Clarity:    {UNBOLD}{response.transcript_clarity}{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Strategy:   {UNBOLD}{response.response_strategy }{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Suggestion: {UNBOLD}{response.suggested_word    }{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Guidance:   {UNBOLD}{response.response_guidance }{RESET}"
    )
    logger.info(log_string)

# Record the complete response-generation result
def log_spoken_response(response: SpokenResponse, t0: float, t1: float) -> None:
    log_string = (
        f"{LLM_MAIN}[LLM] Active-listening {BOLD}spoken response{UNBOLD} generated in ({BOLD}{(t1-t0):.2f}s{UNBOLD}): {RESET}\n"
        f"    {LLM_MAIN}{BOLD}Plan:    {UNBOLD}{response.response_plan}{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Message: {UNBOLD}{response.message      }{RESET}"
    )
    logger.info(log_string)

# Record the complete end-confirmation classification
def log_end_confirmation(response: EndConfirmation, t0: float, t1: float) -> None:
    log_string = (
        f"{LLM_MAIN}[LLM] Active-listening {BOLD}end confirmation{UNBOLD} generated in ({BOLD}{(t1-t0):.2f}s{UNBOLD}): {RESET}\n"
        f"    {LLM_MAIN}{BOLD}Basis:    {UNBOLD}{response.decision_basis}{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Decision: {UNBOLD}{response.decision      }{RESET}"
    )
    logger.info(log_string)
