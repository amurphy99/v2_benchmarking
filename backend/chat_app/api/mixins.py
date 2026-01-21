from rest_framework.exceptions import NotFound
from ..models import Profile

class ProfileMixin:
    """
    Re-usable Profile retrieval helper
    -----------------------------------------------------------------------
    Resolves request.user to the linked Profile (patient or caregiver).
    Raise 404 if not found.
    """
    def get_profile(self):
        user = self.request.user
        try:
            return Profile.objects.get(plwd=user)
        except Profile.DoesNotExist:
            try:
                return Profile.objects.get(caregiver=user)
            except Profile.DoesNotExist:
                raise NotFound("No matching Profile for this user.")
