"""Per-connection silence timing and playback-aware speech interruptions."""
from __future__ import annotations

import asyncio
import time
from collections import OrderedDict
from dataclasses import dataclass


DEFAULT_REPLY_DELAY_SECONDS = 1.0  # Initial automatic silence interval for every source.
MAX_REPLY_DELAY_SECONDS = 5.0      # Maximum interval accepted from client commands.


def validate_reply_delay(value: object) -> float:
    """Return a finite delay in seconds; reject booleans and values outside 0–5."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("seconds must be a number between 0 and 5")

    # Range comparison also rejects NaN/infinity before converting huge integers.
    if not 0 <= value <= MAX_REPLY_DELAY_SECONDS:
        raise ValueError("seconds must be a number between 0 and 5")

    return float(value)


@dataclass
class ReplyPlayback:
    """Track delivery separately from synthesis and saved dialogue state."""
    response_id: int      # Persisted assistant ChatMessage ID, also sent in audio chunks.
    text: str             # Full generated reply; this is not a transcript of heard audio.
    trigger: str          # automatic/harness can yield to speech; explicit replies stay protected.
    started: bool = False      # Client has reported that audible playback began.
    finished: bool = False     # Client reported complete playback, rather than an interruption.
    interrupted: bool = False  # Delivery was cut short; later starts must not revive it.


class TurnTakingState:
    """Own one connection's configurable silence timer and recent reply delivery."""

    def __init__(self, delay: float = DEFAULT_REPLY_DELAY_SECONDS) -> None:
        self.delay = validate_reply_delay(delay)  # Additional automatic reply delay, in seconds.
        self.listening = True                    # Whether automatic waits may progress while STT is active.
        self.silence_since = time.monotonic()     # Latest recognized-text progress, not acoustic speech end.
        self.changed = asyncio.Event()           # Wakes waits after transcript, setting, or listening changes.
        self.replies: OrderedDict[int, ReplyPlayback] = OrderedDict()  # Recent delivery records, oldest first.

    def set_delay(self, value: object) -> None:
        """Update a validated session setting and wake an existing silence wait."""
        self.delay = validate_reply_delay(value)
        self.changed.set()

    def recognized_progress(self) -> None:
        """Restart the reply delay when interim or final recognized text advances."""
        self.silence_since = time.monotonic()
        self.changed.set()

    def set_listening(self, active: bool) -> None:
        """Allow/block automatic waiting using the recognition state, active (bool)."""
        self.listening = active
        self.changed.set()

    async def wait_for_silence(self) -> None:
        """Wait for transcript inactivity without blocking staging or recognition.

        A final transcript is required before automatic response scheduling.
        Advancing interim text and every staged final restart the delay.
        This does not configure Google's endpointer or measure acoustic silence.
        """
        while True:
            self.changed.clear()

            if self.listening:
                remaining = (
                    self.silence_since + self.delay - time.monotonic()
                )
                if remaining <= 0:
                    return
            else:
                remaining = None

            try:
                await asyncio.wait_for(
                    self.changed.wait(),
                    timeout=remaining,
                )
            except asyncio.TimeoutError:
                pass

    def queue_reply(
        self,
        response_id: int,
        text: str,
        trigger: str,
    ) -> None:
        """Register saved text before publication; queued audio can be interrupted.

        response_id (int) identifies the saved reply, text (str) preserves generated
        content, and trigger (str) selects whether speech may interrupt delivery.
        """
        self.replies[response_id] = ReplyPlayback(
            response_id,
            text,
            trigger,
        )

        # Bound connection-local delivery history.
        while len(self.replies) > 32:
            self.replies.popitem(last=False)

    def playback(self, response_id: int, state: str) -> None:
        """Apply an owned playback report; late starts cannot revive a stopped reply."""
        reply = self.replies.get(response_id)

        if reply is None or reply.finished:
            return

        if state == "started" and not reply.interrupted:
            reply.started = True

        elif state in {"finished", "interrupted"}:
            reply.finished = state == "finished" and not reply.interrupted
            reply.interrupted = reply.interrupted or state == "interrupted"

    def interrupt(self, harness) -> tuple[int, ...]:
        """Remember automatic replies that may be unheard; preserve explicit replies.

        harness (ChatHarness) receives InterruptedReply records independently of
        its dialogue state. Exact heard words are intentionally not inferred.
        """
        from ..harnesses.base import InterruptedReply

        pending = [
            reply
            for reply in self.replies.values()
            if not reply.finished and not reply.interrupted
        ]

        # Explicit reply_now/admin speech keeps ownership of the floor.
        if not pending or pending[-1].trigger not in {"automatic", "harness"}:
            return ()

        interrupted = []

        for reply in pending:
            if reply.trigger not in {"automatic", "harness"}:
                continue

            reply.interrupted = True
            interrupted.append(reply.response_id)

            harness.on_interrupted(InterruptedReply(
                response_id=reply.response_id,
                text=reply.text,
                playback_started=reply.started,
            ))

        return tuple(interrupted)



def turn_taking(consumer) -> TurnTakingState:
    """Return/create shared state for a ChatConsumer or compatible test double."""
    # Reuse this connection's silence timer and reply delivery records.
    state = getattr(consumer, "_turn_taking", None)

    if state is None:
        # Create once; later speech and playback events must keep the same state.
        state = consumer._turn_taking = TurnTakingState(
            getattr(
                consumer,
                "reply_delay_seconds",
                DEFAULT_REPLY_DELAY_SECONDS,
            ),
        )

    return state
