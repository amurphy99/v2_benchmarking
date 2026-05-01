"""
Session audio recorder - accumulates user mic + TTS audio, writes stereo WAV.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.services.speech.audio_recorder`

Records both sides of a chat session into a single stereo WAV file:
  - Left  channel: continuous user microphone PCM (16 kHz, 16-bit, mono)
  - Right channel: TTS response PCM, resampled 24 kHz -> 16 kHz and silence-padded
                   to approximate when each response started playing on the frontend

Call sequence:
  1. Consumer sets `_rec_user`, `_rec_tts`, `_session_start_ts` in connect()
  2. handle_audio_data() calls nothing here - it just extends consumer._rec_user
  3. synthesize_and_stream_tts() calls accumulate_tts() once per TTS response
  4. disconnect() calls save_stereo_wav() and passes the path to close_session()

TODO: Clean up the logging
TODO: Add the logging.future stuff for using the consumer type
TODO: Change logger.warning stuff in consumers and here? IDK check how it looks manually somewhere

TODO: I feel like I need different paths here or something

TODO: I also kind of want to make this a class instance and store the buffers and stuff in here. So consumers just holds a copy of this instance

"""
import audioop, struct, wave, logging
logger = logging.getLogger(__name__)

from pathlib     import Path
from time        import monotonic as now_ts
from django.conf import settings

# Output format
OUT_RATE      = 16_000   # Hz
OUT_SAMPWIDTH = 2        # bytes (16-bit signed)
OUT_CHANNELS  = 2        # stereo

# TTS source format (Google Cloud TTS -> wav_to_pcm_bytes)
TTS_IN_RATE   = 24_000


# ================================================================================
# Accumulate one TTS response into the right channel buffer
# ================================================================================
def accumulate_tts(consumer, tts_pcm: bytes, *, in_rate: int = TTS_IN_RATE, out_rate: int = OUT_RATE):
    """
    Called immediately before the TTS audio is streamed to the frontend.
    Resamples from `in_rate` -> `out_rate`, then silence-pads the right-channel
    buffer so that this response lands at the correct elapsed-time position.
    """
    if not tts_pcm: return

    # Resample (linear interpolation via audioop)
    # TODO: audioop is deprecated in Python 3.11 and removed in 3.13.
    # Replace with:
    #   import numpy as np
    #   from scipy.signal import resample_poly
    #   data_int16 = np.frombuffer(tts_pcm, dtype='<i2')
    #   resampled  = resample_poly(data_int16, up=2, down=3).astype('<i2').tobytes()
    resampled, _ = audioop.ratecv(tts_pcm, OUT_SAMPWIDTH, 1, in_rate, out_rate, None)

    # Elapsed seconds since session start -> byte offset in right-channel buffer
    elapsed_sec  = now_ts() - consumer._session_start_ts
    target_bytes = int(elapsed_sec * out_rate * OUT_SAMPWIDTH)   # 2 bytes per sample
    current_len  = len(consumer._rec_tts)
    pad_needed   = max(0, target_bytes - current_len)

    consumer._rec_tts.extend(b'\x00' * pad_needed)
    consumer._rec_tts.extend(resampled)

    logger.debug(
        f"[AudioRecorder] TTS accumulated: {len(resampled):,} bytes "
        f"at offset {target_bytes:,} (pad={pad_needed:,})"
    )


# ================================================================================
# Interleave left + right channels and write a stereo WAV file
# ================================================================================
def save_stereo_wav(session_id: int, left_bytes: bytes, right_bytes: bytes, *, rate: int = OUT_RATE) -> str:
    """
    Interleaves left (user mic) and right (TTS) PCM bytes into a stereo WAV file.
    Shorter channel is zero-padded to match the longer one.
    Returns the media-relative path: "recordings/session_{id}.wav"
    """
    if not left_bytes and not right_bytes:
        logger.warning("[AudioRecorder] Both channels empty - skipping WAV save.")
        return ""

    # Pad shorter channel
    n_bytes = max(len(left_bytes), len(right_bytes))
    # Align to sample boundary (2 bytes per sample)
    if n_bytes % 2:
        n_bytes += 1
    left_bytes  = left_bytes  + b'\x00' * (n_bytes - len(left_bytes))
    right_bytes = right_bytes + b'\x00' * (n_bytes - len(right_bytes))

    n_samples = n_bytes // OUT_SAMPWIDTH

    # Interleave L R L R L R ... using struct
    left_s  = struct.unpack(f'<{n_samples}h', left_bytes)
    right_s = struct.unpack(f'<{n_samples}h', right_bytes)
    stereo  = bytearray(n_samples * 4)           # 4 bytes per stereo frame
    for i in range(n_samples):
        struct.pack_into('<hh', stereo, i * 4, left_s[i], right_s[i])

    # Write WAV
    out_dir = Path(settings.MEDIA_ROOT) / "recordings"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"session_{session_id}.wav"

    with wave.open(str(out_path), 'wb') as wf:
        wf.setnchannels(OUT_CHANNELS)
        wf.setsampwidth(OUT_SAMPWIDTH)
        wf.setframerate(rate)
        wf.writeframes(bytes(stereo))

    size_mb = out_path.stat().st_size / 1_048_576
    logger.info(
        f"[AudioRecorder] Saved stereo WAV for session {session_id}: "
        f"{out_path.name} ({size_mb:.1f} MB, {n_samples / rate:.1f}s)"
    )
    return f"recordings/session_{session_id}.wav"
