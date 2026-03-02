"""
LLM interaction utilities for chats. 
--------------------------------------------------------------------------------
`backend.chat_app.services.llm.chat_utilities`

"""

import logging, asyncio, time, re
logger = logging.getLogger(__name__)

# From this project
from ...config         import PROMPT, MAX_LENGTH
from ...config         import llm as query_llm
from  ..logging_utils  import RESET, BOLD, UNBOLD, LLM_MAIN, ROBO_MSG

from  ..chat_info.emotionHelpers import classify_emotion_with_vader

# Response to return upon LLM request errors
ERROR_UTTERANCE = "I'm sorry, I encountered an error while processing your request."


# --------------------------------------------------------------------------------
# Wrapper method for sending *standard* requests to the LLM
# --------------------------------------------------------------------------------
async def get_LLM_response(context_buffer):
    t1 = time.time(); logger.info(f"{LLM_MAIN}[LLM] Sending LLM request... {RESET}")
    system_resp = await generate_LLM_response(context_buffer)
    t2 = time.time(); logger.info(f"{LLM_MAIN}[LLM] Response received (in {(t2-t1):.4f}): {ROBO_MSG}\"{system_resp}\"{RESET}")
    return system_resp

# ================================================================================
# Generate LLM Response
# ================================================================================
async def generate_LLM_response(context_buffer):
    """
    Original stop characters included punctuation (but not all? '!')...
        stop=["<|end|>", ".", "?"]

    Wrap the response logic in a try-except block. If the model throws an error, return a default response.
    """
    # 1) Prepare a prompt for the LLM
    full_prompt = prepare_LLM_input(context_buffer)

    # 2a) Get a response from the LLM (hosted on a webserver)
    try:
        output = await query_llm(full_prompt, max_tokens=MAX_LENGTH, stop=["<|end|>", "\n"], echo=True) 
        system_resp = (output["choices"][0]["text"].split("<|assistant|>")[-1]).strip()

    # 2b) On error, report in the logs & return a default response
    except Exception as e: 
        logger.error(f"Error in get_LLM_response: {e}")
        system_resp = ERROR_UTTERANCE

    return system_resp

# --------------------------------------------------------------------------------
# Helpers for preparing the input message
# --------------------------------------------------------------------------------
# Formats a turn from the chat history for LLM input
def format_turn(turn): return f"\n<|{turn[0]}|>\n{turn[1]}<|end|>"

# Use a set number of turns from the chat history to give context to the LLM
def prepare_LLM_input(context_buffer):
    """
    1) Start the LLM input string with the specified prompt defined during configuration
    2) Format the each turn in the history (context_buffer) for LLM input & add them to the LLM input string
    3) Finally, complete the LLM input; add a tag for the LLM to respond & return the completed prompt
    """
    LLM_input  = f"<|system|>\n{PROMPT}<|end|>"
    LLM_input += "".join([format_turn(turn) for turn in context_buffer])
    LLM_input += f"\n<|assistant|>\n"
    return LLM_input


# --------------------------------------------------------------------------------
# Helper for cleaning text with re
# --------------------------------------------------------------------------------
def normalize_text(text):
    text = (text or "").strip()
    text = re.sub(r"\s*\n+\s*", " ", text)  # Replace internal newlines 
    text = re.sub(r"[ \t]{2,}", " ", text)  # Collapse repeated whitespace
    return text






# TODO: NOT INTEGRATED 
# --------------------------------------------------------------------------------
# Classify the LLM text using vader or zero-shot (not integrated right now)
# --------------------------------------------------------------------------------
async def classify_llm_text_emotion_async(text: str, emo_classifier_type: str="vader") -> str:
    """
    Asynchronously classify emotion using either Zero-Shot or VADER method.

    Args:
        text (str): The text to classify.
        type (str): The type of classifier to use ("zero_shot" or "vader").

    Returns:
        str: The classified emotion label.
    """
    loop = asyncio.get_running_loop()
    try:
        if emo_classifier_type == "vader":
            return await loop.run_in_executor(None, lambda: classify_emotion_with_vader(text))
        else:
            logger.warning(f"Unknown classifier_type: {emo_classifier_type}. Returning 'Neutral'.")
            return "Neutral"

    except Exception as e:
        logger.exception(f"Emotion classification failed (returning 'Neutral'): {e}")
        return "Neutral"
    