"""
Adapt the activity-chat response pipeline to the shared response-engine hook.
--------------------------------------------------------------------------------
`backend.chat_app.services.llm.live_chat.activity_response_engine`

`ChatHandler` asks whichever engine a consumer supplies for a `ResponseOutcome`
and applies it the same way for every chat type. This adapter lets the activity
pipeline answer through that hook, so the shared response flow needs no
activity-specific code.

Chats that supply an engine skip the regex end/pause intent detection. The
activity's own closing flow decides when the chat ends and reports it through
`close_after`.

NOTE: Unlike the active-listening engine, this one is created per connection
      and is not free of side effects. The activity pipeline updates its own
      state while it generates, before the exchange is committed, so a cancelled
      attempt can advance that state by a turn the user never heard.

"""
from __future__      import annotations
from collections.abc import Awaitable, Callable

# From this project
from .active_listening.response_engine import ChatContext, MoodPublisher
from .active_listening.response_models import DialogueState, ResponseOutcome, ResponseTrigger

# Activity pipeline entry point: returns at least {"text": ...}, with "close_after" set on the final turn
ActivityResponse = Callable[[ChatContext], Awaitable[dict[str, object]]]


# ================================================================================
# Activity Response Engine
# ================================================================================
class ActivityResponseEngine:
    """
    Wrap the activity consumer's response method so it satisfies the same
    `generate` contract as `ActiveListeningEngine`.
    """
    # Store the pipeline entry point used by every response attempt
    def __init__(self, response_method: ActivityResponse) -> None:
        self.response_method = response_method

    # --------------------------------------------------------------------------------
    # Generate Response Outcome
    # --------------------------------------------------------------------------------
    async def generate(
        self,
        context        : ChatContext,      # Conversation history including the latest staged user turn
        trigger        : ResponseTrigger,  # Unused -- activity replies do not depend on what requested them
        dialogue_state : DialogueState,    # Unused -- the activity pipeline keeps its own state
        publish_mood   : MoodPublisher,    # Unused -- the activity pipeline does not produce a mood
    ) -> ResponseOutcome:
        """
        Run one activity turn and translate its result into the outcome that the
        WebSocket response coordinator already knows how to commit and apply.
        """
        result = await self.response_method(context)
        return ResponseOutcome(
            message     = str(result.get("text") or ""),
            robot_mood  = "Neutral",                        # Required by the outcome; never published for activity chats
            close_after = bool(result.get("close_after")),
        )
