from django.db    import transaction
from django.utils import timezone
from ..models     import ChatSession, ChatMessage, ChatBiomarkerScore, UserSettings, AlbumImage

from .  import logging_utils as lu
from .topicHelpers import get_topics
from .emotionHelpers import classify_emotion_with_vader
from ..api.mixins import get_profile
from .imageHelpers import get_images

import logging
logger = logging.getLogger(__name__)

# =======================================================================
# Service for working with chat data
# =======================================================================
# --- ToDo: Need to add topic/sentiment fields, probably on close ---
# --- ToDo: If chat hasn't been modified in X time, save it and remake one automatically ---
# Later on may need to specifically add start/end timestamps to chats/messages

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
        profile = get_profile(user)
        session, created = (ChatSession.objects.select_for_update().get_or_create(profile=profile, source=source, is_active=True))
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
           .filter(role="user")
           .order_by("ts")                      # or "start_ts", "id" ?
           .values_list("content", flat=True))  # returns a queryset of strings
        messages = [msg for msg in msgs]
        message_text = " ".join(messages)
        topics = get_topics(message_text)
        sentiment = classify_emotion_with_vader(message_text)

        # ToDo: Probably should calculate the topics and sentiment right here using helper functions
        # Topics and sentiment won't be sent as arguments, they will be calculated here
        if notes     is not None: session.notes     = notes
        if sentiment is not None: session.sentiment = sentiment
        
        if topics    is not None and len(topics) > 0: 
            session.topics    = str(topics).strip()
            try: # See if there is already an image for the topic
                album_image = AlbumImage.objects.get(topic=topics[0])
                session.image = album_image
            except AlbumImage.DoesNotExist: # If there is not already an image for the topic, get a new one from Pexels
                image = get_images(topics[0], "pexels", 1)
                if image is None:
                    image = get_images(topics[1], "pexels", 1)
                    if image is None:
                        image = {
                            "id": -1,
                            "topic": "N/A",
                            "url": "https://images.pexels.com/photos/356079/pexels-photo-356079.jpeg",
                            "photographer": "Pixabay",
                            "photographer_url": "https://www.pexels.com/@pixabay/"
                        }
                album_image = AlbumImage.objects.create(topic=image["topic"], url=image["url"], photographer=image["photographer"], photographer_url=image["photographer_url"])
                album_image.save()
                session.image = album_image
        
        profile = get_profile(user)
        if profile is not None:
            settings = UserSettings.objects.get(profile=profile)
            session.taskType    = settings.taskType
            session.taskSubtype = settings.taskSubtype
        session.save()
       
        logger.info(f"{lu.RLINE_1}{lu.RED}[DB] ChatSession closed for {user.username} {lu.RESET}{lu.RLINE_2}")
        return session
    
    @staticmethod
    @transaction.atomic
    def close_any_active_session(user):
        profile = get_profile(user)
        qs = ChatSession.objects.select_for_update().filter(profile=profile, is_active=True)
        for s in qs:
            ChatService.close_session(user, s, source=s.source)
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

  