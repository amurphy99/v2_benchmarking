from rest_framework.routers         import DefaultRouter
from django.urls import path, include

from .health import health
from .views import (
    GoalView, UserSettingsView,              # One-off endpoints
    ProfileView, SignupPatientView,          # Auth / Profile
    SignupAccountView, AccountView,          # Account views
    SingleAccountView, AccessView,           # Access views
    CreateAccessView, AccessViewSet,
    MyTokenObtainPairView,                   # JWT login
    MyTokenRefreshView,                      # JWT token refresh
    ChatSessionViewSet, ReminderViewSet,     # Collection endpoints
    DownloadDataView                         # Download data endpoint
)

# ------------------------------------------------------------------
# ViewSets go in a DRF router
# ------------------------------------------------------------------
router = DefaultRouter()
router.register(r"chatsessions", ChatSessionViewSet, basename="chatsession")
router.register(r"reminders",    ReminderViewSet,    basename="reminder"   )
router.register(r"accesses",       AccessViewSet,      basename="accesses" )

# ------------------------------------------------------------------
# Single-object endpoints (no list) & auth go into urlpatterns
# ------------------------------------------------------------------
urlpatterns = [
    # /api/chatsessions/
    path("", include(router.urls)),

    # Health check
    path("health/", health, name="health"),

    # Single-row resources (one per user)
    path("goal/",               GoalView.as_view(), name="goal"    ),
    path("settings/",           UserSettingsView.as_view(), name="settings"),
    path("download/",           DownloadDataView.as_view(), name="download"),

    # Profile & signup
    path("profile/",            ProfileView.as_view(), name="profile"),
    path("account/",            AccountView.as_view(), name="account"),
    path("account/<slug:username>/", SingleAccountView.as_view(), name="single_account"),
    path("signup-patient/",     SignupPatientView.as_view(), name="signup_patient" ),
    path("signup-account/",     SignupAccountView.as_view(), name="signup_account"),
    path("access/",             AccessView.as_view(), name="access"  ),
    path("access/create/",      CreateAccessView.as_view(), name="create_access"),

    # JWT login
    path("token/",              MyTokenObtainPairView.as_view(), name="token"        ),
    path("token/refresh/",      MyTokenRefreshView.as_view(), name="token_refresh"),
]