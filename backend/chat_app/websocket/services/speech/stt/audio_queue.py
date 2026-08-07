"""
Ordered audio and control-marker queue for streaming STT.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.services.speech.stt.audio_queue`

Keep cross-thread chunk ordering, barrier completion, and stream-stop signaling
in one place so the STT request generator sees a consistent queue lifecycle.

"""
from __future__         import annotations
from concurrent.futures import Future
from dataclasses        import dataclass, field
from queue              import Empty, Queue
from threading          import Event
from typing             import TypeAlias
import asyncio


# --------------------------------------------------------------------------------
# Audio Chunk
# --------------------------------------------------------------------------------
# Store one timestamped block of PCM audio waiting to be sent to Google
@dataclass(frozen=True, slots=True)
class AudioChunk:
    received_at : float
    data        : bytes

# --------------------------------------------------------------------------------
# Audio Barrier
# --------------------------------------------------------------------------------
# Acknowledge when every older queue entry has been removed for streaming
@dataclass(slots=True)
class AudioBarrier:
    _future : Future[None] = field(default_factory=Future)

    # Resolve the barrier once without racing a timeout or stream shutdown
    def resolve(self) -> None:
        if not self._future.done(): self._future.set_result(None)

    # Release the waiter with a descriptive stream-lifecycle failure
    def fail(self, message: str) -> None:
        if not self._future.done(): self._future.set_exception(RuntimeError(message))

    # Await the thread-safe future from the consumer's asyncio event loop
    async def wait(self, *, timeout: float | None = None) -> None:
        wrapped = asyncio.wrap_future(self._future)
        if timeout is None: await wrapped  # Timeout is the maximum seconds to wait for the queue boundary
        else:               await asyncio.wait_for(wrapped, timeout=timeout)

# --------------------------------------------------------------------------------
# Stop Signal
# --------------------------------------------------------------------------------
@dataclass(slots=True)
class StopSignal:
    """
    End one Google request stream after every older queue item has been consumed.

    A quick resume can cancel a signal that the generator has not crossed yet. This
    keeps newly accepted audio on the existing stream without moving queue entries.
    """
    _cancelled : Event = field(default_factory=Event)

    # Keep the current stream alive when listening resumes before this marker is reached
    def cancel(self) -> None:
        self._cancelled.set()

    # Report whether the generator should pass over this marker
    def is_cancelled(self) -> bool:
        return self._cancelled.is_set()

# ================================================================================
# Ordered Audio Input Queue
# ================================================================================
# We can put three types of data into the queue
AudioQueueItem: TypeAlias = AudioChunk | AudioBarrier | StopSignal

class AudioInputQueue:
    """
    Preserves the arrival order of audio and one-shot control markers across threads.
    """
    # Initialize the thread-safe backing queue
    def __init__(self) -> None:
        self._items: Queue[AudioQueueItem] = Queue()

    # Add one timestamped audio block 
    # (tracks monotonic time that the raw PCM audio was forwarded to Google)
    def put_audio(self, *, received_at: float, data: bytes) -> None:
        self._items.put(AudioChunk(received_at, data))

    # Insert (or reuse an existing) a boundary marker after all of the items currently queued
    def put_barrier(self, barrier: AudioBarrier | None = None) -> AudioBarrier:
        barrier = barrier or AudioBarrier()
        self._items.put(barrier)
        return barrier

    # Remove the next queue item and acknowledge it when it is a barrier
    def get(self, *, timeout: float) -> AudioQueueItem:
        item = self._items.get(timeout=timeout)  # Timeout is the maximum seconds to block waiting for an item
        if isinstance(item, AudioBarrier): item.resolve()
        return item

    # Return an approximate queue depth for delay diagnostics
    def qsize(self) -> int:
        return self._items.qsize()

    # End the current stream after all queue entries that were accepted before this call
    def request_stop(self) -> StopSignal:
        signal = StopSignal()
        self._items.put(signal)
        return signal

    # Drop queued audio, fail pending barriers, and wake the generator during shutdown
    def abort(self) -> None:
        while True:
            try:
                item = self._items.get_nowait()
                if isinstance(item, AudioBarrier):
                    item.fail("STT stream aborted before the audio barrier was reached")
            except Empty: break

        self._items.put(StopSignal())
