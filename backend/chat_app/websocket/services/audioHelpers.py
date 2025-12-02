# ======================================================================= ===================================
# Audio Helper -- handles incoming audio data and the biomarkers generated from it
# ======================================================================= ===================================
# Might need to make sure this should or shouldn't be done threaded like this
# "librosa is precise but slow; if latency matters and you’re always going integer-ratio 48 kHz to 16 kHz or similar, scipy.signal.resample_poly is ~3-5x faster."

# Audio Data
import numpy as np
import base64, librosa, opensmile

# Threading
import asyncio
from concurrent.futures import ThreadPoolExecutor

# Logging
from time import time
import logging
logger = logging.getLogger(__name__)

# Project Code
from ..biomarkers.biomarker_scores import generate_audio_biomarkers, generate_utterance_biomarkers
from ..biomarkers.biomarker_config import SAMPLE_RATE, PROSODY_FEATURES, PRONUNCIATION_FEATURES
from ... import config as cf

# =======================================================================
# Constants
# =======================================================================
# Initialize opensmile feature extractor
feature_extractor = opensmile.Smile(
    feature_set     = opensmile.FeatureSet.ComParE_2016,
    feature_level   = opensmile.FeatureLevel.LowLevelDescriptors,
    sampling_rate   = SAMPLE_RATE,
)

# Re-use one pool for the whole process
_POOL = ThreadPoolExecutor(max_workers=4)

# =======================================================================
# Handle Audio Data
# =======================================================================
def handle_audio_data(data):
    try:
        # Decode the received base64 data to bytes & get the sample rate
        audio_bytes, sample_rate = data["data"], data["sampleRate"]
        logger.info(f"{cf.CYAN}[Aud] Audio data received: {len(audio_bytes):,} bytes at {sample_rate:,}Hz {cf.RESET}")
        
        # Normalize audio data
        audio_array = np.frombuffer(audio_bytes, dtype=np.int16)
        audio_array = audio_array / max(np.max(np.abs(audio_array)), 1e-9) # (divide by zero)

        # Resample to 16,000 Hz if necessary
        if sample_rate != SAMPLE_RATE:  # SAMPLE_RATE is 16_000
            audio_array = librosa.resample(audio_array, orig_sr=sample_rate, target_sr=SAMPLE_RATE)
            logger.info(f"Resampled audio to {SAMPLE_RATE}Hz")

        # Convert to float32 & extract features
        audio_array = librosa.util.buf_to_float(audio_array, n_bytes=2, dtype=np.float32)
        features = feature_extractor.process_signal(audio_array, SAMPLE_RATE)

        # Get only the specified features for each biomarker
        return features[PROSODY_FEATURES], features[PRONUNCIATION_FEATURES]
        
    # On error, returns both as None
    except Exception as e: 
        logger.error(f"Error processing audio data: {e}")
        return None, None
    

# =======================================================================
# Audio Data/Biomarkers Wrapper
# =======================================================================
async def extract_audio_biomarkers(data, overlapped_speech_count):
    """
    Async wrapper that:
      1. Runs the heavy feature extraction in a worker thread
      2. Turns those features into biomarker scores

    Nothing inside blocks the event-loop.
    """
    t0 = time()
    loop = asyncio.get_running_loop()

    # 1) Run heavy function in thread pool
    prosody_features, pronunciation_features = await loop.run_in_executor(_POOL, handle_audio_data, data)
    t1 = time()
    logger.info(f"{cf.CYAN}[Aud] Audio data processed:    {(t1-t0):5.4f}s {cf.RESET}")

    # 2) Generate the audio-related biomarker scores
    audio_biomarkers = generate_audio_biomarkers(prosody_features, pronunciation_features, overlapped_speech_count)
    logger.info(f"{cf.CYAN}[Bio] Audio biomarkers done:   {(time()-t1):5.4f}s {cf.RESET}")

    return audio_biomarkers


# =======================================================================
# On-Utterance Biomarkers
# =======================================================================
# I'm also just gonna put this here for now, obviously file structure should be changed
async def extract_text_biomarkers(context_buffer):
    t0 = time()
    loop = asyncio.get_running_loop()
    
    # Run heavy function in thread pool
    utterance_biomarkers = await loop.run_in_executor(_POOL, lambda: generate_utterance_biomarkers(context_buffer))
    logger.info(f"{cf.MAGENTA}[Bio] Biomarkers done in:      {(time()-t0):5.4f}s {cf.RESET}")

    # Return the biomarkers
    return utterance_biomarkers 
