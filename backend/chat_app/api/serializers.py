from rest_framework import serializers
from ..models import ChatSession, ChatMessage, ChatBiomarkerScore, Account, Profile, Access, UserSettings, Reminder, Goal, AlbumImage
from ..helpers.downloadHelpers import get_download_data

from django.contrib.auth import get_user_model
from django.db           import transaction

# =======================================================================
# Profiles and Profile-related Data
# =======================================================================
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
        fields = ("id", "account", "zipcode", "birthDate", "locationStatus", "settings", "goal")
        read_only_fields = ("id",) # Not sure...
        
class AccessSerializer(serializers.ModelSerializer):
    account     = AccountSerializer(read_only=True)
    profile     = ProfileSerializer(read_only=True)
    
    class Meta:
        model   = Access
        fields  = ("id", "account", "profile")
        
# =======================================================================
# ChatSession Related Data
# =======================================================================
class AlbumImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = AlbumImage
        fields = ("id", "topic", "url", "photographer", "photographer_url")
        read_only_fields = fields
class ChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ChatMessage
        fields = ("id", "role", "content", "ts", "start_ts", "end_ts")
        read_only_fields = fields

class BiomarkerSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ChatBiomarkerScore
        fields = ("id", "score_type", "score", "ts")
        read_only_fields = fields

class ChatSessionSerializer(serializers.ModelSerializer):
    profile        = ProfileSerializer(read_only=True)
    image          = AlbumImageSerializer(read_only=True)
    messages       = ChatMessageSerializer(many=True, read_only=True)
    biomarkers     = BiomarkerSerializer  (many=True, read_only=True, source="biomarker_scores")
    start_ts       = serializers.SerializerMethodField()
    duration       = serializers.SerializerMethodField()
    average_scores = serializers.SerializerMethodField()

    class Meta:
        model  = ChatSession
        fields = ("id", "profile", "source", "date", "is_active", "start_ts", "end_ts", "duration", "topics", 
                  "sentiment", "notes", "messages", "biomarkers", "average_scores", "taskType", "taskSubtype",
                  "image")
        read_only_fields = fields # ToDo: "notes" shouldn't be read only...

    def get_start_ts      (self, obj): return obj.start_ts
    def get_duration      (self, obj): return obj.duration
    def get_average_scores(self, obj): return obj.average_scores

# =======================================================================
# Other Data
# =======================================================================
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

# =======================================================================
# Signup
# =======================================================================
class SignupPatientSerializer(serializers.Serializer):
    '''
    Because all the data is connected to the Patient, on creation of a Patient account, we also create an empty Profile,
    UserSettings, and Goal object.
    '''
    # Fields expected from the frontend
    username        = serializers.CharField()
    password        = serializers.CharField(write_only=True)
    firstName       = serializers.CharField()
    lastName        = serializers.CharField()

    def validate(self, attrs):
        User = get_user_model()
        if User.objects.filter(username=attrs["username"]).exists(): raise serializers.ValidationError(  "Username already exists.")
        return attrs

    # Create user entries for both the patient and caregiver
    # Also create settings and goal objects for the new Profile
    # Can return whatever the API needs
    @transaction.atomic
    def create(self, validated):
        User = get_user_model()
        user = User.objects.create_user(
            username   = validated["username"],
            password   = validated["password"],
            first_name = validated["firstName"],
            last_name  = validated["lastName"],
        )
        account = Account.objects.create(user=user, role="patient")
        profile = Profile.objects.create(account=account)
        UserSettings.objects.create(profile=profile)
        Goal        .objects.create(profile=profile)
        return account

    def to_representation(self, account: Account):
        return {"success"   : True,
                "username"  : account.user.username,
                "name"      : f'{account.user.first_name} {account.user.last_name}',}
        
class SignupAccountSerializer(serializers.Serializer):
    '''
    Just need to create a User and Account object
    '''
    # Fields expected from the frontend
    username        = serializers.CharField()
    password        = serializers.CharField(write_only=True)
    firstName       = serializers.CharField()
    lastName        = serializers.CharField()

    def validate(self, attrs):
        User = get_user_model()
        if User.objects.filter(username=attrs["username"]).exists(): raise serializers.ValidationError("Username already exists.")
        return attrs

    # Create user entries for both the patient and caregiver
    # Also create settings and goal objects for the new Profile
    # Can return whatever the API needs
    @transaction.atomic
    def create(self, validated):
        User = get_user_model()
        user = User.objects.create_user(
            username   = validated["username"],
            password   = validated["password"],
            first_name = validated["firstName"],
            last_name  = validated["lastName"],
        )
        account = Account.objects.create(user=user, role="caregiver")
        return account

    def to_representation(self, account: Account):
        return {"success"   : True,
                "username"  : account.user.username,
                "name"      : f'{account.user.first_name} {account.user.last_name}',}