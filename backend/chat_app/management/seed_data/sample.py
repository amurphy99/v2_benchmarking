"""
Random demo data seeding.
--------------------------------------------------------------------------------
`backend.chat_app.management.seed_data.sample`

Fills the DB with demo ChatSessions, Reminders, and RAG Instructions.

Only for the the user-facing web UI; admin views are configured to ignore these
sessions via the `source="demo"` tag.

"""
from datetime import timedelta, time
from random   import random

from django.utils        import timezone
from django.contrib.auth import get_user_model

# From this project
from chat_app.models import ChatSession, ChatMessage, ChatBiomarkerScore, Reminder, Activity, RAGInstructions, AlbumImage
from rag_vectorstore.services.vdb_services import index_single_instruction

# Demo data
from .transcript_data.data import BIOMARKERS, DEMO_MESSAGES, DEMO_MESSAGES_ALERT, DEMO_RAG_NAMES, DEMO_RAG_DESCRIPTIONS, DEMO_RAG_INSTRUCTIONS, DEMO_IMAGES


# ================================================================================
# AlbumImages
# ================================================================================
def seed_images():
    for img in DEMO_IMAGES:
        AlbumImage.objects.create(
            topic            = img["topic"],
            url              = img["url"],
            photographer     = img["photographer"],
            photographer_url = img["photographer_url"],
        )


# ================================================================================
# ChatSessions (random demo data - source="demo" is hidden from admin views)
# ================================================================================
def seed_chats(profile, days_back=6):
    now_utc = timezone.now()

    for i in range(1, days_back + 1):
        started_at = (now_utc - timedelta(days=i)).replace(hour=9, minute=0, second=0, microsecond=0)
        ended_at   =  started_at + timedelta(minutes=5)
        image      =  AlbumImage.objects.get(topic=DEMO_IMAGES[i % len(DEMO_IMAGES)]["topic"])
        session    =  ChatSession.objects.create(profile=profile, source="demo", is_active=False, end_ts=ended_at,
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

    # One session with negative sentiment
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
def seed_reminders(profile, num_reminders=5):
    now_utc = timezone.now()

    for i in range(1, num_reminders + 1):
        start_day = (now_utc - timedelta(days=i)).date()
        Reminder.objects.create(profile=profile, title=f"Reminder {i}",
                                start=start_day, end=start_day,
                                startTime=time(0, 0, 0), endTime=time(2, 0, 0), daysOfWeek=[])

    # Repeating reminder
    Reminder.objects.create(profile=profile, title="Repeat reminder",
                            start     = now_utc.date(),
                            end       = (now_utc + timedelta(weeks=5)).date(),
                            startTime = time(0, 0, 0), endTime=time(2, 0, 0), daysOfWeek=[3])


# ================================================================================
# Activities & RAG Instructions
# ================================================================================
def seed_activities():
    Activity.objects.get_or_create(name="memory_activity")

def seed_rag_instructions():
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
