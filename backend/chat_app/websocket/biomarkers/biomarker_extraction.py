"""
Async wrappers around the biomarker pipelines.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.biomarker_extraction`

Two entry points called by `cc_callbacks`:
  * `extract_text_biomarkers (recent_text, words, context_buffer)`
  * `extract_audio_biomarkers(audio_chunks, overlapped_speech_count, words)`

Both run their CPU-heavy work in a shared thread pool so the consumer's event
loop stays responsive. Both return `list[ScoreSpan]`.

For the audio path, the pipeline is:
    slice_audio_chunks -> extract_opensmile_features -> window_features_within_utterance
    -> generate_audio_biomarkers (in biomarker_scores)
"""
import asyncio, logging
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

# Re-use one pool for the whole process (OpenSMILE in particular is CPU-heavy)
_POOL = ThreadPoolExecutor(max_workers=4)

# Skip if the user's utterance is shorter than this -- not enough signal
MIN_UTTERANCE_SECONDS = 5.0

# From this project
from .biomarker_scores                  import generate_audio_biomarkers, generate_utterance_biomarkers
from .preprocessing.audio_preprocessing import (
    slice_audio_chunks,
    extract_opensmile_features,
    window_features_within_utterance,
)


# ================================================================================
# Text biomarkers (per user utterance)
# ================================================================================
async def extract_text_biomarkers(recent_text, words, context_buffer):
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        _POOL, lambda: generate_utterance_biomarkers(recent_text, words, context_buffer)
    )


# ================================================================================
# Audio biomarkers (per user utterance)
# ================================================================================
def _audio_pipeline_sync(audio_chunks_snapshot, overlapped_speech_count, words):
    """
    Slice audio -> OpenSMILE -> window -> score. Runs in the executor pool.
    """
    if not words: return []

    utt_start_dt = words[ 0]["start"]
    utt_end_dt   = words[-1]["end"  ]

    # Skip very short utterances -- not enough signal for the audio biomarkers
    if (utt_end_dt - utt_start_dt).total_seconds() < MIN_UTTERANCE_SECONDS:
        return []

    # 1) Slice the rolling chunk buffer (15s pre-roll for OpenSMILE warm-up + 1s post-roll)
    audio_bytes, audio_start_dt = slice_audio_chunks(
        audio_chunks_snapshot, utt_start_dt, utt_end_dt,
        pre_seconds=15.0, post_seconds=1.0,
    )
    if not audio_bytes: return []

    # 2) OpenSMILE LLDs over the full slice (warm-up included)
    smile_df = extract_opensmile_features(audio_bytes)

    # 3) Window features inside the utterance bounds (skips warm-up + post-roll)
    windows = window_features_within_utterance(smile_df, audio_start_dt, utt_start_dt, utt_end_dt)

    # 4) Score (currently random stubs; real models plug in here)
    return generate_audio_biomarkers(windows, overlapped_speech_count, words)


async def extract_audio_biomarkers(audio_chunks_snapshot, overlapped_speech_count, words):
    """
    `audio_chunks_snapshot` is a list/tuple of (datetime, bytes) chunks -- the caller
    is responsible for snapshotting the rolling deque so we don't fight the event
    loop for mutation.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        _POOL, _audio_pipeline_sync, audio_chunks_snapshot, overlapped_speech_count, words
    )
