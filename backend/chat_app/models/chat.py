"""
Chats and what they record: sessions, messages, words, scores, and audio.
--------------------------------------------------------------------------------
`backend.chat_app.models.chat`

TODO: Add a field to the ChatMessage model for the "source." This field should 
      represent how the message was created (LLM, repeated message, admin user,
      opening greeting, etc.).

"""
from __future__ import annotations
from typing     import TYPE_CHECKING

from django.conf                    import settings
from django.contrib.postgres.fields import ArrayField
from django.db                      import models
from django.db.models               import Avg, Min, Q, UniqueConstraint
from django.utils                   import timezone

# From this project
from .accounts   import Profile
from .field_args import init_args

if TYPE_CHECKING: from .runs.run import ChatRun


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
        # Real chat data
        ("webapp",  "WebApp" ), ("mobile",     "Mobile"    ),  # Web app frontend UI
        ("qtrobot", "QTRobot"), ("buddyrobot", "BuddyRobot"),  # Access via physical robots

        # Seeded chat data
        ("demo",       "Demo"         ),  # Random demo data (hidden from admin views)
        ("analyzed",   "Analyzed Demo"),  # Fixed text-only fixtures with post-chat analysis
        ("transcript", "Transcript"   ),  # Real CSV/imported transcript with word-level timestamps
    ]

    # Levels of risk evaluated in the post-chat analysis
    RISK_LEVEL_CHOICES = [(0, "None"), (1, 'Low'), (2, 'Medium'), (3, 'High'), (4, 'Critical')]

    # --------------------------------------------------------------------------------
    # Initialized on chat creation
    # --------------------------------------------------------------------------------
    profile = models.ForeignKey   (Profile, on_delete=models.CASCADE, related_name="chat_sessions")
    source  = models.CharField    (max_length=32, choices=SOURCE_CHOICES, default="webapp")
    date    = models.DateTimeField(auto_now_add=True)

    # Chat type that ran (its name in `websocket/harnesses/`; "" on sessions from before chat types
    # were recorded). A task chat's condition and variant are on its run (`runs/run.py`)
    chat_type = models.CharField(max_length=32, blank=True, default="")

    # Started in debug mode, from the profile's switch (its features can be switched partway
    # through, so what ran may differ from its condition; each reply's timing says what was on)
    debug_mode = models.BooleanField(default=False)

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

    # The run this chat recorded, or None for a chat without one (only task chats record a run)
    @property
    def run_or_none(self) -> ChatRun | None:
        return self.run if hasattr(self, "run") else None
    
    class Meta:
        constraints = [UniqueConstraint(fields=["profile"], condition=Q(is_active=True), name="unique_active_session_per_profile",),] # One active session per profile
        ordering    = ["-date", "id"]

    def __str__(self): return f"Session {self.id} ({self.profile} | {self.date.strftime('%Y-%m-%d')})"

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

    # How long an assistant reply took, stage by stage, and the features switched on for it
    # (`websocket/services/reply_timing.py`; null for user messages and supplied replies)
    timing = models.JSONField(null=True, blank=True, default=None)

    class Meta:
        ordering = ["ts", "id"]
        indexes  = [models.Index(fields=['session', 'ts'])]
    
    def __str__(self): return f"{self.role}: {self.content}"

# ================================================================================
# ReplyNowEvent -- one received `reply_now` WebSocket command
# ================================================================================
class ReplyNowEvent(models.Model):
    """
    Audit record created when the backend receives a `reply_now` command.

    Timestamp handling:
    * `received_at` is captured at the WebSocket boundary; 
    * `created_at` records when the audit row reached the database.
    """
    ORIGIN_CHOICES = [
        ("primary_client", "Primary Client"),
        ("admin_listener", "Admin Listener"),
    ]

    # Fields
    session       = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name="reply_now_events")
    origin        = models.CharField(max_length=32, choices=ORIGIN_CHOICES)
    received_at   = models.DateTimeField(db_index=True)
    created_at    = models.DateTimeField(auto_now_add=True)
    response_mode = models.CharField(max_length=16)

    command_id   = models.CharField(max_length=128, **init_args)
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, related_name="reply_now_events", **init_args)

    class Meta:
        ordering = ["received_at", "id"]
        indexes  = [models.Index(fields=["session", "received_at"])]

    def __str__(self):
        return f"reply_now for ChatSession {self.session_id} at {self.received_at}"

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
