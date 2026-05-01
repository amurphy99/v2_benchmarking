"""
Handle audio data for generating audio-based biomarkers.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.services.audioHelpers.py`

The old configuration used every bit of audio data regardless of who (if anyone)
was speaking. We now only want to use audio from when we know the user was the
one speaking.

TODO: Currently changed to be a rough outline for what will be added later, all
      existing biomarker code has been deleted. 
      
TODO: This entire file may be removed and the functionality may be put somewhere 
      else later...

TODO: Will have to decide how to pass audio here (or if I should...)

"""
import logging, asyncio
logger = logging.getLogger(__name__)

from time import monotonic as now_ts

# Re-use one pool for the whole process (TODO: This was for the old openSMILE feature extraction)
from concurrent.futures import ThreadPoolExecutor
_POOL = ThreadPoolExecutor(max_workers=4)

# From this project
from ...services                   import logging_utils as lu
from ..biomarkers.biomarker_scores import generate_audio_biomarkers, generate_utterance_biomarkers


# ================================================================================
# Audio Biomarkers Wrapper
# ================================================================================
async def extract_audio_biomarkers(overlapped_speech_count):
    """
    Dummy audio biomarkers (no openSMILE feature extraction, returns random values).
    Real implementation will run OpenSMILE on the most recent user-utterance audio.
    """
    # Generate biomarkers
    t0 = now_ts()
    audio_biomarkers = generate_audio_biomarkers(overlapped_speech_count)
    t1 = now_ts()
    #logger.info(f"{lu.CYAN}[Bio] Audio biomarkers done:   {(t1-t0):5.4f}s {lu.RESET}")

    return audio_biomarkers


# ================================================================================
# On-Utterance Biomarkers
# ================================================================================
async def extract_text_biomarkers(context_buffer):
    loop = asyncio.get_running_loop()

    t0 = now_ts()
    text_biomarkers = await loop.run_in_executor(
        _POOL, lambda: generate_utterance_biomarkers(context_buffer)
    )
    t1 = now_ts()
    #logger.info(f"{lu.CYAN}[Bio] Text biomarkers done:   {(t1-t0):5.4f}s {lu.RESET}")

    return text_biomarkers


