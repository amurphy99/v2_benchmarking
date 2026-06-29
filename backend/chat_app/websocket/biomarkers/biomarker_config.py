"""
Configuration variables for the biomarker scores.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.biomarker_config`

NOTE: Not sure exactly what I might need to keep in here, but this could help
      with keeping things organized across multiple files...

"""

# --------------------------------------------------------------------------------
# Handling raw audio data for generating openSMILE features
# --------------------------------------------------------------------------------
# Default audio capture: 16 kHz mono int16 PCM
SAMPLE_RATE       = 16_000
BYTES_PER_SAMPLE  = 2

# OpenSMILE LowLevelDescriptors emit one frame per 10ms hop (frames cover 60ms total)
FRAMES_PER_SECOND = 100  # One frame per 10ms hop
FRAMES_OFFSET     =   5  # Because the windows look forward, can't use all of them


# --------------------------------------------------------------------------------
# Audio window sizes for summarizing openSMILE features as rows of ML input
# --------------------------------------------------------------------------------
WINDOW_SECONDS =  3.0  # Duration of audio for openSMILE summary features (mean, etc.)
STEP_SECONDS   =  0.5  # Step size between windows of openSMILE features
BUFFER_SECONDS =  0.5  # Capture some time before and after the utterance

# Get window sizes in frames (95 is 1 second due to the overlap)
# Formula is: (seconds * FRAMES_PER_SECOND) - FRAMES_OFFSET
FRAMES_WINDOW = int((WINDOW_SECONDS * FRAMES_PER_SECOND) - FRAMES_OFFSET)
FRAMES_STEP   = int((  STEP_SECONDS * FRAMES_PER_SECOND))


# --------------------------------------------------------------------------------
# Misc. text-based biomarker configuration
# --------------------------------------------------------------------------------
AG_MIN_UTT_WORDS = 6

