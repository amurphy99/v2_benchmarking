"""
The active-listening chat type: a turn assessment shapes each spoken reply.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.active_listening.harness`

The process-wide engine (`response_engine.py`) does the work. This harness keeps
one connection's dialogue state and hands it to the engine on every turn. See
this directory's README for the response flow.

"""
from __future__ import annotations

# From this project
from ..base            import ChatHarness, ResponseOutcome, TurnAttempt
from  .response_engine import get_active_listening_engine
from  .response_models import DialogueState


# ================================================================================
# Active-Listening Harness
# ================================================================================
# Assess each user turn, then reply through the shared engine
class ActiveListeningHarness(ChatHarness):
    NAME = "active_listening"

    # Pending end-chat confirmation, entered once the reply that asked for it is saved
    state : DialogueState = "normal"

    # Run one turn through the engine with this connection's dialogue state
    async def generate(self, attempt: TurnAttempt) -> ResponseOutcome:
        return await get_active_listening_engine().generate(
            context        = attempt.context,
            trigger        = attempt.trigger,
            dialogue_state = self.state,
            publish_mood   = attempt.publish_mood,
        )
