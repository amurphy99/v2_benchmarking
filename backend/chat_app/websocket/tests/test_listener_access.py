"""
Check who the admin listener socket lets in.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.tests.test_listener_access`

The Monitor page's live view connects to `ws/chat/<session_id>/listen/`. Staff
and caregivers linked to the session's participant may listen; any other
account is closed with `4003` before the socket is accepted.

"""
from channels.routing    import URLRouter
from channels.testing    import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test         import TransactionTestCase

# From this project
from chat_app.models            import Access, Account, ChatSession, Profile, UserSettings
from chat_app.websocket.routing import websocket_urlpatterns

# Long enough for the listener to send its initial data before the test hangs up
LISTENER_TEST_TIMEOUT_SEC = 5


# ================================================================================
# Listener Access
# ================================================================================
# A linked caregiver and staff may listen; an unlinked caregiver may not
class ListenerAccessTests(TransactionTestCase):
    # One participant's active chat, a caregiver linked to them, one who is not, and staff
    def setUp(self) -> None:
        User = get_user_model()
        participant  = Account.objects.create(user=User.objects.create_user(username="listen_participant"), role="patient")
        profile      = Profile.objects.create(account=participant)
        UserSettings.objects.create(profile=profile)
        self.session = ChatSession.objects.create(profile=profile, source="webapp", is_active=True)

        self.linked   = User.objects.create_user(username="listen_linked")
        self.unlinked = User.objects.create_user(username="listen_unlinked")
        self.staff    = User.objects.create_user(username="listen_staff", is_staff=True)
        Access.objects.create(account=Account.objects.create(user=self.linked, role="caregiver"), profile=profile)
        Account.objects.create(user=self.unlinked, role="caregiver")

    # Open a listener socket as one user and report (accepted, close code or subprotocol)
    async def connect_as(self, user: object) -> tuple[bool, object]:
        communicator = WebsocketCommunicator(URLRouter(websocket_urlpatterns), f"/ws/chat/{self.session.id}/listen/")
        communicator.scope["user"] = user
        result = await communicator.connect(timeout=LISTENER_TEST_TIMEOUT_SEC)
        await communicator.disconnect(timeout=LISTENER_TEST_TIMEOUT_SEC)
        return result

    # A caregiver linked to the participant and staff are both accepted
    async def test_linked_caregiver_and_staff_can_listen(self) -> None:
        for user in (self.linked, self.staff):
            accepted, _ = await self.connect_as(user)
            self.assertTrue(accepted)

    # A caregiver linked to someone else is refused with 4003
    async def test_unlinked_caregiver_is_refused(self) -> None:
        accepted, close_code = await self.connect_as(self.unlinked)
        self.assertFalse(accepted)
        self.assertEqual(close_code, 4003)
