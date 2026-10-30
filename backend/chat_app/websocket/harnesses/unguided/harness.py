"""
Open conversation with the companion persona (the default chat type).
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.unguided.harness`

Each staged user turn is checked for a spoken end-chat or pause request first
(`intents.py`), which gets a scripted reply. Anything else goes to the
single-stage LLM (`cognibot_api.py`), whose mood is sent ahead of the reply.

"""
from __future__ import annotations

# From this project
from ....services.llm.chat_utilities import get_LLM_response
from   ..base                        import ChatHarness, ResponseOutcome, TurnAttempt
from    .intents                     import IntentState, scripted_outcome


# ================================================================================
# Unguided Harness
# ================================================================================
# Reply with a scripted line to an end-chat or pause request, and with the LLM otherwise
class UnguidedHarness(ChatHarness):
    NAME = "unguided"

    # Whether the last saved reply asked the user to confirm ending the chat
    state : IntentState = "normal"

    # Scripted replies skip the LLM; an LLM reply also drops a pending end-chat request
    async def generate(self, attempt: TurnAttempt) -> ResponseOutcome:
        scripted = scripted_outcome(attempt.user_text, self.state)
        if scripted is not None: return scripted

        # The mood goes out as soon as the LLM returns, ahead of the reply text
        response = await get_LLM_response(attempt.context)
        await attempt.publish_mood(response.response_mood)
        return ResponseOutcome(message=response.message, state="normal")
