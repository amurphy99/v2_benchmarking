"""
Helper functions for whenever a consumer needs info from the DB. 
--------------------------------------------------------------------------------
`backend.chat_app.websocket.consumers.utils.db_data`

It's okay to have database access stuff here instead of `db_services` because we
never write anything to the DB here, this is just for pulling data, formatting
it, and returning it to the client. 

Formatters convert data to whatever JSON formatting the frontend client expects. 

"""

# Django
from channels.db import database_sync_to_async as db_s2a

# Standard
import logging, time
logger = logging.getLogger(__name__)

# Imports from this project
from ....services.db_services import ChatService
from ....services             import logging_utils       as lu
from    .logging              import ChatListenerLogging as log


# ================================================================================
# [ChatListener] On-Connection Data Helpers
# ================================================================================
def format_message_history(messages):
    """ Message history format helper (the "data" field). """
    return [{
        "role"   : m.role,
        "content": m.content,
        "ts"     : m.ts.timestamp(),
    } for m in messages]

def format_biomarker_history(biomarkers):
    """ Biomarker history format helper (the "data" field). """
    return [{
        "ts"    : bio.ts.timestamp(),
        "scores": { f"{bio.score_type.lower()}": bio.score }
    } for bio in biomarkers]

# --------------------------------------------------------------------------------
# Collect and send all data required on-connection
# --------------------------------------------------------------------------------
async def send_initial_data(session_data, consumer):
    """
    On-connection with a frontend client, we want to send them three initial sets
    of data to populate the UI.
      1) "session_info"      : Meta data about the user (primary) and chat session
      2) "message_history"   : All existing messages in the chat
      3) "biomarker_history" : All existing biomarkers from the chat
    """
    # Get DB objects from the provided 'session_info'
    session   = session_data["session"]
    chat_user = session_data["user"   ]

    # 1) Create "session_info" with the required fields 
    start_dt = await ChatService.get_start_ts(session)
    session_info = {
        "sessionId"   : session.id,
        "username"    : getattr(chat_user, "username", str(chat_user)),
        "source"      : getattr(session,   "source",   "unknown"     ),
        "isActive"    : getattr(session,   "is_active", None         ),
        "startTs"     : start_dt.timestamp() if start_dt else None,
        "messageCount": 0, # TODO: This just needs to be handled on the frontend
    }
    await consumer.send_json({"type": "session_info", "data": session_info})

    # 2) Load all existing MESSAGES for the session & format them for the frontend client
    messages = await db_s2a(lambda: list(session.messages.all().order_by("ts")))()
    message_history = format_message_history(messages)    
    await consumer.send_json({"type": "message_history", "data": message_history})

    # 3) Load all existing BIOMARKERS for the session & format them for the frontend client
    biomarkers = await db_s2a(lambda: list(session.biomarker_scores.all().order_by("ts")))()
    biomarker_history = format_biomarker_history(biomarkers)    
    await consumer.send_json({"type": "biomarker_history", "data": biomarker_history})

    # 4) Return the final count of initial messages and biomarkers sent
    return len(message_history), len(biomarker_history)
