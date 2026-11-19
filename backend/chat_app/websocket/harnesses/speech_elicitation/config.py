"""
Speech elicitation tunables: request limits, replies, threads, and the cues.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.speech_elicitation.config`

"""
# --------------------------------------------------------------------------------
# Replies
# --------------------------------------------------------------------------------
ELICITATION_TIMEOUT_SEC     = 15.00  # Maximum duration of each reply request
ELICITATION_MAX_RETRIES     = 1      # Additional attempts allowed after a failed structured response
ELICITATION_RETRY_DELAY_SEC = 0.50   # Delay between reply request attempts
ELICITATION_REPLY_TEMP      = 0.80   # Temperature for the spoken reply (high, so its questions vary)
ELICITATION_REPLY_THINKING  = False  # Whether the reply call lets the model think first (slower)
ELICITATION_HOLD_SEC        = 2.50   # How long a reply waits while the user seems mid-thought (`features/reply_gate/`)


# --------------------------------------------------------------------------------
# Threads
# --------------------------------------------------------------------------------
ELICITATION_SHORT_ANSWER_WORDS = 3  # An answer this short or shorter counts as a short answer
ELICITATION_DRY_AFTER_SHORT    = 2  # Short answers in a row before a thread counts as run dry
ELICITATION_MIN_FOLLOW_UPS     = 3  # Replies a thread gets before its fresh angles are offered


# --------------------------------------------------------------------------------
# Cues
# --------------------------------------------------------------------------------
ELICITATION_QUIET_AFTER_SEC   = 10.0  # Silence on the user's turn before the avatar speaks up again
ELICITATION_MAX_QUIET_PROMPTS = 2     # Times in a row it speaks up before waiting for the user
