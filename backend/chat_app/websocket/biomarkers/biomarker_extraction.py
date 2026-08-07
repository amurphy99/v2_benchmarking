"""
Async wrappers around the biomarker pipelines.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.biomarker_extraction`

Two entry points called by `biomarkers.callbacks`:
  * `extract_text_biomarkers (recent_text, words, context_buffer)`
  * `extract_audio_biomarkers(audio_chunks, overlapped_speech_count, words)`

Both run their CPU-heavy work in a shared thread pool so the consumer's event
loop stays responsive. Both return `list[ScoreSpan]`.

For the audio path, the pipeline is:
  1) slice_audio_chunks
  2) extract_opensmile_features
  3) window_features_within_utterance
  4) generate_audio_biomarkers (in `biomarker_scores`)

TODO: At this point, we may end up with a decently large number of rows per each
      conversation, depending on how long it goes. Might need to take a look at 
      how that looks in the database...

"""
import asyncio, logging
logger = logging.getLogger(__name__)

# Re-use one pool for the whole process (OpenSMILE in particular is CPU-heavy)
from concurrent.futures import ThreadPoolExecutor
_POOL = ThreadPoolExecutor(max_workers=4)

# From this project
from .biomarker_scores                  import generate_audio_biomarkers, generate_utterance_biomarkers
from .preprocessing.audio_preprocessing import slice_audio_chunks, extract_opensmile_features, window_features_within_utterance

# Configuration
MIN_UTTERANCE_SECONDS  =  5.0  # Skip if the user's utterance is shorter than this
PRE_UTTERANCE_SECONDS  = 15.0  # Seconds of audio before the utterance for openSMILE
POST_UTTERANCE_SECONDS =  1.0  # Seconds of audio after the utterance for openSMILE


# ================================================================================
# Text Biomarkers
# ================================================================================
async def extract_text_biomarkers(recent_text, words, context_buffer):
    """
    Called once per user utterance. There can be multiple biomarkers for a single
    utterance however (e.g., 1 per sentence, 1 per tri-gram, etc.).

    Easier entry than the audio biomarkers; only need to provide user utterance text.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        _POOL, lambda: generate_utterance_biomarkers(recent_text, words, context_buffer)
    )


# ================================================================================
# Audio Biomarkers 
# ================================================================================
def _audio_pipeline_sync(audio_chunks_snapshot, overlapped_speech_count, words):
    """
    Called once per user utterance. The utterance must have been at least ~5
    seconds long for a full window of features to be created. Utterances with
    lengths above that will get more biomarker scores depending on the step
    size used (~0.5 seconds for example).

    Slice audio -> OpenSMILE -> window -> score. Runs in the executor pool.
    """
    if not words: return []

    utt_start_dt = words[ 0]["start"]
    utt_end_dt   = words[-1]["end"  ]

    # Skip short utterances (models were trained on audio chunks longer than this)
    if (utt_end_dt - utt_start_dt).total_seconds() < MIN_UTTERANCE_SECONDS:
        return []

    # 1) Slice the rolling chunk buffer (15s pre-roll for OpenSMILE warm-up + 1s post-roll)
    audio_bytes, audio_start_dt = slice_audio_chunks(
        audio_chunks_snapshot, utt_start_dt, utt_end_dt,
        pre_seconds=PRE_UTTERANCE_SECONDS, post_seconds=POST_UTTERANCE_SECONDS,
    )
    if not audio_bytes: return []

    # 2) OpenSMILE LLDs over the full slice (warm-up included)
    smile_df = extract_opensmile_features(audio_bytes)

    # 3) Window features inside the utterance bounds (skips warm-up + post-roll)
    windows = window_features_within_utterance(smile_df, audio_start_dt, utt_start_dt, utt_end_dt)

    # 4) Score (currently random stubs; real models plug in here)
    return generate_audio_biomarkers(windows, overlapped_speech_count, words)

# Called by external methods
async def extract_audio_biomarkers(audio_chunks_snapshot, overlapped_speech_count, words):
    """
    The caller is responsible for snapshotting the rolling audio deque so we don't have
    to fight the event loop for mutation.

    `audio_chunks_snapshot` => list/tuple of (datetime, bytes) chunks
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        _POOL, _audio_pipeline_sync, audio_chunks_snapshot, overlapped_speech_count, words
    )
