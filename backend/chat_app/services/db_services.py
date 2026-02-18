"""
Service for working with chat data
--------------------------------------------------------------------------------
`backend.chat_app.services.db_services`

TODO: Need to add topic/sentiment fields, probably on close ?
TODO: If chat hasn't been modified in X time, save it and remake one automatically

TODO: When fully adding the LLM-based post-chat analysis, should find a way to make
      the existing stuff work as a backup...

Later on may need to specifically add start/end timestamps to chats/messages...

"""
import logging
logger = logging.getLogger(__name__)

# Django imports
from channels.db        import database_sync_to_async
from django  .db        import transaction
from django  .db.models import Min
from django  .utils     import timezone

# From this project
from ..models         import ChatSession, ChatMessage, ChatBiomarkerScore, UserSettings
from ..api.mixins     import get_profile
from  .               import logging_utils as lu

# Helpers
from  .chat_info.topicHelpers   import get_topics
from  .chat_info.emotionHelpers import classify_emotion_with_vader
from  .chat_info.imageHelpers   import get_image_for_topics

# Utilities for conducting the post-chat analysis via LLMs
from .llm.chat_utilities              import normalize_text
from .llm.non_chat.post_chat_analysis import post_chat_analysis


# ================================================================================
# Utility methods for other files to interact with the database
# ================================================================================
class ChatService:
    """
    Most methods here are wrapped as atomic transactions to avoid problems from things like two cuncurrent requests.
    """
    @staticmethod
    @transaction.atomic
    def get_or_create_active_session(user, *, source="webapp"):
        """ Returns the single active ChatSession for the user or creates one if needed. """
        profile = get_profile(user)
        session, created = (ChatSession.objects.select_for_update().get_or_create(profile=profile, source=source, is_active=True))
        return session

    # ===============================================================================
    # Close Session
    # ================================================================================
    @staticmethod 
    async def close_session(user, session, *, source="webapp", notes=None, sentiment=None, topics=None):
        """
        NOT an atomic transaction. All of the helpers are atomic, but the slower calls here from
        post-chat analysis and searching for images, so we do those outside of the DB calls.

        TODO: Might still need to do something with the source field...

        """
        # Get messages for the session & make sure it is valid
        valid, messages = await database_sync_to_async(ChatService.prepare_session_for_analysis)(user, session)
        if not valid: return None

        # Run a post-chat analysis to fill out the rest of the fields
        # TODO: Testing the new LLM-based post-chat analysis methods
        analysis = await post_chat_analysis(messages) # summary, topics, sentiment, emotion

        # Use the results to save the rest of the fields
        session = await database_sync_to_async(ChatService.save_session_fields)(
            user, session, messages, notes, sentiment, topics
        )

        # Done
        logger.info(f"{lu.RED}[DB] ChatSession closed for {user.username} {lu.RESET}")
        return session

    # --------------------------------------------------------------------------------
    # Methods to wrap with `database_sync_to_async` for DB saving
    # --------------------------------------------------------------------------------
    @staticmethod
    @transaction.atomic
    def prepare_session_for_analysis(user, session):
        # Set session to inactive & add the end timestamp
        session.is_active = False
        session.end_ts = timezone.now()

        # Retrieve messages for the session (includes user & assistant; reuse this so we only need one DB query)
        qs       = ChatMessage.objects.filter(session=session).order_by("ts", "id")
        messages = list(qs)  # converted to a list for object stability

        # If the session has no meaningful content, delete it and return None
        has_user_msgs = any((m.role == "user") and normalize_text(m.content) for m in messages)
        if not has_user_msgs:
            session_id = session.id
            session.delete()  # Cascades to ChatMessage because of foreign key on_delete=CASCADE
            logger.info(f"{lu.RED}[DB] Deleted empty ChatSession id={session_id} for {user.username}{lu.RESET}")
            return False, []

        # If valid, save the fields we changed & return the messages
        session.save(update_fields=["is_active", "end_ts"])
        return True, messages
    
    # Wrapper to do everything from `close_session` AFTER the async await
    # One method to wrap with `async_to_sync`
    @staticmethod
    @transaction.atomic
    def save_session_fields(user, session, messages, notes, sentiment, topics):
        # Set the topics TODO: if it works, these will come from analysis
        topics, sentiment = ChatService.set_analysis_fields(session, messages, notes=notes, sentiment=sentiment, topics=topics)
        
        # Get an AlbumImage for the session
        album_image = get_image_for_topics(topics)
        session.image = album_image
        
        # Get the chat type and subtype from the user's profile
        profile = get_profile(user)
        if profile is not None:
            settings = UserSettings.objects.get(profile=profile)
            session.taskType    = settings.taskType
            session.taskSubtype = settings.taskSubtype

        # Save & return the session
        session.save(update_fields=["image", "taskType", "taskSubtype"])
        return session


    # --------------------------------------------------------------------------------
    # Set post-chat analysis fields for the session (summary, topics, sentiment)
    # --------------------------------------------------------------------------------
    # TODO: this might just get added to `save_session_fields` later...
    @staticmethod 
    @transaction.atomic
    def set_analysis_fields(session, messages, notes=None, sentiment=None, topics=None):
        # Get ONLY message content ONLY for the user
        user_texts = [normalize_text(m.content) for m in messages if m.role == "user" and normalize_text(m.content)]
        message_text = " ".join(user_texts)

        if topics    is None: topics    = get_topics                 (message_text)
        if sentiment is None: sentiment = classify_emotion_with_vader(message_text)

        # Set sentiment and notes
        if sentiment is not None: session.sentiment = sentiment
        if notes     is not None: session.notes     = notes
        if topics    is not None: session.topics    = topics

        # Done; save and return topics
        session.save(update_fields=["topics", "sentiment", "notes"])
        return topics, sentiment






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
    
    # Get the starting timestamp of a session
    @staticmethod
    @database_sync_to_async
    def get_start_ts(session):
        biomarker_ts = session.biomarker_scores.aggregate(min_ts=Min("ts"))["min_ts"]
        message_ts   = session.messages        .aggregate(min_ts=Min("ts"))["min_ts"]
        timestamps   = [ts for ts in [biomarker_ts, message_ts] if ts is not None]
        return min(timestamps) if timestamps else None


