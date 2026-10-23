"""
URL routes for the REST API (mounted under `/api/`).
--------------------------------------------------------------------------------
`backend.chat_app.api.router`

ViewSets go through the DRF router; single-object endpoints, staff account
creation, and the JWT login routes are listed in `urlpatterns`. There is no public
signup route: staff create every account.

"""
from rest_framework.routers         import DefaultRouter
from django.urls import path, include

from .health import health
from .views import (
    AdminProfileViewSet,                     # Admin participant settings
    AdminCaregiverViewSet,                   # Admin caregiver links
    AdminCreateAccountView,                  # Admin account creation
    GoalView, UserSettingsView,              # One-off endpoints
    ProfileView, AccountView,                # Profile & account
    AccessViewSet,                           # Who a profile is shared with
    MyTokenObtainPairView,                   # JWT login
    MyTokenRefreshView,                      # JWT token refresh
    LatestChatSessionView,
    ChatSessionViewSet, ReminderViewSet,     # Collection endpoints
    ChatSessionView,
    SessionAudioPlaybackView,
    DownloadDataView,                        # Download data endpoint
    RAGInstructionsView,                     # RAG Instructions endpoint
    RAGInstructionsViewSet                   # RAG Instructions list endpoint
)

# --------------------------------------------------------------------------------
# ViewSets go in a DRF router
# --------------------------------------------------------------------------------
router = DefaultRouter()
# The regex allows us to filter by active and demo status: 0 for false, 1 for true
router.register(r"chatsessions/(?P<active>\d+)/(?P<demo>\d+)", ChatSessionViewSet, basename="chatsession")
router.register(r"reminders",        ReminderViewSet, basename="reminder"        )
router.register(r"accesses",           AccessViewSet, basename="accesses"        )
router.register(r"rags",      RAGInstructionsViewSet, basename="rag_instructions")

# Participant settings (scoped to the caller's participants): /api/admin/profiles/ and /api/admin/profiles/<id>/
router.register(r"admin/profiles",   AdminProfileViewSet,   basename="admin_profile"  )

# Staff-only caregiver links: /api/admin/caregivers/ and /api/admin/caregivers/<id>/
router.register(r"admin/caregivers", AdminCaregiverViewSet, basename="admin_caregiver")

# --------------------------------------------------------------------------------
# Single-object endpoints (no list) & auth go into urlpatterns
# --------------------------------------------------------------------------------
urlpatterns = [
    # /api/chatsessions/
    path("", include(router.urls)),

    # Health check
    path("health/", health, name="health"),

    # Single-row resources (one per user)
    path("goal/",     GoalView        .as_view(), name="goal"    ),
    path("settings/", UserSettingsView.as_view(), name="settings"),
    path("download/", DownloadDataView.as_view(), name="download"),

    # Profile & account
    path("profile/", ProfileView.as_view(), name="profile"),
    path("account/", AccountView.as_view(), name="account"),

    # Staff-only account creation
    path("admin/accounts/", AdminCreateAccountView.as_view(), name="admin_create_account"),
    
    # Single-row resources
    path("rag/<int:ragid>/", RAGInstructionsView.as_view(), name="rag_instructions"),
    path("chatsession/<int:sessionid>/", ChatSessionView.as_view(), name="chatsession"),
    path("chatsession/<int:sessionid>/audio-playback/", SessionAudioPlaybackView.as_view(), name="session_audio_playback"),
    path("chatsession/latest/", LatestChatSessionView.as_view(), name="latest_chatsession"),

    # JWT login
    path("token/",         MyTokenObtainPairView.as_view(), name="token"        ),
    path("token/refresh/", MyTokenRefreshView   .as_view(), name="token_refresh"),
]
