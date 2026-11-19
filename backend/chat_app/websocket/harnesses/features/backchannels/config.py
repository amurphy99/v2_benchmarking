"""
Signs of listening defaults, which a chat type's subclass can override.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.features.backchannels.config`

"""
BACKCHANNEL_PAUSE_SEC    = 0.7  # A pause this long inside the user's utterance gets a sign
BACKCHANNEL_MIN_WORDS    = 6    # Words the utterance needs first (a short answer gets a reply, not a sign)
BACKCHANNEL_MIN_GAP_SEC  = 4.0  # Shortest time between two signs (the reply check's signs count too)
BACKCHANNEL_SOUND_VOLUME = 0.6  # How loud a listening sound plays, beside the reply voice at 1
