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

# Module-level cache: loaded lazily on the first predict() call, then reused.
_MODELS_DIR = Path(__file__).resolve().parent.parent.parent / "models" / "prosody"
_ENSEMBLE   = LGBMEnsemble(_MODELS_DIR)


# --------------------------------------------------------------------------------
# Wrapper function around final feature pre-processing & model inference
# --------------------------------------------------------------------------------
def generate_prosody(windows: list[dict[pd.DataFrame, datetime, datetime]]) -> list[dict]:
    if not windows: return []

    # Finish feature preparation
    feature_rows: list[pd.Series] = [extract_prosody_features(window) for window in windows]

    # Generate the biomarker scores
    scores = _ENSEMBLE.predict_batch(feature_rows)

    return [{
        "score_type" : "prosody",
        "score"      : float(score),
        "start_ts"   : window["start_dt"],
        "end_ts"     : window[  "end_dt"],
    } for window, score in zip(windows, scores)]

