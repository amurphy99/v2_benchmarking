"""
Utilities for the non-chat LLM calls & analysis.
--------------------------------------------------------------------------------
`backend.chat_app.services.llm.non_chat.utils`

"""
import re

# --------------------------------------------------------------------------------
# Convert messages from the database to a basic string format we can use 
# --------------------------------------------------------------------------------
def to_transcript(messages, max_chars=30_000) -> str:
    """ Format ChatMessage objects into a transcript for the LLM post-chat analysis. """
    # 1) Sort ChatMessages by timestamp
    try:              messages = messages.order_by("ts", "id") 
    except Exception: messages = sorted(messages, key=lambda m: (m.ts, getattr(m, "id", 0)))
    messages = list(messages)

    # 2) Loop through and prepare a line for each message 
    lines = []
    for m in messages:
        # Clean up and skip if empty
        content = normalize_text(getattr(m, "content", ""))
        if not content: continue

        # Add a prefix for the message senders role
        role   = (getattr(m, "role", "") or "").lower()
        prefix = "USER" if role == "user" else "ASSISTANT" if role == "assistant" else role.upper() or "UNKNOWN"

        # Build the line and add it
        lines.append(f"{prefix}: {content}")
    
    # 3) Join the lines together
    transcript = "\n".join(lines).strip()
    if not transcript: return ""

    # 4) Keep recent characters if we have to truncate
    if len(transcript) > max_chars:
        transcript = transcript[-max_chars:]
        transcript = "(TRUNCATED TO MOST RECENT PORTION)\n" + transcript

    return transcript

# --------------------------------------------------------------------------------
# Helper for cleaning text with re
# --------------------------------------------------------------------------------
def normalize_text(text):
    text = (text or "").strip()
    text = re.sub(r"\s*\n+\s*", " ", text)  # Replace internal newlines 
    text = re.sub(r"[ \t]{2,}", " ", text)  # Collapse repeated whitespace
    return text
