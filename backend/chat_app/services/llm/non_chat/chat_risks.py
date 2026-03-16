"""
Use structured generation to assess caregiver-relevant risk signals from a chat transcript.
----------------------------------------------------------------------------------------
`backend.chat_app.services.llm.non_chat.chat_risk_assessment`

TODO: Pretty long system prompt, we'll see how it does...

"""
import logging
logger = logging.getLogger(__name__)

from pydantic import BaseModel, Field
from typing   import Literal

from ....services import logging_utils as lu
from ....services.logging_utils import RESET, BOLD, UNBOLD, LLM_MAIN

# Define types
RiskLevel = Literal[0, 1, 2] # [0, 1, 2, 3, 4] 

# --------------------------------------------------------------------------------
# Define the Pydantic response Model
# --------------------------------------------------------------------------------
class ChatRiskAssessment(BaseModel):
    # Overall risk level (0-2 inclusive)
    risk_level: RiskLevel = Field(
        ...,
        description = (
            "Overall user distress risk level (0, 1, or 2) for caregiver awareness, using context (not keywords), and considering intensity + repetition + tense.\n"
            "0 = No meaningful distress signals in context.\n"
            "1 = Low risk (monitor): mild negative mood/stress/early anxiety (e.g., feeling off, drained, on edge).\n"
            "2 = Moderate distress (flag if repeated/escalating): clear suffering, loneliness/isolation, depression-like language, or panic symptoms.\n"
            "Do not escalate for quoted/media/hypothetical content; future-intent phrasing is more concerning than past/present."
        ),
    )

    # Specific quotes from the transcript justifying the risk level
    quotes: list[str] = Field(
        default_factory = list,
        min_length      = 0,
        max_length      = 5,
        description     = (
            "0-5 short verbatim USER quotes that best justify risk_level (around 5-25 words each). "
            "Include enough surrounding context to disambiguate; do not quote the assistant. "
            "If risk_level=0 => []. If risk_level is above that, always include at least 1 quote."
        ),
    )

    # Reasoning behind the risk level assessment
    reason: str = Field(
        ...,
        description=(
            "Plain text, 2-5 sentences explaining why the quotes justify risk_level. "
            "Reference context (not quoted/media), and note intensity/repetition and tense where relevant. "
            "Do not invent details not present in the transcript."
        ),
    )

# Default response (used in failure/error cases)
DEFAULT_RISK = ChatRiskAssessment(risk_level=0, quotes=[], reason="Risk assessment failed.")

# --------------------------------------------------------------------------------
# Build System Prompt
# --------------------------------------------------------------------------------
RISK_ASSESSMENT_SYSTEM = (
    "You generate post-chat risk metadata for caregiver awareness.\n"
    "Return ONLY a single JSON object matching the schema exactly (no markdown, no extra keys).\n"
    "Use only information in the transcript; do not invent details.\n\n"

    "RULES:\n"
    "- Never use flagged words alone; always judge full context.\n"
    "- Do not raise risk for quoted/media/hypothetical content.\n"
    "- Consider intensity + frequency + repetition across the transcript.\n"
    "- Consider tense/intent: future-oriented language is more concerning than past/present.\n"
    "- This output supports human review.\n\n"

    "RISK LEVELS:\n"
    "0 = none (no meaningful distress signals in context)\n"
    "1 = low (monitor): mild negative mood/stress/early anxiety\n"
    "2 = moderate (flag if repeated/escalating): clear suffering, loneliness/isolation, depression-like language, or panic symptoms\n\n"

    "OUTPUT REQUIREMENTS:\n"
    "- quotes: 0-5 short verbatim USER quotes with context (around 5-25 words); never quote the assistant.\n"
    "- reason: 2-5 sentences linking quotes to the chosen level."
)

# Structure the prompt accordingly
def build_risk_assessment_messages(transcript: str):
    return [
        {"role": "system", "content": RISK_ASSESSMENT_SYSTEM},
        {"role": "user",   "content": (
                "Assess the chat transcript for caregiver-relevant risk signals from the USER.\n"
                "Return JSON with fields: risk_level, quotes, reason.\n\n"

                f"CHAT TRANSCRIPT:\n{transcript}"
            ),
        },
    ]

# --------------------------------------------------------------------------------
# Logging
# --------------------------------------------------------------------------------
def log_risk_response(response: ChatRiskAssessment, t0: float, t1: float):
    log_string = (
        f"{LLM_MAIN}[LLM] Post-chat {BOLD}risk assessment{UNBOLD} extracted in ({BOLD}{(t1-t0):.2f}s{UNBOLD}): {RESET}\n"
        f"    {LLM_MAIN}{BOLD}Risk:   {UNBOLD} {response.risk_level}{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Reason: {UNBOLD} {response.reason    }{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Quotes: {UNBOLD} {response.quotes    }{RESET}"
    )
    logger.info(log_string)
