from django.db    import transaction
from django.utils import timezone
from ..models     import ChatSession, ChatMessage, ChatBiomarkerScore

from .  import logging_utils as lu
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
       
        logger.info(f"{lu.RLINE_1}{lu.RED}[DB] ChatSession closed for {user.username} {lu.RESET}{lu.RLINE_2}")
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


    # ================================================================================
    # Service for working with chat data
    # ================================================================================
    @staticmethod
    @transaction.atomic
    def resume_session(user, session_id):
        """
        Reactivates an old session. 
        Handles the 'unique_active_session_per_user' constraint by closing or deleting the currently active session first.
        """
        # 1. Get the session we want to resume
        try:                             target_session = ChatSession.objects.get(id=session_id, user=user)
        except ChatSession.DoesNotExist: return None # Or raise an error

        # If it's already active, just return it
        if target_session.is_active: return target_session

        # 2. Handle the CURRENT active session (if any)
        # We must clear the 'active' slot to satisfy the UniqueConstraint
        current_active = ChatSession.objects.filter(user=user, is_active=True).first()
        
        if current_active:
            # Check if the current active session is "empty"
            has_messages = ChatMessage.objects.filter(session=current_active).exists()
            
            # If it's an empty placeholder, just delete it to keep DB clean
            # If it has content, close it gracefully so it saves to history
            if not has_messages: current_active.delete()
            else: ChatService.close_session(user, current_active)

        # 3. Reactivate the target session
        target_session.is_active = True
        
        # 4. Clear the "Finalized" metadata (since the chat is open again, the previous end time and analysis are invalid)
        target_session.end_ts    = None
        target_session.sentiment = "N/A" # Reset to default
        target_session.topics    = "N/A" # Reset to default
        
        target_session.save()
        
        logger.info(f"Resumed session {target_session.id} for user {user.username}")
        return target_session
    
    @staticmethod
    def get_last_closed_session_with_content(user):
        """
        Finds the most recent INACTIVE session that actually has messages.
        Useful for a 'Resume Last Chat' button.
        """
        last_session = (ChatSession.objects
            .filter(user=user, is_active=False)  # Only look at history (closed chats)
            .filter(messages__isnull=False)      # MUST have related messages (excludes empty chats)
            .distinct()                          # Required because filtering across a join can create duplicates
            .order_by("-date")                   # Newest first
            .first()                             # Return the top one or None
        )
        return last_session

  