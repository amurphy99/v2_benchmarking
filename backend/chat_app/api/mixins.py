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
    
    def get_account(self):
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
    
def get_profile(user):
    '''
    Gets a profile based on the given user. Will first check if the given user is the owner of a Profile, then checks which Profile
    the user has access to. Each user only has access to one Profile.
    user: The user to get the profile for.
    '''
    account = get_account(user)
    try: return Profile.objects.get(account=account)
    except Profile.DoesNotExist:
        try:
            access = Access.objects.get(account=account)
            return access.profile
        except Access.DoesNotExist:
            print("This Account does not have access to any Profiles.")
            return None

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
