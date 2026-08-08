"""
Postgres Database Schema
--------------------------------------------------------------------------------
`backend.chat_app.models`

TODO: Add a field to the ChatMessage model for the "source." This field should 
      represent how the message was created (LLM, repeated message, admin user,
      opening greeting, etc.).

"""
from django.db        import models
from django.db.models import UniqueConstraint, Q, Avg, Min
from django.conf      import settings
from django.utils     import timezone
from django.contrib.postgres.fields import ArrayField
from rest_framework.exceptions import NotFound

from datetime import date, timedelta

# Arguments that get reused
init_args    = dict(null=True, blank=True)
DAYS_OF_WEEK = ((0, 'Monday'), (1, 'Tuesday'), (2, 'Wednesday'), (3, 'Thursday'), (4, 'Friday'), (5, 'Saturday'), (6, 'Sunday'),)

# ================================================================================
# Non-Chat Models
# ================================================================================
class Account(models.Model):
    ROLE_CHOICES = [("Patient", "patient"), ("Caregiver", "caregiver"), ("Family", "family"), ("Physician", "physician"), ("Other", "other")]
    user        = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="account_user")
    role        = models.CharField(max_length=32, choices=ROLE_CHOICES, **init_args)
    
    def __str__(self): return f"Account for {self.user.username}"

class Profile(models.Model):
    account               = models.OneToOneField(Account, on_delete=models.CASCADE, related_name="profile_account")
    zipcode               = models.CharField(max_length=10, **init_args)
    birthDate             = models.DateField(**init_args)
    locationStatus        = models.CharField(max_length=100, **init_args)
    save_audio_by_default = models.BooleanField(default=False)
    
    def __str__(self): return f"Profile for {self.account.user.username}"
    
class Access(models.Model):
    PERMISSIONS_CHOICES = [("Full", "full"), ("View", "view")]
    account     = models.OneToOneField(Account, on_delete=models.CASCADE, related_name="account_access")
    profile     = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name="profile_access")
    permissions = models.CharField(max_length=100, choices=PERMISSIONS_CHOICES, default="full", **init_args)
    
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
# AlbumImage 
# ================================================================================
# Every topic (from conversations) has one associated image, and every ChatSession has a main topic
class AlbumImage(models.Model):
    topic = models.CharField(max_length=100, unique=True)
    url = models.CharField(max_length=255)
    photographer = models.CharField(max_length=100)
    photographer_url = models.CharField(max_length=255)
    
# ================================================================================
# ChatSession 
# ================================================================================
# Only one ChatSession per user should be "active" at once
class ChatSession(models.Model):
    """
    TODO: overlapped speech needs to be handled (?)
    """
    # Sources are given on connection to the chat
    SOURCE_CHOICES = [
        ("webapp",  "WebApp" ), ("mobile",     "Mobile"    ),  # Web app frontend UI
        ("qtrobot", "QTRobot"), ("buddyrobot", "BuddyRobot"),  # Access via physical robots
        ("demo",       "Demo"),                                # Random demo data (hidden from admin views)
        ("transcript", "Transcript"),                          # Real CSV/imported transcript with word-level timestamps
    ]

    # Levels of risk evaluated in the post-chat analysis
    RISK_LEVEL_CHOICES = [(0, "None"), (1, 'Low'), (2, 'Medium'), (3, 'High'), (4, 'Critical')]

    # --------------------------------------------------------------------------------
    # Initialized on chat creation
    # --------------------------------------------------------------------------------
    profile = models.ForeignKey   (Profile, on_delete=models.CASCADE, related_name="chat_sessions")
    source  = models.CharField    (max_length=32, choices=SOURCE_CHOICES, default="webapp")
    date    = models.DateTimeField(auto_now_add=True)

    # TODO: Future field for what LLM version was used
    llmVersion = models.CharField(max_length=255, default="phi3_finetuned")

    # Flexible field -- would be used for clinicians or users to save notes about chats
    notes = models.TextField(**init_args)

    # --------------------------------------------------------------------------------
    # Updated on chat end
    # --------------------------------------------------------------------------------
    # TODO: `start_ts`, `end_ts`, and `duration` should all be defined once upon chat 
    #       end, or as properties...
    is_active  = models.BooleanField (default=True)
    end_ts          = models.DateTimeField(**init_args)                  # `start_ts` is a property defined elsewhere
    # These are filled out based on the user's current settings at the time the chat ends
    taskType    = models.CharField(**init_args, max_length=255, default="chat")
    taskSubtype = models.CharField(**init_args, max_length=255, default="N/A")

    # Based on the first listed topic
    image = models.ForeignKey(AlbumImage, on_delete=models.SET_NULL, null=True)

    # --------------------------------------------------------------------------------
    # Post-chat analysis filled out when chats are completed
    # --------------------------------------------------------------------------------
    # Summary & Topics (stage 1 of post-chat analysis)
    summary   = models.TextField(**init_args)
    topics    = ArrayField(models.CharField(max_length=100), **init_args)

    # Sentiment & Emotion (stage 2 of post-chat analysis)
    sentiment = models.CharField(**init_args, max_length=255, default="N/A")
    emotion   = models.CharField(**init_args, max_length=255, default="N/A")

    # Risk Alerts (stage 3 of post-chat analysis)
    risk_level  = models.SmallIntegerField(**init_args, choices=RISK_LEVEL_CHOICES)
    risk_quotes = ArrayField(models.CharField(max_length=255), **init_args)
    risk_reason = models.TextField(**init_args)

    # --------------------------------------------------------------------------------
    # Properties
    # --------------------------------------------------------------------------------
    # TODO: We only really need to define this once?
    @property
    def start_ts(self):
        """Returns the earliest timestamp from related biomarker scores or messages"""
        biomarker_ts = self.biomarker_scores.aggregate(min_ts=Min("ts"))["min_ts"]
        message_ts   = self.messages        .aggregate(min_ts=Min("ts"))["min_ts"]
        timestamps   = [ts for ts in [biomarker_ts, message_ts] if ts is not None]
        return min(timestamps) if timestamps else None
    
    @property
    def duration(self):
        start = self.start_ts
        if not start: return 0

        end = self.end_ts or timezone.now()
        return (end - start).total_seconds()
    
    @property
    def average_scores(self) -> dict[str, float]:
        """ Returns {'prosody': 0.71, 'pragmatic': 0.42, ...} (missing biomarkers are omitted) """
        qs = (self.biomarker_scores.values("score_type").annotate(avg=Avg("score")))
        return {row["score_type"]: row["avg"] for row in qs}
    
    class Meta:
        constraints = [UniqueConstraint(fields=["profile"], condition=Q(is_active=True), name="unique_active_session_per_profile",),] # One active session per profile
        ordering    = ["-date", "id"]

    def __str__(self): return self.date

# ================================================================================
# SessionAudio -- storage metadata for one ChatSession recording
# ================================================================================
class SessionAudio(models.Model):
    STORAGE_CHOICES = [("local", "Local"), ("gcs", "Google Cloud Storage")]  # Supported recording object stores

    session          = models.OneToOneField(ChatSession, on_delete=models.CASCADE, related_name="audio")
    storage_backend  = models.CharField(max_length=16, choices=STORAGE_CHOICES)
    object_key       = models.CharField(max_length=500)
    started_at       = models.DateTimeField            (**init_args)
    sample_rate      = models.PositiveIntegerField     (**init_args)
    channels         = models.PositiveSmallIntegerField(**init_args)
    bits_per_sample  = models.PositiveSmallIntegerField(**init_args)
    duration_seconds = models.FloatField               (**init_args)
    size_bytes       = models.BigIntegerField          (**init_args)
    sha256           = models.CharField(max_length=64,  **init_args)
    created_at       = models.DateTimeField(auto_now_add=True)

    def __str__(self): return f"Audio for ChatSession {self.session_id}"

# ================================================================================
# ChatMessage -- an array of these is assigned to each ChatSession
# ================================================================================
class ChatMessage(models.Model):
    """
    `ts` records when the database message was created. `start_ts` and `end_ts`
    describe when the message was "audibly spoken" whenever that information is
    available. 
    * For user messages, those come from the min/max values of associated word timestamps
    * For assistant messages, we depend on the frontends to report when TTS started/finished
    """
    # Speaker
    ROLE_CHOICES   = [("user", "User"), ("assistant", "Assistant")]

    # If from the assistant, how was the message sent? (e.g. were admin controls used to sent it?)
    #SOURCE_CHOICES = [("llm", "LLM"), ("admin", "Admin"), ("other", "Other")]
    
    session   = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name="messages")
    role      = models.CharField(max_length=32, choices=ROLE_CHOICES)
    content   = models.TextField()
    ts        = models.DateTimeField(auto_now_add=True)
    source    = models.CharField(max_length=128, default="") # TODO: For now, not going to constrain this by a choice

    # Utterance start and end timestamps (see docstring for more)
    start_ts = models.DateTimeField(**init_args)
    end_ts   = models.DateTimeField(**init_args)

    class Meta:
        ordering = ["ts", "id"]
        indexes  = [models.Index(fields=['session', 'ts'])]
    
    def __str__(self): return f"{self.role}: {self.content}"

# ================================================================================
# ChatWord -- word-level STT timestamps associated with a ChatMessage
# ================================================================================
class ChatWord(models.Model):
    """
    TODO: Should the timestamps be float durations from start instead? That would probably help a lot with storage...
    """
    message  = models.ForeignKey(ChatMessage, on_delete=models.CASCADE, related_name="words")
    word       = models.CharField(max_length=64)          # Spoken word
    start_ts   = models.DateTimeField()                   # Start timestamp of the word
    end_ts     = models.DateTimeField()                   # End timestamp of the word
    index      = models.PositiveSmallIntegerField()       # 0-based position within the utterance
    confidence = models.FloatField(null=True, blank=True) # ASR confidence in the word (optional)

    class Meta:
        ordering = ["message", "index"]
        indexes  = [models.Index(fields=["message", "index"])]

    def __str__(self): return f"{self.index}: {self.word} ({self.start_ts} - {self.end_ts})"

# ================================================================================
# ChatBiomarkerScore -- an array of these is assigned to each ChatSession
# ================================================================================
class ChatBiomarkerScore(models.Model):
    """
    Some biomarkers may be linked to messages/utterances directly while others are
    linked to timestamps (e.g., 5 seconds of audio).
    """
    BIOMARKER_CHOICES = [
        ("alteredgrammar", "AlteredGrammar"), ("anomia", "Anomia"), ("pragmatic", "PragmaticImpairment"),
        ("pronunciation", "Pronunciation"), ("prosody", "Prosody"), ("turntaking", "Turntaking"),
        ("perplexity", "PerplexityDifference")
    ]

    session    = models.ForeignKey(ChatSession,  on_delete=models.CASCADE,  related_name="biomarker_scores")

    # Nullable foreign to the specific utterance this score was calculated from
    message    = models.ForeignKey(ChatMessage,  on_delete=models.SET_NULL, related_name="biomarker_scores", **init_args)

    # Score information
    score_type = models.CharField (max_length=32, choices=BIOMARKER_CHOICES)
    score      = models.FloatField()
    ts         = models.DateTimeField(auto_now_add=True)
    
    # Time range of the audio/text window this score was derived from
    start_ts   = models.DateTimeField(**init_args)
    end_ts     = models.DateTimeField(**init_args)

    class Meta:
        ordering = ["ts", "score_type", "id"]

    def __str__(self): return f"{self.score_type:16}: {self.score:.4f}"














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
        return ChatSession.objects.filter(profile=self.profile, is_active=False, date__gte=start).count()
    
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
    MODEL_CHOICES = [("buddy", "Buddy"), ("qt", "QT")]
    
    profile            = models.OneToOneField(Profile, on_delete=models.CASCADE, related_name="settings_user")
    patientViewOverall = models.BooleanField(default=True)
    patientCanSchedule = models.BooleanField(default=True)
    taskType           = models.CharField(max_length=32, choices=TASK_CHOICES, default="chat")
    taskSubtype        = models.CharField(max_length=32, default="N/A")
    modelChoice        = models.CharField(max_length=32, choices=MODEL_CHOICES, default="buddy")

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

# ================================================================================
# Activities and RAG Instructions Models
# ================================================================================

class Activity(models.Model):
    name = models.CharField(max_length=100, unique=True)

    def __str__(self):
        return self.name

class RAGInstructions(models.Model):
    
    # need to allow null for initial migration (as we already have some data), need make this false later
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="rag_instructions",
        null=True, blank=True,
    )
    activity = models.ForeignKey(
        "Activity",
        on_delete=models.CASCADE,
        related_name="rag_instructions",
        null=True, blank=True, 
    )
    name = models.CharField(max_length=100)
    instructions = models.TextField()
    description = models.TextField()
    instruction_order = models.PositiveIntegerField(default=1, db_index=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["name", "user", "activity"],
                name="unique_rag_instruction_per_user_activity_name",
            )
        ]

    def __str__(self):
        user_part = getattr(self.user, "username", "GLOBAL")
        activity_part = getattr(self.activity, "name", "NO_ACTIVITY")
        return f"{user_part} / {activity_part} / {self.name}: {self.description}"
