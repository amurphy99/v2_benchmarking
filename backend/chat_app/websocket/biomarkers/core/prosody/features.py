"""
Feature extraction for the Prosody biomarker.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.core.prosody.features`

Take the subset of openSMILE features defined as "Prosody-relevant" relevant and
calculate summary statistics for them over the given window DataFrame. This will
include the mean, median, coefficient of variation, etc. 

TODO: Placeholder version just returns a fixed-length zero vector per OpenSMILE 
feature window. Real implementation will summarize each window's LLD DataFrame 
into the same 1D feature vector that the models were trained on (means, stds,
percentiles, etc.).

"""

# Arbitrary length until I set the actual model files/data prep code in here
_PLACEHOLDER_FEATURE_LEN = 10

# ================================================================================
# Feature Extraction 
# ================================================================================
def extract_prosody_features(window) -> list[float]:
    """
    `window` is a dict with keys "features" (pd.DataFrame), "start_dt", "end_dt".
    """
    return [0.0] * _PLACEHOLDER_FEATURE_LEN
