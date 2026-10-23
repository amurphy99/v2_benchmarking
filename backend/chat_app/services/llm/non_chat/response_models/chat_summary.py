"""
Generate a chat summary & get the topics
--------------------------------------------------------------------------------
`backend.chat_app.services.llm.non_chat.response_models.chat_summary`

Use structured generation to retrieve a list of topics & summary from a chat. 

"""
import logging
logger = logging.getLogger(__name__)

from pydantic import BaseModel, Field

from .....services import logging_utils as lu
from .....services.logging_utils import RESET, BOLD, UNBOLD, LLM_MAIN

# --------------------------------------------------------------------------------
# Define the Pydantic response Model
# --------------------------------------------------------------------------------
class ChatSummaryTopics(BaseModel):
    # "Thought" field
    thought: str = Field(..., description = (
        "Brief internal note (1-3 sentences) about what felt most meaningful "
        "or personally important in the user's side of the chat, and what tone "
        "the summary should keep. Ground this strictly in the transcript."
    ),)

    # Get a ~1 paragraph summary
    summary: str = Field(..., description = (
        "One short plain-language paragraph summary of the completed chat (4-6 sentences). " 
        "Use plain text. No bullet points. Use only information in the transcript; do not invent details. "
        "DO NOT use first-person assistant language. DO NOT imply the system is still listening, helping, or responding."
    ),)

    # Get a short list of comma separated main topics for this chat
    topics: list[str] = Field(...,
        min_length  = 2,
        max_length  = 4,
        description = (
            "2-4 short topic labels, 1-3 words each (no sentences). "
            "Use concrete, human-meaningful topics rather than vague abstractions."
        ),
    )

# Default response
DEFAULT_TOPICS = ChatSummaryTopics(thought="FAILED", summary="Chat summary failed", topics=["N/A", "N/A"])

# --------------------------------------------------------------------------------
# Build System Prompt
# --------------------------------------------------------------------------------
SUMMARY_TOPICS_SYSTEM = (
    "You generate post-chat metadata for a conversational system.\n"
    "Return ONLY a single JSON object matching the provided schema exactly (no markdown, no extra keys).\n"
    "Use only information in the transcript; do not invent details.\n\n"

    "GOAL:\n"
    "- Create a brief, human-readable summary of the completed chat. \n"
    "- Capture what the user talked about in grounded, useful way.\n\n"

    "STYLE RULES:\n"
    "- The summary should feel respectful, clear, and human.\n"
    "- Write it as a completed recap, not as an ongoing conversation.\n"
    "- DO NOT use first-person assistant language.\n"
    "- DO NOT imply the system is still listening, helping, or responding.\n"
)

# Structure the prompt accordingly
def build_summary_topics_messages(transcript):
    return [
        {"role": "system", "content": SUMMARY_TOPICS_SYSTEM},
        {"role": "user",   "content":
            "Analyze the chat transcript and return the summary/topics JSON.\n\n"
            f"CHAT TRANSCRIPT:\n{transcript}"
        },
    ]

# --------------------------------------------------------------------------------
# Logging
# --------------------------------------------------------------------------------
def log_summary_response(response: ChatSummaryTopics, t0, t1):
    log_string = (
        f"{LLM_MAIN}[LLM] Post-chat {BOLD}summary & topics{UNBOLD} extracted in ({BOLD}{(t1-t0):.2f}s{UNBOLD}): {RESET}\n"
        f"    {LLM_MAIN}{BOLD}Thought: {UNBOLD}{response.thought}{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Summary: {UNBOLD}{response.summary}{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Topics:  {UNBOLD}{response.topics }{RESET}"
    )
    logger.info(f"{log_string}")
    