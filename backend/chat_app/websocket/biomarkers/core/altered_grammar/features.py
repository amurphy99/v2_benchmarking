"""
Feature extraction for the Altered Grammar biomarker.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.core.altered_grammar.features`

TODO: Placeholder. Returns a fixed-length zero vector so the LightGBM ensemble
has something to use during development. Real implementation will generate the
same linguistic features that the models were trained on.

"""

# Arbitrary length until I set the actual model files/data prep code in here
_PLACEHOLDER_FEATURE_LEN = 10

# ================================================================================
# Feature Extraction 
# ================================================================================
def extract_altered_grammar_features(cleaned, tokens, pos_tags, words) -> list[float]:
    """Real implementation will replace this with the trained-model feature set."""
    return [0.0] * _PLACEHOLDER_FEATURE_LEN
