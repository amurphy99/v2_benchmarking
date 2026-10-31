"""
Map Task LLM tunables: request limits, and each call's temperature and thinking.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.map_task.config`

"""
# --------------------------------------------------------------------------------
# Map Task Turns
# --------------------------------------------------------------------------------
MAP_TASK_TIMEOUT_SEC     = 15.00    # Maximum duration of each Map Task LLM request
MAP_TASK_MAX_RETRIES     = 1        # Additional attempts allowed after a failed structured response
MAP_TASK_RETRY_DELAY_SEC = 0.50     # Delay between Map Task request attempts
MAP_TASK_FOLLOW_TEMP     = 0.30     # Temperature for the single-call reply
MAP_TASK_CHECK_TEMP      = 0.00     # Temperature for checking a drafted answer
MAP_TASK_ASSESS_TEMP     = 0.10     # Temperature for assessing a mismatched turn
MAP_TASK_REPLY_TEMP      = 0.50     # Temperature for the reply after an assessment

# Which Map Task calls let the model think first (slower, for the harder turns)
MAP_TASK_FOLLOW_THINKING = False    # The single-call reply
MAP_TASK_CHECK_THINKING  = False    # Checking a drafted answer
MAP_TASK_ASSESS_THINKING = True     # Assessing a mismatched turn
MAP_TASK_REPLY_THINKING  = False    # The reply after an assessment
