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
# ChatConsumer Utilities (GREEN & BRIGHT_GREEN)
# --------------------------------------------------------------------------------
from ....services.logging_utils import CC_MAIN, CC_H, CC_R, GREEN, G_LINE_1, G_LINE_2

class ChatConsumerLogging:
    @staticmethod
    def log_connect(user, source):
        logger.info(f"{G_LINE_1}{CC_MAIN} {CC_H}{user}{CC_R} opened ChatSession from {CC_H}{source}{RESET}{G_LINE_2}")

    @staticmethod
    def log_connect_done(user, session_id, *, config={}):
        logger.info((
            f"{CC_MAIN} All setup steps for {CC_H}{user}{CC_R} succeeded. " 
            f"ChatSession ID: {CC_H}{session_id}{CC_R}, "
            f"Chat Configs: {lu.BRIGHT_GREEN}{config}{CC_R}. {RESET}"
        ))

    @staticmethod
    def log_disconnect(user, code):
        logger.info(f"{G_LINE_1}{CC_MAIN} {CC_H}{user}{CC_R} {lu.RED}disconnected{GREEN} (code: {CC_H}{code}{CC_R}) {RESET}{G_LINE_2}")

    @staticmethod
    def log_group_left(user, channel_name):
        logger.info(f"{CC_MAIN} {CC_H}{user}{CC_R} left channel group: {CC_H}{channel_name}{CC_R} {RESET}")

# --------------------------------------------------------------------------------
# ChatListener Utilities
# --------------------------------------------------------------------------------
from ....services.logging_utils import CL_MAIN, CL_H, CL_R, Y_LINE_1, Y_LINE_2

class ChatListenerLogging:
    @staticmethod
    def log_connect(username, session_owner, session_id):
        logger.info(f"{Y_LINE_1}{CL_MAIN} {CL_H}{username}{CL_R} listening to: {CL_H}{session_owner}{CL_R}. ChatSession ID: {CL_H}{session_id} {RESET}{Y_LINE_2}")
        
    @staticmethod
    def log_connect_done(num_messages, num_biomarkers):
        logger.info(f"{CL_MAIN} Loaded {CL_H}{num_messages}{CL_R} messages & {CL_H}{num_biomarkers}{CL_R} biomarkers. {RESET}")

    @staticmethod
    def log_disconnect(username, code):
        logger.info(f"{Y_LINE_1}{CL_MAIN} {CL_H}{username}{CL_R} disconnected (code: {CL_H}{code}{CL_R}) {RESET}{Y_LINE_2}")

    @staticmethod
    def log_group_left(user, channel_name):
        logger.info(f"{CL_MAIN} {CL_H}{user}{CL_R} left channel group: {CL_H}{channel_name}{CL_R} {RESET}")
