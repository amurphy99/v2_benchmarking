"""
Avatar frames: the robot mood vocabulary, and capable avatars' setups and plans.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.avatar`

Moods go out as `robot_action` emotions. The backend sends every frontend the
same vocabulary, and each one maps it onto what its own avatar can do
(`CLIENT_PROTOCOL.md` §3.1).

A plan-driven chat type drives a capable avatar with `avatar_setup` and
`avatar_plan` frames instead (`consumers/HARNESS_PROTOCOL.md`), and sends no
moods: a `robot_action` cuts the running plan short. Its harness builds each plan
from the avatar's own names, and the client rejects any plan it can't run whole.

"""
from __future__ import annotations
from typing     import Literal, TYPE_CHECKING

# From this project
from ..consumers.utils.groups import format_send_actions_command

if TYPE_CHECKING: from ..consumers.consumers import ChatConsumer

# Moods the LLM may choose (`frontend/src/pages/admin/capabilities/profiles.ts` copies them)
# TODO: Add these to the response model
ResponseMood = Literal["Neutral", "Grumpy", "Happy", "Love", "Sad", "Scared", "Sick", "Surprised", "Thinking", "Tired"]

# One `avatar_setup` or `avatar_plan` body, in the wire format (`HARNESS_PROTOCOL.md` §2 and §3)
AvatarSetup = dict[str, object]
AvatarPlan  = dict[str, object]


# --------------------------------------------------------------------------------
# Send Avatar Frames
# --------------------------------------------------------------------------------
# Send a mood to the primary client as a `robot_action` emotion, label unchanged
async def send_mood(consumer: ChatConsumer, mood: ResponseMood) -> None:
    await format_send_actions_command(consumer, {"data": {"kind": "emotion", "value": mood}})

# Send session settings to the primary client (each setup replaces the last, and plans never cancel it)
async def send_avatar_setup(consumer: ChatConsumer, setup: AvatarSetup) -> None:
    await consumer.send_json({"type": "avatar_setup", "data": setup})

# Send a plan to the primary client (it drops every older plan's waiting steps)
async def send_avatar_plan(consumer: ChatConsumer, plan: AvatarPlan) -> None:
    await consumer.send_json({"type": "avatar_plan", "data": plan})
