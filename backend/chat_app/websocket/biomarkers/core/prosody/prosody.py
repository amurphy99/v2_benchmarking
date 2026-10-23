"""
Prosody biomarker.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.core.prosody.prosody`

Generates one 'ScoreSpan' per OpenSMILE feature window, scored by an ensemble of
pretrained LightGBM models.

LGBMEnsemble falls back to random.random() if there are no model files in the
`biomarkers/models/prosody/` directory.

"""
import pandas as pd

from pathlib  import Path
from datetime import datetime

# From this project
from .features              import extract_prosody_features
from ...utils.model_loading import LGBMEnsemble
from ...utils.load_features import load_best_features

# Module-level cache: loaded lazily on the first predict() call, then reused.
PROSODY_MODELS_DIR = Path(__file__).resolve().parent.parent.parent / "models" / "prosody"
PROSODY_ENSEMBLE   = LGBMEnsemble(PROSODY_MODELS_DIR)
PROSODY_FEATURES   = load_best_features(PROSODY_MODELS_DIR)


# --------------------------------------------------------------------------------
# Wrapper function around final feature pre-processing & model inference
# --------------------------------------------------------------------------------
def generate_prosody(windows: list[dict[pd.DataFrame, datetime, datetime]]) -> list[dict]:
    if not windows: return []

    # Finish feature preparation
    feature_rows: list[pd.Series] = [extract_prosody_features(window) for window in windows]

    # Use the list of best features from training to trim the features down
    batch_df   = pd.DataFrame(feature_rows)  # Convert to a DataFrame (N, F) 
    batch_df   = batch_df[PROSODY_FEATURES]  # Slice to get only the needed features
    X_features = batch_df.to_numpy()

    # Generate the biomarker scores
    scores = PROSODY_ENSEMBLE.predict_batch(X_features)

    return [{
        "score_type" : "prosody",
        "score"      : float(score),
        "start_ts"   : window["start_dt"],
        "end_ts"     : window[  "end_dt"],
    } for window, score in zip(windows, scores)]

