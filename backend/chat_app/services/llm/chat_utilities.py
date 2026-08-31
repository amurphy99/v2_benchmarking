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

# What API response class we are using
# - v1 would be the current code
# - v2 is the version that just wants messages: list[dict] in the class __call__ method
RESPONSE_VERSION = "v2"

# Reuse the hosted or dummy client selected once in config.py
_live_chat_client = query_llm if RESPONSE_VERSION == "v2" else None


# --------------------------------------------------------------------------------
# Wrapper method for sending *standard* requests to the LLM
# --------------------------------------------------------------------------------
async def get_LLM_response(context_buffer) -> str:
    t1 = time.time(); logger.info(f"{LLM_MAIN}[LLM] Sending LLM request... {RESET}")
    system_resp = await generate_LLM_response(context_buffer)
    #t2 = time.time(); logger.info(f"{LLM_MAIN}[LLM] Response received (in {(t2-t1):.4f}): {ROBO_MSG}\"{system_resp}\"{RESET}")
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
    if RESPONSE_VERSION == "v2":
        # Prepare messages and call the configured hosted or dummy client
        messages = prepare_LLM_messages(context_buffer)
        return await _live_chat_client(messages)

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

# v2: Convert context_buffer to a messages list for CognibotAPI.
# Skips system-role turns since CognibotAPI injects its own system prompt.
def prepare_LLM_messages(context_buffer) -> list[dict]:
    return [{"role": turn[0], "content": turn[1]} for turn in context_buffer if turn[0] != "system"]

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
# Helper for cleaning text with regex
# --------------------------------------------------------------------------------
def normalize_text(text):
    text = (text or "").strip()
    text = re.sub(r"\s*\n+\s*", " ", text)  # Replace internal newlines 
    text = re.sub(r"[ \t]{2,}", " ", text)  # Collapse repeated whitespace
    return text

