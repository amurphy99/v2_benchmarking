"""
Interim transcript-progress tracking for streaming STT.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.services.speech.stt.stream_state`

Keep transcript comparison and timing-watermark state together so the STT provider
only cancels a response when Google has recognized additional speech.

"""
from __future__         import annotations
from typing             import Any
import re

INTERIM_PROGRESS_EPSILON_SEC = 0.04  # Minimum result-end advancement treated as timing progress


# ================================================================================
# Interim Transcript Progress
# ================================================================================
class InterimProgressTracker:
    """
    We use Google's result end-time as the primary progress "watermark", but we
    still want to make sure there is a change in the transcript itself because a
    "watermark" that comes in later could just be finalized processing rather than
    an actual new recognized word that we would want to cancel response generation
    for.
    """
    # Initialize the comparison threshold and empty stream state
    def __init__(self, *, epsilon_sec : float = INTERIM_PROGRESS_EPSILON_SEC) -> None:
        self._epsilon_sec = epsilon_sec
        self.reset()

    # Reset progress tracking when Google starts a new streaming request
    def reset(self) -> None:
        self._latest_interim     = ""
        self._max_result_end_sec = 0.0

    # Normalize Google's timedelta/protobuf duration variants to seconds
    @staticmethod
    def _duration_seconds(duration : Any | None) -> float | None:
        # Google returns a `timedalta` or `protobuf` duration with the result
        if duration is None: return None
        if hasattr(duration, "total_seconds"): return float(duration.total_seconds())

        seconds = getattr(duration, "seconds", None)
        nanos   = getattr(duration, "nanos",   None)
        if (seconds is None) and (nanos is None): return None
        else: return float(seconds or 0) + (float(nanos or 0) / 1_000_000_000)

    # Normalize case, punctuation, and whitespace before comparing interim text
    @staticmethod
    def _normalize(transcript : str) -> str:
        return " ".join(re.findall(r"\w+", transcript.casefold()))

    # --------------------------------------------------------------------------------
    # Check if an interim contains speech beyond the previous progress "watermark"
    # --------------------------------------------------------------------------------
    def has_new_speech(self, result: Any, transcript: str) -> bool:
        normalized = self._normalize(transcript)
        previous   = self._latest_interim

        result_end = self._duration_seconds(getattr(result, "result_end_time", None))
        if (result_end is not None) and (result_end > 0):
            timing_advanced          = result_end > (self._max_result_end_sec + self._epsilon_sec)
            self._max_result_end_sec = max(self._max_result_end_sec, result_end)

            # Ignore delayed revisions that do not move beyond the recognized boundary,
            # so they do not become the baseline for genuinely new speech
            if not timing_advanced: return False
            self._latest_interim = normalized

            # Require recognized text growth as well as a later timing watermark
            if (not normalized) or (normalized == previous): return False
            if not previous: return True
            else:            return len(normalized.split()) > len(previous.split())

        # Fall back to transcript growth when Google does not provide useful timing
        self._latest_interim = normalized
        if (not normalized) or (normalized == previous): return False
        if not previous: return True
        else:            return len(normalized.split()) > len(previous.split())

    # Advance the timing "watermark" and start a fresh interim comparison segment
    def record_final(self, result : Any) -> None:
        result_end = self._duration_seconds(getattr(result, "result_end_time", None))
        if result_end is not None:
            self._max_result_end_sec = max(self._max_result_end_sec, result_end)
        self._latest_interim = ""
