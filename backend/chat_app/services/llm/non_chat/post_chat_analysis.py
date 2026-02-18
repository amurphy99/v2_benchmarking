"""
Use LLM calls to generate post-chat data.
--------------------------------------------------------------------------------
`backend.chat_app.services.llm.non_chat.post_chat_analysis`

"""
import logging, os, time
logger = logging.getLogger(__name__)

# From this project
from ....services import logging_utils as lu
from ....services.logging_utils import RESET, BOLD, UNBOLD, LLM_MAIN

# Import helper methods 
from .utils            import to_transcript
from .instruct_wrapper import InstructWrapper
from .chat_summary     import ChatSummaryTopics, build_summary_topics_messages, log_summary_response
from .chat_sentiment   import ChatSentimentRisk, build_sentiment_messages, log_sentiment_response

# Config
DEFAULT_MODEL = "qwen2.5-3b"
TEMPERATURE   = 0.5

# Default Response (empty transcript or local mode)
DEF_ANALYSIS = {"summary": "Empty chat", "topics": [], "sentiment_label": "neutral", "emotion_label": "neutral"}


# ================================================================================
# Make all LLM queries for the post-chat analysis
# ================================================================================
async def post_chat_analysis(chat_messages, model=DEFAULT_MODEL):
    # Check if we are in local or deployed mode
    if os.getenv("APP_ENVIRONMENT", "local"): 
        logger.info(f"{LLM_MAIN}[LLM] {lu.RED}{BOLD}WARNING{UNBOLD}{LLM_MAIN} Post-chat analysis attempted in local mode. {RESET}")
        return DEF_ANALYSIS

    # Prepare the transcript & handle empty chats
    transcript = to_transcript(chat_messages)
    
    if not transcript.strip():
        logger.info(f"{LLM_MAIN}[LLM] {lu.RED}{BOLD}WARNING{UNBOLD}{LLM_MAIN} Post-chat analysis attempted with empty chat. {RESET}")
        return DEF_ANALYSIS

    # Build formatted messages for each (system prompts are already included)
    msgs_summary   = build_summary_topics_messages(transcript)
    msgs_sentiment = build_sentiment_messages     (transcript)

    # --------------------------------------------------------------------------------
    # Make LLM calls
    # --------------------------------------------------------------------------------
    # Initialize the client to use
    client = InstructWrapper.init_async_client()
    call   = InstructWrapper.call_with_retries_async # Shorter name for readability

    # Call 1: Summary & Topics
    t0 = time.time()
    summary_response = await call(client, model=model, response_model=ChatSummaryTopics, messages=msgs_summary, temperature=TEMPERATURE)
    t1 = time.time()
    log_summary_response(summary_response, t0, t1)

    # Call 2:  Sentiment & Emotions
    t0 = time.time()
    sentiment_response = await call(client, model=model, response_model=ChatSentimentRisk, messages=msgs_sentiment, temperature=TEMPERATURE)
    t1 = time.time()
    log_sentiment_response(sentiment_response, t0, t1)

    # Return a combined analysis object
    return {
        "summary"   :   summary_response.summary, 
        "topics"    :   summary_response.topics,
        "sentiment" : sentiment_response.sentiment_label,
        "emotion"   : sentiment_response.  emotion_label,
    }
