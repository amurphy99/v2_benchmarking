"""
Logging helpers for the consumer classes 
--------------------------------------------------------------------------------
backend.chat_app.websocket.consumers.utils.logging

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
class ChatConsumerLogging:
    @staticmethod
    def log_connect(user, source):
        logger.info(f"{lu.G_LINE_1}{lu.CC_MAIN} {BOLD}{user}{UNBOLD} opened ChatSession from {BOLD}{source}{RESET}{lu.G_LINE_2}")

    @staticmethod
    def log_connect_done(user, session_id):
        logger.info(f"{lu.CC_MAIN} All setup steps for {BOLD}{user}{UNBOLD} succeeded. ChatSession ID: {BOLD}{session_id}{lu.RESET}")

    @staticmethod
    def log_disconnect():
        pass

# --------------------------------------------------------------------------------
# ChatListener Utilities
# --------------------------------------------------------------------------------
class ChatListenerLogging:
    @staticmethod
    def log_connect(username, session_owner):
        logger.info(f"{lu.Y_LINE_1}{lu.CL_MAIN} {BOLD}{username}{UNBOLD} listening to: {BOLD}{session_owner}{RESET}{lu.Y_LINE_2}")
        
    @staticmethod
    def log_disconnect(username, code):
        logger.info(f"{lu.Y_LINE_1}{lu.CL_MAIN} {BOLD}{username}{UNBOLD} disconnected (code: {BOLD}{code}{UNBOLD}) {RESET}{lu.Y_LINE_2}")

