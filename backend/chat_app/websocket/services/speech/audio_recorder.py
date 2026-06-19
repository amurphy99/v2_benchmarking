"""
Session audio recorder - accumulates user mic + TTS audio, writes stereo WAV.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.services.speech.audio_recorder`

Records both sides of a chat session into a single stereo WAV file:
  - Left  channel: Continuous user microphone PCM (16 kHz, 16-bit, mono)
  - Right channel: TTS response PCM, resampled 24 kHz -> 16 kHz and silence-padded
                   to approximate when each response started playing on the frontend

NOTE: Time Alignment:
    Both channels share a single zero-time anchor: `consumer._audio_start_mono`
    (set in ws_events._toggle_stream when the user first clicks "Start Chat").

    Left channel: 
    User audio chunks arrive from the frontend shortly after _audio_start_mono. 
    Frame 0 of _rec_user = first PCM chunk ~= time 0 in the file.

    Right channel: 
    Each TTS response is padded into _rec_tts at byte offset 
    (elapsed_sec * OUT_RATE * OUT_SAMPWIDTH) 
    where 
    elapsed_sec = time.monotonic() - _audio_start_mono + TTS_PLAYBACK_DELAY_SEC

    TTS_PLAYBACK_DELAY_SEC shifts TTS forward to compensate for the time between
    synthesis completion and when the audio actually starts playing on the frontend
    (WebSocket transmission + client buffer lookahead).


Call sequence:
  1. Consumer sets _audio_start_mono/_audio_start_dt in ws_events (first "start")
  2. handle_audio_data() extends consumer._rec_user each chunk
  3. synthesize_and_stream_tts() calls accumulate_tts() once per TTS response
  4. disconnect() calls save_stereo_wav() and passes the path to close_session()

"""
import audioop, struct, wave, logging
logger = logging.getLogger(__name__)

from pathlib     import Path
from time        import monotonic as now_ts
from django.conf import settings

# From this project
from ....services               import logging_utils as lu
from ....services.logging_utils import RESET, BOLD, UNBOLD, AUDIO_REC, AR_H, AR_R, BLUE, RED

# Output format
OUT_RATE      = 16_000   # Hz
OUT_SAMPWIDTH = 2        # bytes (16-bit signed)
OUT_CHANNELS  = 2        # stereo

# TTS source format (Google Cloud TTS -> wav_to_pcm_bytes)
TTS_IN_RATE = 24_000

# Approximate time from TTS synthesis completion -> audio playing on frontend.
# Should account for WebSocket chunk streaming + client buffer lookahead (0.2s)...
# TODO: Increase if the right channel still starts too early relative to the left
TTS_PLAYBACK_DELAY_SEC = 0.35


# ================================================================================
# Accumulate one TTS response into the right channel buffer
# ================================================================================
def accumulate_tts(
    consumer,                       # ChatConsumer object managing this session
    tts_pcm   : bytes,              # Audio bytes from TTS, already converted to PCM 
    *, 
    in_rate   : int = TTS_IN_RATE,  # Sample rate from TTS (depends based on TTS source)
    out_rate  : int = OUT_RATE,     # Sample rate to use for our output file
    nchannels : int = 1,            # Number of channels in the TTS audio response
):
    """
    Called immediately before the TTS audio is streamed to the frontend.

    Downmixes stereo audio to monochannel if needed, resamples from `in_rate` to
    `out_rate`, then silence-pads the right-channel buffer at the correct 
    elapsed-time offset.

    NOTE: `in_rate` and `nchannels` should come from the actual WAV returned by 
    the TTS API (not hardcoded anymore).
    """
    if not tts_pcm: return

    # 1) Prepare raw TTS output for saving (make monochannel and adjust the sample rate)
    resampled = _prepare_TTS_for_recording(tts_pcm=tts_pcm, in_rate=in_rate, out_rate=out_rate, nchannels=nchannels)

    # 2) Handle time alignment
    # Use _audio_start_mono (set when user first clicks "Start Chat") as the zero-time for the recording. 
    # Fall back to _session_start_ts for TTS that happens before the user starts (e.g. the greeting), which we clamp to 0.
    audio_start = getattr(consumer, "_audio_start_mono", None) or consumer._session_start_ts
    elapsed_sec = now_ts() - audio_start + TTS_PLAYBACK_DELAY_SEC
    elapsed_sec = max(0.0, elapsed_sec)  # clamp to not place TTS before time-zero

    # 3) Zero-padding
    target_bytes = int(elapsed_sec * out_rate * OUT_SAMPWIDTH)   # 2 bytes per sample
    current_len  = len(consumer._rec_tts)
    pad_needed   = max(0, target_bytes - current_len)

    consumer._rec_tts.extend(b'\x00' * pad_needed)
    consumer._rec_tts.extend(resampled)

    # Logging
    logger.info(f"{AUDIO_REC} TTS accumulated: {AR_H}{len(resampled):,} bytes at offset {target_bytes:,} (pad={pad_needed:,}){RESET}")


# --------------------------------------------------------------------------------
# Prepare raw TTS output for saving alongside the audio we recorded from the user
# --------------------------------------------------------------------------------
def _prepare_TTS_for_recording(
    tts_pcm   : bytes,              # Audio bytes from TTS, already converted to PCM 
    *, 
    in_rate   : int = TTS_IN_RATE,  # Sample rate from TTS (depends based on TTS source)
    out_rate  : int = OUT_RATE,     # Sample rate to use for our output file
    nchannels : int = 1,            # Number of channels in the TTS audio response
) -> bytes:
    """
    Downmixes stereo audio to monochannel if needed + resamples from `in_rate` to `out_rate`.
    """
    # 1) Downmix stereo audio to mono channel before resampling (average of the left+right)
    if nchannels == 2:
        tts_pcm = audioop.tomono(tts_pcm, OUT_SAMPWIDTH, 0.5, 0.5)
    elif nchannels > 2:
        # Unexpected multi-channel: keep first channel only
        step    = OUT_SAMPWIDTH * nchannels
        tts_pcm = bytes(b for i in range(0, len(tts_pcm), step)
                          for b in tts_pcm[i : i + OUT_SAMPWIDTH])
        
    # 2) Resample to OUT_RATE (currently done through linear interpolation via audioop)
    # TODO: audioop is deprecated in Python 3.11 and removed in 3.13
    # Replace with:
    #   import numpy as np
    #   from scipy.signal import resample_poly
    #   data_int16 = np.frombuffer(tts_pcm, dtype='<i2')
    #   resampled  = resample_poly(data_int16, up=out_rate, down=in_rate).astype('<i2').tobytes()
    resampled, _ = audioop.ratecv(tts_pcm, OUT_SAMPWIDTH, 1, in_rate, out_rate, None)

    # Return the processed audio
    return resampled


# ================================================================================
# Write to a WAV file (2-channel; interleave left + right channels)
# ================================================================================
def save_stereo_wav(
    session_id  : int,             # ChatSession database ID
    left_bytes  : bytes,           # User microphone audio bytes (accumulated throughout chat)
    right_bytes : bytes,           # TTS response audio bytes (concatenated silence-padded) 
    *, 
    rate        : int = OUT_RATE,  # Sample rate to save the final audio file with

) -> str:                          # Returns a string with the path to the audio file (in the Django media folder)
    """
    Interleaves left (user mic) and right (TTS) PCM bytes into a stereo WAV file.
    Shorter channel is zero-padded to match the longer one.

    Returns the media-relative path: "recordings/session_{id}.wav"
    """
    # TODO: It should maybe be fine if there are no TTS (right-channel) audio
    #       bytes (e.g., the chat was with one of the robots that still does TTS
    #       locally)...
    if (not left_bytes) and (not right_bytes):
        logger.info(f"{AUDIO_REC} {RED}Both audio channels empty{BLUE} -- skipping WAV save.{RESET}")
        return ""

    # --------------------------------------------------------------------------------
    # 1) Zero-pad the shorter channel (if there is one)
    # --------------------------------------------------------------------------------
    n_bytes = max(len(left_bytes), len(right_bytes))
    if n_bytes % 2: n_bytes += 1
    left_bytes  =  left_bytes + b'\x00' * (n_bytes - len( left_bytes))
    right_bytes = right_bytes + b'\x00' * (n_bytes - len(right_bytes))

    n_samples = n_bytes // OUT_SAMPWIDTH

    # --------------------------------------------------------------------------------
    # 2) Interleave L R L R L R ...
    # --------------------------------------------------------------------------------
    left_s  = struct.unpack(f'<{n_samples}h',  left_bytes)
    right_s = struct.unpack(f'<{n_samples}h', right_bytes)
    stereo  = bytearray(n_samples * 4)
    for i in range(n_samples):
        struct.pack_into('<hh', stereo, i * 4, left_s[i], right_s[i])

    # --------------------------------------------------------------------------------
    # 3) Write WAV to the media path
    # --------------------------------------------------------------------------------
    # Recording save path (where audio will be served from)
    out_dir = Path(settings.MEDIA_ROOT) / "recordings"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"session_{session_id}.wav"

    # Write WAV file
    with wave.open(str(out_path), 'wb') as wf:
        wf.setnchannels(OUT_CHANNELS )  # 2 channels
        wf.setsampwidth(OUT_SAMPWIDTH)  # Audio range/clarity
        wf.setframerate(rate)           # Audio sample rate
        wf.writeframes(bytes(stereo))   # Interleaved bytes

    # Logging
    size_mb = out_path.stat().st_size / 1_048_576
    logger.info(
        f"{AUDIO_REC} Saved stereo WAV for session {AR_H}{session_id}{AR_R}: "
        f"{AR_H}{out_path.name}{AR_R} ({AR_H}{size_mb:.1f} MB{AR_R}, {AR_H}{n_samples / rate:.1f}s{AR_R}){RESET}"
    )

    # Returns a string with the path to the audio file (in the Django media folder)
    return f"recordings/session_{session_id}.wav"

