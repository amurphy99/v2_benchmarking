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

A setup can also carry a few short sounds in the avatar's own voice ("mm-hm",
"yeah") for plans to play by name. `synthesize_sounds` makes them with the same
text-to-speech voice the replies use, once per process.

"""
from __future__ import annotations
from typing     import Literal, TYPE_CHECKING

import asyncio, base64

# From this project
from ..consumers.utils.groups import format_send_actions_command

if TYPE_CHECKING: from ..consumers.consumers import ChatConsumer

# Moods the LLM may choose (`frontend/src/pages/admin/capabilities/profiles.ts` copies them)
# TODO: Add these to the response model
ResponseMood = Literal["Neutral", "Grumpy", "Happy", "Love", "Sad", "Scared", "Sick", "Surprised", "Thinking", "Tired"]

# One `avatar_setup` or `avatar_plan` body, in the wire format (`HARNESS_PROTOCOL.md` §2 and §3)
AvatarSetup = dict[str, object]
AvatarPlan  = dict[str, object]

# A setup's `sounds`: each name's clip as base64 PCM (16-bit mono) and its sample rate (§2)
AvatarSounds = dict[str, dict[str, object]]

# Clips synthesized so far, by the words spoken (every chat in the process shares one voice)
_sound_clips: AvatarSounds = {}


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


# --------------------------------------------------------------------------------
# Setup Sounds
# --------------------------------------------------------------------------------
# Synthesize a setup's sounds in the avatar's own voice (`words`: the name a plan uses -> the words spoken)
async def synthesize_sounds(words: dict[str, str]) -> AvatarSounds:
    # Imported here so the harness modules still load where the Google client isn't installed
    from ..services.speech.tts.tts_google import TextToSpeechProvider

    # Each clip is made once, off the event loop (the provider's call blocks)
    missing  = [text for text in words.values() if text not in _sound_clips]
    provider = TextToSpeechProvider() if missing else None
    for text in missing:
        pcm, sample_rate, _, _ = await asyncio.to_thread(provider.synthesize_speech, text)

        # A session saved with a cue set must have run with that set's sounds
        if not pcm: raise RuntimeError(f"No audio was synthesized for the avatar sound {text!r}")
        _sound_clips[text] = {"audio": base64.b64encode(pcm).decode("ascii"), "sample_rate": sample_rate}

    return {name: _sound_clips[text] for name, text in words.items()}


# --------------------------------------------------------------------------------
# Shared Plans
# --------------------------------------------------------------------------------
# Back to listening at once: the held prop down and the eyes free (newer speech cancelled the reply)
def listening_plan(turn: int) -> AvatarPlan:
    return {"id": f"t{turn}-listen", "turn": turn, "steps": [{"state": "listening", "prop": {"raise": 0}, "gaze": "release"}]}
