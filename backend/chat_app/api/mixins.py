from rest_framework.exceptions import NotFound
from ..models import Profile, Account

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
            
def get_profile(user):
    '''
    Gets a profile based on the user given.
    user: The user to get the profile for.
    '''
    try:
        account = Account.objects.get(user=user)
        try:
            return Profile.objects.get(mainUser=account)
        except Profile.DoesNotExist:
            raise NotFound("No matching Profile for this user.")
    except Account.DoesNotExist:
        raise NotFound("No matching Account for this user.")