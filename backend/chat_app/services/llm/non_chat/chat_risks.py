"""
Use structured generation to assess caregiver-relevant risk signals from a chat transcript.
----------------------------------------------------------------------------------------
`backend.chat_app.services.llm.non_chat.chat_risk_assessment`

Goal:
- Assign a single discrete risk level (0-4) based on USER content in context
- Provide a small set of short verbatim user quotes as evidence
- Provide a concise rationale that explains why the quotes support the chosen level

Important:
- This is decision support for human review (not a final clinical judgment).
"""
import logging
logger = logging.getLogger(__name__)

from typing import Literal
from pydantic import BaseModel, Field

from ....services.logging_utils import RESET, BOLD, UNBOLD, LLM_MAIN

# Define types
RiskLevel = Literal[0, 1, 2, 3, 4]


# ================================================================================
# Single Pydantic response model
# ================================================================================
class ChatRiskAssessment(BaseModel):
    risk_level: RiskLevel = Field(
        ...,
        description=(
            "Overall caregiver-alert risk level inferred from the USER's statements, considering context "
            "(not flagged words alone), frequency/intensity/repetition, and verb tense/intent.\n"
            "0 = No concerning user risk signals in context.\n"
            "1 = Low risk (monitor): mild negative mood, stress/overwhelm, early anxiety (e.g., 'down', 'stressed', 'on edge').\n"
            "2 = Moderate distress (caregiver awareness if repeated/escalating): clear suffering, loneliness/isolation, depression-like language, "
            "or panic symptoms (e.g., 'hopeless', 'worthless', 'lonely', 'panic', 'can't breathe').\n"
            "3 = High risk (caregiver alert): self-harm ideation without explicit plan or means; passive or explicit ideation (e.g., "
            "'I don't want to live', 'better off without me', 'suicidal') but no plan.\n"
            "4 = Emergency (immediate escalation protocol): active intent/plan for self-harm OR credible intent to harm others "
            "(e.g., 'I'm going to kill myself', 'I have a plan', 'I bought pills', 'I want to kill someone').\n\n"
            "Context rules:\n"
            "- Do not inflate risk for quoted/media/hypothetical content (e.g., talking about a movie).\n"
            "- Future intent/planning increases risk more than past/present description.\n"
            "- If uncertain between adjacent levels, choose the lower level unless future intent/plan is present."
        ),
    )

    quotes: list[str] = Field(
        default_factory=list,
        min_length=0,
        max_length=5,
        description=(
            "0-5 short, verbatim quotes from the USER that most strongly support the chosen risk level. "
            "Each quote must include enough context to disambiguate meaning (not single keywords). "
            "Keep each quote to ~5-25 words. Do not include assistant text.\n\n"
            "If risk_level = 0, return an empty list.\n"
            "If risk_level >= 2, include at least 1 quote whenever possible."
        ),
    )

    reason: str = Field(
        ...,
        description=(
            "Plain-text explanation (2-5 sentences) of why the provided USER quotes support the selected risk_level. "
            "Must reference context (e.g., not quoted/media), and consider frequency/intensity/repetition and verb tense/intent "
            "(future intent or planning => higher risk). "
            "Do not invent details not present in the transcript."
        ),
    )


# Default response used on failure paths
DEFAULT_RISK = ChatRiskAssessment(
    risk_level=0,
    quotes=[],
    reason="Risk assessment failed.",
)


# ================================================================================
# System prompt
# ================================================================================
RISK_ASSESSMENT_SYSTEM = (
    "You generate post-chat safety metadata for a conversational system.\n"
    "You MUST output a single JSON object that matches the provided schema exactly.\n"
    "Do not output markdown. Do not wrap JSON in code fences. Do not add extra keys.\n"
    "Only use information present in the transcript; do not invent details.\n\n"
    "Critical guidelines:\n"
    "- Flagged words are never sufficient alone; always consider full context.\n"
    "- Distinguish user statements from quoted/media/hypothetical content "
    "(e.g., 'I saw a movie where someone hurt themselves' is not self-harm intent).\n"
    "- Combine frequency + intensity + repetition across the transcript when choosing a level.\n"
    "- Consider verb tense/intent: future intent or planning implies higher risk than past/present feelings.\n"
    "- This output supports human review to facilitate risk assessment.\n\n"
    "Risk levels:\n"
    "0 None: no concerning user risk signals in context.\n"
    "1 Low (monitor): mild negative mood, stress, overwhelm, early anxiety.\n"
    "2 Moderate (caregiver awareness if repeated/escalating): depression-like language, loneliness/isolation, panic symptoms.\n"
    "3 High (caregiver alert): self-harm ideation without explicit plan.\n"
    "4 Emergency (immediate escalation): active intent/plan for self-harm OR credible intent to harm others.\n\n"
    "Output requirements:\n"
    "- Provide 0-5 SHORT verbatim USER quotes as evidence; do not quote the assistant.\n"
    "- Quotes must include context and be ~5-25 words each.\n"
    "- If risk_level = 0 => quotes must be [].\n"
    "- Provide a concise reason explaining why the quotes support the chosen level."
)


# ================================================================================
# Prompt builder
# ================================================================================
def build_risk_assessment_messages(transcript: str):
    return [
        {"role": "system", "content": RISK_ASSESSMENT_SYSTEM},
        {
            "role": "user",
            "content": (
                "Assess the chat transcript for caregiver-relevant risk signals from the USER.\n"
                "Return JSON with fields: risk_level, quotes, reason.\n\n"
                "Remember:\n"
                "- Do not rely on keywords alone; use context.\n"
                "- Quoted/media/hypothetical content should not inflate risk.\n"
                "- Frequency/intensity/repetition matter.\n"
                "- Future intent/plan => higher risk.\n\n"
                f"CHAT TRANSCRIPT:\n{transcript}"
            ),
        },
    ]


# ================================================================================
# Logging
# ================================================================================
def log_risk_response(response: ChatRiskAssessment, t0: float, t1: float):
    log_string = (
        f"{LLM_MAIN}[LLM] Post-chat {BOLD}risk assessment{UNBOLD} extracted in "
        f"({BOLD}{(t1 - t0):.2f}s{UNBOLD}): {RESET}\n"
        f"    {LLM_MAIN}{BOLD}Risk:{UNBOLD}   {response.risk_level}{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Reason:{UNBOLD} {response.reason}{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Quotes:{UNBOLD} {response.quotes}{RESET}"
    )
    logger.info(log_string)