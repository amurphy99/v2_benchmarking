"""
DRF serializers for profiles, settings, chat sessions, and admin account tools.
--------------------------------------------------------------------------------
`backend.chat_app.api.serializers`

Field names follow the model fields, including the few camelCase ones (such as
`UserSettings.modelChoice`); `frontend/src/api/models.ts` mirrors them exactly.
Accounts are created only by staff (`AdminCreateAccountSerializer`); there is no
public signup.

"""
from rest_framework            import serializers
from rest_framework.exceptions import PermissionDenied
from ..models import ChatSession, SessionAudio, ChatMessage, ChatBiomarkerScore, ChatWord, Account, Profile, Access, UserSettings, Reminder, Goal, AlbumImage, RAGInstructions
from ..helpers.downloadHelpers import get_download_data

from django.conf                             import settings as django_settings
from django.contrib.auth                     import get_user_model
from django.contrib.auth.password_validation import validate_password as check_password_rules
from django.contrib.auth.validators          import UnicodeUsernameValidator
from django.db                               import transaction

# ================================================================================
# Profiles and Profile-related Data
# ================================================================================
class UserSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model  = UserSettings
        fields = ("patientViewOverall", "patientCanSchedule", "taskType", "taskSubtype", "modelChoice")
        
class ReminderSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Reminder
        fields = ("id", "title", "notes", "start", "end", "startTime", "endTime", "daysOfWeek")
        read_only_fields = ("id",)
        
class GoalSerializer(serializers.ModelSerializer):
    current   = serializers.IntegerField(read_only=True)
    remaining = serializers.IntegerField(read_only=True)
    class Meta:
        model  = Goal
        fields = ("id", "target", "auto_renew", "period", "start_date", "start_dow", "current", "remaining")
        read_only_fields = ("id", "current", "remaining")

    def get_remaining(self, obj): return obj.remaining
    
class RAGInstructionsSerializer(serializers.ModelSerializer):
    class Meta:
        model  = RAGInstructions
        fields = ("id", "name", "instructions", "description", "activity", "instruction_order")
        read_only_fields = ("id", "activity")
    
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model  = get_user_model()
        fields = ("id", "username", "first_name", "last_name", "is_staff")
        read_only_fields = fields   # (all set by Django)

class AccountSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    
    class Meta:
        model = Account
        fields = ("id", "user", "role")
        read_only_fields = fields
class ProfileSerializer(serializers.ModelSerializer):
    account   = AccountSerializer(read_only=True)
    settings  = UserSettingsSerializer(read_only=True, source="settings_user")
    goal      = GoalSerializer        (read_only=True)
    class Meta:
        model  = Profile
        fields = ("id", "account", "zipcode", "birthDate", "locationStatus", "save_audio_by_default", "settings", "goal")
        read_only_fields = ("id", "save_audio_by_default")


# --------------------------------------------------------------------------------
# Admin Participant Settings
# --------------------------------------------------------------------------------
# Logins whose password startup reapplies from the server's .env on every run
def env_managed_usernames() -> frozenset[str]:
    usernames = (django_settings.ADMIN_USERNAME_0, django_settings.ADMIN_USERNAME_1, django_settings.DEMO_USERNAME_0, django_settings.BUDDY_USERNAME)
    return frozenset(username for username in usernames if username)


# One participant for the admin settings page: who they are, their chat activity, and the settings staff change
class AdminProfileSerializer(serializers.ModelSerializer):
    user              = UserSerializer(source="account.user", read_only=True)
    modelChoice       = serializers.ChoiceField(source="settings_user.modelChoice", choices=UserSettings.MODEL_CHOICES)
    chat_count        = serializers.IntegerField (read_only=True)               # Annotated by `AdminProfileViewSet` (demo sessions left out)
    last_chat_at      = serializers.DateTimeField(read_only=True)               # Start of the latest of those sessions (null without one)
    password          = serializers.CharField(write_only=True, required=False)  # New login password (staff only)
    password_from_env = serializers.SerializerMethodField()                     # Startup resets this login's password from the .env

    class Meta:
        model            = Profile
        fields           = ("id", "user", "save_audio_by_default", "language", "modelChoice", "chat_count", "last_chat_at", "password", "password_from_env")
        read_only_fields = ("id",)

    # Whether the server's .env controls this participant's password
    def get_password_from_env(self, profile: Profile) -> bool:
        return profile.account.user.username in env_managed_usernames()

    # Only staff set passwords, and never one the server's .env controls
    def validate_password(self, password: str) -> str:
        if not self.context["request"].user.is_staff: raise PermissionDenied("Only staff can set passwords.")
        if self.get_password_from_env(self.instance): raise serializers.ValidationError("This password is set in the server's .env.")
        check_password_rules(password, user=self.instance.account.user)
        return password

    # Save the settings (on the profile and its settings row) and any new password together
    @transaction.atomic
    def update(self, profile: Profile, validated_data: dict[str, object]) -> Profile:
        # A PATCH may carry any setting alone, and carries a password only when one was typed
        password        = validated_data.pop("password", None)
        settings_fields = validated_data.pop("settings_user", {})
        for name, value in validated_data.items():  setattr(profile,               name, value)
        for name, value in settings_fields.items(): setattr(profile.settings_user, name, value)

        # Write only the columns that were sent (an empty `update_fields` skips that save)
        profile.save(update_fields=list(validated_data))
        profile.settings_user.save(update_fields=list(settings_fields))

        # Replace the login password last, inside the same transaction
        if password is not None:
            profile.account.user.set_password(password)
            profile.account.user.save(update_fields=["password"])
        return profile


# --------------------------------------------------------------------------------
# Admin Accounts
# --------------------------------------------------------------------------------
# New login created by staff: a participant (with their profile) or a caregiver
class AdminCreateAccountSerializer(serializers.Serializer):
    username   = serializers.CharField(max_length=150, validators=[UnicodeUsernameValidator()])
    password   = serializers.CharField(write_only=True)
    first_name = serializers.CharField(max_length=150)
    last_name  = serializers.CharField(max_length=150)
    role       = serializers.ChoiceField(choices=["patient", "caregiver"])

    # Refuse a username that is already taken
    def validate_username(self, username: str) -> str:
        if get_user_model().objects.filter(username=username).exists(): raise serializers.ValidationError("Username already exists.")
        return username

    # Apply the project's password rules (`AUTH_PASSWORD_VALIDATORS`)
    def validate_password(self, password: str) -> str:
        check_password_rules(password)
        return password

    # Create the login and its account (a participant also gets a profile, settings, and goal)
    @transaction.atomic
    def create(self, validated: dict[str, object]) -> Account:
        user = get_user_model().objects.create_user(
            username   = validated["username"  ],
            password   = validated["password"  ],
            first_name = validated["first_name"],
            last_name  = validated["last_name" ],
        )
        account = Account.objects.create(user=user, role=validated["role"])

        # New participants start on the model defaults (Smiley, recording off, English)
        if validated["role"] == "patient":
            profile = Profile.objects.create(account=account)
            UserSettings.objects.create(profile=profile)
            Goal        .objects.create(profile=profile)
        return account

    # Reply with the new account as the rest of the API shows it
    def to_representation(self, account: Account) -> dict[str, object]:
        return AccountSerializer(account).data


# One participant linked to a caregiver: their profile ID and who they are
class LinkedParticipantSerializer(serializers.ModelSerializer):
    user = UserSerializer(source="account.user", read_only=True)

    class Meta:
        model            = Profile
        fields           = ("id", "user")
        read_only_fields = fields


# One caregiver for the admin accounts page, with the participants linked to them
class AdminCaregiverSerializer(serializers.ModelSerializer):
    user            = UserSerializer(read_only=True)
    participants    = serializers.SerializerMethodField()
    participant_ids = serializers.PrimaryKeyRelatedField(many=True, write_only=True, queryset=Profile.objects.all())
    password        = serializers.CharField(write_only=True, required=False)  # New login password (sent only when one was typed)

    class Meta:
        model            = Account
        fields           = ("id", "user", "participants", "participant_ids", "password")
        read_only_fields = ("id",)

    # Apply the project's password rules (`AUTH_PASSWORD_VALIDATORS`)
    def validate_password(self, password: str) -> str:
        check_password_rules(password, user=self.instance.user)
        return password

    # Linked participants, oldest link first (the first one is what the caregiver pages show)
    def get_participants(self, account: Account) -> list[dict[str, object]]:
        links = sorted(account.account_access.all(), key=lambda access: access.id)
        return LinkedParticipantSerializer([access.profile for access in links], many=True).data

    # Replace the caregiver's links with exactly the participants sent, and any new password with them
    @transaction.atomic
    def update(self, account: Account, validated_data: dict[str, object]) -> Account:
        profiles = validated_data["participant_ids"]
        account.account_access.exclude(profile__in=profiles).delete()
        for profile in profiles: Access.objects.get_or_create(account=account, profile=profile)

        # A password is sent only when staff typed a new one
        if "password" in validated_data:
            account.user.set_password(validated_data["password"])
            account.user.save(update_fields=["password"])
        return account


# Who a profile is shared with (read-only; staff change links on the admin accounts page)
class AccessSerializer(serializers.ModelSerializer):
    account     = AccountSerializer(read_only=True)
    profile     = ProfileSerializer(read_only=True)

    class Meta:
        model   = Access
        fields  = ("id", "account", "profile")

# ================================================================================
# ChatSession Related Data
# ================================================================================
class AlbumImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = AlbumImage
        fields = ("id", "topic", "url", "photographer", "photographer_url")
        read_only_fields = fields

class ChatWordSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ChatWord
        fields = ("id", "word", "start_ts", "end_ts", "index")
        read_only_fields = fields

class ChatMessageSerializer(serializers.ModelSerializer):
    words = ChatWordSerializer(many=True, read_only=True)
    class Meta:
        model  = ChatMessage
        fields = ("id", "role", "content", "ts", "start_ts", "end_ts", "words")
        read_only_fields = fields

class SessionAudioSerializer(serializers.ModelSerializer):
    class Meta:
        model  = SessionAudio
        fields = ("storage_backend", "started_at", "sample_rate", "channels", "bits_per_sample", "duration_seconds", "size_bytes", "sha256", "created_at")
        read_only_fields = fields

class BiomarkerSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ChatBiomarkerScore
        fields = ("id", "score_type", "score", "ts", "message", "start_ts", "end_ts")
        read_only_fields = fields

class ChatSessionSerializer(serializers.ModelSerializer):
    profile        = ProfileSerializer    (           read_only=True)
    image          = AlbumImageSerializer (           read_only=True)
    messages       = ChatMessageSerializer(many=True, read_only=True)
    biomarkers     = BiomarkerSerializer  (many=True, read_only=True, source="biomarker_scores")
    start_ts       = serializers.SerializerMethodField()
    duration       = serializers.SerializerMethodField()
    average_scores = serializers.SerializerMethodField()
    audio          = SessionAudioSerializer(read_only=True)

    class Meta:
        model  = ChatSession
        fields = ("id", "profile", "source", "date", "is_active", "start_ts", "end_ts", "audio", "duration", "topics",
                  "sentiment", "emotion", "notes", "summary", "messages", "biomarkers", "average_scores", "taskType", "taskSubtype",
                  "image", "risk_level", "risk_quotes", "risk_reason")
        read_only_fields = fields # ToDo: "notes" shouldn't be read only...

    def get_start_ts      (self, obj): return obj.start_ts
    def get_duration      (self, obj): return obj.duration
    def get_average_scores(self, obj): return obj.average_scores

# ================================================================================
# Other Data
# ================================================================================
class DownloadDataSerializer(serializers.ModelSerializer):
    fileName = serializers.SerializerMethodField()
    fileContents = serializers.SerializerMethodField()
    
    class Meta:
        model = Profile
        fields = ("fileName", "fileContents")
    
    def get_fileName(self, obj: Profile):
        return f"{obj.account.user.first_name}_{obj.account.user.last_name}_data"
    
    def get_fileContents(self, obj):
        return get_download_data(obj)
