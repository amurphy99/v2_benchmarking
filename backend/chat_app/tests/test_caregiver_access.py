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
from chat_app.models import Access, Account, ChatMessage, ChatSession, Profile


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

    # A participant's own list counts each chat's messages once, however many caregivers they have
    # (the access filter joins one row per caregiver, and every one of them matches the participant)
    def test_message_counts_hold_with_several_caregivers(self) -> None:
        second = Account.objects.create(user=get_user_model().objects.create_user(username="scope_second_caregiver"), role="caregiver")
        Access.objects.create(account=second, profile=self.profiles[0])
        session = ChatSession.objects.get(profile=self.profiles[0])
        for role, text in (("user", "Hi"), ("assistant", "Hello!")): ChatMessage.objects.create(session=session, role=role, content=text)

        self.api.force_authenticate(user=self.profiles[0].account.user)
        response = self.api.get(reverse("chatsession-list", kwargs={"active": 0, "demo": 0}))
        self.assertEqual([row["message_count"] for row in response.data], [2])

    # The caregiver pages show the participant linked first
    def test_profile_is_first_linked_participant(self) -> None:
        response = self.api.get(reverse("profile"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], self.profiles[0].id)
