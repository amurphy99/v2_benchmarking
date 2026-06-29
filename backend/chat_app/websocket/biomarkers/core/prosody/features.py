"""
Feature extraction for the Prosody biomarker.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.core.prosody.features`

Take the subset of openSMILE features defined as "Prosody-relevant" relevant and
calculate summary statistics for them over the given window DataFrame. This will
include the mean, median, coefficient of variation, etc. 

NOTE: Prosody features taken from:
  "Improving automated scoring of prosody in oral reading fluency using deep learning algorithm"
  https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2024.1440760/full

"""
import pandas as pd
from datetime import datetime

# --------------------------------------------------------------------------------
# Designated openSMILE feature subset for our "Prosody" biomarker
# --------------------------------------------------------------------------------
LLD_PROSODY = [
    "F0final_sma",                      # Prosodic
    "audspec_lengthL1norm_sma",         # Prosodic
    "audspecRasta_lengthL1norm_sma",    # Prosodic
    "pcm_RMSenergy_sma",                # Prosodic
    "pcm_zcr_sma",                      # Prosodic
    "pcm_fftMag_fband250-650_sma",      # Spectral
    "pcm_fftMag_fband1000-4000_sma",    # Spectral
    "pcm_fftMag_spectralCentroid_sma",  # Spectral
    "pcm_fftMag_psySharpness_sma",      # Spectral
]


# ================================================================================
# Create a sample of data from a window of openSMILE features (for ML models)
# ================================================================================
def _window_sample_ML(smile_df: pd.DataFrame) -> pd.Series:
    """
    ML models only use one row so we summarize the 2d features with 1d statistics.
    
    We end up with 7 summary statistics for each feature in the given data. For the
    Prosody biomarker (9 features), that gives us 63 total model inputs. 

    NOTE: I've found CoV to be better than standard deviation in almost all cases here.
    """
    # --------------------------------------------------------------------------------
    # Standard statistical properties
    # --------------------------------------------------------------------------------
    # Arithmatic mean, standard deviation, & coefficient of variation (COV)
    means   = smile_df.mean(numeric_only=True)
    medians = smile_df.quantile(0.50, numeric_only=True)
    stds    = smile_df.std (numeric_only=True)
    cov     = stds / means.abs()

    # Rename columns to differentiate them
    means  .index = means  .index + "_mean"
    medians.index = medians.index + "_median"
    stds   .index = stds   .index + "_std"
    cov    .index = cov    .index + "_cov"

    # --------------------------------------------------------------------------------
    # Percentile Distributions
    # --------------------------------------------------------------------------------
    p10 = smile_df.quantile(0.10, numeric_only=True)
    p25 = smile_df.quantile(0.25, numeric_only=True)
    p75 = smile_df.quantile(0.75, numeric_only=True)
    p90 = smile_df.quantile(0.90, numeric_only=True)

    # Rename columns to differentiate them
    p10.index = p10.index + "_p10"
    p25.index = p25.index + "_p25"
    p75.index = p75.index + "_p75"
    p90.index = p90.index + "_p90"

    # --------------------------------------------------------------------------------
    # Concatentate the features together for 1 row of input
    # --------------------------------------------------------------------------------
    features = pd.concat([
        means, medians, cov,
        p10, p25, p75, p90,
    ])

    return features


# ================================================================================
# Feature Extraction (public facing endpoint)
# ================================================================================
def extract_prosody_features(window: dict[pd.DataFrame, datetime, datetime]) -> pd.Series | list[float]:
    smile_df = window["features"][LLD_PROSODY]
    if (smile_df is not None) and (len(smile_df) > 0): return _window_sample_ML(smile_df) # Summarize into ML features
    else:                                              return [0.0] * len(LLD_PROSODY)    # Return array of zeros otherwise

