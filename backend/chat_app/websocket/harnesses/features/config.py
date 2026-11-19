"""
Shared feature tunables: switches, signs of listening, and the reply check.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.features.config`

A feature runs only in the chat types that use it, and there only in the
conditions its switch lists, so one switch turns a feature off (or on) for every
chat type at once. Each connection copies its switch into the feature's `on`, so
something can flip a feature partway through one chat. A chat type sets its own
sounds, signs, and hold length.

"""
# --------------------------------------------------------------------------------
# Switches
# --------------------------------------------------------------------------------
# Conditions each feature runs in (`()` turns it off in every chat type)
FEATURE_BACKCHANNELS_CONDITIONS = ("cues",)  # Signs of listening at pauses
FEATURE_TURN_END_CONDITIONS     = ("cues",)  # Holding a reply while the user seems to be mid-thought
FEATURE_MISHEARD_CONDITIONS     = ("cues",)  # Asking about a likely misheard word instead of replying


# --------------------------------------------------------------------------------
# Signs of Listening (defaults a chat type can override)
# --------------------------------------------------------------------------------
BACKCHANNEL_PAUSE_SEC    = 0.7  # A pause this long inside the user's utterance gets a sign
BACKCHANNEL_MIN_WORDS    = 6    # Words the utterance needs first (a short answer gets a reply, not a sign)
BACKCHANNEL_MIN_GAP_SEC  = 4.0  # Shortest time between two signs (the reply check's signs count too)
BACKCHANNEL_SOUND_VOLUME = 0.6  # How loud a listening sound plays, beside the reply voice at 1


# --------------------------------------------------------------------------------
# Reply Check
# --------------------------------------------------------------------------------
REPLY_CHECK_TIMEOUT_SEC      = 5.0    # Longest the check may take before the reply goes out unchecked
REPLY_CHECK_MAX_RETRIES      = 0      # No retry: a verdict after one would come too late to matter
REPLY_CHECK_TEMP             = 0.0    # Temperature for the check (a judgment, not prose)
REPLY_CHECK_THINKING         = False  # Whether the check lets the model think first (slower)
REPLY_CHECK_CONTEXT_MESSAGES = 6      # Most recent messages the check reads, ending with the user's turn
