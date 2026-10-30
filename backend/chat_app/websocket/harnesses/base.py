"""
Contract for chat-type harnesses and the reply attempts passed to them.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.base`

A harness holds everything one chat type does differently from the others. The
chat consumer builds one per connection, and `ChatHandler` asks it for every
reply, so the shared pipeline never checks which chat type it is running.

A reply proposes its effects in a `ResponseOutcome` instead of applying them.
`ChatHandler` applies them only once that reply's exchange is saved, so a reply
cancelled by newer speech never leaves the chat in a state the user never heard.

"""
from __future__  import annotations
from abc         import ABC, abstractmethod
from dataclasses import dataclass
from typing      import Awaitable, Callable, Literal, TYPE_CHECKING

# From this project
from .avatar import ResponseMood

if TYPE_CHECKING: from ..consumers.consumers import ChatConsumer


# --------------------------------------------------------------------------------
# Reply Types
# --------------------------------------------------------------------------------
# Conversation turns as (role, text, timestamp), oldest first
ChatContext = list[tuple[str, str, float]]

# What asked for a reply: a finalized utterance, or an explicit `reply_now` command
ResponseTrigger = Literal["automatic", "reply_now"]

# Sends a robot mood before the reply (dropped if newer speech cancelled it)
MoodPublisher = Callable[[ResponseMood], Awaitable[None]]


# --------------------------------------------------------------------------------
# Reply Attempts and Outcomes
# --------------------------------------------------------------------------------
# Everything a harness gets for one reply attempt
@dataclass(frozen=True, slots=True)
class TurnAttempt:
    context      : ChatContext      # Conversation so far, ending with the staged user turn
    user_text    : str              # The staged user turn (everything said since the last reply)
    trigger      : ResponseTrigger  # What asked for this reply
    publish_mood : MoodPublisher    # Sends a robot mood now, before the reply text

# One reply, and the effects to apply once its exchange is saved
@dataclass(frozen=True, slots=True)
class ResponseOutcome:
    message         : str             # Spoken assistant reply
    state           : object = None   # Harness state to enter once the exchange is saved (None keeps the current one)
    pause_listening : bool   = False  # Stop the STT stream once the reply is saved
    close_after     : bool   = False  # Send `chat_ended` and close once the reply has gone out


# ================================================================================
# Chat Harness
# ================================================================================
# Everything one chat type does differently, built once per connection
class ChatHarness(ABC):
    """
    The first entry of `CONDITIONS` and of `VARIANTS` is the default a client gets
    when it leaves that parameter out; an empty tuple means the chat type takes none.
    """
    NAME       : str                   # `chat_type` value that selects this harness (saved on the session)
    CONDITIONS : tuple[str, ...] = ()  # Cue sets a client can pick with `condition`
    VARIANTS   : tuple[str, ...] = ()  # Task content (a map, a scenario) a client can pick with `variant`

    # Dialogue state every chat starts in (`committed` replaces it on the instance)
    state : object = None

    # Keep the connection this harness serves and the options it was picked with
    def __init__(self, consumer: ChatConsumer, *, condition: str, variant: str) -> None:
        self.consumer  = consumer
        self.condition = condition
        self.variant   = variant

    # Reply to the staged user turn (newer speech may cancel it at any await)
    @abstractmethod
    async def generate(self, attempt: TurnAttempt) -> ResponseOutcome: ...

    # Enter the state a reply proposed, now that its exchange is saved
    def committed(self, outcome: ResponseOutcome) -> None:
        if outcome.state is not None: self.state = outcome.state
