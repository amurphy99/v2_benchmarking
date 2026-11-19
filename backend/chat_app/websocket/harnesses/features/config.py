"""
Which conditions each shared harness feature runs in.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.features.config`

A feature runs only in the chat types that use it, and there only in the
conditions its switch lists, so one switch turns a feature off (or on) for every
chat type at once. Each connection copies its switch into the feature's `on`, so
something can flip a feature partway through one chat. A feature's other
settings live in its own folder's `config.py`, and a chat type sets its own
sounds, signs, prompt notes, and hold length.

"""
# Conditions each feature runs in (`()` turns it off in every chat type)
FEATURE_BACKCHANNELS_CONDITIONS = ("cues",)  # Signs of listening at pauses (`backchannels/`)
FEATURE_TURN_END_CONDITIONS     = ("cues",)  # Holding a reply while the user seems to be mid-thought (`reply_gate/`)
FEATURE_MISHEARD_CONDITIONS     = ("cues",)  # Asking about a likely misheard word instead of replying (`reply_gate/`)
