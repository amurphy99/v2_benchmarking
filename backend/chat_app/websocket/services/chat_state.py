"""
Dependency-free state objects used by the live chat pipeline.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.services.chat_state`

Keep staged transcript text and word metadata together so response retries can safely
consume only the utterances included in their snapshot.

"""
from __future__  import annotations
from dataclasses import dataclass
from typing      import Iterable, Iterator, Sequence


# --------------------------------------------------------------------------------
# Staged Utterance
# --------------------------------------------------------------------------------
@dataclass(frozen=True, slots=True)
class StagedUtterance:
    """
    Store a final STT utterance and the metadata that must be committed with it.
    """
    sequence  : int
    text      : str
    words     : tuple[dict[str, object], ...]
    timestamp : float


# ================================================================================
# Staged Utterance Buffer
# ================================================================================
class StagedUtteranceBuffer:
    """
    Keep staged text and word timestamps as one atomic collection.
    Response attempts consume an exact prefix snapshot. Anything appended while an
    LLM request is in flight remains in the buffer for the retry or next response.
    """
    # Initialize an empty buffer with monotonic sequence IDs
    def __init__(self) -> None:
        self._items: list[StagedUtterance] = []
        self._next_sequence                = 0

    # Add one final transcript and its word metadata as an atomic record
    def append(self, *, text: str, words: Iterable[dict[str, object]] | None, timestamp: float) -> StagedUtterance:
        """
        Creates a "staged utterance" using the final transcript text, google word
        timing records, and the timestamp that the final transcript was staged.
        """
        item = StagedUtterance(
            sequence  = self._next_sequence,
            text      = text,
            words     = tuple(words or ()),
            timestamp = timestamp,
        )
        self._next_sequence += 1
        self._items.append(item)
        return item

    # Return an immutable view of the records available to one response attempt
    def snapshot(self) -> tuple[StagedUtterance, ...]:
        return tuple(self._items)

    # Remove the exact prefix committed by a successful response attempt
    def consume(self, snapshot : Sequence[StagedUtterance]) -> None:
        """
        Remove only the exact prefix included in a successful response.

        Sequence validation prevents a stale response task from clearing utterances that
        arrived while its LLM request was running.
        """
        if not snapshot: return
        count = len(snapshot)

        current_sequences  = tuple(item.sequence for item in self._items[:count])
        snapshot_sequences = tuple(item.sequence for item in snapshot)

        if current_sequences != snapshot_sequences:
            raise RuntimeError("Staged utterance snapshot is no longer the buffer prefix")

        del self._items[:count]

    # Drop all staged records while preserving monotonic sequence numbering
    def clear(self) -> None:
        self._items.clear()

    # Report whether at least one utterance is waiting to be committed
    def __bool__(self) -> bool:
        return bool(self._items)

    # Return the number of staged utterance records
    def __len__(self) -> int:
        return len(self._items)

    # Iterate over staged records without exposing the backing list
    def __iter__(self) -> Iterator[StagedUtterance]:
        return iter(self._items)

