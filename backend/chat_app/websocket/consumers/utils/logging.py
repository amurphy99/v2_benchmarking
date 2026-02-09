"""
Logging helpers for the consumer classes 
--------------------------------------------------------------------------------
`backend.chat_app.websocket.consumers.utils.logging`

Help reduce code bloat in the actual consumer classes.

"""

import logging
logger = logging.getLogger(__name__)

# From this project
from ....services import logging_utils as lu 
from ....services.logging_utils import RESET, BOLD, UNBOLD

# --------------------------------------------------------------------------------
# ChatConsumer Utilities
# --------------------------------------------------------------------------------
from ....services.logging_utils import CC_MAIN, BRIGHT_GREEN, G_LINE_1, G_LINE_2

class ChatConsumerLogging:
    @staticmethod
    def log_connect(user, source):
        logger.info(f"{G_LINE_1}{CC_MAIN} {BOLD}{user}{UNBOLD} opened ChatSession from {BOLD}{source}{RESET}{G_LINE_2}")

    @staticmethod
    def log_connect_done(user, session_id):
        logger.info(f"{CC_MAIN} All setup steps for {BOLD}{user}{UNBOLD} succeeded. ChatSession ID: {BOLD}{session_id}{RESET}")

    @staticmethod
    def log_disconnect(user, code):
        logger.info(f"{G_LINE_1}{CC_MAIN} {BOLD}{user}{UNBOLD} {lu.RED}disconnected{BRIGHT_GREEN} (code: {BOLD}{code}{UNBOLD}) {RESET}{G_LINE_2}")

# --------------------------------------------------------------------------------
# ChatListener Utilities
# --------------------------------------------------------------------------------
from ....services.logging_utils import CL_MAIN, Y_LINE_1, Y_LINE_2

class ChatListenerLogging:
    @staticmethod
    def log_connect(username, session_owner, session_id):
        logger.info(f"{Y_LINE_1}{CL_MAIN} {BOLD}{username}{UNBOLD} listening to: {BOLD}{session_owner}{UNBOLD}. ChatSession ID: {BOLD}{session_id} {RESET}{Y_LINE_2}")
        
    @staticmethod
    def log_disconnect(username, code):
        logger.info(f"{Y_LINE_1}{CL_MAIN} {BOLD}{username}{UNBOLD} disconnected (code: {BOLD}{code}{UNBOLD}) {RESET}{Y_LINE_2}")

