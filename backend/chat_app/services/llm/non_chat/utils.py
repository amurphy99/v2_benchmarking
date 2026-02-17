"""
Utilities for the non-chat LLM calls & analysis.
--------------------------------------------------------------------------------
`backend.chat_app.services.llm.non_chat.utils`

"""
from ..chat_utilities import normalize_text

# --------------------------------------------------------------------------------
# Convert messages from the database to a basic string format we can use 
# --------------------------------------------------------------------------------
def to_transcript(messages, max_chars=30_000) -> str:
    """ Format ChatMessage objects into a transcript for the LLM post-chat analysis. """
    # 1) Sort ChatMessages by timestamp
    messages = _sort_messages(messages)

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
    if len(transcript) > max_chars: transcript = "(TRUNCATED TO MOST RECENT PORTION)\n" + transcript[-max_chars:]
    return transcript

# --------------------------------------------------------------------------------
# Flexible Sorting
# --------------------------------------------------------------------------------
# Allow database model objects or dictionary-style rows
def _get(m, key, default=None):
    if isinstance(m, dict): return m.get(key, default)
    return getattr(m, key, default)

# If it is a "QuerySet" (result from DB access) => standard ordering works
# If it is a list of dicts/objects              => sort normally
def _sort_messages(messages):
    try:              messages = messages.order_by("ts", "id")
    except Exception: messages = sorted(messages, key=lambda m: (_get(m, "ts"), _get(m, "id", 0)))
