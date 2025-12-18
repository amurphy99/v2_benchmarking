# Django Rest Framework imports
from rest_framework import viewsets, generics, permissions
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.views       import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer
from rest_framework_simplejwt.state import token_backend

# Can I move the serializers.py file into this folder ?
from ..models      import Account, Profile, Access, Goal, UserSettings, Reminder, ChatSession
from  .serializers import AccountSerializer, ProfileSerializer, AccessSerializer, GoalSerializer, UserSettingsSerializer, ReminderSerializer, ChatSessionSerializer, SignupPatientSerializer, SignupAccountSerializer, DownloadDataSerializer
from  .mixins      import ProfileMixin
from ..helpers.downloadHelpers     import get_download_data

# ======================================================================= ===================================
# Single-object endpoints (no list, one-to-one)
# ======================================================================= ===================================
# ToDo: add one-to-one contraints to these
class GoalView(ProfileMixin, generics.RetrieveUpdateAPIView):
    """
    (Might need to do the reset stuff or last start data that is implemented in the model definition...)
    GET  /api/goal/  => fetch the single Goal row for this user
    PUT  /api/goal/  => update target / auto_renew / period / start_date / start_dow
    """
    serializer_class   = GoalSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        profile = self.get_profile()
        goal, _ = Goal.objects.get_or_create(profile=profile)
        return goal

class UserSettingsView(ProfileMixin, generics.RetrieveUpdateAPIView):
    """
    GET  /api/settings/  => fetch the single UserSettings row for this user
    PUT  /api/settings/  => update various fields
    """
    serializer_class   = UserSettingsSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        profile = self.get_profile()
        settings, _ = UserSettings.objects.get_or_create(profile=profile)
        return settings
    
class DownloadDataView(ProfileMixin, generics.RetrieveAPIView):
    """View to request the user's data to download. Returns a formatted string of the user's data."""
    serializer_class   = DownloadDataSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_object(self):
        return self.get_profile()

# ======================================================================= ===================================
# List + Create
# ======================================================================= ===================================
class ReminderViewSet(ProfileMixin, viewsets.ModelViewSet):
    """
    ToDo: ....
    GET  /api/reminders/  => 
    PUT  /api/reminders/  => 
    """
    serializer_class   = ReminderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        profile = self.get_profile()
        return Reminder.objects.filter(profile=profile)
    
    def perform_create(self, serializer):
        serializer.save(profile=self.get_profile())

# ======================================================================= ===================================
# Read-only List & Details (messages, biomarkers)
# ======================================================================= ===================================
class ChatSessionViewSet(ProfileMixin, viewsets.ReadOnlyModelViewSet):
    """
    ToDo:
        * I think I need to make sure average scores and duration are included
        * also add default string values to sentiment/topics
        * Add functionality to just get the latest chat session?
    """
    serializer_class   = ChatSessionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self): 
        profile = self.get_profile()
        return (ChatSession.objects
                .filter(profile=profile)
                .filter(is_active=False)
                .select_related("profile", "image")
                .prefetch_related("messages", "biomarker_scores"))

# ======================================================================= ===================================
# Profile Related Views
# ======================================================================= ===================================
class SignupPatientView(generics.CreateAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class   = SignupPatientSerializer
    
class SignupAccountView(generics.CreateAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class   = SignupAccountSerializer

class ProfileView(ProfileMixin, generics.RetrieveAPIView):
    serializer_class   = ProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.get_profile() 
     
class AccountView(generics.RetrieveAPIView):
    serializer_class   = AccountSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        user = self.request.user
        return Account.objects.get(user=user)
    
class SingleAccountView(ProfileMixin, generics.RetrieveAPIView):
    serializer_class   = AccountSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        username = self.kwargs["username"]
        user = get_user_model().objects.get(username=username)
        account = Account.objects.get(user=user)
        return account

class AccessView(ProfileMixin, generics.RetrieveAPIView):
    serializer_class    = AccessSerializer
    permission_classes  = [permissions.IsAuthenticated]
    
    def get_object(self):
        account = self.get_account
        return Access.objects.get(account=account)

# ======================================================================= ===================================
# Tokens 
# ======================================================================= ===================================
class MyTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["id"        ] = user.id
        token["username"  ] = user.username
        return token
    
    # Extra keys that appear in the JSON response
    def validate(self, attrs):
        data = super().validate(attrs)  # gives you {"refresh": ..., "access": ...}
        data["user"] = {
            "id"        : self.user.id,
            "username"  : self.user.username,
            "first_name": self.user.first_name,
            "last_name" : self.user.last_name,
            "is_staff"  : self.user.is_staff,
        }
        return data

class MyTokenObtainPairView(TokenObtainPairView):
    serializer_class = MyTokenObtainPairSerializer
    
class MyTokenRefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)      # gives {"refresh": ..., "access": ...}
        decoded_payload = token_backend.decode(data['access'], verify=True)
        user_id=decoded_payload['user_id']
        user = get_user_model().objects.get(id=user_id)
        data["user"] = {
            "id"        : user.id,
            "username"  : user.username,
            "first_name": user.first_name,
            "last_name" : user.last_name,
            "is_staff"  : user.is_staff,
        }
        return data
class MyTokenRefreshView(TokenRefreshView):
    permission_classes = (permissions.AllowAny,)
    serializer_class = MyTokenRefreshSerializer