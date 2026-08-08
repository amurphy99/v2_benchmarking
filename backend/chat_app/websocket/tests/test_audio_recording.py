"""Unit tests for incremental user-only WAV recording and local persistence."""
import base64, tempfile, unittest, wave

from datetime import datetime, timezone
from pathlib  import Path

from django.test import override_settings

from chat_app.websocket.consumers.processing.audio import _validate_audio_payload
from chat_app.websocket.services.speech.audio_recorder import AUDIO_SAMPLE_RATE, SessionAudioRecorder
from chat_app.services.session_audio_storage import local_recording_path


class SessionAudioRecorderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_directory = tempfile.TemporaryDirectory()
        root = Path(self.temp_directory.name)
        self.settings = override_settings(
            SESSION_AUDIO_STORAGE="local",
            SESSION_AUDIO_LOCAL_ROOT=root / "stored",
            SESSION_AUDIO_TEMP_ROOT=root / "temporary",
            SESSION_AUDIO_OBJECT_PREFIX="recordings",
        )
        self.settings.enable()

    def tearDown(self) -> None:
        self.settings.disable()
        self.temp_directory.cleanup()

    # Persist a valid mono/16 kHz/16-bit WAV and insert silence across an explicit pause
    def test_incremental_recording_preserves_format_and_pause_timeline(self) -> None:
        recorder  = SessionAudioRecorder(session_id=42)
        started_at = datetime.now(timezone.utc)
        pcm_chunk = b"\x01\x00" * 1_024

        recorder.write_user_audio(pcm_chunk, started_at, received_mono=10.0)
        recorder.pause(paused_at_mono=10.1)
        recorder.resume()
        recorder.write_user_audio(pcm_chunk, started_at, received_mono=10.6)
        artifact = recorder.finalize(persist=True)

        self.assertIsNotNone(artifact)
        recording_path = local_recording_path(artifact.object_key)
        with wave.open(str(recording_path), "rb") as recording:
            self.assertEqual(recording.getframerate(), AUDIO_SAMPLE_RATE)
            self.assertEqual(recording.getnchannels(), 1)
            self.assertEqual(recording.getsampwidth(), 2)
            self.assertEqual(recording.getnframes(), 2_048 + round(0.5 * AUDIO_SAMPLE_RATE))

        self.assertEqual(artifact.size_bytes, recording_path.stat().st_size)
        self.assertEqual(len(artifact.sha256), 64)

    # Delete the complete temporary WAV when the final recording state is disabled
    def test_disabled_recording_is_discarded_at_finalize(self) -> None:
        recorder = SessionAudioRecorder(session_id=43)
        recorder.write_user_audio(b"\x01\x00" * 64, datetime.now(timezone.utc), received_mono=1.0)

        self.assertIsNone(recorder.finalize(persist=False))
        self.assertEqual(list((Path(self.temp_directory.name) / "temporary").glob("*.wav")), [])

    # Reject caller-controlled object keys that escape the configured local root
    def test_local_storage_rejects_path_traversal(self) -> None:
        with self.assertRaises(ValueError): local_recording_path("../outside.wav")

    # Accept the canonical format and reject mismatched or partial PCM samples
    def test_audio_payload_format_validation(self) -> None:
        encoded = base64.b64encode(b"\x01\x00").decode("ascii")
        valid = {
            "sampleRate": 16_000,
            "channels": 1,
            "bitsPerSample": 16,
            "encoding": "pcm_s16le",
            "data": encoded,
        }

        self.assertEqual(_validate_audio_payload(valid), b"\x01\x00")
        self.assertIsNone(_validate_audio_payload({**valid, "channels": 2}))
        self.assertIsNone(_validate_audio_payload({**valid, "data": base64.b64encode(b"\x01").decode("ascii")}))
