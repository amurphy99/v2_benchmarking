from django.core.management.base import BaseCommand
from django.db           import transaction
from django.utils        import timezone
from django.contrib.auth import get_user_model

from datetime        import timedelta, date, time
from random          import random
from chat_app.models import Profile, Account, Access, UserSettings, Goal, ChatSession, ChatMessage, ChatBiomarkerScore, Reminder, Activity, RAGInstructions, AlbumImage
from rag_vectorstore.services.vdb_services import index_single_instruction

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
DEMO_MESSAGES_ALERT = [
    "Hi, I'm the user. I was feeling sad today.",
    "Why were you feeling sad today?",
    "I was feeling lonely and down.",
    "I'm sorry to hear that."
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
        # User = get_user_model()
        # User.objects.filter(username__in=USERNAMES).delete()

        # Setup for Goal creation
        two_days_ago = timezone.localdate() - timedelta(days=2)

        # Create user entries for both the patient and caregiver
        # I added this so that the user_id does not change on every seed run. 
        # This could lead to dangling vector embeddings since they are linked to a separate DB using the user_id, and cascading delete won't work across DBs.
        plwd = self.get_or_create_demo_user("demo_patient",   password="1", first_name="John", last_name="Patient"  )
        care = self.get_or_create_demo_user("demo_caregiver", password="1", first_name="Jane", last_name="Caregiver", is_staff=True)
        plwd_account, _ = Account.objects.get_or_create(user=plwd, defaults={"role": "patient"})
        care_account, _ = Account.objects.get_or_create(user=care, defaults={"role": "caregiver"})
        profile, _ = Profile.objects.get_or_create(account=plwd_account,defaults={"zipcode": "9999", "birthDate": timezone.now(), "locationStatus": "alone",},)
        
        # Create an Access object so caregiver account can access the plwd account
        Access.objects.get_or_create(account=care_account, profile=profile)

        # Also create settings and goal objects for the new Profile
        UserSettings.objects.get_or_create(profile=profile)
        Goal        .objects.get_or_create(profile=profile, target=5, start_date=two_days_ago)
        # Add sample ChatSessions
        self.seed_chats(profile, days_back=10)
        
        # Add sample Reminders
        self.seed_reminders(profile, num_reminders=5)

        # --------------------------------------------------------------------
        # Second profile
        # --------------------------------------------------------------------
        plwd_2 = self.get_or_create_demo_user("buddy_user", password="1", first_name="Buddy", last_name="Robot"    )
        care_2 = self.get_or_create_demo_user("buddy_care", password="1", first_name="Buddy", last_name="Caregiver", is_staff=True)
        plwd_account_2, _ = Account.objects.get_or_create(user=plwd_2, defaults={"role": "patient"})
        care_account_2, _ = Account.objects.get_or_create(user=care_2, defaults={"role": "caregiver"})
        profile_2, _ = Profile.objects.get_or_create(account=plwd_account_2, defaults={"zipcode": "9999", "birthDate": timezone.now(), "locationStatus": "alone",})
        
        # Create an Access object so caregiver account can access the plwd account
        Access.objects.get_or_create(account=care_account_2, profile=profile_2)

        UserSettings.objects.get_or_create(profile=profile_2)
        Goal        .objects.get_or_create(profile=profile_2, target=5, start_date=two_days_ago)
        self.seed_chats(profile_2, days_back=10)
        self.seed_reminders(profile_2, num_reminders=5)
        self.seed_activities()
        self.seed_rag_instructions()
    
    # ====================================================================
    # Helper: Deletes all data associated with a user, such as Account, Profile, Settings, etc
    # ====================================================================
    def delete_user_data(self, user):
        account = Account.objects.filter(user=user).first()
        # if there is no account linked to this user, then there is no data to delete, so we can just return.
        if not account:
            return

        RAGInstructions.objects.filter(user=user).delete()
        try: # The case where this user's account is the main account of a Profile object
            profile = Profile.objects.get(account=account)
            Goal.objects.get(profile=profile).delete()
            UserSettings.objects.get(profile=profile).delete()
            ChatSession.objects.filter(profile=profile).delete()
            profile.delete()
        except Profile.DoesNotExist: # The case where this user's account is a secondary account of a Profile object
            try: # The case where this user's account is linked to a Profile
                access = Access.objects.get(account=account)
                profile = access.profile
                Goal.objects.get(profile=profile).delete()
                UserSettings.objects.get(profile=profile).delete()
                ChatSession.objects.filter(profile=profile).delete()
                profile.delete()
            except Access.DoesNotExist: # The case where this user's account is not linked to anything; do nothing
                pass
        account.delete()

    # ====================================================================
    # Helper: Get user if exists (cleaning their data), or create new
    # ====================================================================
    def get_or_create_demo_user(self, username, **kwargs):
        User = get_user_model()
        password = kwargs.pop("password", "1")

        user, created = User.objects.get_or_create(username=username, defaults=kwargs)

        # Always ensure password is hashed and details are correct
        changed = False
        for k, v in kwargs.items():
            if getattr(user, k, None) != v:
                setattr(user, k, v)
                changed = True

        user.set_password(password)  # hashes properly
        changed = True

        if changed:
            user.save()

        # If user already existed, delete linked demo data (resetting the user but keeping the same user_id to avoid dangling vector DB entries)
        if not created:
            self.delete_user_data(user)

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
    def seed_chats(self, profile, days_back=6):
        # Times for everything need to override "auto_now_add" field properties
        now_utc = timezone.now()
        for i in range(1, days_back+1):
            day_offset = timedelta(days=i)
            started_at = (now_utc - day_offset).replace(hour=9, minute=0, second=0, microsecond=0)
            ended_at   = started_at + timedelta(minutes=5)
            
            topic = DEMO_IMAGES[i % len(DEMO_IMAGES)]['topic']
            image = AlbumImage.objects.get(topic=topic)

            # 1) Create a ChatSession object
            session = ChatSession.objects.create(profile=profile, source="demo", is_active=False, end_ts=ended_at, 
                                                 topics=["Moon Landing", "Granddaughter", "Gardening", "Morning Routine"],
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
        # Seed the chat that will have flagged words and sentiment
        topic = DEMO_IMAGES[0]['topic']
        image = AlbumImage.objects.get(topic=topic)

        # 1) Create a ChatSession object
        session = ChatSession.objects.create(profile=profile, source="demo", is_active=False, end_ts=ended_at, 
                                             topics=["Moon Landing", "Granddaughter", "Gardening", "Morning Routine"],
                                             sentiment="Negative", image=image)
        session.date = (now_utc).replace(hour=9, minute=0, second=0, microsecond=0)
        session.save(update_fields=["date"])

        # 2) Add ChatMessages to the ChatSession (message timestamps spaced 20 seconds apart)
        for idx, text in enumerate(DEMO_MESSAGES_ALERT):
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
    def seed_reminders(self, profile, num_reminders=5):
        now_utc = timezone.now()
        for i in range(1, num_reminders+1):
            day_offset = timedelta(days=i)
            
            start_day = (now_utc - day_offset).date()
            end_day   = start_day
            start_time = time(0, 0, 0)
            end_time = time(2, 0, 0)
            title = f"Reminder {i}"

            # Create a Reminder object
            reminder = Reminder.objects.create(profile=profile, title=title, start=start_day, end=end_day, 
                                               startTime=start_time, endTime=end_time, daysOfWeek=[])
            reminder.save()
            
        # Create repeating Reminder
        start_day = now_utc.date()
        end_day = (now_utc + timedelta(weeks=5)).date()
        start_time = time(hour=0, minute=0, second=0)
        end_time = time(hour=2, minute=0, second=0)
        reminder = Reminder.objects.create(profile=profile, title="Repeat reminder", start=start_day, 
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
            obj, _ = RAGInstructions.objects.update_or_create(
                        name=name,
                        user=demo_user,
                        activity=memory_activity,
                        defaults={
                            "description": description,
                            "instructions": instructions,
                            "instruction_order": 1,
                        },
                    )

            try:
                index_single_instruction(obj)
            except Exception as e:
                print(f"[VectorDB] Failed to index seeded instruction {obj.id}: {e}")