"""
Use structure generation to retrieve a list of topics & summary from a chat.
--------------------------------------------------------------------------------
`backend.chat_app.services.llm.non_chat.chat_summary`

"""
import logging
logger = logging.getLogger(__name__)

from pydantic import BaseModel, Field

from ....services import logging_utils as lu
from ....services.logging_utils import RESET, BOLD, UNBOLD, LLM_MAIN

# --------------------------------------------------------------------------------
# Define the Pydantic response Model
# --------------------------------------------------------------------------------
class ChatSummaryTopics(BaseModel):
    # "Thought" field
    thought: str = Field(..., description="Analyze the messages of this chat with the creation of a summary in mind.")

    # Get a ~1 paragraph summary
    summary: str = Field(..., description="One short paragraph summary of the chat (2-5 sentences). Use plain text. No bullet points.")

    # Get a short list of comma separated main topics for this chat
    topics: list[str] = Field(..., min_items=2, max_items=8, description="2-8 short topic labels, 1-4 words each (no sentences).")


# --------------------------------------------------------------------------------
# Build System Prompt
# --------------------------------------------------------------------------------
SUMMARY_TOPICS_SYSTEM = (
    "You generate post-chat metadata for a conversational system. "
    "Return JSON that matches the provided schema exactly."
)

# Structure the prompt accordingly
def build_summary_topics_messages(transcript):
    return [
        {"role": "system", "content": SUMMARY_TOPICS_SYSTEM},
        {"role": "user",   "content":

            "Given the chat transcript below, produce:\n"
            "1) a concise paragraph summary (2-5 sentences)\n"
            "2) 2-8 short topic labels (1-4 words each)\n\n"

            "Rules:\n"
            "- Topics must be short labels, not sentences.\n"
            "- Don't invent details not present in the transcript.\n\n"
            
            f"CHAT TRANSCRIPT:\n{transcript}"
        },
    ]

# --------------------------------------------------------------------------------
# Logging
# --------------------------------------------------------------------------------
def log_summary_response(response: ChatSummaryTopics, t0, t1):
    log_string = (
        f"{LLM_MAIN}[LLM] Post-chat {BOLD}summary & topics{UNBOLD} extracted in ({BOLD}{(t1-t0):.2f}{UNBOLD}s): {RESET}\n"
        f"    {LLM_MAIN}{BOLD}Thought: {UNBOLD}{response.thought}{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Summary: {UNBOLD}{response.summary}{RESET}\n"
        f"    {LLM_MAIN}{BOLD}Topics:  {UNBOLD}{response.topics }{RESET}"
    )
    logger.info(f"{log_string}")
    