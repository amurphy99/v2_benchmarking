from django.core.management.base import BaseCommand
from django.db           import transaction
from django.utils        import timezone
from django.contrib.auth import get_user_model

from datetime        import timedelta, date, time
from random          import random
from chat_app.models import Profile, UserSettings, Goal, ChatSession, ChatMessage, ChatBiomarkerScore, Reminder, Activity, RAGInstructions, AlbumImage

# Demo data
USERNAMES     = ("demo_patient", "demo_caregiver", "buddy_user", "buddy_care")
BIOMARKERS    = ("alteredgrammar", "anomia", "pragmatic", "pronunciation", "prosody", "turntaking")
DEMO_MESSAGES = [
    "Hi, I'm the user.", 
    "Hello, how are you today?", 
    "I'm doing well, thank you!", 
    "Can you tell me about your day?", 
    "Sure. This morning I went for a walk.",
    "Did you enjoy your walk?",
    "Yes, I enjoyed my walk.",
]
DEMO_RAG_NAMES = [
    "start_conversation",
    "end_conversation",
    "initiate_smalltalk",
]
DEMO_RAG_DESCRIPTIONS = [
    "Instructions for starting a conversation with the user.",
    "Instructions for ending a conversation with the user.",
    "Instructions for initiating small talk with the user.",
]

DEMO_RAG_INSTRUCTIONS = [
    '''
    Purpose / Goal:
    Start the chat warmly, introduce yourself as QT Robot, and invite the user to share their name.

    When to use:
    At the very beginning of interaction, when there is no previous chat history with the user.
    ''',
    '''
    Purpose / Goal:
    Close the interaction on a positive emotional note so the user feels valued.

    When to use:
    After reflecting on fun and imaginative scenarios regarding the past and the future, gracefully bring an end to the conversation.
    ''',
    '''
    Purpose / Goal:
    Build rapport and make the user comfortable through short, pleasant conversation.

    When to use:
    •	Once the user replies or shares their name, transition naturally into light small talk or a fun, simple question about them. 
    •	Also, as a follow-up after the initial greetings phase, you will ask questions based on the user's response. The follow-up questions should be open-ended based on the user's response, such that the user can elaborate on the previously mentioned topic.
    ''',
]
DEMO_IMAGES = [
    {
        "topic": "Moon Landing",
        "url": "https://images.pexels.com/photos/41162/moon-landing-apollo-11-nasa-buzz-aldrin-41162.jpeg",
        "photographer": "Pixabay",
        "photographer_url": "https://www.pexels.com/@pixabay/"
    },
    {
        "topic": "Gardening",
        "url": "https://images.pexels.com/photos/5905352/pexels-photo-5905352.jpeg",
        "photographer": "Vanessa P",
        "photographer_url": "https://www.pexels.com/@vanessa-p-273294/"
    },
    {
        "topic": "Grandchildren",
        "url": "https://images.pexels.com/photos/6148876/pexels-photo-6148876.jpeg",
        "photographer": "RDNE Stock Project",
        "photographer_url": "https://www.pexels.com/@rdne/"
    },
    {
        "topic": "Walk",
        "url": "https://images.pexels.com/photos/631986/pexels-photo-631986.jpeg",
        "photographer": "Tobi",
        "photographer_url": "https://www.pexels.com/@pripicart/"
    }
]

class Command(BaseCommand):
    help = "Seeds demo users and a sample ChatSession with messages+biomarkers."

    # ====================================================================
    # Seed default demo data into the DB 
    # ====================================================================
    @transaction.atomic
    def handle(self, *args, **kwargs):
        # Delete and recreate AlbumImages first
        AlbumImage.objects.all().delete()
        self.seed_images()

        # Delete and recreate the user data, RAG instructions
        User = get_user_model()
        User.objects.filter(username__in=USERNAMES).delete()

        # Setup for Goal creation
        two_days_ago = timezone.localdate() - timedelta(days=2)

        # Create user entries for both the patient and caregiver
        # I added this so that the user_id does not change on every seed run. 
        # This could lead to dangling vector embeddings since they are linked to a separate DB using the user_id, and cascading delete won't work across DBs.
        plwd = self.get_or_create_demo_user("demo_patient",   password="1", first_name="John", last_name="Patient"  )
        care = self.get_or_create_demo_user("demo_caregiver", password="1", first_name="Jane", last_name="Caregiver", is_staff=True)
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
        plwd_2 = self.get_or_create_demo_user("buddy_user", password="1", first_name="Buddy", last_name="Robot"    )
        care_2 = self.get_or_create_demo_user("buddy_care", password="1", first_name="Buddy", last_name="Caregiver")
        profile_2 = Profile.objects.create(plwd=plwd_2, caregiver=care_2)

        UserSettings.objects.create(user=profile_2)
        Goal        .objects.create(user=profile_2, target=5, start_date=two_days_ago)
        self.seed_chats(plwd_2, days_back=10)
        self.seed_reminders(profile_2, num_reminders=5)
        self.seed_activities()
        self.seed_rag_instructions()

    # ====================================================================
    # Helper: Get user if exists (cleaning their data), or create new
    # ====================================================================
    def get_or_create_demo_user(self, username, **kwargs):
        User = get_user_model()
        # Try to fetch the existing user to preserve their ID
        user, created = User.objects.get_or_create(username=username, defaults=kwargs)
        
        if not created:
            # If user exists, update their details just in case they changed
            for k, v in kwargs.items():
                if k != 'password':
                    setattr(user, k, v)
            user.set_password(kwargs.get('password', '1'))
            user.save()
            
            # Delete Profiles linked to this user
            Profile.objects.filter(plwd=user).delete()
            Profile.objects.filter(caregiver=user).delete()
            
            # Delete other direct relations
            ChatSession.objects.filter(user=user).delete()
            RAGInstructions.objects.filter(user=user).delete()
            
        return user

    # Seed AlbumImages into the DB
    # ====================================================================
    def seed_images(self):
        for img in DEMO_IMAGES:
            album_image = AlbumImage.objects.create(topic=img["topic"], url=img["url"], photographer=img["photographer"], photographer_url=img["photographer_url"])
            album_image.save()
            
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
            
            topic = DEMO_IMAGES[i % len(DEMO_IMAGES)]['topic']
            image = AlbumImage.objects.get(topic=topic)

            # 1) Create a ChatSession object
            session = ChatSession.objects.create(user=plwd_user, source="webapp", is_active=False, end_ts=ended_at, 
                                                 topics="['Moon Landing','Granddaughter','Gardening','Morning Routine']",
                                                 sentiment="Positive", image=image)
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

    # ====================================================================
    # Seed Activities into the DB
    # ====================================================================
    def seed_activities(self):
        # just one for now
        Activity.objects.get_or_create(name="memory_activity")  # don't create if already exists.
        
    # ====================================================================
    # Seed RAG Instructions into the DB
    # ====================================================================
    def seed_rag_instructions(self):
        User = get_user_model()
        memory_activity = Activity.objects.get(name="memory_activity")
        demo_user = User.objects.get(username="demo_caregiver")

        for idx, name in enumerate(DEMO_RAG_NAMES):
            description = DEMO_RAG_DESCRIPTIONS[idx]
            instructions = DEMO_RAG_INSTRUCTIONS[idx]
            RAGInstructions.objects.create(
                name=name,
                description=description,
                instructions=instructions,
                user=demo_user,
                activity=memory_activity,
            )