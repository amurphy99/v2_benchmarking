"""
Scope tests for a caregiver linked to several participants.
--------------------------------------------------------------------------------
`backend.chat_app.tests.test_caregiver_access`

The Monitor page lists chats through `/api/chatsessions/`, which must hold only
the caregiver's linked participants. The single-participant caregiver pages read
`/api/profile/`, which must show the first linked participant instead of
failing.

"""
from django.contrib.auth import get_user_model
from django.test         import TestCase
from django.urls         import reverse

from rest_framework.test import APIClient

# From this project
from chat_app.models import Access, Account, ChatSession, Profile


# ================================================================================
# Caregiver With Several Participants
# ================================================================================
# One caregiver linked to two participants, plus a third participant they cannot see
class CaregiverScopeTests(TestCase):
    # Three participants with one finished chat each; the caregiver is linked to the first two
    def setUp(self) -> None:
        User = get_user_model()
        self.caregiver = User.objects.create_user(username="scope_caregiver")
        caregiver_account = Account.objects.create(user=self.caregiver, role="caregiver")

        self.profiles = []
        for username in ("scope_first", "scope_second", "scope_outside"):
            account = Account.objects.create(user=User.objects.create_user(username=username), role="patient")
            profile = Profile.objects.create(account=account)
            ChatSession.objects.create(profile=profile, source="webapp", is_active=False)
            self.profiles.append(profile)

        for profile in self.profiles[:2]: Access.objects.create(account=caregiver_account, profile=profile)

        self.api = APIClient()
        self.api.force_authenticate(user=self.caregiver)

    # The Monitor chat list holds only the two linked participants' chats
    def test_chat_list_holds_only_linked_participants(self) -> None:
        response = self.api.get(reverse("chatsession-list", kwargs={"active": 0, "demo": 0}))
        self.assertEqual(response.status_code, 200)

        listed = {session["profile"]["account"]["user"]["username"] for session in response.data}
        self.assertEqual(listed, {"scope_first", "scope_second"})

    # The caregiver pages show the participant linked first
    def test_profile_is_first_linked_participant(self) -> None:
        response = self.api.get(reverse("profile"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], self.profiles[0].id)
