"""
Prosody biomarker.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.core.prosody.prosody`

Generates one 'ScoreSpan' per OpenSMILE feature window, scored by an ensemble of
pretrained LightGBM models.

LGBMEnsemble falls back to random.random() if there are no model files in the
`biomarkers/models/prosody/` directory.

"""
from pathlib import Path

# From this project
from .features              import extract_prosody_features
from ...utils.model_loading import LGBMEnsemble

# Module-level cache: loaded lazily on the first predict() call, then reused.
_MODELS_DIR = Path(__file__).resolve().parent.parent.parent / "models" / "prosody"
_ENSEMBLE   = LGBMEnsemble(_MODELS_DIR)


# --------------------------------------------------------------------------------
# Wrapper function around final feature pre-processing & model inference
# --------------------------------------------------------------------------------
def generate_prosody(windows) -> list[dict]:
    if not windows: return []

    # Finish feature preparation
    feature_rows = [extract_prosody_features(w) for w in windows]

    # Generate the biomarker scores
    scores = _ENSEMBLE.predict_batch(feature_rows)

    return [{
        "score_type" : "prosody",
        "score"      : float(score),
        "start_ts"   : w["start_dt"],
        "end_ts"     : w["end_dt"  ],
    } for w, score in zip(windows, scores)]
