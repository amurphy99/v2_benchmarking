"""
Service for working with chat data
--------------------------------------------------------------------------------
`backend.chat_app.services.db_services`

TODO: Need to add topic/sentiment fields, probably on close ?
TODO: If chat hasn't been modified in X time, save it and remake one automatically

Later on may need to specifically add start/end timestamps to chats/messages...

"""

from django.db    import transaction
from django.utils import timezone

from channels.db      import database_sync_to_async
from django.db.models import Min

import logging
logger = logging.getLogger(__name__)

# From this project
from ..models         import ChatSession, ChatMessage, ChatBiomarkerScore, UserSettings, AlbumImage
from ..api.mixins     import get_profile
from  .topicHelpers   import get_topics
from  .emotionHelpers import classify_emotion_with_vader
from  .imageHelpers   import get_images
from  .               import logging_utils as lu

# ================================================================================
# ChatService
# ================================================================================
class ChatService:
    """
    ChatListenerConsumer
    --------------------
    Service for working with chat data.

    """
    # --------------------------------------------------------------------------------
    # Session Helpers
    # --------------------------------------------------------------------------------
    @staticmethod
    @transaction.atomic
    def get_or_create_active_session(user, *, source="webapp"):
        """
        Returns the single active ChatSession for the user or creates one if needed.
        Wrapped in a transaction to avoid problems from things like two cuncurrent requests.
        """
        profile = get_profile(user)
        session, created = (ChatSession.objects.select_for_update().get_or_create(profile=profile, source=source, is_active=True))
        return session
    
    # ================================================================================
    # Close Session
    # ================================================================================
    @staticmethod
    @transaction.atomic
    def close_session(user, session, *, source="webapp", notes=None, sentiment=None, topics=None):
        """
        * Marks the current session inactive
        * Fills in "ended_at"
        * Stores optional metadata
        * Immediately opens a fresh/blank session
        """
        session.is_active = False
        session.end_ts    = timezone.now()

        # --------------------------------------------------------------------------------
        # Get all messages for this session
        # -------------------------------------------------------------------------------- 
        msgs = (ChatMessage.objects
           .filter(session=session)             # could also stack .filter(role="user")
           .filter(role="user")
           .order_by("ts")                      # or "start_ts", "id" ?
           .values_list("content", flat=True))  # returns a queryset of strings
        
        messages     = [msg for msg in msgs]
        message_text = " ".join(messages)
        
        # --------------------------------------------------------------------------------
        # Topics & Sentiment (and Notes, but it is currently unused anyways...)
        # --------------------------------------------------------------------------------
        topics    = get_topics                 (message_text)
        sentiment = classify_emotion_with_vader(message_text)

        # Set sentiment and notes
        if sentiment is not None: session.sentiment = sentiment
        if notes     is not None: session.notes     = notes

        # Album Image
        if (topics is not None) and (len(topics) > 0): 
            session.topics = str(topics).strip()

            # See if there is already an image for the topic
            try:
                album_image = AlbumImage.objects.get(topic=topics[0])
                session.image = album_image
            
            # If there is not already an image for the topic, get a new one from Pexels
            except AlbumImage.DoesNotExist: 
                image = get_images(topics[0], "pexels", 1)
                if image is None:
                    image = get_images(topics[1], "pexels", 1)
                    if image is None:
                        image = {
                            "id"               : -1,
                            "topic"            :  "N/A",
                            "url"              : "https://images.pexels.com/photos/356079/pexels-photo-356079.jpeg",
                            "photographer"     : "Pixabay",
                            "photographer_url" : "https://www.pexels.com/@pixabay/"
                        }
                album_image = AlbumImage.objects.create(topic=image["topic"], url=image["url"], photographer=image["photographer"], photographer_url=image["photographer_url"])
                album_image.save()
                session.image = album_image

        # Changes to user ?        
        profile = get_profile(user)
        if profile is not None:
            settings = UserSettings.objects.get(profile=profile)
            session.taskType    = settings.taskType
            session.taskSubtype = settings.taskSubtype
        session.save()
       
        logger.info(f"{lu.RED}[DB] ChatSession closed for {user.username} {lu.RESET}")
        return session
    
    # --------------------------------------------------------------------------------
    # Manually close an active chat session
    # --------------------------------------------------------------------------------
    @staticmethod
    @transaction.atomic
    def close_any_active_session(user):
        profile = get_profile(user)
        qs = ChatSession.objects.select_for_update().filter(profile=profile, is_active=True)
        for s in qs:
            ChatService.close_session(user, s, source=s.source)
        
    # ================================================================================
    # Message & Biomarker Score Helpers
    # ================================================================================
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
    # ChatListener Helpers
    # ================================================================================
    @staticmethod
    def get_session_info(session_id):
        # Pull session + profile + account + user in one DB query
        session = (
            ChatSession.objects
            .select_related("profile", "profile__account", "profile__account__user")
            .get(id=session_id)
        )

        return {
            "session": session,
            "profile": session.profile,
            "account": session.profile.account,
            "user"   : session.profile.account.user,
        }
    
    # --------------------------------------------------------------------------------
    # Get the starting timestamp of a session
    # --------------------------------------------------------------------------------
    @staticmethod
    @database_sync_to_async
    def get_start_ts(session):
        biomarker_ts = session.biomarker_scores.aggregate(min_ts=Min("ts"))["min_ts"]
        message_ts   = session.messages        .aggregate(min_ts=Min("ts"))["min_ts"]
        timestamps   = [ts for ts in [biomarker_ts, message_ts] if ts is not None]
        return min(timestamps) if timestamps else None
