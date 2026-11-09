"""
Cooperative planning tunables: request limits, each call's settings, and the cues.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.cooperative_planning.config`

"""
# --------------------------------------------------------------------------------
# Planning Turns
# --------------------------------------------------------------------------------
PLANNING_TIMEOUT_SEC     = 15.00    # Maximum duration of each planning LLM request
PLANNING_MAX_RETRIES     = 1        # Additional attempts allowed after a failed structured response
PLANNING_RETRY_DELAY_SEC = 0.50     # Delay between planning request attempts
PLANNING_TRACK_TEMP      = 0.10     # Temperature for working out how a turn changes the plan
PLANNING_REPLY_TEMP      = 0.60     # Temperature for the spoken reply
PLANNING_COMBINED_TEMP   = 0.40     # Temperature for the single call that does both

# Which planning calls let the model think first (slower)
PLANNING_TRACK_THINKING    = False  # Working out how a turn changes the plan
PLANNING_REPLY_THINKING    = False  # The spoken reply
PLANNING_COMBINED_THINKING = False  # The single call that does both

# How each turn is answered: "track_then_reply", "single_call", or "reply_then_track" (`pipelines.py`)
PLANNING_PIPELINE = "track_then_reply"


# --------------------------------------------------------------------------------
# Cues
# --------------------------------------------------------------------------------
PLANNING_NUDGE_AFTER_SEC = 12.0     # Silence on the user's turn before the avatar nudges them to keep going
PLANNING_MAX_NUDGES      = 2        # Nudges in a row before the avatar waits for the user to speak
