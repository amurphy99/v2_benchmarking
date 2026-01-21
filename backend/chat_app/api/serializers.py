from rest_framework import serializers
from ..models import ChatSession, ChatMessage, ChatBiomarkerScore, Profile, UserSettings, Reminder, Goal

from django.contrib.auth import get_user_model
from django.db           import transaction

# =======================================================================
# ChatSession Related Data
# =======================================================================
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
    messages       = ChatMessageSerializer(many=True, read_only=True)
    biomarkers     = BiomarkerSerializer  (many=True, read_only=True, source="biomarker_scores")
    start_ts       = serializers.SerializerMethodField()
    duration       = serializers.SerializerMethodField()
    average_scores = serializers.SerializerMethodField()

    class Meta:
        model  = ChatSession
        fields = ("id", "user", "source", "date", "is_active", "start_ts", "end_ts", "duration", "topics", "sentiment", "notes", "messages", "biomarkers", "average_scores")
        read_only_fields = fields # ToDo: "notes" shouldn't be read only...

    def get_start_ts      (self, obj): return obj.start_ts
    def get_duration      (self, obj): return obj.duration
    def get_average_scores(self, obj): return obj.average_scores

# =======================================================================
# Other Data
# =======================================================================
class UserSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model  = UserSettings
        fields = ("patientViewOverall", "patientCanSchedule")
        
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

# =======================================================================
# Profiles
# =======================================================================
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model  = get_user_model()
        fields = ("id", "username", "first_name", "last_name", "is_staff")
        read_only_fields = fields   # (all set by Django)

class ProfileSerializer(serializers.ModelSerializer):
    plwd      = UserSerializer        (read_only=True)
    caregiver = UserSerializer        (read_only=True)
    settings  = UserSettingsSerializer(read_only=True, source = "settings_user")
    goal      = GoalSerializer        (read_only=True)
    role      = serializers.SerializerMethodField()
    class Meta:
        model  = Profile
        fields = ("id", "plwd", "caregiver", "settings", "goal", "role")
        read_only_fields = fields # Not sure...

    def get_role(self, obj):
        req_user = self.context["request"].user
        return "Patient" if obj.plwd == req_user else "Caregiver"

# =======================================================================
# Signup
# =======================================================================
class SignupSerializer(serializers.Serializer):
    # Fields expected from the frontend
    plwdUsername        = serializers.CharField()
    plwdPassword        = serializers.CharField(write_only=True)
    plwdFirstName       = serializers.CharField()
    plwdLastName        = serializers.CharField()
    caregiverUsername   = serializers.CharField()
    caregiverPassword   = serializers.CharField(write_only=True)
    caregiverFirstName  = serializers.CharField()
    caregiverLastName   = serializers.CharField()

    def validate(self, attrs):
        User = get_user_model()
        if User.objects.filter(username=attrs[     "plwdUsername"]).exists(): raise serializers.ValidationError(  "Patient username already exists.")
        if User.objects.filter(username=attrs["caregiverUsername"]).exists(): raise serializers.ValidationError("Caregiver username already exists.")
        return attrs

    # Create user entries for both the patient and caregiver
    # Also create settings and goal objects for the new Profile
    # Can return whatever the API needs
    @transaction.atomic
    def create(self, validated):
        User = get_user_model()
        plwd = User.objects.create_user(
            username   = validated["plwdUsername"],
            password   = validated["plwdPassword"],
            first_name = validated["plwdFirstName"],
            last_name  = validated["plwdLastName"],
        )
        caregiver = User.objects.create_user(
            username   = validated["caregiverUsername"],
            password   = validated["caregiverPassword"],
            first_name = validated["caregiverFirstName"],
            last_name  = validated["caregiverLastName"],
        )
        profile = Profile.objects.create(plwd=plwd, caregiver=caregiver)
        UserSettings.objects.create(user=profile)
        Goal        .objects.create(user=profile)
        return profile

    def to_representation(self, profile):
        return {"success"           : True,
                "plwdUsername"      : profile.plwd     .username,
                "caregiverUsername" : profile.caregiver.username,}
