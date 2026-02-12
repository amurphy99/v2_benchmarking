from ...services import logging_utils as lu

# Constants
WINDOW_SIZE = 5       # seconds
HOP_LENGTH  = 0.01    # 10ms for feature extraction
SAMPLE_RATE = 16_000  # Hz

PROSODY_FEATURES = [
    'F0final_sma', 'voicingFinalUnclipped_sma',
    'audspec_lengthL1norm_sma', 'audspecRasta_lengthL1norm_sma',
    'pcm_RMSenergy_sma', 'pcm_zcr_sma', 'jitterLocal_sma', 
    'jitterDDP_sma', 'shimmerLocal_sma', 'logHNR_sma'
]

PRONUNCIATION_FEATURES = [
    'audSpec_Rfilt_sma[3]', 'audSpec_Rfilt_sma[5]', 'audSpec_Rfilt_sma[9]', 'audSpec_Rfilt_sma[11]', 
    'audSpec_Rfilt_sma[12]', 'audSpec_Rfilt_sma[16]', 'audSpec_Rfilt_sma[20]', 'audSpec_Rfilt_sma[21]', 
    'audSpec_Rfilt_sma[23]', 'audSpec_Rfilt_sma[24]', 'audSpec_Rfilt_sma[25]', 'pcm_fftMag_fband250-650_sma', 
    'pcm_fftMag_spectralCentroid_sma', 'pcm_fftMag_spectralVariance_sma', 'mfcc_sma[5]', 'mfcc_sma[9]', 'mfcc_sma[10]', 
    'mfcc_sma[13]'
    ] 

# For the LLM
LAST_X_CHAT_ENTRIES = 5

# ================================================================================
# Configure Logging
# ================================================================================
# Time how long each biomarker takes to calculate and log it
TIME_BIOMARKERS = True

# Toggles
LOG_GRAMMAR = False

# --------------------------------------------------------------------------------
# Biomarker Logging Helpers
# --------------------------------------------------------------------------------
BIO_LOG = f"{lu.GREEN}[Bio] "
PRAG = f"{BIO_LOG}Pragmatic:      "
GRAM = f"{BIO_LOG}Altered Grammar:"
PROS = f"{BIO_LOG}Prosody:        "
PRON = f"{BIO_LOG}Pronunciation:  "
ANOM = f"{BIO_LOG}Anomia:         "
TURN = f"{BIO_LOG}Turntaking:     "

