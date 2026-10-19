"""
Ordered audio and barrier queue for streaming STT.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.services.speech.stt.audio_queue`

Keep cross-thread chunk ordering and stream-ending barriers in one place so the STT
request generator sees a consistent queue lifecycle.

"""
from __future__         import annotations
from concurrent.futures import Future
from dataclasses        import dataclass, field
from queue              import Empty, Queue
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
@dataclass(slots=True)
class AudioBarrier:
    """
    Ends the Google request stream that reaches it. Half-closing the stream makes Google
    return final results for all audio queued ahead of the barrier right away, instead of
    waiting for its endpointer to hear silence. The STT provider resolves the barrier once
    those results have been staged.
    """
    _future : Future[None] = field(default_factory=Future)

    # Resolve the barrier once without racing a timeout or stream shutdown
    def resolve(self) -> None:
        if not self._future.done(): self._future.set_result(None)

    # Release the waiter with a descriptive stream-lifecycle failure
    def fail(self, message: str) -> None:
        if not self._future.done(): self._future.set_exception(RuntimeError(message))

    # Await the thread-safe future from the consumer's asyncio event loop
    # (shielded, so one waiter's timeout or cancellation cannot cancel it for the others)
    async def wait(self, *, timeout: float | None = None) -> None:
        wrapped = asyncio.shield(asyncio.wrap_future(self._future))
        if timeout is None: await wrapped  # Timeout is the maximum seconds to wait for the queue boundary
        else:               await asyncio.wait_for(wrapped, timeout=timeout)

# ================================================================================
# Ordered Audio Input Queue
# ================================================================================
# We can put two types of data into the queue
AudioQueueItem: TypeAlias = AudioChunk | AudioBarrier

class AudioInputQueue:
    """
    Preserves the arrival order of audio and one-shot barriers across threads.
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

    # NOTE: This is the old version of this function with the silence
    # Remove the next queue item and acknowledge it when it is a barrier
    #def get(self, *, timeout: float) -> AudioQueueItem:
    #    item = self._items.get(timeout=timeout)  # Timeout is the maximum seconds to block waiting for an item
    #    if isinstance(item, AudioBarrier): item.resolve()
    #    return item

    # Wait for the next queue item (barriers are resolved by the provider, not here)
    def get(self) -> AudioQueueItem:
        return self._items.get()

    # Return an approximate queue depth for delay diagnostics
    def qsize(self) -> int:
        return self._items.qsize()

    # Drop queued audio, fail pending barriers, and end the generator during shutdown
    def abort(self) -> None:
        while True:
            try:
                item = self._items.get_nowait()
                if isinstance(item, AudioBarrier):
                    item.fail("STT stream aborted before the audio barrier was reached")
            except Empty: break

        self._items.put(AudioBarrier())  # Nobody waits on this one; it only ends the stream
