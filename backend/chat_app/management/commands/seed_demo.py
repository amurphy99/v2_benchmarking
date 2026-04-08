"""
Seed demo data into the database.
--------------------------------------------------------------------------------
`backend.chat_app.management.commands.seed_demo`

Two seeding modes are controlled by the constants below:
  - REMAKE_SAMPLE_DATA   : wipe and recreate the random demo chats (source="demo", hidden from admin views)
  - REMAKE_ANALYZED_DATA : wipe and recreate the fixed-transcript chats (source="webapp", visible to admins)

"""
import asyncio, json as json_lib
from datetime  import timedelta, time
from pathlib   import Path
from random    import random

from django.core.management.base import BaseCommand
from django.db                   import transaction
from django.utils                import timezone
from django.contrib.auth         import get_user_model

from chat_app.models                                   import Profile, Account, Access, UserSettings, Goal, Reminder, Activity, RAGInstructions
from chat_app.models                                   import ChatSession, ChatMessage, ChatBiomarkerScore, AlbumImage
from chat_app.services.llm.non_chat.post_chat_analysis import post_chat_analysis
from chat_app.services.db_services                     import ChatService
from rag_vectorstore.services.vdb_services             import index_single_instruction

from ._seed_demo_data import (
    BIOMARKERS, DEMO_MESSAGES, DEMO_MESSAGES_ALERT,
    DEMO_RAG_NAMES, DEMO_RAG_DESCRIPTIONS, DEMO_RAG_INSTRUCTIONS, DEMO_IMAGES,
)


# --------------------------------------------------------------------------------
# Config
# --------------------------------------------------------------------------------
# Set to True to wipe and recreate all existing random demo data on each run.
REMAKE_SAMPLE_DATA   = False

# Set to True to wipe and recreate the analyzed demo chats (fixed-transcript chats under buddy_user).
REMAKE_ANALYZED_DATA = False


# ================================================================================
# Seed default demo data into the DB 
# ================================================================================
class Command(BaseCommand):

    @transaction.atomic
    def handle(self, *args, **kwargs):
        if REMAKE_SAMPLE_DATA:
            AlbumImage.objects.all().delete()
            self.seed_images()

        two_days_ago = timezone.localdate() - timedelta(days=2)

        # --------------------------------------------------------------------------------
        # Profile 1: demo_patient & demo_caregiver
        # --------------------------------------------------------------------------------
        # Using get_or_create so the user_id stays stable across runs.
        # Stable IDs prevent dangling vector DB embeddings (linked by user_id across DBs).
        plwd = self.get_or_create_demo_user("demo_patient",   password="1", first_name="John", last_name="Patient"  )
        care = self.get_or_create_demo_user("demo_caregiver", password="1", first_name="Jane", last_name="Caregiver", is_staff=True)

        plwd_account, _ = Account.objects.get_or_create(user=plwd, defaults={"role": "patient"  })
        care_account, _ = Account.objects.get_or_create(user=care, defaults={"role": "caregiver"})
        profile, _      = Profile.objects.get_or_create(account=plwd_account, defaults={"zipcode": "9999", "birthDate": timezone.now(), "locationStatus": "alone"})

        Access      .objects.get_or_create(account=care_account, profile=profile)
        UserSettings.objects.get_or_create(profile=profile)
        Goal        .objects.get_or_create(profile=profile, defaults={"target": 5, "start_date": two_days_ago})

        if REMAKE_SAMPLE_DATA:
            self.seed_chats    (profile, days_back=10)
            self.seed_reminders(profile, num_reminders=5)

        # --------------------------------------------------------------------------------
        # Profile 2: buddy_user & buddy_care
        # --------------------------------------------------------------------------------
        plwd_2 = self.get_or_create_demo_user("buddy_user", password="1", first_name="Buddy", last_name="Robot"    )
        care_2 = self.get_or_create_demo_user("buddy_care", password="1", first_name="Buddy", last_name="Caregiver", is_staff=True)

        plwd_account_2, _ = Account.objects.get_or_create(user=plwd_2, defaults={"role": "patient"  })
        care_account_2, _ = Account.objects.get_or_create(user=care_2, defaults={"role": "caregiver"})
        profile_2, _      = Profile.objects.get_or_create(account=plwd_account_2, defaults={"zipcode": "9999", "birthDate": timezone.now(), "locationStatus": "alone"})

        Access      .objects.get_or_create(account=care_account_2, profile=profile_2)
        UserSettings.objects.get_or_create(profile=profile_2)
        Goal        .objects.get_or_create(profile=profile_2, defaults={"target": 5, "start_date": two_days_ago})

        if REMAKE_SAMPLE_DATA:
            self.seed_chats         (profile_2, days_back=10)
            self.seed_reminders     (profile_2, num_reminders=5)
            self.seed_activities    ()
            self.seed_rag_instructions()

        if REMAKE_ANALYZED_DATA:
            ChatSession.objects.filter(profile=profile_2, source="webapp").delete()
            self.seed_analyzed_chats(profile_2, plwd_2)
        
        # Grant is_staff to an existing user account
        # This is just a temporary solution for testing the admin interface.
        User = get_user_model()
        add_sup = User.objects.filter(username="AdnanSadi2").first()
        if add_sup and (not add_sup.is_staff or not add_sup.is_superuser):
            add_sup.is_staff = True
            add_sup.is_superuser = True
            add_sup.save(update_fields=["is_staff", "is_superuser"])

    # ================================================================================
    # User Setup
    # ================================================================================
    def get_or_create_demo_user(self, username, **kwargs):
        User     = get_user_model()
        password = kwargs.pop("password", "1")

        user, created = User.objects.get_or_create(username=username, defaults=kwargs)

        # Always ensure password and profile fields are up to date
        changed = False
        for k, v in kwargs.items():
            if getattr(user, k, None) != v: setattr(user, k, v); changed = True
        user.set_password(password); changed = True
        if changed: user.save()

        # Delete linked data when remaking (keeps the same user_id to avoid dangling vector DB entries)
        if not created and REMAKE_SAMPLE_DATA: self.delete_user_data(user)

        return user

    def delete_user_data(self, user):
        account = Account.objects.filter(user=user).first()
        if not account: return

        RAGInstructions.objects.filter(user=user).delete()

        # User's account is the primary account on a Profile
        try:   
            profile = Profile.objects.get(account=account)
            Goal        .objects.filter(profile=profile).delete()
            UserSettings.objects.filter(profile=profile).delete()
            ChatSession .objects.filter(profile=profile).delete()
            profile.delete()

        # User's account is a secondary (caregiver) account linked via Access
        except Profile.DoesNotExist:
            try:   
                access  = Access.objects.get(account=account)
                profile = access.profile
                Goal        .objects.filter(profile=profile).delete()
                UserSettings.objects.filter(profile=profile).delete()
                ChatSession .objects.filter(profile=profile).delete()
                profile.delete()

            # Account exists but is not linked to any profile; nothing to clean up
            except Access.DoesNotExist:
                pass  

        account.delete()

    # ================================================================================
    # AlbumImages
    # ================================================================================
    def seed_images(self):
        for img in DEMO_IMAGES:
            AlbumImage.objects.create(
                topic            = img["topic"],
                url              = img["url"],
                photographer     = img["photographer"],
                photographer_url = img["photographer_url"],
            )

    # ================================================================================
    # ChatSessions (random demo data — source="demo" is hidden from admin views)
    # ================================================================================
    def seed_chats(self, profile, days_back=6):
        now_utc = timezone.now()

        for i in range(1, days_back + 1):
            started_at = (now_utc - timedelta(days=i)).replace(hour=9, minute=0, second=0, microsecond=0)
            ended_at   =  started_at + timedelta(minutes=5)
            image      =  AlbumImage.objects.get(topic=DEMO_IMAGES[i % len(DEMO_IMAGES)]["topic"])
            session    = ChatSession.objects.create(profile=profile, source="demo", is_active=False, end_ts=ended_at,
                                                    topics=["Moon Landing", "Granddaughter", "Gardening", "Morning Routine"],
                                                    sentiment="Positive", image=image)
            session.date = started_at
            session.save(update_fields=["date"])

            for idx, text in enumerate(DEMO_MESSAGES):
                ts   = started_at + timedelta(seconds=20 * idx)
                role = "user" if idx % 2 == 0 else "assistant"
                m    = ChatMessage.objects.create(session=session, role=role, content=text, start_ts=ts, end_ts=ts + timedelta(seconds=20))
                m.ts = ts; m.save(update_fields=["ts"])

            for j in range(3):
                ts = started_at + timedelta(seconds=40 * j + 20)
                for score_type in BIOMARKERS:
                    s    = ChatBiomarkerScore.objects.create(session=session, score_type=score_type, score=round(random(), 3))
                    s.ts = ts; s.save(update_fields=["ts"])

        # One session with negative sentiment / flagged content
        image        = AlbumImage.objects.get(topic=DEMO_IMAGES[0]["topic"])
        session      = ChatSession.objects.create(profile=profile, source="demo", is_active=False, end_ts=ended_at,
                                                  topics=["Moon Landing", "Granddaughter", "Gardening", "Morning Routine"],
                                                  sentiment="Negative", image=image)
        session.date = now_utc.replace(hour=9, minute=0, second=0, microsecond=0)
        session.save(update_fields=["date"])

        for idx, text in enumerate(DEMO_MESSAGES_ALERT):
            ts   = started_at + timedelta(seconds=20 * idx)
            role = "user" if idx % 2 == 0 else "assistant"
            m    = ChatMessage.objects.create(session=session, role=role, content=text, start_ts=ts, end_ts=ts + timedelta(seconds=20))
            m.ts = ts; m.save(update_fields=["ts"])

        for j in range(3):
            ts = started_at + timedelta(seconds=40 * j + 20)
            for score_type in BIOMARKERS:
                s    = ChatBiomarkerScore.objects.create(session=session, score_type=score_type, score=round(random(), 3))
                s.ts = ts; s.save(update_fields=["ts"])

    # ================================================================================
    # Reminders
    # ================================================================================
    def seed_reminders(self, profile, num_reminders=5):
        now_utc = timezone.now()

        for i in range(1, num_reminders + 1):
            start_day = (now_utc - timedelta(days=i)).date()
            Reminder.objects.create(profile=profile, title=f"Reminder {i}",
                                    start=start_day, end=start_day,
                                    startTime=time(0, 0, 0), endTime=time(2, 0, 0), daysOfWeek=[])

        # Repeating reminder
        Reminder.objects.create(profile=profile, title="Repeat reminder",
                                start    = now_utc.date(),
                                end      = (now_utc + timedelta(weeks=5)).date(),
                                startTime= time(0, 0, 0), endTime=time(2, 0, 0), daysOfWeek=[3])

    # ================================================================================
    # Activities & RAG Instructions
    # ================================================================================
    def seed_activities(self):
        Activity.objects.get_or_create(name="memory_activity")

    def seed_rag_instructions(self):
        User            = get_user_model()
        memory_activity = Activity.objects.get(name="memory_activity")
        demo_user       = User.objects.get(username="demo_caregiver")

        for idx, name in enumerate(DEMO_RAG_NAMES):
            obj, _ = RAGInstructions.objects.update_or_create(
                name=name, user=demo_user, activity=memory_activity,
                defaults={
                    "description"      : DEMO_RAG_DESCRIPTIONS[idx],
                    "instructions"     : DEMO_RAG_INSTRUCTIONS[idx],
                    "instruction_order": 1,
                },
            )
            try:    index_single_instruction(obj)
            except Exception as e: print(f"[VectorDB] Failed to index seeded instruction {obj.id}: {e}")

    # ================================================================================
    # Analyzed Chats (hardcoded transcripts -> post-chat analysis pipeline)
    # ================================================================================
    def seed_analyzed_chats(self, profile, user):
        """
        Builds sessions from the transcripts in seed_demo_examples.json, then runs the
        same post_chat_analysis() pipeline as close_session() to fill in summary,
        sentiment, topics, and risk fields. source="webapp" so admin views include them.
        """
        examples_path = Path(__file__).parent / "seed_demo_examples.json"
        examples = json_lib.loads(examples_path.read_text())
        now_utc  = timezone.now()

        for example in examples:
            started_at = (now_utc - timedelta(days=example["date_offset_days"])).replace(hour=10, minute=0, second=0, microsecond=0)
            ended_at   =  started_at + timedelta(minutes=8)

            # 1) Session
            session      = ChatSession.objects.create(profile=profile, source="webapp", is_active=False, end_ts=ended_at)
            session.date = started_at
            session.save(update_fields=["date"])

            # 2) Messages from transcript
            messages = []
            for idx, msg in enumerate(example["messages"]):
                ts   = started_at + timedelta(seconds=30 * idx)
                m    = ChatMessage.objects.create(session=session, role=msg["role"], content=msg["content"], start_ts=ts, end_ts=ts + timedelta(seconds=30))
                m.ts = ts; m.save(update_fields=["ts"])
                messages.append(m)

            # 3) Dummy biomarkers
            for j in range(3):
                ts = started_at + timedelta(seconds=40 * j + 20)
                for score_type in BIOMARKERS:
                    s    = ChatBiomarkerScore.objects.create(session=session, score_type=score_type, score=round(random(), 3))
                    s.ts = ts; s.save(update_fields=["ts"])

            # 4) Run post-chat analysis (same pipeline as close_session)
            analysis = asyncio.run(post_chat_analysis(messages))

            # 5) Save all analysis fields via the same helper used by close_session
            ChatService.save_session_fields(
                user, session, messages,
                summary     = analysis.get("summary",     None),
                sentiment   = analysis.get("sentiment",   None),
                emotion     = analysis.get("emotion",     None),
                topics      = analysis.get("topics",      None),
                risk_level  = analysis.get("risk_rating", None),
                risk_reason = analysis.get("risk_reason", None),
                risk_quotes = [q.strip() for q in analysis.get("risk_quotes", []) if q and q.strip()],
            )
