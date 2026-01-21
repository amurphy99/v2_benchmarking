from django.core.management.base import BaseCommand
from django.db           import transaction
from django.utils        import timezone
from django.contrib.auth import get_user_model

from datetime        import timedelta, date, time
from random          import random
from chat_app.models import Profile, UserSettings, Goal, ChatSession, ChatMessage, ChatBiomarkerScore, Reminder

# Demo data
USERNAMES     = ("demo_patient", "demo_caregiver", "buddy_user", "buddy_care")
BIOMARKERS    = ("alteredgrammar", "anomia", "pragmatic", "pronunciation", "prosody", "turntaking")
DEMO_MESSAGES = [
    "Hi, I'm the user.", 
    "Hello, how are you today?", 
    "I'm doing well, thank you!", 
    "Can you tell me about your day?", 
    "Sure. This morning I went for a walk.",
]


class Command(BaseCommand):
    help = "Seeds demo users and a sample ChatSession with messages+biomarkers."

    # ====================================================================
    # Seed default demo data into the DB 
    # ====================================================================
    @transaction.atomic
    def handle(self, *args, **kwargs):
        # Delete and recreate the user data
        User = get_user_model()
        User.objects.filter(username__in=USERNAMES).delete()

        # Setup for Goal creation
        two_days_ago = timezone.localdate() - timedelta(days=2)

        # Create user entries for both the patient and caregiver
        plwd = User.objects.create_user("demo_patient",   password="1", first_name="John", last_name="Patient"  )
        care = User.objects.create_user("demo_caregiver", password="1", first_name="Jane", last_name="Caregiver", is_staff=True)
        profile = Profile.objects.create(plwd=plwd, caregiver=care)

        # Also create settings and goal objects for the new Profile
        UserSettings.objects.create(user=profile)
        Goal        .objects.create(user=profile, target=5, start_date=two_days_ago)

        # Add sample ChatSessions
        self.seed_chats(plwd, days_back=10)
        
        # Add sample Reminders
        self.seed_reminders(profile, num_reminders=5)

        # --------------------------------------------------------------------
        # Second profile
        # --------------------------------------------------------------------
        plwd_2 = User.objects.create_user("buddy_user", password="1", first_name="Buddy", last_name="Robot"    )
        care_2 = User.objects.create_user("buddy_care", password="1", first_name="Buddy", last_name="Caregiver")
        profile_2 = Profile.objects.create(plwd=plwd_2, caregiver=care_2)

        UserSettings.objects.create(user=profile_2)
        Goal        .objects.create(user=profile_2, target=5, start_date=two_days_ago)
        self.seed_chats(plwd_2, days_back=10)
        self.seed_reminders(profile_2, num_reminders=5)


    # ====================================================================
    # Seed ChatSessions into the DB for a user
    # ====================================================================
    def seed_chats(self, plwd_user, days_back=6):
        # Times for everything need to override "auto_now_add" field properties
        now_utc = timezone.now()
        for i in range(1, days_back+1):
            day_offset = timedelta(days=i)
            started_at = (now_utc - day_offset).replace(hour=9, minute=0, second=0, microsecond=0)
            ended_at   = started_at + timedelta(minutes=5)

            # 1) Create a ChatSession object
            session = ChatSession.objects.create(user=plwd_user, source="webapp", is_active=False, end_ts=ended_at)
            session.date = started_at
            session.save(update_fields=["date"])

            # 2) Add ChatMessages to the ChatSession (message timestamps spaced 20 seconds apart)
            for idx, text in enumerate(DEMO_MESSAGES):
                ts   = started_at + timedelta(seconds=20 * idx)
                role = "user" if idx % 2 == 0 else "assistant"
                message = ChatMessage.objects.create(session=session, role=role, content=text, start_ts=ts, end_ts=(ts + timedelta(seconds=20)))
                message.ts = ts
                message.save(update_fields=["ts"])

            # 3) Add ChatBiomarkerScores to the ChatSession (random scores)
            for j in range(3):
                ts = started_at + timedelta(seconds=40 * j + 20)
                for score_type in BIOMARKERS:
                    score = ChatBiomarkerScore.objects.create(session=session, score_type=score_type, score=round(random(), 3), ts=ts)
                    score.ts = ts
                    score.save(update_fields=["ts"])

            #print(f"Seeded ChatSession for {(now_utc - day_offset).date()}")
            
     # ====================================================================
    # Seed Reminders into the DB for a user
    # ====================================================================
    def seed_reminders(self, plwd, num_reminders=5):
        now_utc = timezone.now()
        for i in range(1, num_reminders+1):
            day_offset = timedelta(days=i)
            
            start_day = (now_utc - day_offset).date()
            end_day   = start_day
            start_time = time(0, 0, 0)
            end_time = time(2, 0, 0)
            title = f"Reminder {i}"

            # Create a Reminder object
            reminder = Reminder.objects.create(user=plwd, title=title, start=start_day, end=end_day, 
                                               startTime=start_time, endTime=end_time, daysOfWeek=[])
            reminder.save()
            
        # Create repeating Reminder
        start_day = now_utc.date()
        end_day = (now_utc + timedelta(weeks=5)).date()
        start_time = time(hour=0, minute=0, second=0)
        end_time = time(hour=2, minute=0, second=0)
        reminder = Reminder.objects.create(user=plwd, title="Repeat reminder", start=start_day, 
                                           end=end_day, startTime=start_time, endTime=end_time,
                                           daysOfWeek=[3])
        reminder.save()