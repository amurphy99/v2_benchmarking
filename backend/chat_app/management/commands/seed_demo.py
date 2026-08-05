"""
Seed demo data into the database.
--------------------------------------------------------------------------------
`backend.chat_app.management.commands.seed_demo`

Three seeding modes are controlled by the constants below:
  - REMAKE_SAMPLE_DATA     : wipe and recreate the random demo chats (source="demo", hidden from admin views)
  - REMAKE_ANALYZED_DATA   : wipe and recreate the fixed-transcript chats (source="webapp", visible to admins)
  - REMAKE_TRANSCRIPT_DATA : wipe and recreate the CSV-imported transcript chat with word-level timestamps (source="transcript")

TODO: Should also make it just check to see if the demo data types exist and add them if not

"""
import os
from datetime import timedelta

# Django imports
from django.core.management.base import BaseCommand
from django.conf                 import settings as django_settings
from django.db                   import transaction
from django.utils                import timezone
from django.contrib.auth         import get_user_model

# From this project
from chat_app.models           import Profile, Account, Access, UserSettings, Goal, ChatSession, AlbumImage, RAGInstructions
from ..seed_data.sample        import seed_images, seed_chats, seed_reminders, seed_activities, seed_rag_instructions
from ..seed_data.analyzed      import seed_analyzed_chats
from ..seed_data.transcript    import seed_transcript_chat
from ...services.logging_utils import RESET, SEED_DATA, SD_H, SD_R


# --------------------------------------------------------------------------------
# Config (don't remake locally since I already have this stuff)
# --------------------------------------------------------------------------------
# If we are local or deployed (based on the .env file)
APP_ENVIRONMENT = os.getenv("APP_ENVIRONMENT", "sandbox")
LOCAL_MODE      = (APP_ENVIRONMENT == "local")

# Set to True to wipe and recreate all existing random demo data on each run.
REMAKE_SAMPLE_DATA = False # False # not LOCAL_MODE

# Set to True to wipe and recreate the analyzed demo chats (fixed-transcript chats under buddy_user).
REMAKE_ANALYZED_DATA = False # False # not LOCAL_MODE

# Set to True to wipe and recreate the CSV-imported transcript chat with real word-level timestamps.
REMAKE_TRANSCRIPT_DATA = True # False # not LOCAL_MODE


# ================================================================================
# Seed default demo data into the DB 
# ================================================================================
class Command(BaseCommand):

    # ================================================================================
    # Handle
    # ================================================================================
    @transaction.atomic
    def handle(self, *args, **kwargs):
        # Reference time points for sample data
        two_days_ago    = timezone.localdate() - timedelta(days= 2)
        seven_days_ago  = timezone.localdate() - timedelta(days= 7)
        thirty_days_ago = timezone.localdate() - timedelta(days=30)

        if REMAKE_SAMPLE_DATA:
            AlbumImage.objects.all().delete()
            seed_images()

        # --------------------------------------------------------------------------------
        # Create seeded users and chat data
        # --------------------------------------------------------------------------------
        # Create protected users (admin & demo data) using login info from the environment
        primary_admin, workshop_user = self.set_environment_users(days_ago=two_days_ago)

        # Setup dummy sample chat data (just random sentences; not shown on admin view)
        self.setup_dummy_chats(days_ago=thirty_days_ago)

        # Designated demo user/caregiver combo for the test conversations I saved
        self.setup_analyzed_data(days_ago=seven_days_ago)

        # --------------------------------------------------------------------------------
        # Other setup
        # --------------------------------------------------------------------------------
        # Close any sessions left active by a previous crash/restart
        closed = ChatSession.objects.filter(is_active=True).update(is_active=False, end_ts=timezone.now())
        if closed:
            self.stdout.write(self.style.WARNING(f"[seed_demo] Closed {closed} stale active session(s) on startup.{RESET}"))
        
        # Grant is_staff to an existing user account
        # This is just a temporary solution for testing the admin interface.
        User = get_user_model()
        add_sup = User.objects.filter(username="AdnanSadi2").first()
        if add_sup and (not add_sup.is_staff or not add_sup.is_superuser):
            add_sup.is_staff = True
            add_sup.is_superuser = True
            add_sup.save(update_fields=["is_staff", "is_superuser"])


    # ================================================================================
    # User Setup (handles remaking users)
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
            except Access.DoesNotExist:  pass

        account.delete()


    # ================================================================================
    # Setup IU testing users & data ("analyzed data")
    # ================================================================================
    def setup_analyzed_data(self, days_ago):
        """
        Designated demo user/caregiver combo for the test conversations I saved
        """
        # --------------------------------------------------------------------------------
        # Start by setting up the users & profile
        # --------------------------------------------------------------------------------
        # Caregiver is NOT an admin -- admin view/transcript data is now protected
        plwd_2 = self.get_or_create_demo_user("sample_user", password="1", first_name="Analysis", last_name="Tester"    )
        care_2 = self.get_or_create_demo_user("sample_care", password="1", first_name="Sample",   last_name="Caregiver", is_staff=False)

        # Setup account and profile objects
        plwd_account_2, _ = Account.objects.get_or_create(user=plwd_2, defaults={"role": "patient"  })
        care_account_2, _ = Account.objects.get_or_create(user=care_2, defaults={"role": "caregiver"})
        profile_2, _      = Profile.objects.get_or_create(account=plwd_account_2, defaults={"zipcode": "9999", "birthDate": timezone.now(), "locationStatus": "alone"})

        # Create other remaining related user objects
        Access      .objects.get_or_create(account=care_account_2, profile=profile_2)
        UserSettings.objects.get_or_create(profile=profile_2)
        Goal        .objects.get_or_create(profile=profile_2, defaults={"target": 5, "start_date": days_ago})

        # Close any sessions left active by a previous crash/restart
        closed = ChatSession.objects.filter(is_active=True).update(is_active=False, end_ts=timezone.now())
        if closed:
            self.stdout.write(self.style.WARNING(f"{SEED_DATA} Closed {SD_H}{closed}{SD_R} stale active session(s) on startup.{RESET}"))

        # --------------------------------------------------------------------------------
        # Remake sample data with the source set as this user
        # --------------------------------------------------------------------------------
        if REMAKE_SAMPLE_DATA:
            seed_chats           (profile_2, days_back     = 10)
            seed_reminders       (profile_2, num_reminders =  5)
            seed_activities      ()
            seed_rag_instructions()

        if REMAKE_ANALYZED_DATA:
            ChatSession.objects.filter(profile=profile_2, source="webapp").delete()
            seed_analyzed_chats(profile_2, plwd_2)


    # ================================================================================
    # Setup dummy sample chat data (just random sentences; not shown on admin view)
    # ================================================================================
    def setup_dummy_chats(self, days_ago):
        """
        Profile 1: demo_patient & demo_caregiver
        Pulls random sentences to make chats for filling up the user-facing UI.
        """
        # Using get_or_create so the user_id stays stable across runs.
        # Stable IDs prevent dangling vector DB embeddings (linked by user_id across DBs).
        plwd = self.get_or_create_demo_user("demo_patient",   password="1", first_name="John", last_name="Patient"  )
        care = self.get_or_create_demo_user("demo_caregiver", password="1", first_name="Jane", last_name="Caregiver", is_staff=False)

        plwd_account, _ = Account.objects.get_or_create(user=plwd, defaults={"role": "patient"  })
        care_account, _ = Account.objects.get_or_create(user=care, defaults={"role": "caregiver"})
        profile,      _ = Profile.objects.get_or_create(account=plwd_account, defaults={"zipcode": "9999", "birthDate": timezone.now(), "locationStatus": "alone"})

        Access      .objects.get_or_create(account=care_account, profile=profile)
        UserSettings.objects.get_or_create(profile=profile)
        Goal        .objects.get_or_create(profile=profile, defaults={"target": 5, "start_date": days_ago})

        if REMAKE_SAMPLE_DATA:
            seed_chats    (profile, days_back     = 10)
            seed_reminders(profile, num_reminders =  5)


    # ================================================================================
    # Set up users from the environment
    # ================================================================================
    def set_environment_users(self, days_ago):
        """
        Create protected users (admin & demo data) using login info from the environment
        """
        # --------------------------------------------------------------------------------
        # Primary admin user (they can view all transcripts)
        # --------------------------------------------------------------------------------
        admin_username = django_settings.ADMIN_USERNAME_0
        admin_password = django_settings.ADMIN_PASSWORD_0
        if (admin_username and admin_password):
            # Create the user
            primary_admin = self.get_or_create_demo_user(
                username   = admin_username, 
                password   = admin_password, 
                first_name = "Primary", 
                last_name  = "Admin", 
                is_staff   = True,
            )

            # Logging
            self.stdout.write(self.style.SUCCESS(f"{SEED_DATA} Primary admin user {SD_H}{admin_username}{SD_R} set from env.{RESET}"))

        # --------------------------------------------------------------------------------
        # Workshop demo data user (pre-loaded demo transcripts, audio, & biomarker scores)
        # --------------------------------------------------------------------------------
        demo_username = django_settings.DEMO_USERNAME_0
        demo_password = django_settings.DEMO_PASSWORD_0
        if (demo_username and demo_password):
            # Create the user
            workshop_user = self.get_or_create_demo_user(
                username   = demo_username, 
                password   = demo_password, 
                first_name = "Workshop", 
                last_name  = "Participant", 
                is_staff   = False,
            )

            # Logging
            self.stdout.write(self.style.SUCCESS(f"{SEED_DATA} Workshop demo data user {SD_H}{demo_username}{SD_R} set from env.{RESET}"))

        # --------------------------------------------------------------------------------
        # Setup account and profile objects
        # --------------------------------------------------------------------------------
        user_account, _ = Account.objects.get_or_create(user=workshop_user,   defaults={"role": "patient"  })
        care_account, _ = Account.objects.get_or_create(user=primary_admin,   defaults={"role": "caregiver"})
        profile, _      = Profile.objects.get_or_create(account=user_account, defaults={"zipcode": "9999", "birthDate": timezone.now(), "locationStatus": "alone"})

        # Create other remaining related user objects
        Access      .objects.get_or_create(account=care_account, profile=profile)
        UserSettings.objects.get_or_create(profile=profile)
        Goal        .objects.get_or_create(profile=profile, defaults={"target": 5, "start_date": days_ago})

        # Close any sessions left active by a previous crash/restart
        closed = ChatSession.objects.filter(is_active=True).update(is_active=False, end_ts=timezone.now())
        if closed:
            self.stdout.write(self.style.WARNING(f"{SEED_DATA} Closed {SD_H}{closed}{SD_R} stale active session(s) on startup.{RESET}"))

        # --------------------------------------------------------------------------------
        # Seeded chats with complete transcripts/biomarkers/audio data
        # --------------------------------------------------------------------------------
        if REMAKE_TRANSCRIPT_DATA:
            ChatSession.objects.filter(profile=profile, source="transcript").delete()
            #seed_transcript_chat(profile, primary_admin, test_dir = "test_01")
            seed_transcript_chat(profile, primary_admin, test_dir = "test_02")
            seed_transcript_chat(profile, primary_admin, test_dir = "test_03")
            seed_transcript_chat(profile, primary_admin, test_dir = "test_04")
            seed_transcript_chat(profile, primary_admin, test_dir = "test_05")

        # Return both users
        return primary_admin, workshop_user

