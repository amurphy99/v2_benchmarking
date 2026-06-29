"""
Audio preprocessing for the audio-based biomarkers.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.preprocessing.audio_preprocessing`

Three pure functions used by the audio-biomarker pipeline:
1) `slice_audio_chunks`
    * Cuts a (pre-roll + utterance + post-roll) byte slice out of the rolling timestamped chunk deque.

2) `extract_opensmile_features`
    * Runs OpenSMILE LLDs on a PCM byte slice (incoming audio data).

3) `window_features_within_utterance`
    * Chunk the LLD frames into 5-second windows within the utterance bounds (start_ts, end_ts).

The 15-second pre-roll exists so OpenSMILE's internal normalization/smoothing
has time to warm up before we start scoring frames. We do NOT score the pre- or
post-roll. We only score frames inside [utt_start_dt, utt_end_dt] + a short
buffer (0.5 seconds) before and after the utterance.

"""
import numpy  as np
import pandas as pd
import opensmile

from datetime import datetime, timedelta
from typing   import Iterable, Optional

# From this project
from ..biomarker_config import SAMPLE_RATE, BYTES_PER_SAMPLE, FRAMES_PER_SECOND, FRAMES_OFFSET
from ..biomarker_config import WINDOW_SECONDS, STEP_SECONDS, BUFFER_SECONDS


# Lazily-instantiated OpenSMILE feature extractor (heavy to construct repeatedly)
_smile_extractor: Optional[opensmile.Smile] = None
def _get_smile():
    global _smile_extractor
    if _smile_extractor is None:
        _smile_extractor = opensmile.Smile(
            feature_set   = opensmile.FeatureSet  .ComParE_2016,
            feature_level = opensmile.FeatureLevel.LowLevelDescriptors,
            sampling_rate = SAMPLE_RATE,
        )
    return _smile_extractor


# ================================================================================
# 1) Slice the rolling audio chunk deque
# ================================================================================
def slice_audio_chunks(
    chunks       : Iterable,      # Chunks of audio+timestamp labels we get from the ChatConsumer
    utt_start_dt : datetime,      # Datetime of the START of the utterance
    utt_end_dt   : datetime,      # Datetime of the END of the utterance
    pre_seconds  : float = 15.0,  # "Pre-roll" duration of seconds before the start of the utterance kept
    post_seconds : float =  1.0,  # "Post-roll" is shorter since openSMILE normalization is already done
):
    """
    This takes the chunks of audio+timestamp labels we get from the ChatConsumer
    and puts them together into a single length of audio. The audio covers the 
    duration of time of the last utterance, including ~15 seconds from before
    the start of the utterance and ~1 second from the end of the utterance.

    Returns (audio_bytes, audio_start_dt) for chunks whose receive-time falls in
    [utt_start_dt-pre_seconds, utt_end_dt+post_seconds].

    Caller should calculate the actual pre-roll as: 
        `(utt_start_dt - audio_start_dt).total_seconds()`
    This may be < pre_seconds when the session just started.
    """
    # Pull chunks from the buffer if they fit the time range around the utterance
    target_start = utt_start_dt - timedelta(seconds=pre_seconds)
    target_end   = utt_end_dt   + timedelta(seconds=post_seconds)
    selected     = [(t, b) for (t, b) in chunks if target_start <= t <= target_end]
    
    # Return (None, None) if no chunks match (e.g. utterance came before buffer was filled)
    if not selected: return None, None

    # Concatenate chunks into one segment of audio (and return the datetime of the start of the audio)
    audio_bytes    = b"".join(b for (_, b) in selected)
    audio_start_dt = selected[0][0]
    return audio_bytes, audio_start_dt


# ================================================================================
# 2) Run OpenSMILE on PCM bytes
# ================================================================================
def extract_opensmile_features(audio_bytes: bytes, sample_rate: int = SAMPLE_RATE) -> pd.DataFrame:
    """Decode 16-bit PCM, normalize to float32 in [-1, 1], run OpenSMILE LLDs."""
    audio_int16   = np.frombuffer(audio_bytes, dtype=np.int16)
    audio_float32 = audio_int16.astype(np.float32) / 32_768.0
    return _get_smile().process_signal(audio_float32, sample_rate)


# ================================================================================
# 3) Slide 5-second windows within the utterance
# ================================================================================
def window_features_within_utterance(
    smile_df       : pd.DataFrame,            # Generated openSMILE feature DataFrame
    audio_start_dt : datetime,                # Datetime of the real start of the audio (pre-roll may be less than 15 seconds)
    utt_start_dt   : datetime,                # Datetime of the START of the utterance (total audio includes ~15 seconds before this)
    utt_end_dt     : datetime,                # Datetime of the END of the utterance (total audio incldues 1 second after this)
    window_sec     : float = WINDOW_SECONDS,  # (5.0s) openSMILE feature window duration for ML summary statistics
    step_sec       : float =   STEP_SECONDS,  # (0.5s) Step size between feature windows
    buffer_sec     : float = BUFFER_SECONDS,  # (0.5s) Include additional audio before & after the utterance 
) -> list[dict[pd.DataFrame, datetime, datetime]]:  # Returns a list of: {"features": pd.DataFrame, "start_dt": datetime, "end_dt": datetime}
    """
    Chunk `smile_df` into windows that fall within: 
        [utt_start_dt-buffer_sec, utt_end_dt+buffer_sec]
        
    Anchors a final window flush to utt_end_dt when the sliding stride doesn't
    land exactly on the last frame.

    Can get kind of complicated with the frame indices, step sizes, buffers, and overlaps here...

    """
    if smile_df.empty: return []

    # --------------------------------------------------------------------------------
    # Sort out the frame indices for the full utterance & windows within it
    # --------------------------------------------------------------------------------
    # Pre-roll might not always be 15 seconds, could be shorter if at the start of a recording
    # We have a buffer at the start and end of the speaker's utterance
    pre_roll_sec     = (utt_start_dt - audio_start_dt).total_seconds()
    utt_duration_sec = (utt_end_dt   - utt_start_dt  ).total_seconds()

    # Return an empty list when the utterance is shorter than `window_sec`
    if utt_duration_sec < (window_sec - (2 * buffer_sec)): return []

    # Get window sizes in frames (95 is 1 second due to the overlap; openSMILE frames cover 60ms, step size of 10ms)
    # Formula is: (seconds * FRAMES_PER_SECOND) - FRAMES_OFFSET
    frames_window = int(window_sec * FRAMES_PER_SECOND) - FRAMES_OFFSET
    frames_step   = int(  step_sec * FRAMES_PER_SECOND)
    frames_buffer = int(buffer_sec * FRAMES_PER_SECOND)

    # Subtract/add the buffer frames to the start/end of the utterance
    utt_start_idx = int( pre_roll_sec                     * FRAMES_PER_SECOND) - frames_buffer
    utt_end_idx   = int((pre_roll_sec + utt_duration_sec) * FRAMES_PER_SECOND) + frames_buffer

    # Clamp to the actual frame count we got back (OpenSMILE may emit slightly less than expected)
    utt_end_idx   = min(utt_end_idx, len(smile_df))
    utt_start_idx = max(utt_start_idx, 0)
    if utt_end_idx - utt_start_idx < frames_window: return []

    # --------------------------------------------------------------------------------
    # Set the features & timestamps for the subsequent biomarker calculations
    # --------------------------------------------------------------------------------
    # Anchor strictly to the start of the audio file to avoid buffer offset math
    def _make(start_idx: int, end_idx: int) -> dict[pd.DataFrame, datetime, datetime]:
        # Calculate absolute seconds from the very beginning of the audio file
        absolute_offset_s = start_idx / FRAMES_PER_SECOND
        window_start = audio_start_dt + timedelta(seconds=absolute_offset_s)
        return {
            "features" : smile_df.iloc[start_idx:end_idx],
            "start_dt" : window_start,
            "end_dt"   : window_start + timedelta(seconds=window_sec),
        }

    # --------------------------------------------------------------------------------
    # Prepare sliding windows within this utterance
    # --------------------------------------------------------------------------------
    windows  = []
    last_end = utt_start_idx
    for start_idx in range(utt_start_idx, utt_end_idx, frames_step):
        end_idx = start_idx + frames_window
        if end_idx > utt_end_idx: break

        windows.append(_make(start_idx, end_idx))
        last_end = end_idx

    # Anchor a final window flush to the utterance end
    if last_end < utt_end_idx:
        end_idx   = utt_end_idx
        start_idx = end_idx - frames_window
        windows.append(_make(start_idx, end_idx))

    return windows

