"""
The robot mood vocabulary, and the frame that shows a mood on the avatar.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.avatar`

Moods go out as `robot_action` emotions. The backend sends every frontend the
same vocabulary, and each one maps it onto what its own avatar can do
(`CLIENT_PROTOCOL.md` §3.1).

TODO: Send `avatar_setup` and `avatar_plan` from here once a chat type drives the
      avatar with plans (`frontend/src/pages/common/avatar/AVATAR_PLANS.md`).

"""
from __future__ import annotations
from typing     import Literal, TYPE_CHECKING

# From this project
from ..consumers.utils.groups import format_send_actions_command

if TYPE_CHECKING: from ..consumers.consumers import ChatConsumer

# Moods the LLM may choose (`frontend/src/pages/admin/capabilities/profiles.ts` copies them)
# TODO: Add these to the response model
ResponseMood = Literal["Neutral", "Grumpy", "Happy", "Love", "Sad", "Scared", "Sick", "Surprised", "Thinking", "Tired"]


# Send a mood to the primary client as a `robot_action` emotion, label unchanged
async def send_mood(consumer: ChatConsumer, mood: ResponseMood) -> None:
    await format_send_actions_command(consumer, {"data": {"kind": "emotion", "value": mood}})
