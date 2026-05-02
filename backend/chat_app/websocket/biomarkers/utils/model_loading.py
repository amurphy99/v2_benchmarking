"""
LightGBM ensemble loader/predictor. 
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.utils.model_loading`

Shared by the Altered Grammar and Prosody biomarkers (and any future ones with
the same setup).

Each biomarker has 5-6 pretrained LightGBM Boosters saved as native-format .txt
files (`Booster.save_model(path)`). At score time we load them once, run each
on the same feature row(s), and average the predictions.

Loads the models once on the first use and then reuses them for subsequent
calls. If the model directory is missing or empty then just return a random 
value.

Threading: `Booster.predict()` is thread-safe in LightGBM, and we share 
instances across the executor pool used by `biomarker_extraction`.

TODO: Add logging with timing and stuff around here (also for the models
      loading in and out).

"""
import logging, random
logger = logging.getLogger(__name__)

import numpy    as np
import lightgbm as lgb

from pathlib import Path
from typing  import Iterable, Optional


# ================================================================================
# LightGBM Ensemble Loader/Predictor
# ================================================================================
class LGBMEnsemble:
    """
    Wrapper around N LightGBM Boosters living in a folder. Predictions average 
    across all loaded models. Empty/missing folder => random fallback.
    """
    def __init__(self, folder: Path):
        self._folder        : Path = Path(folder)
        self._models        : Optional[list]  = None     # Lazy loading
        self._warned_missing: bool            = False    # Only log "no models found" warning once

    # --------------------------------------------------------------------------------
    # Loading
    # --------------------------------------------------------------------------------
    def _check_loaded(self) -> list:
        # Skip if we already loaded the models in
        if self._models is not None: return self._models

        # Load in each pre-trained model from the biomarker models directory
        models = []
        if self._folder.is_dir():
            for path in sorted(self._folder.glob("*.txt")):
                try: models.append(lgb.Booster(model_file=str(path)))
                except Exception as e: logger.error(f"Failed to load LightGBM model {path}: {e}")

        # Log a warning if the models files are missing
        if (not models) and (not self._warned_missing):
            logger.warning(f"No LightGBM models found in {self._folder} -- falling back to random scores.")
            self._warned_missing = True

        self._models = models
        return self._models

    @property
    def model_count(self) -> int:
        return len(self._check_loaded())

    # --------------------------------------------------------------------------------
    # Prediction
    # --------------------------------------------------------------------------------
    # One feature row -> one averaged score in [0, 1]-ish (depends on model output).
    def predict(self, features: Iterable[float]) -> float:
        # Make sure the models are loaded
        models = self._check_loaded()
        if not models: return random.random()

        # Make predictions with each model
        arr = np.asarray([list(features)], dtype=np.float64)            # (1, F)
        preds_per_model = np.stack([m.predict(arr) for m in models], 0) # (M, 1)
        
        # Aggregate via taking the mean (TODO: for now, might change this later depending on certain parameters)
        prediction = float(preds_per_model.mean())
        return prediction

    # N feature rows -> N averaged scores. Faster than calling predict() in a loop.
    def predict_batch(self, feature_rows) -> list[float]:
        rows = list(feature_rows)
        if not rows: return []

        # Make sure the models are loaded
        models = self._check_loaded()
        if not models: return [random.random() for _ in rows]

        # Make predictions with each model
        arr = np.asarray(rows, dtype=np.float64)                        # (N, F)
        preds_per_model = np.stack([m.predict(arr) for m in models], 0) # (M, N)

        # Aggregate via taking the mean (TODO: for now, might change this later depending on certain parameters)
        predictions = preds_per_model.mean(axis=0).tolist()
        return predictions
