"""
Resolve which profiles and chat sessions the logged-in user may reach.
--------------------------------------------------------------------------------
`backend.chat_app.api.mixins`

A patient owns one profile. A caregiver owns none and reaches participants
through `Access` links, and may hold several. Staff (`is_staff`) reach every
profile and session.

"""
from rest_framework.exceptions import NotFound
from django.db.models import Q, QuerySet

from ..models import Profile, Account, Access, ChatSession

class ProfileMixin:
    """
    Re-usable Profile retrieval helper
    -----------------------------------------------------------------------
    Resolves request.user to the linked Profile, either as the Profile's main user (the Patient)
    or any of the shared users.
    Raise 404 if not found.
    """
    def get_profile(self):
        user = self.request.user
        return get_profile(user)

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

# Return the user's own profile, else the first participant linked to them (None without one)
def get_profile(user: object) -> Profile | None:
    """
    The caregiver pages show one participant at a time, so a caregiver linked to
    several participants sees the one linked first there. The Monitor pages show
    all of them through `monitored_profiles`.
    """
    account = get_account(user)
    try: return Profile.objects.get(account=account)
    except Profile.DoesNotExist:
        access = Access.objects.filter(account=account).order_by("id").first()
        return access.profile if (access is not None) else None

# Return every profile for staff, otherwise only the participants linked to this user
def monitored_profiles(user: object) -> QuerySet[Profile]:
    if user.is_staff: return Profile.objects.all()
    return Profile.objects.filter(profile_access__account__user=user)

# Return only sessions the authenticated user may inspect or play back
def accessible_chat_sessions(user: object) -> QuerySet[ChatSession]:
    sessions = ChatSession.objects.all()
    if getattr(user, "is_staff", False): return sessions

    return sessions.filter(
        Q(profile__account__user                 = user) |
        Q(profile__profile_access__account__user = user)
    ).distinct()

# Check session access without exposing whether an inaccessible ID exists
def can_access_chat_session(user: object, session_id: int) -> bool:
    return accessible_chat_sessions(user).filter(id=session_id).exists()
