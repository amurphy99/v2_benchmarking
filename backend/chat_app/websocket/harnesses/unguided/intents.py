"""
Regex-based intent detection for user-initiated end-chat and pauses.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.unguided.intents`

The unguided harness checks every staged user turn here before it calls the LLM.
A match gets a scripted reply, and the dialogue state or listening pause that goes
with it comes back in the outcome, so it applies only once that reply is saved.

TODO: Pause needs to communicate with the frontend chat page and the listener page

"""
from __future__ import annotations
from typing     import Literal

import logging, re
logger = logging.getLogger(__name__)

# From this project
from ....services.logging_utils import RESET, BOLD, UNBOLD, ORANGE
from   ..base                   import ResponseOutcome

# Whether the last saved reply asked the user to confirm ending the chat
IntentState = Literal["normal", "awaiting_end_confirmation"]


# --------------------------------------------------------------------------------
# Scripted Responses
# --------------------------------------------------------------------------------
# TODO: Queue up an LLM response after 'MSG_END_CANCEL' ?
# TODO: Might need to do a customized LLM call where it is like a completion? and we give it this message as a "prefix" for what to say...
MSG_END_CONFIRM = "Okay, are you sure that's all for our chat?"
MSG_END_GOODBYE = "Alright, it was great talking with you. Take care!"
MSG_END_CANCEL  = "Great! Let's keep going then! What were you saying?" 
MSG_PAUSE       = "Sure! Press the play button whenever you're ready to resume!"


# ================================================================================
# Patterns (tries to filter for only when the chat is the direct object)
# ================================================================================
# End-chat Triggers
_END_PATTERNS = [
    r"\bend\s+(the\s+|our\s+|this\s+)?chat\b",
    r"\band\s+(the\s+|our\s+|this\s+)?chat\b",  # Adding "and" because it mis-hears that so often
    r"\bstop\s+(the\s+|our\s+|this\s+)?chat\b",
    r"\b(i'?d?\s+like\s+to|i\s+want\s+to|let'?s|can\s+we)\s+(end|and|stop|finish|wrap\s+up)(\s+the\s+chat)?\b",
    r"\b(that'?s|i'?m|we'?re)\s+(all\s+)?(done|finished)(\s+now)?\b",
    r"\b(goodbye|bye(-?bye)?|farewell)\b",
    r"\bwrap\s+up\b",
    r"\bi'?m\s+done\b",
]

# Pause Triggers 
_PAUSE_PATTERNS = [
    r"\bpause\s+(the\s+|our\s+|this\s+)?chat\b",
    r"\b(take|need)\s+a\s+(quick\s+|short\s+)?break\b",
    r"\b(be\s+right\s+back|brb)\b",
    r"\b(step\s+away|step\s+out)\b",
    r"\b(let'?s\s+pause|pause\s+for\s+now)\b",
]

# Negation
# Check if they negated their message (e.g., "don't end the chat") in the same sentence as the trigger
_NEGATION = re.compile(
    r"\b(don'?t|do\s+not|not|never|no)\b",
    re.IGNORECASE,
)

# --------------------------------------------------------------------------------
# Used when checking a "are you sure?" confirmation response
# --------------------------------------------------------------------------------
# Affirmation
_AFFIRMATION = re.compile(
    r"\b(yes|yeah|yep|yup|sure|correct|right|absolutely|definitely|of\s+course|please|go\s+ahead)\b",
    re.IGNORECASE,
)

# Denial
_DENIAL = re.compile(
    r"\b(no|nope|nah|not\s+really|never\s+mind|nevermind|forget\s+it|continue|keep\s+going)\b",
    re.IGNORECASE,
)

# ================================================================================
# Wrapper fucntions for each regex string
# ================================================================================
def _check_end_intent(text: str) -> bool:
    return _matches_with_negation_check(text, _END_PATTERNS)

def _check_pause_intent(text: str) -> bool:
    return _matches_with_negation_check(text, _PAUSE_PATTERNS)

def _check_affirmation(text: str) -> bool:
    return bool(_AFFIRMATION.search(text))

def _check_denial(text: str) -> bool:
    return bool(_DENIAL.search(text))

# --------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------
def _sentences(text: str) -> list:
    return re.split(r"[.!?]+", text)

def _matches_with_negation_check(text: str, patterns: list) -> bool:
    """Return True if any pattern matches in a sentence that does NOT also contain negation."""
    for sentence in _sentences(text):
        for pat in patterns:
            if re.search(pat, sentence, re.IGNORECASE):
                if not _NEGATION.search(sentence):
                    return True
    return False


# ================================================================================
# Check for "end_chat" or "pause_chat" intent in the user's message
# ================================================================================
def scripted_outcome(text: str, state: IntentState) -> ResponseOutcome | None:
    """
    Check which case we are in to decide which regex strings to check for, and return
    the scripted reply for it (None lets the LLM reply instead).

    The outcome carries the state to enter and whether to stop listening, instead of
    changing them here. `ChatHandler` applies them once the reply is saved, so a reply
    cancelled by newer speech changes nothing.
    """
    # --------------------------------------------------------------------------------
    # Waiting for the user to confirm or deny ending the chat
    # --------------------------------------------------------------------------------
    if state == "awaiting_end_confirmation":
        # Case A: User confirms we should end the chat
        if _check_affirmation(text):
            logger.info(f"{ORANGE}[Intent] User {BOLD}confirms{UNBOLD} they wish to end the chat.{RESET}")
            return ResponseOutcome(message=MSG_END_GOODBYE, state="normal", close_after=True)

        # Case B: User does not confirm they wish to end the chat
        if _check_denial(text):
            logger.info(f"{ORANGE}[Intent] User {BOLD}denies{UNBOLD} they wish to end the chat.{RESET}")
            return ResponseOutcome(message=MSG_END_CANCEL, state="normal")

        # Case C: User says something unrelated; the LLM replies normally, which drops the request
        logger.info(f"{ORANGE}[Intent] User {BOLD}does not confirm{UNBOLD} they wish to end the chat.{RESET}")
        return None

    # --------------------------------------------------------------------------------
    # "Normal" mode: scan for the users intent
    # --------------------------------------------------------------------------------
    # Case A: User indicates they want to END the chat
    if _check_end_intent(text):
        logger.info(f"{ORANGE}[Intent] User indicates they wish to {BOLD}END{UNBOLD} the chat (checking for confirmation).{RESET}")
        return ResponseOutcome(message=MSG_END_CONFIRM, state="awaiting_end_confirmation")

    # Case B: User indicates they want to PAUSE the chat (applied once the reply is saved)
    if _check_pause_intent(text):
        logger.info(f"{ORANGE}[Intent] User indicates they wish to {BOLD}PAUSE{UNBOLD} the chat.{RESET}")
        return ResponseOutcome(message=MSG_PAUSE, pause_listening=True)

    # Return default response if none of our pre-programmed intents were detected
    return None
