"""
Altered Grammar biomarker.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.core.altered_grammar.altered_grammar`

Generates one 'ScoreSpan' per user utterance, scored by an ensemble of pretrained 
LightGBM models.

LGBMEnsemble falls back to random.random() if there are no model files in the
`biomarkers/models/altered_grammar/` directory.

"""
from pathlib import Path

# From this project
from .features              import extract_altered_grammar_features
from ...utils.model_loading import LGBMEnsemble

# Module-level cache: loaded lazily on the first predict() call, then reused.
_MODELS_DIR = Path(__file__).resolve().parent.parent.parent / "models" / "altered_grammar"
_ENSEMBLE   = LGBMEnsemble(_MODELS_DIR)


# --------------------------------------------------------------------------------
# Wrapper function around final feature pre-processing & model inference
# --------------------------------------------------------------------------------
def generate_altered_grammar(cleaned, tokens, pos_tags, words) -> list[dict]:
    if not tokens or not words: return []

    # Finish feature preparation
    features = extract_altered_grammar_features(cleaned, tokens, pos_tags, words)

    # Generate the biomarker score
    score = _ENSEMBLE.predict(features)

    return [{
        "score_type" : "alteredgrammar",
        "score"      : float(score),
        "start_ts"   : words[ 0]["start"],
        "end_ts"     : words[-1]["end"  ],
    }]
