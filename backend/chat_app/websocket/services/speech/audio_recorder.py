"""
Incrementally record incoming user audio for one live chat session.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.services.speech.audio_recorder`

Every accepted microphone chunk is written directly to a temporary mono WAV. The
temporary recording covers the full session regardless of the current save
toggle. At disconnect it is either moved/uploaded to durable storage or deleted.

Assistant TTS is intentionally not part of this recording format. Check note in
`speech.tts.tts_streaming` for more information on that.

Frontend systems have the option to report when TTS playback started and/or
completed, and we use those messages to add proper start/end timestamps to
assistant messages.

"""
from __future__ import annotations

import logging, hashlib, tempfile, wave
logger = logging.getLogger(__name__)

from dataclasses import asdict, dataclass
from datetime    import datetime
from pathlib     import Path

from django.conf import settings

# From this project
from ....services.logging_utils         import RESET, AUDIO_REC, AR_H, AR_R
from ....services.session_audio_storage import build_recording_object_key, store_recording

# Constants
AUDIO_SAMPLE_RATE     = 16_000  # Sample rate required from every accepted microphone chunk
AUDIO_CHANNELS        = 1       # User-only recordings contain one mono channel
AUDIO_SAMPLE_WIDTH    = 2       # Signed 16-bit PCM bytes per sample
SILENCE_WRITE_SECONDS = 10      # Maximum silence duration allocated in one write operation


# ================================================================================
# Recording Artifact
# ================================================================================
@dataclass(frozen=True, slots=True)
class RecordingArtifact:
    storage_backend  : str
    object_key       : str
    started_at       : datetime
    sample_rate      : int
    channels         : int
    bits_per_sample  : int
    duration_seconds : float
    size_bytes       : int
    sha256           : str

    # Return the artifact fields as a dictionary
    def as_dict(self) -> dict[str, object]:
        return asdict(self)


# ================================================================================
# Session Audio Recorder
# ================================================================================
class SessionAudioRecorder:
    """
    We create a temporary WAV file that we "incrementally" append audio bytes to
    during the chat. It persists from connection setup to all of the way until
    disconnection, where, based on the settings for that ChatSession, we either
    save it to storage or delete it forever.
    """
    # Initialize a new temporary WAV file and wave writer
    def __init__(self, session_id: int) -> None:
        temp_root = Path(settings.SESSION_AUDIO_TEMP_ROOT)
        temp_root.mkdir(parents=True, exist_ok=True)

        temp_file = tempfile.NamedTemporaryFile(
            prefix = f"session_{session_id}_",
            suffix = ".wav",
            dir    = temp_root,
            delete = False,
        )
        self._temp_path = Path(temp_file.name)
        temp_file.close()

        self._session_id         = session_id
        self._wave               = wave.open(str(self._temp_path), "wb")
        self._started_at         = None
        self._frame_count        = 0
        self._paused             = False
        self._pause_started_mono = None
        self._closed             = False

        self._wave.setnchannels(AUDIO_CHANNELS    )
        self._wave.setsampwidth(AUDIO_SAMPLE_WIDTH)
        self._wave.setframerate(AUDIO_SAMPLE_RATE )

    # --------------------------------------------------------------------------------
    # Add one valid microphone chunk to the temporary WAV file
    # --------------------------------------------------------------------------------
    def write_user_audio(self, pcm_bytes: bytes, received_at: datetime, received_mono: float) -> None:
        # Guard for validity
        if (self._closed) or (self._paused) or (not pcm_bytes):  return
        if len(pcm_bytes) % AUDIO_SAMPLE_WIDTH:
            logger.warning(f"{AUDIO_REC} Ignoring an incomplete PCM sample.{RESET}")
            return

        # Set the `_started_at` timestamp upon receiving the first bytes
        if self._started_at is None: self._started_at = received_at

        # Write the bytes to our file            
        self._write_pending_pause_silence(received_mono)
        self._wave.writeframesraw(pcm_bytes)
        self._frame_count += len(pcm_bytes) // AUDIO_SAMPLE_WIDTH

    # Begin a gap that will be represented as silence if recording later resumes
    def pause(self, paused_at_mono: float) -> None:
        if (self._closed) or (self._paused): return
            
        self._paused = True
        if self._frame_count:
            self._pause_started_mono = paused_at_mono

    # Accept later chunks and defer silence insertion until the first resumed chunk
    def resume(self) -> None:
        if self._closed: return
        self._paused = False

    # --------------------------------------------------------------------------------
    # Close the WAV and either persist it or discard the complete temporary recording
    # --------------------------------------------------------------------------------
    def finalize(self, persist: bool) -> RecordingArtifact | None:
        if self._closed: return None
            
        self._closed = True
        self._wave.close()

        if (not persist) or (not self._frame_count) or (self._started_at is None):
            self._temp_path.unlink(missing_ok=True)
            return None

        duration_seconds = self._frame_count / AUDIO_SAMPLE_RATE
        size_bytes       = self._temp_path.stat().st_size
        checksum         = self._sha256()
        object_key       = build_recording_object_key(self._session_id)
        storage_backend  = store_recording(self._temp_path, object_key)

        logger.info(
            f"{AUDIO_REC} Saved user WAV for session {AR_H}{self._session_id}{AR_R}: "
            f"{AR_H}{duration_seconds:.1f}s{AR_R}, {AR_H}{size_bytes / 1_048_576:.1f} MB{AR_R}.{RESET}"
        )
        
        return RecordingArtifact(
            storage_backend  = storage_backend,
            object_key       = object_key,
            started_at       = self._started_at,
            sample_rate      = AUDIO_SAMPLE_RATE,
            channels         = AUDIO_CHANNELS,
            bits_per_sample  = AUDIO_SAMPLE_WIDTH * 8,
            duration_seconds = duration_seconds,
            size_bytes       = size_bytes,
            sha256           = checksum,
        )

    # --------------------------------------------------------------------------------
    # Fill an explicit listening pause so later transcript offsets still match
    # --------------------------------------------------------------------------------
    def _write_pending_pause_silence(self, resumed_at_mono: float) -> None:
        """
        When the user pauses the chat, we no longer record/receive any audio
        from them. Because word timestamps are "global" time-based (not based
        on seconds-from-start), we need to fill in the gap during the pause to
        allow word-timestamps to map properly to transcript playback in the
        frontend web app.
        """
        if self._pause_started_mono is None: return

        silence_frames = max(0, round((resumed_at_mono - self._pause_started_mono) * AUDIO_SAMPLE_RATE))
        max_frames     = SILENCE_WRITE_SECONDS * AUDIO_SAMPLE_RATE
        silence_block  = b"\x00" * (max_frames * AUDIO_SAMPLE_WIDTH)
        
        while silence_frames:
            frame_count        = min(silence_frames, max_frames)
            self._wave.writeframesraw(silence_block[:frame_count * AUDIO_SAMPLE_WIDTH])
            self._frame_count += frame_count
            silence_frames    -= frame_count

        self._pause_started_mono = None

    # Hash the completed file without loading it back into memory
    def _sha256(self) -> str:
        digest = hashlib.sha256()
        
        with self._temp_path.open("rb") as recording:
            for block in iter(lambda: recording.read(1_048_576), b""):
                digest.update(block)
                
        return digest.hexdigest()
