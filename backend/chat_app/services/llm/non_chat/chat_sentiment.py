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
ChatEmotion   = Literal["neutral", "happy", "sad", "scared", "surprised", "angry"]

# --------------------------------------------------------------------------------
# Define the Pydantic response Model
# --------------------------------------------------------------------------------
class ChatSentimentRisk(BaseModel):
    # "Thought" field for reasoning
    thought: str = Field(..., description="Analyze the messages of this chat and focus on things the user said that may reflect their overall mood.")

    # Get sentiment & emotion labels
    sentiment_label: ChatSentiment = Field(..., description="Overall label for whatever sentiment was most prominent during this chat.")
    emotion_label  : ChatEmotion   = Field(..., description="Overall label for whatever emotion was most prominent from the user during this chat.")

# Default response
DEFAULT_SENTIMENT = ChatSentimentRisk(thought="FAILED", sentiment_label="neutral", emotion_label="neutral")

# --------------------------------------------------------------------------------
# Build System Prompt
# --------------------------------------------------------------------------------
SENTIMENT_SYSTEM = (
    "You rate overall chat sentiment and emotion. "
    "Return JSON that matches the provided schema exactly."
)

# Structure the prompt accordingly
def build_sentiment_messages(transcript):
    return [
        {"role": "system", "content": SENTIMENT_SYSTEM},
        {"role": "user",   "content":
         
            "Rate the overall sentiment and emotion of the chat.\n\n"

            "Rules:\n"
            "- Base everything strictly on the transcript.\n\n"

            f"CHAT TRANSCRIPT:\n{transcript}"
        },
    ]

# --------------------------------------------------------------------------------
# Logging
# --------------------------------------------------------------------------------
def log_sentiment_response(response: ChatSentimentRisk, t0, t1):
    log_string = (
        f"{LLM_MAIN}[LLM] Post-chat {BOLD}sentiment & emotion{UNBOLD} extracted in ({BOLD}{(t1-t0):.2f}{UNBOLD}s): {RESET}\n"
        f"    {LLM_MAIN}{BOLD}Thought:   {UNBOLD}{response.thought        }{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Sentiment: {UNBOLD}{response.sentiment_label}{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Emotion:   {UNBOLD}{response.  emotion_label}{RESET}"
    )
    logger.info(f"{log_string}")
