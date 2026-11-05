"""
Active-listening tunables: request limits, temperatures, and the grace period.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.active_listening.config`

"""
# --------------------------------------------------------------------------------
# Live-Chat Response Generation
# --------------------------------------------------------------------------------
ACTIVE_LISTENING_GRACE_SEC       =  0.80    # Extra silence allowed after an incomplete-turn assessment
ACTIVE_LISTENING_TIMEOUT_SEC     = 15.00    # Maximum duration of each active-listening LLM request
ACTIVE_LISTENING_MAX_RETRIES     =  1       # Additional attempts allowed after a failed structured response
ACTIVE_LISTENING_RETRY_DELAY_SEC =  0.50    # Delay between active-listening request attempts
ACTIVE_LISTENING_ASSESSMENT_TEMP =  0.10    # Low-variance temperature used for turn assessment
ACTIVE_LISTENING_RESPONSE_TEMP   =  0.50    # Temperature used to generate the spoken response
