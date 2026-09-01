"""
Create idempotent random demo fixtures for testing the user-facing interface.
--------------------------------------------------------------------------------
`backend.chat_app.management.seed_data.sample`

Seeding always preserves existing data and only creates data when it is missing.

NOTE: Random ChatSessions use `source="demo"` so admin views can omit them.

"""
import logging
logger = logging.getLogger(__name__)

from django.contrib.auth.base_user import AbstractBaseUser
from django.utils                  import timezone
from datetime                      import time, timedelta
from random                        import random

# From this project
from chat_app.models                       import Activity, AlbumImage, ChatBiomarkerScore, ChatMessage, ChatSession, Profile, RAGInstructions, Reminder
from chat_app.services.logging_utils       import RESET, SEED_DATA, SD_H, SD_R
from rag_vectorstore.services.vdb_services import index_single_instruction

# Demo data
from .transcript_data.data import BIOMARKERS, DEMO_IMAGES, DEMO_MESSAGES, DEMO_MESSAGES_ALERT, DEMO_RAG_DESCRIPTIONS, DEMO_RAG_INSTRUCTIONS, DEMO_RAG_NAMES


# ================================================================================
# AlbumImages
# ================================================================================
def seed_images() -> int:
    """
    Ensure each shared demo image exists by its unique topic. Known fixture fields
    follow the checked-in source data, while unrelated AlbumImage rows are untouched.
    """
    created_count = 0
    for image_data in DEMO_IMAGES:
        _, created = AlbumImage.objects.update_or_create(
            topic    = image_data["topic"],
            defaults = {
                "url"              : image_data["url"             ],
                "photographer"     : image_data["photographer"    ],
                "photographer_url" : image_data["photographer_url"],
            },
        )
        created_count += int(created)
    return created_count


# ================================================================================
# ChatSessions (random demo data - source="demo" is hidden from admin views)
# ================================================================================
def seed_chats(profile: Profile, days_back: int = 6) -> int:
    """
    Create the complete random chat fixture set only when this profile has no demo
    sessions. The command transaction keeps the set all-or-nothing during startup.
    """
    if ChatSession.objects.filter(profile=profile, source="demo").exists(): return 0

    now_utc = timezone.now()

    # Create one positive example per requested day
    for index in range(1, days_back + 1):
        started_at = (now_utc - timedelta(days=index)).replace(hour=9, minute=0, second=0, microsecond=0)
        ended_at   =  started_at + timedelta(minutes=5)
        image      =  AlbumImage.objects.get(topic=DEMO_IMAGES[index % len(DEMO_IMAGES)]["topic"])
        session    =  ChatSession.objects.create(
            profile   = profile,
            source    = "demo",
            is_active = False,
            end_ts    = ended_at,
            topics    = ["Moon Landing", "Granddaughter", "Gardening", "Morning Routine"],
            sentiment = "Positive",
            image     = image,
        )
        session.date = started_at
        session.save(update_fields=["date"])

        # Fill each session with alternating sample messages
        for message_index, text in enumerate(DEMO_MESSAGES):
            timestamp = started_at + timedelta(seconds=20 * message_index)
            role      = "user" if (message_index % 2 == 0) else "assistant"
            message   = ChatMessage.objects.create(
                session  = session,
                role     = role,
                content  = text,
                start_ts = timestamp,
                end_ts   = timestamp + timedelta(seconds=20),
            )
            message.ts = timestamp
            message.save(update_fields=["ts"])

        # Add placeholder biomarker rows for interface rendering
        for score_index in range(3):
            timestamp = started_at + timedelta(seconds=40 * score_index + 20)
            for score_type in BIOMARKERS:
                score    = ChatBiomarkerScore.objects.create(session=session, score_type=score_type, score=round(random(), 3))
                score.ts = timestamp
                score.save(update_fields=["ts"])

    # Add one recent negative-sentiment example
    started_at = now_utc.replace(hour=9, minute=0, second=0, microsecond=0)
    ended_at   = started_at + timedelta(minutes=5)
    image      = AlbumImage.objects.get(topic=DEMO_IMAGES[0]["topic"])
    session    = ChatSession.objects.create(
        profile   = profile,
        source    = "demo",
        is_active = False,
        end_ts    = ended_at,
        topics    = ["Moon Landing", "Granddaughter", "Gardening", "Morning Routine"],
        sentiment = "Negative",
        image     = image,
    )
    session.date = started_at
    session.save(update_fields=["date"])

    for message_index, text in enumerate(DEMO_MESSAGES_ALERT):
        timestamp = started_at + timedelta(seconds=20 * message_index)
        role      = "user" if (message_index % 2 == 0) else "assistant"
        message   = ChatMessage.objects.create(
            session  = session,
            role     = role,
            content  = text,
            start_ts = timestamp,
            end_ts   = timestamp + timedelta(seconds=20),
        )
        message.ts = timestamp
        message.save(update_fields=["ts"])

    for score_index in range(3):
        timestamp = started_at + timedelta(seconds=40 * score_index + 20)
        for score_type in BIOMARKERS:
            score    = ChatBiomarkerScore.objects.create(session=session, score_type=score_type, score=round(random(), 3))
            score.ts = timestamp
            score.save(update_fields=["ts"])

    return days_back + 1


# ================================================================================
# Reminders
# ================================================================================
def seed_reminders(profile: Profile, num_reminders: int = 5) -> int:
    """
    Create each named reminder only when it is absent. Existing reminders—including
    user edits to a matching fixture—are never overwritten by startup seeding.
    """
    now_utc = timezone.now()
    created = 0

    # Create the dated one-off reminders
    for index in range(1, num_reminders + 1):
        title = f"Reminder {index}"
        if Reminder.objects.filter(profile=profile, title=title).exists(): continue

        start_day = (now_utc - timedelta(days=index)).date()
        Reminder.objects.create(
            profile    = profile,
            title      = title,
            start      = start_day,
            end        = start_day,
            startTime  = time(0, 0, 0),
            endTime    = time(2, 0, 0),
            daysOfWeek = [],
        )
        created += 1

    # Create the repeating reminder separately
    if not Reminder.objects.filter(profile=profile, title="Repeat reminder").exists():
        Reminder.objects.create(
            profile    = profile,
            title      = "Repeat reminder",
            start      = now_utc.date(),
            end        = (now_utc + timedelta(weeks=5)).date(),
            startTime  = time(0, 0, 0),
            endTime    = time(2, 0, 0),
            daysOfWeek = [3],
        )
        created += 1

    return created


# ================================================================================
# Activities and RAG Instructions
# ================================================================================
def seed_activities() -> Activity:
    activity, _ = Activity.objects.get_or_create(name="memory_activity")
    return activity


# Ensure the checked-in instructions exist without overwriting later edits
def seed_rag_instructions(user: AbstractBaseUser) -> int:
    memory_activity = seed_activities()
    created_count   = 0

    for index, name in enumerate(DEMO_RAG_NAMES):
        instruction, created = RAGInstructions.objects.get_or_create(
            name     = name,
            user     = user,
            activity = memory_activity,
            defaults = {
                "description"       : DEMO_RAG_DESCRIPTIONS[index],
                "instructions"      : DEMO_RAG_INSTRUCTIONS[index],
                "instruction_order" : 1,
            },
        )
        created_count += int(created)

        # Re-index existing rows too in case the vector database was rebuilt separately
        try: index_single_instruction(instruction)
        except Exception:
            logger.exception(
                f"{SEED_DATA} Failed to index seeded RAG instruction "
                f"{SD_H}{instruction.id}{SD_R}.{RESET}"
            )

    return created_count
