"""
Use structure generation to retrieve overall sentiment & risk factors.
--------------------------------------------------------------------------------
`backend.chat_app.services.llm.non_chat.chat_sentiment`

"""
import logging
logger = logging.getLogger(__name__)

from pydantic import BaseModel, Field
from typing   import Literal

from ....services import logging_utils as lu
from ....services.logging_utils import RESET, BOLD, UNBOLD, LLM_MAIN

# Define types
ChatSentiment = Literal["very_negative", "negative", "neutral", "positive", "very_positive"]
ChatEmotion   = Literal["neutral", "happy", "sad", "anxious", "surprised", "angry", "frustrated", "confused"]

# --------------------------------------------------------------------------------
# Define the Pydantic response Model
# --------------------------------------------------------------------------------
class ChatSentimentRisk(BaseModel):
    # "Thought" field for reasoning
    thought: str = Field(..., description = (
        "Brief internal note (1-3 sentences) about the user's overall emotional "
        "tone across the chat, including whether it felt steady, mixed, or shifted "
        "over time. Ground this strictly in the user's messages in the transcript."
    ),)

    # Get sentiment & emotion labels
    sentiment_label : ChatSentiment = Field(..., description="Overall label for whatever sentiment was most prominent during this chat.")
    emotion_label   : ChatEmotion   = Field(..., description="Primary emotion that best describes the user's overall emotional tone.")

# Default response
DEFAULT_SENTIMENT = ChatSentimentRisk(thought="FAILED", sentiment_label="neutral", emotion_label="neutral")

# --------------------------------------------------------------------------------
# Build System Prompt
# --------------------------------------------------------------------------------
SENTIMENT_SYSTEM = (
    "You rate overall chat sentiment and emotional tone.\n"
    "Return ONLY a single JSON object matching the provided schema exactly (no markdown, no extra keys).\n"

    "RULES:\n"
    "- Use only information in the transcript; do not invent details.\n"
    "- Focus primarily on the USER, not the assistant.\n"
    "- Do not over-weigh isolated words without context.\n"
    "- Do not treat fictional, quoted, media-related, or hypothetical content as direct evidence of the user's real emotional state unless the user clearly connects it to themself.\n"
    "- Be modest when the transcript is sparse or emotionally unclear.\n\n"
)

# Structure the prompt accordingly
def build_sentiment_messages(transcript):
    return [
        {"role": "system", "content": SENTIMENT_SYSTEM},
        {"role": "user",   "content": (
                "Rate the overall sentiment and emotion of the chat.\n\n"
                f"CHAT TRANSCRIPT:\n{transcript}"
            )
        },
    ]

# --------------------------------------------------------------------------------
# Logging
# --------------------------------------------------------------------------------
def log_sentiment_response(response: ChatSentimentRisk, t0, t1):
    log_string = (
        f"{LLM_MAIN}[LLM] Post-chat {BOLD}sentiment & emotion{UNBOLD} extracted in ({BOLD}{(t1-t0):.2f}s{UNBOLD}): {RESET}\n"
        f"    {LLM_MAIN}{BOLD}Thought:   {UNBOLD}{response.thought        }{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Sentiment: {UNBOLD}{response.sentiment_label}{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Emotion:   {UNBOLD}{response.  emotion_label}{RESET}"
    )
    logger.info(f"{log_string}")
