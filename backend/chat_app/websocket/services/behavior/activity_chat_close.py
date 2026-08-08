"""
Post-session closing behavior for the Activity Chat.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.services.behavior.activity_chat_close`

Handles the farewell + optional summary flow that is triggered when the activity chat system transitions to the 'close_session' state.

Returns (response_text, close_after) tuples - so _execute_response in
chatHelpers.py can handle both paths identically.
"""
from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING

from langchain_core.messages import SystemMessage, HumanMessage

from chat_app.services import logging_utils as lu
from chat_app.websocket.services.utils.chatUtils import organize_full_conversation

if TYPE_CHECKING:
    from chat_app.websocket.consumers.consumers import ChatConsumer

logger = logging.getLogger(__name__)

# --- Fallback strings (used if LLM calls fail) ---
_FAREWELL_FALLBACK = (
    "It has been a great pleasure getting to know more about you. I feel like we are getting closer to becoming good friends. "
    "Would you like a short summary of what we talked about today?"
)
_GOODBYE_NO_SUMMARY = "That's totally fine! It was wonderful talking with you. Take care!"
_CLARIFY_PROMPT     = "Sorry, I didn't quite catch that — would you like a summary of our conversation? Please say yes or no!"


# =============================================================================
# Internal LLM helpers
# =============================================================================

async def _generate_farewell_with_summary_offer(chat_state, *, trace_id: str) -> str:
    """
    Makes a small LLM call to produce a warm, lightly paraphrased farewell
    that ends by asking if the user wants a summary.
    Uses the tail of the conversation as context so it can feel personal.
    """
    from chat_app import config as cf  # local import to avoid circular deps at module load

    if cf.openai_client is None:
        logger.warning(f"[SessionClosing][{trace_id}] openai_client is None, using fallback farewell.")
        return _FAREWELL_FALLBACK

    # Pull the last few lines of the conversation for a personal touch
    try:
        full_hist = organize_full_conversation(chat_state)
        # last ~600 chars should be enough for a farewell
        context_snippet = full_hist[-600:] if len(full_hist) > 600 else full_hist
    except Exception:
        context_snippet = ""

    system_prompt = (
        "You are a warm, friendly conversational companion wrapping up a chat session. "
        "Based on the brief conversation context below, write a single short response (2-3 sentences) that:\n"
        "1. Acknowledge anything the user said in the most recent part of the conversation.\n"
        "2. Expresses that you genuinely enjoyed the conversation and feel closer to the user.\n"
        "3. Asks if they would like a short summary of what you talked about.\n\n"
        "Rules:\n"
        "- Keep it concise and warm.\n"
        "- Do not use emojis or emoticons.\n"
        "- End with the summary question."
    )

    messages = [
        {"role": "system",    "content": system_prompt},
        {"role": "user",      "content": f"Recent conversation:\n{context_snippet}"},
    ]

    try:
        resp = await cf.openai_client.chat.completions.create(
            model=cf.INSTRUCTOR_MODEL_NAME,
            messages=messages,
            temperature=0.8,   # slightly higher for natural variation
            max_tokens=120,
            reasoning_effort="none",
        )
        text = (resp.choices[0].message.content or "").strip()
        if text:
            logger.info(f"{lu.GREEN}[SessionClosing][{trace_id}] Farewell generated: {text!r}{lu.RESET}")
            return text
    except Exception:
        logger.exception(f"{lu.RED}[SessionClosing][{trace_id}] Farewell LLM call failed, using fallback.{lu.RESET}")

    return _FAREWELL_FALLBACK


async def _generate_personalized_summary(chat_state, *, trace_id: str) -> str:
    """
    Makes an LLM call over the full conversation history to produce a short,
    warm, first-person personalized summary (3-4 sentences).
    """
    from chat_app import config as cf

    if cf.openai_client is None:
        logger.warning(f"[SessionClosing][{trace_id}] openai_client is None, cannot generate summary.")
        return "It was a wonderful conversation! I'm sorry I can't recall all the details right now."

    try:
        full_hist = organize_full_conversation(chat_state)
    except Exception:
        full_hist = ""

    if not full_hist.strip():
        return "It was a great chat, even if it was brief! I hope we get to talk again soon."

    system_prompt = (
        "You are a warm, friendly conversational companion. "
        "Based on the conversation below, write a short personalized summary (3-4 sentences) for the user.\n\n"
        "Rules:\n"
        "- Write in first person ('We talked about...', 'I learned that you...', 'You mentioned...').\n"
        "- Highlight the most interesting or personal things that were discussed.\n"
        "- Keep it warm, conversational, and engaging — not a dry list of facts.\n"
        "- No bullet points, no headings, no special formatting.\n"
        "- Make sure that you end the summary with a positive note by saying something like 'I really enjoyed our chat and look forward to talking again soon! Goodbye!'\n"
        "- Use maximum 4 sentences."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user",   "content": f"Conversation:\n{full_hist}"},
    ]

    try:
        resp = await cf.openai_client.chat.completions.create(
            model=cf.INSTRUCTOR_MODEL_NAME,
            messages=messages,
            temperature=0.5,
            max_tokens=180,
            reasoning_effort="none",
        )
        text = (resp.choices[0].message.content or "").strip()
        if text:
            logger.info(f"{lu.GREEN}[SessionClosing][{trace_id}] Summary generated: {text!r}{lu.RESET}")
            return text
    except Exception:
        logger.exception(f"{lu.RED}[SessionClosing][{trace_id}] Summary LLM call failed.{lu.RESET}")

    return "We had a really lovely conversation! I'm sorry I can't put it into words right now."


def _check_yes(text: str) -> bool:
    return bool(re.search(r"\b(yes|yeah|yep|yup|sure|okay|ok|please|go ahead|absolutely|definitely)\b", text, re.IGNORECASE))

def _check_no(text: str) -> bool:
    return bool(re.search(r"\b(no|nope|nah|not really|never mind|nevermind|skip|don'?t)\b", text, re.IGNORECASE))


# =============================================================================
# Main entry point
# =============================================================================

async def handle_closing_turn(
    consumer: ChatConsumer,
    user_text: str,
    rag_state: dict,
    *,
    trace_id: str = "N/A",
) -> tuple[str, bool]:
    """
    Called by _execute_response in chatHelpers.py when rag_state["_closing_flow_active"] is True.

    Returns (response_text, close_after).
    - close_after=True: ChatHelpers will send {"type": "chat_ended"} and call consumer.close()
    - close_after=False: WebSocket stays open, waiting for the user's next message
    """
    chat_state = rag_state.get("_chat_state")


    # TODO: I think I will add another phase here for the "Cookie Theft" task here, that way we can ensure that it always happens at the end of the session.

    # -------------------------------------------------------------------------
    # Phase 2: We already sent the farewell, now we're waiting for yes/no
    # -------------------------------------------------------------------------
    if rag_state.get("awaiting_summary_choice"):
        logger.info(f"{lu.ORANGE}[SessionClosing][{trace_id}] Received summary choice: {user_text!r}{lu.RESET}")

        if _check_yes(user_text):
            logger.info(f"{lu.GREEN}[SessionClosing][{trace_id}] User wants a summary.{lu.RESET}")
            if chat_state:
                summary = await _generate_personalized_summary(chat_state, trace_id=trace_id)
            else:
                summary = "It was a wonderful conversation! Sadly I can't recall the details right now."
            rag_state["awaiting_summary_choice"] = False
            return summary, True  # close after delivering summary

        if _check_no(user_text):
            logger.info(f"{lu.ORANGE}[SessionClosing][{trace_id}] User declined summary.{lu.RESET}")
            rag_state["awaiting_summary_choice"] = False
            return _GOODBYE_NO_SUMMARY, True  # close without summary

        # Ambiguous answer — ask again, keep connection open
        logger.info(f"{lu.YELLOW}[SessionClosing][{trace_id}] Ambiguous summary response, re-prompting.{lu.RESET}")
        return _CLARIFY_PROMPT, False

    # -------------------------------------------------------------------------
    # Phase 1: First turn after close_session was detected — send the farewell
    # -------------------------------------------------------------------------
    logger.info(f"{lu.ORANGE}[SessionClosing][{trace_id}] Entering closing flow — generating farewell.{lu.RESET}")
    farewell = await _generate_farewell_with_summary_offer(chat_state, trace_id=trace_id)
    rag_state["awaiting_summary_choice"] = True
    return farewell, False  # keep connection open to wait for yes/no