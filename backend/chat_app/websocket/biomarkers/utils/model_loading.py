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

NOTE: For now I am not using the `y_ref` part. I just want the predictions
      to be in the percentile format as that is between 0 and 1. 

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
    Wrapper around N LightGBM Boosters living in a folder. Empty/missing models
    folder fallback to random "predictions."

    Additionally loads in reference data, `train_preds` and `y_ref` to separately
    scale the predictions of each model in the ensemble. 

    TODO: I really don't know if that is the best way to do it, especially having
          a bunch of really long numpy arrays loaded in constantly...
    """
    def __init__(self, folder: Path):
        self._folder         : Path = Path(folder)
        self._models         : Optional[list      ] = None   # Lazy loading
        self._train_preds    : Optional[list      ] = None   # Sorted training preds per fold
        self._y_ref          : Optional[np.ndarray] = None   # Sorted training targets
        self._warned_missing : bool                 = False  # Only log "no models found" warning once

    # --------------------------------------------------------------------------------
    # Loading
    # --------------------------------------------------------------------------------
    def _check_loaded(self) -> list:
        # Skip if we already loaded the models in
        if self._models is not None: return self._models

        # Load in each pre-trained model from the biomarker models directory
        models, train_preds = [], []
        if self._folder.is_dir():
            for path in sorted(self._folder.glob("*.txt")):
                try: 
                    # Load the LGB Booster model
                    models.append(lgb.Booster(model_file=str(path)))

                    # Load the corresponding sorted training predictions
                    preds_path = path.with_suffix("").with_name(path.stem + "_train_preds.npy")
                    if preds_path.exists(): train_preds.append(np.load(preds_path))
                    
                except Exception as e: logger.error(f"Failed to load LightGBM model {path}: {e}")

        # Load y_ref for quantile mapping
        y_ref_path = self._folder / "y_ref.npy"
        if y_ref_path.exists(): self._y_ref = np.load(y_ref_path)

        # Log a warning if the models files are missing
        if (not models) and (not self._warned_missing):
            logger.warning(f"No LightGBM models found in {self._folder} -- falling back to returning random scores.")
            self._warned_missing = True

        # Assign the saved models
        self._models = models
        self._train_preds = train_preds if (len(train_preds) == len(models)) else []
        return self._models

    @property
    def model_count(self) -> int:
        return len(self._check_loaded())

    # ================================================================================
    # Prediction
    # ================================================================================
    def predict_batch(self, feature_rows) -> list[float]:
        # Make sure the models are loaded
        models = self._check_loaded()
        if not models: return [random.random() for _ in rows]

        # Make sure we actually have input data
        rows = list(feature_rows)
        if not rows: return []
        arr = np.asarray(rows, dtype=np.float64)  # (N, F)

        # --------------------------------------------------------------------------------
        # Ranker Models
        # --------------------------------------------------------------------------------
        # Percentile-rank each model's predictions against its training distribution
        if self._train_preds:
            preds = []
            for model, sorted_train in zip(models, self._train_preds):
                raw = model.predict(arr)
                percentiles = np.searchsorted(sorted_train, raw) / len(sorted_train)
                preds.append(percentiles)

            # Take the average only once the predictions are in percentile form
            avg = np.stack(preds, axis=0).mean(axis=0)

            # TODO: I actually don't think I want this...
            # Map to MoCA scale through training target quantiles
            if (self._y_ref is not None):
                avg = np.quantile(self._y_ref, avg)
        
        # --------------------------------------------------------------------------------
        # Regression Models (or no reference data saved)
        # --------------------------------------------------------------------------------
        else:
            # Make predictions with each model & aggregate via taking the mean
            preds = np.stack([m.predict(arr) for m in models], axis=0) # (N, F) -> (M, N)
            avg   = preds.mean(axis=0)

        return avg.tolist()


    # Singular prediction (forward it as a batch of 1)
    def predict(self, features: Iterable[float]) -> float:
        result = self.predict_batch([list(features)])
        return result[0]

