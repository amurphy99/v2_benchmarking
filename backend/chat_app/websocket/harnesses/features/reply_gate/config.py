"""
Reply check tunables: its request limits, its settings, and what it reads.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.features.reply_gate.config`

A chat type sets its own hold length and prompt notes.

"""
REPLY_CHECK_TIMEOUT_SEC      = 5.0    # Longest the check may take before the reply goes out unchecked
REPLY_CHECK_MAX_RETRIES      = 0      # No retry: a verdict after one would come too late to matter
REPLY_CHECK_TEMP             = 0.0    # Temperature for the check (a judgment, not prose)
REPLY_CHECK_THINKING         = False  # Whether the check lets the model think first (slower)
REPLY_CHECK_CONTEXT_MESSAGES = 6      # Most recent messages the check reads, ending with the user's turn
