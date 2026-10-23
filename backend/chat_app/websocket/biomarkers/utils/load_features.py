"""
Load the list of best feature names for pre-trained machine learning models.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.utils.load_features`

This is used inside of `altered_grammar.py`.

TODO: It is kind of out of order, we still generate all features even though we
      know we don't need them all -- this only gets used at the last step to
      trim the features down...

"""
from pathlib import Path
import json


# ================================================================================
# Helper for loading a set of best features from the saved model directory
# ================================================================================
def load_best_features(folder: str | Path) -> list[str]:
    """
    Loads the list of best feature names from the ensemble artifact directory.
    NOTE: Just needs the directory path, best features are always saved under 
          the same filename ("best_features.json").
    """
    file_path = Path(folder) / "best_features.json"
    
    # Error finding the saved features list
    if not file_path.exists():
        raise FileNotFoundError(f"Feature artifact not found at: {file_path}")
        
    # Load the feature names in as a python list
    with open(file_path, "r", encoding="utf-8") as f:
        best_features = json.load(f)
        
    return best_features

