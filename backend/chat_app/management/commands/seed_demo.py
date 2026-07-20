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
from django.db                   import transaction
from django.utils                import timezone
from django.contrib.auth         import get_user_model

# From this project
from chat_app.models        import Profile, Account, Access, UserSettings, Goal, ChatSession, AlbumImage, RAGInstructions
from ..seed_data.sample     import seed_images, seed_chats, seed_reminders, seed_activities, seed_rag_instructions
from ..seed_data.analyzed   import seed_analyzed_chats
from ..seed_data.transcript import seed_transcript_chat

# --------------------------------------------------------------------------------
# Config (don't remake locally since I already have this stuff)
# --------------------------------------------------------------------------------
# If we are local or deployed (based on the .env file)
APP_ENVIRONMENT = os.getenv("APP_ENVIRONMENT", "sandbox")
LOCAL_MODE      = (APP_ENVIRONMENT == "local")

# Set to True to wipe and recreate all existing random demo data on each run.
REMAKE_SAMPLE_DATA   = not LOCAL_MODE

# Set to True to wipe and recreate the analyzed demo chats (fixed-transcript chats under buddy_user).
REMAKE_ANALYZED_DATA = not LOCAL_MODE

# Set to True to wipe and recreate the CSV-imported transcript chat with real word-level timestamps.
REMAKE_TRANSCRIPT_DATA =  not LOCAL_MODE


# ================================================================================
# Seed default demo data into the DB 
# ================================================================================
class Command(BaseCommand):

    # ================================================================================
    # Handle
    # ================================================================================
    @transaction.atomic
    def handle(self, *args, **kwargs):
        if REMAKE_SAMPLE_DATA:
            AlbumImage.objects.all().delete()
            seed_images()

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
        profile,      _ = Profile.objects.get_or_create(account=plwd_account, defaults={"zipcode": "9999", "birthDate": timezone.now(), "locationStatus": "alone"})

        Access      .objects.get_or_create(account=care_account, profile=profile)
        UserSettings.objects.get_or_create(profile=profile)
        Goal        .objects.get_or_create(profile=profile, defaults={"target": 5, "start_date": two_days_ago})

        if REMAKE_SAMPLE_DATA:
            seed_chats    (profile, days_back=10)
            seed_reminders(profile, num_reminders=5)

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

        # Close any sessions left active by a previous crash/restart
        closed = ChatSession.objects.filter(is_active=True).update(is_active=False, end_ts=timezone.now())
        if closed:
            self.stdout.write(self.style.WARNING(f"[seed_demo] Closed {closed} stale active session(s) on startup."))
            
        if REMAKE_SAMPLE_DATA:
            seed_chats           (profile_2, days_back    =10)
            seed_reminders       (profile_2, num_reminders= 5)
            seed_activities      ()
            seed_rag_instructions()

        if REMAKE_ANALYZED_DATA:
            ChatSession.objects.filter(profile=profile_2, source="webapp").delete()
            seed_analyzed_chats(profile_2, plwd_2)

        if REMAKE_TRANSCRIPT_DATA:
            ChatSession.objects.filter(profile=profile_2, source="transcript").delete()
            seed_transcript_chat(profile_2, plwd_2)

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
            except Access.DoesNotExist:  pass

        account.delete()
