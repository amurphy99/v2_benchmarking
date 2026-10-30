"""
Contract for chat-type harnesses, their cues, and the turn events they hear.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.harnesses.base`

A harness holds everything one chat type does differently from the others. The
chat consumer builds one per connection, and the shared pipeline tells it about
each stage of a turn: the user's speech, a reply starting, being saved or
cancelled, and its audio playing. The pipeline never checks which chat type it
is running.

Cues are the behaviors a condition switches on or off. The harness passes every
turn event to each of its cues, and a cue reacts with side effects only (avatar
frames, or a turn of its own). A reply proposes its effects in a
`ResponseOutcome` instead, and they apply only once that reply's exchange is
saved, so a reply cancelled by newer speech never leaves the chat in a state the
user never heard.

"""
from __future__  import annotations
from abc         import ABC, abstractmethod
from dataclasses import dataclass
from datetime    import datetime
from typing      import Awaitable, Callable, Literal, TYPE_CHECKING

import logging
logger = logging.getLogger(__name__)

# From this project
from ...services.logging_utils import RESET, CC_MAIN, CC_H, CC_R
from  .avatar                  import ResponseMood

if TYPE_CHECKING: from ..consumers.consumers import ChatConsumer


# --------------------------------------------------------------------------------
# Reply Types
# --------------------------------------------------------------------------------
# Conversation turns as (role, text, timestamp), oldest first
ChatContext = list[tuple[str, str, float]]

# What asked for a reply: a finalized utterance, a `reply_now` command, or the harness itself
ResponseTrigger = Literal["automatic", "reply_now", "harness"]

# Sends a robot mood before the reply (dropped if newer speech cancelled it)
MoodPublisher = Callable[[ResponseMood], Awaitable[None]]


# --------------------------------------------------------------------------------
# User Speech Events
# --------------------------------------------------------------------------------
# One interim STT result: the utterance so far, while the user is still speaking
@dataclass(frozen=True, slots=True)
class InterimSpeech:
    text       : str       # The whole utterance so far (later interims revise it)
    new_speech : bool      # Recognition moved past the previous interim (what cancels an automatic reply)
    stability  : float     # Google's estimate that this text won't change (0-1; 0 when it gives none)
    ended_at   : datetime  # Wall-clock end of the audio recognized so far (the word timestamps' time base)

# One finalized utterance, from STT or from a text client's `transcription`
@dataclass(frozen=True, slots=True)
class FinalUtterance:
    text  : str                            # The finalized text
    words : tuple[dict[str, object], ...]  # Word timings ("word", "start", "end"; empty from a text client)


# --------------------------------------------------------------------------------
# Reply Attempts and Outcomes
# --------------------------------------------------------------------------------
# Everything a harness gets for one reply attempt
@dataclass(frozen=True, slots=True)
class TurnAttempt:
    context      : ChatContext      # Conversation so far, ending with the staged user turn (if any)
    user_text    : str              # The staged user turn ("" for a harness turn with nothing staged)
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
    A subclass builds the `cues` for its condition in its own `__init__`.

    Every hook runs on the chat's event loop and must not block; start async work
    with `fire_and_log`. `generate` is the only hook a harness must write. The others
    pass the event on to each cue, so a subclass that overrides one calls `super()`.
    """
    NAME       : str                   # `chat_type` value that selects this harness (saved on the session)
    CONDITIONS : tuple[str, ...] = ()  # Cue sets a client can pick with `condition`
    VARIANTS   : tuple[str, ...] = ()  # Task content (a map, a scenario) a client can pick with `variant`

    # Dialogue state every chat starts in (`on_reply_saved` replaces it on the instance)
    state : object = None

    # Keep the connection this harness serves, the options it was picked with, and its cues
    def __init__(self, consumer: ChatConsumer, *, condition: str, variant: str) -> None:
        self.consumer        = consumer
        self.condition       = condition
        self.variant         = variant
        self.cues: list[Cue] = []

    # --------------------------------------------------------------------------------
    # Replies
    # --------------------------------------------------------------------------------
    # Reply to the staged user turn (newer speech may cancel it at any await)
    @abstractmethod
    async def generate(self, attempt: TurnAttempt) -> ResponseOutcome: ...

    # Enter the state a reply proposed, now that its exchange is saved, then tell the cues
    def on_reply_saved(self, outcome: ResponseOutcome) -> None:
        if outcome.state is not None: self.state = outcome.state
        self._tell_cues("on_reply_saved", outcome)

    # --------------------------------------------------------------------------------
    # Connection
    # --------------------------------------------------------------------------------
    # The connection is ready: its session exists, and audio can arrive
    async def start(self) -> None:
        pass

    # The connection is closing: stop every cue, so nothing starts during teardown
    def stop(self) -> None:
        self._tell_cues("stop")

    # --------------------------------------------------------------------------------
    # Turn Events (each one is described on `Cue`)
    # --------------------------------------------------------------------------------
    # Pass each turn event on to every cue
    def on_interim        (self, speech:      InterimSpeech           ) -> None: self._tell_cues("on_interim",         speech            )
    def on_final          (self, utterance:   FinalUtterance          ) -> None: self._tell_cues("on_final",           utterance         )
    def on_reply_started  (self, attempt:     TurnAttempt             ) -> None: self._tell_cues("on_reply_started",   attempt           )
    def on_reply_cancelled(self, attempt:     TurnAttempt, saved: bool) -> None: self._tell_cues("on_reply_cancelled", attempt,     saved)
    def on_playback       (self, response_id: int,         state: str ) -> None: self._tell_cues("on_playback",        response_id, state)

    # Hand one event to each cue in turn (a cue that raises is logged, and the rest still hear it)
    def _tell_cues(self, hook: str, *args: object) -> None:
        for cue in self.cues:
            try: getattr(cue, hook)(*args)
            except Exception: logger.exception(f"{CC_MAIN} Cue {CC_H}{type(cue).__name__}{CC_R} failed in {hook}.{RESET}")


# --------------------------------------------------------------------------------
# Cue
# --------------------------------------------------------------------------------
# One behavior a condition switches on or off; it hears every turn event its harness does
class Cue(ABC):
    """
    Override only the events a cue needs. A cue reacts with side effects (avatar frames,
    or a turn of its own through `ChatHandler.request_harness_turn`), and never changes
    the dialogue state.
    """
    # Keep the harness whose events this cue hears
    def __init__(self, harness: ChatHarness) -> None:
        self.harness = harness

    # The connection is closing (cancel anything still scheduled)
    def stop(self) -> None:
        pass

    # The user is speaking: the utterance so far
    def on_interim(self, speech: InterimSpeech) -> None:
        pass

    # The user finished an utterance (heard in order with the interims, before it is staged)
    def on_final(self, utterance: FinalUtterance) -> None:
        pass

    # A reply attempt started: the avatar is preparing to speak
    def on_reply_started(self, attempt: TurnAttempt) -> None:
        pass

    # Newer speech or a command cancelled a reply (`saved`: its text had already gone out)
    def on_reply_cancelled(self, attempt: TurnAttempt, saved: bool) -> None:
        pass

    # A reply's exchange was saved, and its text goes out now
    def on_reply_saved(self, outcome: ResponseOutcome) -> None:
        pass

    # The client heard the reply's audio "started" or "finished" (`tts_playback`)
    def on_playback(self, response_id: int, state: str) -> None:
        pass
