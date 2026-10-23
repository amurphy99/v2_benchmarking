"""
Ensure configured accounts and optional demo fixtures exist.
--------------------------------------------------------------------------------
`backend.chat_app.management.commands.seed_demo`

This command is safe to run at every backend startup. Account setup never
deletes linked application data, and each enabled fixture seeder creates only
data that is currently missing.

"""
from django.conf                   import settings as django_settings
from django.contrib.auth           import get_user_model
from django.contrib.auth.base_user import AbstractBaseUser
from django.core.management.base   import BaseCommand
from django.db                     import transaction
from django.utils                  import timezone
from datetime                      import date, timedelta

# From this project
from chat_app.models           import Access, Account, Goal, Profile, UserSettings
from  ..seed_data.analyzed     import seed_analyzed_chats
from  ..seed_data.sample       import seed_activities, seed_chats, seed_images, seed_rag_instructions, seed_reminders
from  ..seed_data.transcript   import seed_transcript_chat
from ...services.logging_utils import RESET, SEED_DATA, SD_H, SD_R


# --------------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------------
# These are all pulled from the environment (`/backend/.env `if local)
SEED_UI_SAMPLE_DATA       = django_settings.SEED_UI_SAMPLE_DATA        # Ensure random UI chats, reminders, activities, and RAG fixtures exist
SEED_ANALYZED_CHAT_DATA   = django_settings.SEED_ANALYZED_CHAT_DATA    # Ensure fixed text-only analyzed chat fixtures exist
SEED_TRANSCRIPT_CHAT_DATA = django_settings.SEED_TRANSCRIPT_CHAT_DATA  # Ensure imported transcript, audio, and biomarker fixtures exist

TRANSCRIPT_FIXTURE_DIRS = ("test_02", "test_03", "test_04", "test_05")  # Imported transcript folders enabled for the workshop profile

# Study logins as (username, first name, last name); their two passwords come from the environment
STUDY_CAREGIVER    = ("study_caregiver", "Study", "Caregiver")
STUDY_PARTICIPANTS = (
    ("study_participant_1", "Participant", "One"  ),
    ("study_participant_2", "Participant", "Two"  ),
    ("study_participant_3", "Participant", "Three"),
)


# ================================================================================
# Make sure that all "default" accounts and optional demo data exist
# ================================================================================
class Command(BaseCommand):
    help = "Ensure configured accounts and enabled demo fixture datasets exist."

    # ================================================================================
    # Command entry point
    # ================================================================================
    @transaction.atomic
    def handle(self, *args: object, **options: object) -> None:
        # Reference dates used only when a related Goal is first created
        two_days_ago    = timezone.localdate() - timedelta(days= 2)
        seven_days_ago  = timezone.localdate() - timedelta(days= 7)
        thirty_days_ago = timezone.localdate() - timedelta(days=30)

        # Album images are shared reference rows, so safely ensure them on every run
        seed_images()

        # Keep operational accounts separate from fixture-only data owners
        self.setup_environment_accounts(days_ago=two_days_ago)
        self.setup_study_accounts      (days_ago=two_days_ago)
        self.setup_ui_sample_data      (days_ago=thirty_days_ago)
        self.setup_analyzed_data       (days_ago=seven_days_ago)

        # TODO: Temporary -- an earlier version of this command promoted this hardcoded account.
        #       Remove once every deployed database has started once with this demotion
        get_user_model().objects.filter(username="AdnanSadi2").update(is_staff=False, is_superuser=False)

    # ================================================================================
    # User and Profile helpers
    # ================================================================================
    # Make sure a user account exists
    def ensure_user(
        self,
        *,
        username         : str,           # Stable username identifying the account
        password         : str,           # Initial or environment-authoritative password
        refresh_password : bool = False,  # Reapply environment-managed credentials when changed
        **fields         : object,        # Django user fields that should match configured values
    ) -> AbstractBaseUser:
        """
        Create an account or refresh its configured identity fields without touching
        any Account, Profile, Access, ChatSession, or recording linked to that user.

        Environment-managed passwords are reapplied when they change. Hardcoded fixture
        passwords are only assigned at creation so an intentional later change survives.
        """
        User          = get_user_model()
        user, created = User.objects.get_or_create(username=username, defaults=fields)
        changed_fields : list[str] = []

        # Refresh configured identity and permission fields without replacing the user
        for field_name, value in fields.items():
            if getattr(user, field_name, None) == value: continue
            setattr(user, field_name, value)
            changed_fields.append(field_name)

        # New accounts need a password; environment accounts also follow credential updates
        if (created) or (refresh_password and not user.check_password(password)):
            user.set_password(password)
            changed_fields.append("password")

        if changed_fields: user.save(update_fields=changed_fields)
        return user

    # Ensure a patient account has its persistent profile-level support records
    def ensure_patient_profile(self, user: AbstractBaseUser, days_ago: date) -> Profile:
        account, _ = Account.objects.get_or_create(user=user, defaults={"role": "patient"})
        if account.role != "patient": account.role = "patient"; account.save(update_fields=["role"])

        profile, _ = Profile.objects.get_or_create(
            account  = account,
            defaults = {"zipcode": "9999", "birthDate": timezone.localdate(), "locationStatus": "alone"},
        )
        UserSettings.objects.get_or_create(profile=profile)
        Goal        .objects.get_or_create(profile=profile, defaults={"target": 5, "start_date": days_ago})
        return profile

    # Ensure a user has a caregiver account (staff admins need one to open any page)
    def ensure_caregiver_account(self, user: AbstractBaseUser) -> Account:
        account, _ = Account.objects.get_or_create(user=user, defaults={"role": "caregiver"})
        if account.role != "caregiver": account.role = "caregiver"; account.save(update_fields=["role"])
        return account

    # Link a caregiver to one more profile (links to other profiles are kept)
    def ensure_caregiver_access(self, user: AbstractBaseUser, profile: Profile) -> None:
        account = self.ensure_caregiver_account(user)
        Access.objects.get_or_create(account=account, profile=profile)

    # ================================================================================
    # Persistent environment accounts
    # ================================================================================
    # Check each of the "default" accounts we need exist in the database
    def setup_environment_accounts(self, days_ago: date) -> None:
        """
        Ensure the two admins, workshop login, and Buddy robot login from the private
        environment. These are persistent operational accounts, even when they also
        provide access to seeded transcript fixtures.
        """
        # Only the primary admin is a Django superuser (full access to the admin dashboard)
        primary_admin   = self.ensure_environment_user("ADMIN_USERNAME_0", "ADMIN_PASSWORD_0", "Primary",   "Admin", is_staff=True, is_superuser=True)
        secondary_admin = self.ensure_environment_user("ADMIN_USERNAME_1", "ADMIN_PASSWORD_1", "Secondary", "Admin", is_staff=True)
        workshop_user   = self.ensure_environment_user("DEMO_USERNAME_0",  "DEMO_PASSWORD_0",  "Workshop",  "Participant")
        buddy_user      = self.ensure_environment_user("BUDDY_USERNAME",   "BUDDY_PASSWORD",   "Buddy",     "Speaker"    )

        # Give each non-admin operational login its own durable patient profile
        workshop_profile = self.ensure_patient_profile(workshop_user, days_ago) if (workshop_user) else None
        if buddy_user:     self.ensure_patient_profile(   buddy_user, days_ago)

        # Admins always get a caregiver account, even when there is no workshop profile to link
        if primary_admin:   self.ensure_caregiver_account(primary_admin  )
        if secondary_admin: self.ensure_caregiver_account(secondary_admin)

        # Admins can monitor the protected workshop profile without owning it
        if (workshop_profile) and (  primary_admin): self.ensure_caregiver_access(  primary_admin, workshop_profile)
        if (workshop_profile) and (secondary_admin): self.ensure_caregiver_access(secondary_admin, workshop_profile)

        # Transcript fixtures need a target profile and a user for normal session fields
        if (SEED_TRANSCRIPT_CHAT_DATA) and (workshop_profile):
            analysis_user = primary_admin or workshop_user
            for test_dir in TRANSCRIPT_FIXTURE_DIRS:
                seed_transcript_chat(workshop_profile, analysis_user, test_dir=test_dir)
        
        elif SEED_TRANSCRIPT_CHAT_DATA:
            self.stdout.write(self.style.WARNING(
                f"{SEED_DATA} Skipped transcript fixtures because {SD_H}DEMO_USERNAME_0{SD_R} "
                f"and {SD_H}DEMO_PASSWORD_0{SD_R} are not configured.{RESET}"
            ))

    # Ensure one optional environment-controlled login
    def ensure_environment_user(
        self,
        username_setting : str,           # Django setting containing the username
        password_setting : str,           # Django setting containing the password
        first_name       : str,           # Configured display first name
        last_name        : str,           # Configured display last name
        *,
        is_staff         : bool = False,  # Whether custom admin-only access is enabled
        is_superuser     : bool = False,  # Whether the Django admin dashboard is fully accessible
    ) -> AbstractBaseUser | None:
        username = getattr(django_settings, username_setting)
        password = getattr(django_settings, password_setting)
        if (not username) or (not password): return None

        user = self.ensure_user(
            username         = username,
            password         = password,
            refresh_password = True,
            first_name       = first_name,
            last_name        = last_name,
            is_staff         = is_staff,
            is_superuser     = is_superuser,
        )
        self.stdout.write(self.style.SUCCESS(
            f"{SEED_DATA} Account {SD_H}{username}{SD_R} ensured from the environment.{RESET}"
        ))
        return user

    # ================================================================================
    # Study Accounts
    # ================================================================================
    def setup_study_accounts(self, days_ago: date) -> None:
        """
        Ensure one caregiver linked to three participants. Usernames are fixed above;
        both passwords come from the environment, and the group is skipped while either
        is blank. New participants start on the model defaults (Smiley avatar, recording
        off, English), and later changes from the admin pages survive restarts.
        """
        caregiver_password   = django_settings.STUDY_CAREGIVER_PASSWORD
        participant_password = django_settings.STUDY_PARTICIPANT_PASSWORD
        if (not caregiver_password) or (not participant_password): return

        # The caregiver login (never staff, so it sees only its own participants)
        username, first_name, last_name = STUDY_CAREGIVER
        caregiver = self.ensure_study_user(username, caregiver_password, first_name, last_name)

        # Each participant gets a profile and a link to the caregiver
        for username, first_name, last_name in STUDY_PARTICIPANTS:
            participant = self.ensure_study_user(username, participant_password, first_name, last_name)
            profile     = self.ensure_patient_profile(participant, days_ago)
            self.ensure_caregiver_access(caregiver, profile)

    # Ensure one study login, following the environment password like the other operational accounts
    def ensure_study_user(
        self,
        username   : str,  # Fixed study username
        password   : str,  # Password from the environment (reapplied when it changes)
        first_name : str,  # Configured display first name
        last_name  : str,  # Configured display last name
    ) -> AbstractBaseUser:
        user = self.ensure_user(
            username         = username,
            password         = password,
            refresh_password = True,
            first_name       = first_name,
            last_name        = last_name,
            is_staff         = False,
            is_superuser     = False,
        )
        self.stdout.write(self.style.SUCCESS(f"{SEED_DATA} Study account {SD_H}{username}{SD_R} ensured.{RESET}"))
        return user

    # ================================================================================
    # Random UI Sample Fixtures
    # ================================================================================
    def setup_ui_sample_data(self, days_ago: date) -> None:
        """
        Ensure the fixture-only patient/caregiver pair used by random user-interface
        examples. Their account records are never deleted when fixture seeding is off
        or when this command is run repeatedly.
        """
        patient   = self.ensure_user(username="demo_patient",   password="1", first_name="John", last_name="Patient")
        caregiver = self.ensure_user(username="demo_caregiver", password="1", first_name="Jane", last_name="Caregiver", is_staff=False)
        profile   = self.ensure_patient_profile(patient, days_ago)
        self.ensure_caregiver_access(caregiver, profile)

        if not SEED_UI_SAMPLE_DATA: return

        seed_chats           (profile, days_back     = 10)
        seed_reminders       (profile, num_reminders =  5)
        seed_activities      ()
        seed_rag_instructions()

    # ================================================================================
    # Fixed Analyzed Chat Fixtures
    # ================================================================================
    def setup_analyzed_data(self, days_ago: date) -> None:
        """
        Ensure the fixture-only profile for fixed analyzed conversations. Random UI
        filler and analyzed chats remain independently controlled datasets attached to
        this same profile for backwards compatibility with the existing demo screens.
        """
        patient   = self.ensure_user(username="sample_user", password="1", first_name="Analysis", last_name="Tester")
        caregiver = self.ensure_user(username="sample_care", password="1", first_name="Sample",   last_name="Caregiver", is_staff=False)
        profile   = self.ensure_patient_profile(patient, days_ago)
        self.ensure_caregiver_access(caregiver, profile)

        if SEED_UI_SAMPLE_DATA:
            seed_chats    (profile, days_back     = 10)
            seed_reminders(profile, num_reminders =  5)

        if SEED_ANALYZED_CHAT_DATA: seed_analyzed_chats(profile, patient)
