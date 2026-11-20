"""
Intro tunables: the reading call's request limits and settings.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.features.intro.config`

A chat type sets its own lines (`IntroScript` in `flow.py`).

"""
INTRO_TIMEOUT_SEC     = 10.0   # Longest one reading of the user's answer may take
INTRO_MAX_RETRIES     = 1      # Additional attempts allowed after a failed reading
INTRO_RETRY_DELAY_SEC = 0.5    # Delay between reading attempts
INTRO_TEMP            = 0.2    # Temperature for the reading (a judgment, and a short answer at most)
INTRO_THINKING        = False  # Whether the reading lets the model think first (slower)
