# Django Rest Framework imports
from rest_framework                       import viewsets, generics, permissions
from rest_framework.response              import Response
from rest_framework.views                 import APIView
from rest_framework_simplejwt.views       import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer
from rest_framework_simplejwt.state       import token_backend
from rest_framework.exceptions            import PermissionDenied

from django.contrib.auth import get_user_model
from django.shortcuts    import get_object_or_404

# Can I move the serializers.py file into this folder ?
from ..models      import Account, Profile, Access, Goal, UserSettings, Reminder, ChatSession, RAGInstructions, Activity
from  .serializers import AccountSerializer, ProfileSerializer, AccessSerializer, CreateAccessSerializer, GoalSerializer, UserSettingsSerializer, ReminderSerializer, ChatSessionSerializer, SignupPatientSerializer, SignupAccountSerializer, DownloadDataSerializer, RAGInstructionsSerializer
from  .mixins      import ProfileMixin, accessible_chat_sessions
from ..helpers.downloadHelpers             import get_download_data
from ..services.session_audio_storage      import create_recording_playback_url
from rag_vectorstore.services.vdb_services import index_single_instruction, delete_instruction_embeddings

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
    
class RAGInstructionsView(generics.RetrieveUpdateAPIView):
    """
    GET  /api/rag/<int:ragid>/  => fetch a single set of RAG instructions
    PUT  /api/rag/<int:ragid>/  => update various fields
    """
    serializer_class   = RAGInstructionsSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        ragid = self.kwargs["ragid"]
        instructions = RAGInstructions.objects.get(
            id=ragid, 
            user=self.request.user, # only allow access to own instructions
        )
        return instructions
    
class ChatSessionView(generics.RetrieveAPIView):
    """
    GET  /api/chatsession/<int:sessionid>/  => fetch a single ChatSession
    """
    serializer_class   = ChatSessionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        sessionid = self.kwargs["sessionid"]
        sessions = (accessible_chat_sessions(self.request.user)
                    .select_related  ("profile", "image", "audio")
                    .prefetch_related("messages__words", "biomarker_scores"))
        return get_object_or_404(sessions, id=sessionid)

class SessionAudioPlaybackView(APIView):
    """Issue a short-lived playback URL for an authorized session recording."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, sessionid: int) -> Response:
        sessions = accessible_chat_sessions(request.user).select_related("audio")
        session  = get_object_or_404(sessions, id=sessionid)
        audio    = getattr(session, "audio", None)
        if audio is None: return Response({"detail": "This session has no saved recording."}, status=404)

        response = Response({"url": create_recording_playback_url(audio, request)})
        response["Cache-Control"] = "private, no-store"
        return response

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
        
class RAGInstructionsViewSet(viewsets.ModelViewSet):
    """
    GET  /api/rag/  => fetch all RAG instructions for the current user
    """
    serializer_class   = RAGInstructionsSerializer
    permission_classes = [permissions.IsAuthenticated]

    def _require_caregiver(self):
        """
        Ensure only caregivers can create/update/delete RAG instructions.
        """
        try:
            if self.request.user.account_user.role.lower() != "caregiver":
                raise PermissionDenied("Only caregivers can manage RAG instructions.")
        except Exception:
            raise PermissionDenied("Only caregivers can manage RAG instructions.")

    def get_queryset(self):
        self._require_caregiver()
        # Only return instructions belonging to the logged-in user
        return RAGInstructions.objects.filter(user=self.request.user).order_by("instruction_order", "name")

    def perform_create(self, serializer):
        # Only caregivers should be able to create RAG instructions, since they are the ones configuring the activities for the PLWD. Enforce this at the API level.
        self._require_caregiver()
        # For now, always use the 'memory_activity'
        activity = Activity.objects.get(name="memory_activity")
        instance = serializer.save(user=self.request.user, activity=activity)

        # Vector DB update
        try:
            index_single_instruction(instance)
        except Exception as e:
            print(f"[VectorDB] Failed to index new instruction {instance.id}: {e}")

    def perform_update(self, serializer):
        self._require_caregiver()
        # Save the updated instruction to the default DB
        instance = serializer.save()

        # Update the vector store for this instruction
        try:
            index_single_instruction(instance)
        except Exception as e:
            print(f"[VectorDB] Failed to update embedding for instruction {instance.id}: {e}")

    def perform_destroy(self, instance):
        self._require_caregiver()
        inst_id = instance.id

        # Delete chunks from vector DB first
        try:
            delete_instruction_embeddings(inst_id)
        except Exception as e:
            print(f"[VectorDB] Failed to delete embeddings for {inst_id}: {e}")

        # Delete from default DB
        instance.delete()

# ================================================================================ 
# [Read-Only] ChatSession & Details (messages, biomarkers)
# ================================================================================ 
class ChatSessionViewSet(ProfileMixin, viewsets.ReadOnlyModelViewSet):
    """
    TODO: Should this be protected based on what kind of user you are?
    """
    serializer_class   = ChatSessionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self): 
        # Filtering objects  
        active  = self.kwargs["active"]
        demo    = self.kwargs["demo"  ]
        
        # Start with the base query (unfiltered by profile)
        objs = (accessible_chat_sessions(self.request.user)
                .select_related("profile", "image", "audio")
                .prefetch_related("messages__words", "biomarker_scores"))

        # Filter for active / inactive chats
        if   int(active) == 0: objs = objs.filter(is_active=False)
        elif int(active) == 1: objs = objs.filter(is_active=True )

        # Filter for demo vs. real data
        if   int(demo) == 0:  objs = objs.exclude(source="demo")
        elif int(demo) == 1:  objs = objs.filter (source="demo")

        # Return ChatSessions ordered by creation date
        return objs.order_by("-date")

# --------------------------------------------------------------------------------
# Return just the most recent ChatSession
# --------------------------------------------------------------------------------
class LatestChatSessionView(ProfileMixin, generics.RetrieveAPIView):
    serializer_class   = ChatSessionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        profile = self.get_profile()
        return (ChatSession.objects
                .filter(profile=profile)
                .select_related("profile", "image", "audio")
                .prefetch_related("messages__words", "biomarker_scores")
                .order_by("-end_ts")
                .first())

# ======================================================================= ===================================
# Profile Related Views
# ======================================================================= ===================================
class SignupPatientView(generics.CreateAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class   = SignupPatientSerializer
    
class SignupAccountView(generics.CreateAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class   = SignupAccountSerializer

class ProfileView(ProfileMixin, generics.RetrieveUpdateAPIView):
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
    
class SingleAccountView(generics.RetrieveAPIView):
    serializer_class   = AccountSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        username = self.kwargs["username"]
        user = get_user_model().objects.get(username=username)
        account = Account.objects.get(user=user)
        return account

class AccessView(ProfileMixin, generics.RetrieveUpdateAPIView):
    serializer_class    = AccessSerializer
    permission_classes  = [permissions.IsAuthenticated]
    
    def get_object(self):
        account = self.get_account()
        return Access.objects.get(account=account)
    
class CreateAccessView(generics.CreateAPIView):
    serializer_class   = CreateAccessSerializer
    permission_classes = [permissions.IsAuthenticated]

class AccessViewSet(ProfileMixin, viewsets.ModelViewSet):
    serializer_class    = AccessSerializer
    permission_classes  = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        profile = self.get_profile()
        return Access.objects.filter(profile=profile)

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
