from django.db    import transaction
from django.utils import timezone
from ..models     import ChatSession, ChatMessage, ChatBiomarkerScore

from .. import config as cf
from .db_helpers import get_sentiment_topics

import logging
logger = logging.getLogger(__name__)

# =======================================================================
# Service for working with chat data
# =======================================================================
# --- ToDo: Need to add topic/sentiment fields, probably on close ---
# --- ToDo: If chat hasn't been modified in X time, save it and remake one automatically ---
# Later on may need to specifically add start/end timestamps to chats/messages
"""

        sentiment = "N/A"
        topics = "N/A"
        message_text = get_message_text(messages)
        try:
            sentiment = sentiment_scores(message_text)
            topics = get_topics(message_text)
        except Exception as e:
            print(e)
            pass  # If there is an error in extracting sentiment or topics, we will return "N/A"
        

        
def get_sentiment_topics(data_messages):
    message_text = get_message_text(data_messages)

    # Sentiment
    try:    sentiment = sentiment_scores(message_text)
    except: sentiment = "N/A"

    # Topics
    try:    topics = get_topics(message_text)
    except: topics = "N/A"

    return sentiment, topics

"""

class ChatService:
    # -----------------------------------------------------------------------
    # Session Helpers
    # -----------------------------------------------------------------------
    @staticmethod
    @transaction.atomic
    def get_or_create_active_session(user, *, source="webapp"):
        """
        Returns the single active ChatSession for the user or creates one if needed.
        Wrapped in a transaction to avoid problems from things like two cuncurrent requests.
        """
        session, created = (ChatSession.objects.select_for_update().get_or_create(user=user, source=source, is_active=True))
        return session
    
    @staticmethod
    @transaction.atomic
    def close_session(user, session, *, source="webapp", notes=None, sentiment=None, topics=None):
        """
        Marks the current session inactive, fills in "ended_at", stores 
        optional metadata, and immediately opens a fresh/blank session.
        """
        session.is_active = False
        session.end_ts    = timezone.now()

        # -----------------------------------------------------------------------
        # Get all messages for this session
        # ----------------------------------------------------------------------- 
        msgs = (ChatMessage.objects
           .filter(session=session)             # could also stack .filter(role="user")
           .order_by("ts")                      # or "start_ts", "id" ?
           .values_list("content", flat=True))  # returns a queryset of strings
        
        sentiment, topics = get_sentiment_topics(msgs)

        # ToDo: Probably should calculate the topics and sentiment right here using helper functions
        # Topics and sentiment won't be sent as arguments, they will be calculated here
        if notes     is not None: session.notes     = notes
        if topics    is not None: session.topics    = topics
        if sentiment is not None: session.sentiment = sentiment
        session.save()
       
        logger.info(f"{cf.RLINE_1}{cf.RED}[DB] ChatSession closed for {user.username} {cf.RESET}{cf.RLINE_2}")
        return session
    
    # -----------------------------------------------------------------------
    # Message & Biomarker Score Helpers
    # -----------------------------------------------------------------------
    # Messages
    @staticmethod
    def add_message(session, role, text, *, start_ts=None, end_ts=None):
        return ChatMessage.objects.create(session=session, role=role, content=text, start_ts=start_ts, end_ts=end_ts)
    
    # Biomarker Scores
    @staticmethod
    def add_biomarker(session, score_type, score):
        return ChatBiomarkerScore.objects.create(session=session, score_type=score_type, score=score)
    
    @staticmethod
    def add_biomarkers_bulk(session, scores: dict):
        ChatBiomarkerScore.objects.bulk_create([ChatBiomarkerScore(session=session, score_type=k, score=v) for k, v in scores.items()])

  