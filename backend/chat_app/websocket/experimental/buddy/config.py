"""
Capability names, timing, close codes, and log tag for the Buddy media experiment.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.experimental.buddy.config`

Values come from Buddy's media protocol (the Android side as of November 2, 2026).
The log tag lives here instead of `logging_utils.py` so the experiment touches no
shared module; it moves there if this graduates.

"""
from ....services import logging_utils as lu

# Log tag and highlight pair for every experimental Buddy line
BM_H      = f"{lu.BOLD}{lu.BRIGHT_MAGENTA}"
BM_R      = f"{lu.UNBOLD}{lu.MAGENTA}"
BUDDY_TAG = f"{lu.MAGENTA}[{BM_H}BuddyMedia{BM_R}]"

# Advertised in the `get_control_state` probe ack
BUDDY_CAPABILITIES = ("buddy_input_mode_v1", "buddy_media_v1")


# --------------------------------------------------------------------------------
# Media Sockets
# --------------------------------------------------------------------------------
MEDIA_PROTOCOL_VERSION       = 1    # Reported in every media ack
MEDIA_HEARTBEAT_INTERVAL_SEC = 1.0  # Buddy turns media off after 3 s without a backend command

# Close codes (the viewer's match the admin listener's, `CLIENT_PROTOCOL.md` §1)
UNAUTHENTICATED_CLOSE_CODE    = 4001
VIEWER_FORBIDDEN_CLOSE_CODE   = 4003
MEDIA_PARENT_ENDED_CLOSE_CODE = 4004  # Buddy's chat connection ended, was replaced, or never existed
VIEWER_NOT_FOUND_CLOSE_CODE   = 4404

# Group every viewer of one chat session joins (images, telemetry, and state go here)
MEDIA_VIEWER_GROUP = "buddy_media_{session_id}"
