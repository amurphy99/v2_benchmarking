"""
Accounts and their profiles, settings, goals, reminders, and caregiver access.
--------------------------------------------------------------------------------
`backend.chat_app.models.accounts`

"""
from datetime import date, timedelta

from django.conf                    import settings
from django.contrib.postgres.fields import ArrayField
from django.db                      import models
from django.db.models               import UniqueConstraint
from django.utils                   import timezone

from rest_framework.exceptions import NotFound

# From this project
from .field_args import init_args

# Days of the week, by `date.weekday()` number (a weekly goal's starting day)
DAYS_OF_WEEK = ((0, 'Monday'), (1, 'Tuesday'), (2, 'Wednesday'), (3, 'Thursday'), (4, 'Friday'), (5, 'Saturday'), (6, 'Sunday'),)


# ================================================================================
# Non-Chat Models
# ================================================================================
class Account(models.Model):
    ROLE_CHOICES = [("patient", "Patient"), ("caregiver", "Caregiver"), ("family", "Family"), ("physician", "Physician"), ("other", "Other")]
    user        = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="account_user")
    role        = models.CharField(max_length=32, choices=ROLE_CHOICES, **init_args)

    def __str__(self): return f"Account for {self.user.username}"

class Profile(models.Model):
    """
    Built-in "toggles" allow managing users to modify how the system works for
    individual users.

    The boolean flag values are all read when each new chat connects.
    """
    # Chat languages as BCP-47 tags (`LANGUAGE_CHOICES` in `frontend/src/api/models.ts` copies these)
    LANGUAGE_CHOICES = [
        ("en-US", "English (US)"         ), ("en-GB", "English (UK)"         ),
        ("de-DE", "German"               ), ("el-GR", "Greek"                ),
        ("es-ES", "Spanish (Spain)"      ), ("es-MX", "Spanish (Mexico)"     ),
        ("fr-FR", "French"               ), ("it-IT", "Italian"              ),
        ("nl-NL", "Dutch"                ), ("pl-PL", "Polish"               ),
        ("pt-PT", "Portuguese (Portugal)"), ("pt-BR", "Portuguese (Brazil)"  ),
        ("tr-TR", "Turkish"              ), ("ru-RU", "Russian"              ),
        ("ar-SA", "Arabic"               ), ("hi-IN", "Hindi"                ),
        ("ja-JP", "Japanese"             ), ("ko-KR", "Korean"               ),
        ("zh-CN", "Chinese (Simplified)" ), ("zh-TW", "Chinese (Traditional)"),
    ]

    # Misc. profile details
    account               = models.OneToOneField(Account, on_delete=models.CASCADE, related_name="profile_account")
    zipcode               = models.CharField(max_length=10, **init_args)
    birthDate             = models.DateField(**init_args)
    locationStatus        = models.CharField(max_length=100, **init_args)

    # Configurable fields that change how the system works for users
    save_audio_by_default = models.BooleanField(default=False)  # Toggle automatic audio saving
    run_biomarkers        = models.BooleanField(default=False)  # Toggle speech biomarker analysis for chats
    debug_mode            = models.BooleanField(default=False)  # Toggle the chat page's debug mode (its chats are marked as debug sessions)
    language = models.CharField(max_length=16, choices=LANGUAGE_CHOICES, default="en-US")  # TODO: Select the chat's STT, LLM, and TTS language


    def __str__(self): return f"Profile for {self.account.user.username}"



# One caregiver's link to one participant (a caregiver may hold several)
class Access(models.Model):
    PERMISSIONS_CHOICES = [("Full", "full"), ("View", "view")]
    account     = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="account_access")
    profile     = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name="profile_access")
    permissions = models.CharField(max_length=100, choices=PERMISSIONS_CHOICES, default="full", **init_args)

    class Meta:
        constraints = [UniqueConstraint(fields=["account", "profile"], name="unique_access_per_account_profile")]

    def __str__(self): return f"{self.account.user.username} has {self.permissions} permissions for {self.profile.account.user.username}'s profile"


class Reminder(models.Model):
    profile    = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name="reminder_user")
    title      = models.CharField(max_length=100)
    notes      = models.TextField    (**init_args)
    start      = models.DateField(**init_args)
    end        = models.DateField(**init_args)
    startTime  = models.TimeField    (**init_args)
    endTime    = models.TimeField    (**init_args)
    daysOfWeek = ArrayField(models.IntegerField(**init_args), size=7, **init_args)
    
    def __str__(self): return f"Reminder {self.title}"


# ================================================================================
# One-to-one Models
# ================================================================================
class Goal(models.Model):
    PERIOD_NONE    = "N"   # no rollover
    PERIOD_WEEKLY  = "W"
    PERIOD_MONTHLY = "M"
    PERIOD_CHOICES = [(PERIOD_NONE, "None"), (PERIOD_WEEKLY, "Weekly"), (PERIOD_MONTHLY, "Monthly")]

    # Core fields
    profile     = models.OneToOneField(Profile, on_delete=models.CASCADE, related_name="goal")
    target      = models.PositiveIntegerField(default=5)
    auto_renew  = models.BooleanField(default=True)
    period      = models.CharField(max_length=1, choices=PERIOD_CHOICES, default=PERIOD_WEEKLY)
    start_date  = models.DateField(default=timezone.localdate)                      # anchor
    start_dow   = models.PositiveSmallIntegerField(default=0, choices=DAYS_OF_WEEK) # only used when period = WEEKLY

    # --------------------------------------------------------------------------------
    # Properties
    # --------------------------------------------------------------------------------
    # To calculate 'current', use the 'date' property of ChatSessions
    @property
    def current(self) -> int:
        start = self.current_period_start()
        return self.profile.chat_sessions.filter(is_active=False, date__gte=start).count()
    
    @property
    def remaining(self) -> int: return max(0, self.target - self.current)

    # --------------------------------------------------------------------------------
    # Helper –- figure out current period window
    # --------------------------------------------------------------------------------
    def current_period_start(self) -> date:
        today = timezone.localdate()

        # Never roll over
        if not self.auto_renew or self.period == self.PERIOD_NONE: 
            return self.start_date

        # Find most recent "start_dow" not after today
        if self.period == self.PERIOD_WEEKLY:
            offset = (today.weekday() - self.start_dow) % 7
            return today - timedelta(days=offset)

        # Anchor on day-of-month from start_date (e.g. 15th)
        if self.period == self.PERIOD_MONTHLY: 
            anchor_dom = self.start_date.day
            # Roll back one month
            if today.day < anchor_dom: return (today.replace(day=1) - timedelta(days=1)).replace(day=anchor_dom)
            else:                      return  today.replace(day=anchor_dom)

    
    def __str__(self): return f"{self.profile.account.user.username}'s goal ({self.period})"
    
    class Meta:
        constraints = [models.UniqueConstraint(fields=["profile"], name="one_goal_per_profile")]


class UserSettings(models.Model):
    TASK_CHOICES = [("chat", "Chat"), ("chattopic", "ChatTopic"), ("chatimage", "ChatImage")]
    # Web avatars (`AVATAR_MODEL_CHOICES` in `frontend/src/api/models.ts` copies these)
    MODEL_CHOICES = [
        ("buddy", "Buddy"), ("qt", "QT"), ("robot", "Robot"), ("smiley", "Smiley"), ("talkinghead", "TalkingHead"),
        ("temp1", "Temp 1"), ("temp2", "Temp 2"), ("temp3", "Temp 3"),  # Reserved for avatars still being built
    ]

    profile            = models.OneToOneField(Profile, on_delete=models.CASCADE, related_name="settings_user")
    patientViewOverall = models.BooleanField(default=True)
    patientCanSchedule = models.BooleanField(default=True)
    taskType           = models.CharField(max_length=32, choices=TASK_CHOICES, default="chat")
    taskSubtype        = models.CharField(max_length=32, default="N/A")
    modelChoice        = models.CharField(max_length=32, choices=MODEL_CHOICES, default="smiley")

    def __str__(self): return f"{self.profile.account.user.username}'s settings"

    class Meta:
        constraints = [models.UniqueConstraint(fields=["profile"], name="one_settings_per_profile")]


##### Helper functions

def get_account(user):
    '''
    Gets an Account based on the given user. 
    user: The user to get the Account for.
    '''
    try:
        account = Account.objects.get(user=user)
        return account
    except Account.DoesNotExist:
        raise NotFound("No matching Account for this user.")
    
def get_profile(user):
    '''
    Gets a profile based on the given user. Will first check if the given user is the owner of a Profile, then checks which Profile
    the user has access to. Each user only has access to one Profile.
    user: The user to get the profile for.
    '''
    account = get_account(user)
    try:
        return Profile.objects.get(account=account)
    except Profile.DoesNotExist:
        try:
            access = Access.objects.get(account=account)
            return access.profile
        except Access.DoesNotExist:
            raise NotFound("This Account does not have access to any Profiles.")
