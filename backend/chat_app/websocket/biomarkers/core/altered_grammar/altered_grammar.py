"""
Altered Grammar biomarker.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.core.altered_grammar.altered_grammar`

Generates one 'ScoreSpan' per user utterance, scored by an ensemble of pretrained 
LightGBM models.

LGBMEnsemble falls back to random.random() if there are no model files in the
`biomarkers/models/altered_grammar/` directory.

TODO: Do the same file split for the sentence-level features and the
      transcript-level features in the offline version of the code.

TODO: If I do it well enough, I may be able to just copy and paste the entire
      file into the offline version...

"""
from pathlib import Path

# From this project
from .features              import extract_altered_grammar_features
from ...utils.model_loading import LGBMEnsemble
from ...utils.load_features import load_best_features

# Module-level cache: loaded lazily on the first predict() call, then reused.
ALTERED_GRAMMAR_MODELS_DIR = Path(__file__).resolve().parent.parent.parent / "models" / "altered_grammar"
ALTERED_GRAMMAR_ENSEMBLE   = LGBMEnsemble      (ALTERED_GRAMMAR_MODELS_DIR)
ALTERED_GRAMMAR_FEATURES   = load_best_features(ALTERED_GRAMMAR_MODELS_DIR)


# --------------------------------------------------------------------------------
# Wrapper function around final feature pre-processing & model inference
# --------------------------------------------------------------------------------
def generate_altered_grammar(cleaned, tokens, pos_tags, words) -> list[dict]:
    """
    Skips generating a score for this utterance if no sentence passes the guard
    for having >= 2 tokens (e.g. one-word "Yeah." responses).
    """
    if (not tokens) or (not words): return []

    # Finish feature preparation
    gram_feats, _ = extract_altered_grammar_features(cleaned, tokens, pos_tags, words)
    if not gram_feats: return []

    # Use the list of best features from training to trim the features down
    X_features = [float(gram_feats[feature_name]) for feature_name in ALTERED_GRAMMAR_FEATURES]

    # Generate the biomarker score
    score = ALTERED_GRAMMAR_ENSEMBLE.predict(X_features)

    return [{
        "score_type" : "alteredgrammar",
        "score"      : float(score),
        "start_ts"   : words[ 0]["start"],
        "end_ts"     : words[-1]["end"  ],
    }]
