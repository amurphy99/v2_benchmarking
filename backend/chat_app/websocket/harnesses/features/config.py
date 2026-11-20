"""
Which conditions each shared harness feature runs in.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.features.config`

A feature runs only in the chat types that use it, and there only in the
conditions its switch lists, so one switch turns a feature off (or on) for every
chat type at once. Each connection copies its switch into the feature's `on`,
which the `set_feature` command can flip partway through one chat
(`consumers/processing/commands.py`). A feature's other settings live in its own
folder's `config.py`, and a chat type sets its own sounds, signs, prompt notes,
and hold length.

The intro is the exception: it opens a chat, so it is decided as the chat starts
and no command switches it. It explains the task rather than acting as a cue, so
it runs in both conditions.

"""
# Conditions each feature runs in (`()` turns it off in every chat type)
FEATURE_BACKCHANNELS_CONDITIONS = ("cues",)  # Signs of listening at pauses (`backchannels/`)
FEATURE_TURN_END_CONDITIONS     = ("cues",)  # Holding a reply while the user seems to be mid-thought (`reply_gate/`)
FEATURE_MISHEARD_CONDITIONS     = ("cues",)  # Asking about a likely misheard word instead of replying (`reply_gate/`)

# Opening with what the task is, and its rules for anyone new to it (`intro/`)
FEATURE_INTRO_CONDITIONS = ("cues", "no_cues")
