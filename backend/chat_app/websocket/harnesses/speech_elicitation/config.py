"""
Speech elicitation tunables: request limits, the reply call's settings, and the cues.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.speech_elicitation.config`

"""
# --------------------------------------------------------------------------------
# Replies
# --------------------------------------------------------------------------------
ELICITATION_TIMEOUT_SEC        = 15.00  # Maximum duration of each reply request
ELICITATION_MAX_RETRIES        = 1      # Additional attempts allowed after a failed structured response
ELICITATION_RETRY_DELAY_SEC    = 0.50   # Delay between reply request attempts
ELICITATION_REPLY_TEMP         = 0.80   # Temperature for the spoken reply (high, so its questions vary)
ELICITATION_REPLY_THINKING     = False  # Whether the reply call lets the model think first (slower)
ELICITATION_SHORT_ANSWER_WORDS = 3      # An answer this short or shorter is treated as a thread running dry


# --------------------------------------------------------------------------------
# Cues
# --------------------------------------------------------------------------------
ELICITATION_QUIET_AFTER_SEC   = 10.0    # Silence on the user's turn before the avatar speaks up again
ELICITATION_MAX_QUIET_PROMPTS = 2       # Times in a row it speaks up before waiting for the user
ELICITATION_NOD_EVERY_WORDS   = 12      # Words the user says between the avatar's listening nods
