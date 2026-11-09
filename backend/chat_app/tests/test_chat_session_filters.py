"""
The session list's filters on what ran: chat type, condition, and variant.
--------------------------------------------------------------------------------
`backend.chat_app.tests.test_chat_session_filters`

The Monitor page and researchers read which chat type, cue condition, and task
variant each session ran from `/api/chatsessions/`, and can narrow the list to
one of them with query parameters.

"""
from django.contrib.auth import get_user_model
from django.test         import TestCase
from django.urls         import reverse

from rest_framework.test import APIClient

# From this project
from chat_app.models import Account, ChatSession, Profile


# ================================================================================
# Session List Filters
# ================================================================================
# A staff member's view of one participant's three finished chats of different types
class ChatSessionRunFilterTests(TestCase):
    # An open conversation (no condition or variant), and two planning chats in different conditions
    def setUp(self) -> None:
        User    = get_user_model()
        account = Account.objects.create(user=User.objects.create_user(username="filter_participant"), role="patient")
        profile = Profile.objects.create(account=account)
        for chat_type, condition, variant in (("unguided", "", ""), ("cooperative_planning", "cues", "dinner_party"), ("cooperative_planning", "no_cues", "dinner_party")):
            ChatSession.objects.create(profile=profile, source="webapp", is_active=False, chat_type=chat_type, condition=condition, variant=variant)

        self.api = APIClient()
        self.api.force_authenticate(user=User.objects.create_user(username="filter_staff", is_staff=True))

    # The listed sessions' (chat type, condition) pairs for these query parameters
    def _listed(self, **params: str) -> set[tuple[str, str]]:
        response = self.api.get(reverse("chatsession-list", kwargs={"active": 0, "demo": 0}), params)
        self.assertEqual(response.status_code, 200)
        return {(session["chat_type"], session["condition"]) for session in response.data}

    # Every session carries what ran, and no filter lists them all
    def test_sessions_carry_what_ran(self) -> None:
        self.assertEqual(self._listed(), {("unguided", ""), ("cooperative_planning", "cues"), ("cooperative_planning", "no_cues")})

    # Each filter is an exact match, and they combine
    def test_filters_narrow_the_list(self) -> None:
        self.assertEqual(self._listed(chat_type="cooperative_planning"),                      {("cooperative_planning", "cues"), ("cooperative_planning", "no_cues")})
        self.assertEqual(self._listed(chat_type="cooperative_planning", condition="no_cues"), {("cooperative_planning", "no_cues")})
        self.assertEqual(self._listed(variant=""),                                            {("unguided", "")})
