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

NOTE: I am now using the `y_ref` data to convert scores back to MoCA/MMSE scale
      before we normalize (dividing by the max score of 30) and clip to be
      between 0 and 1.

"""
import logging, random, json
logger = logging.getLogger(__name__)

import numpy  as np
import pandas as pd
import lightgbm as lgb

from pathlib import Path
from typing  import Iterable, Optional

# From this project
from ....services.logging_utils import RESET, BOLD, UNBOLD, BRIGHT_YELLOW
from .predict_and_scale         import predict_and_scale

TAG = f"{BRIGHT_YELLOW}[{BOLD}LightGBM{UNBOLD}]"  # Tag for this file to show in the logs


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
        self._feature_set    : Optional[list[str] ] = None   # List of feature names the model was trained with
        self._train_preds    : Optional[list      ] = None   # Sorted training preds per fold
        self._y_ref          : Optional[np.ndarray] = None   # Sorted training targets
        self._warned_missing : bool                 = False  # Only log "no models found" warning once

    # ================================================================================
    # Loading
    # ================================================================================
    def _check_loaded(self) -> list:
        # Skip if we already loaded the models in
        if (self._models is not None): return self._models

        # --------------------------------------------------------------------------------
        # 1) Load the training feature set into a list
        # --------------------------------------------------------------------------------
        features_path = self._folder / "features.json"

        # If we have a feature set saved, load it in
        if features_path.exists():
            with open(features_path, "r", encoding="utf-8") as f: self._feature_set = json.load(f)
            logger.info(f"{TAG} Loaded {BOLD}{len(self._feature_set)}{UNBOLD} training features {BOLD}{self._folder.name}{UNBOLD}.{RESET}")
        
        # Otherwise we will just use the full set of given features
        else:
            self._feature_set = None
            logger.info(f"{TAG} No features saved for {BOLD}{self._folder.name}{UNBOLD}; will use all given data to make inferences.{RESET}")

        # --------------------------------------------------------------------------------
        # 2) Load in the pre-trained model and its training predictions for each fold
        # --------------------------------------------------------------------------------
        models, train_preds = [], []
        if self._folder.is_dir():
            for path in sorted(self._folder.glob("*.txt")):
                try: 
                    # Load the LightGBM Booster model
                    models.append(lgb.Booster(model_file=str(path)))

                    # Load the corresponding sorted training predictions
                    preds_path = path.with_suffix("").with_name(path.stem + "_train_preds.npy")
                    if preds_path.exists(): train_preds.append(np.load(preds_path))
                    
                except Exception as e: logger.error(f"Failed to load LightGBM model {path}: {e}")

        # --------------------------------------------------------------------------------
        # 3) Load 'y_ref' for quantile mapping
        # --------------------------------------------------------------------------------
        y_ref_path = self._folder / "y_ref.npy"
        if y_ref_path.exists(): self._y_ref = np.load(y_ref_path)

        # --------------------------------------------------------------------------------
        # 4) Report the "results" of the load
        # --------------------------------------------------------------------------------
        # Log a warning if the models files are missing
        if (not models) and (not self._warned_missing):
            logger.warning(f"{TAG} No LightGBM models found for {BOLD}{self._folder.name}{UNBOLD} -- falling back to returning random scores.{RESET}")
            self._warned_missing = True

        # Success
        elif models:
            logger.info(f"{TAG} Loaded {BOLD}{len(models)}{UNBOLD} LightGBM models for {BOLD}{self._folder.name}{UNBOLD}.{RESET}")

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
    # TODO: This might not be a Pandas Series for Altered Grammar
    def predict_batch(self, feature_rows: list[pd.Series]) -> list[float]:

        # If we loaded in a feature set, slice inputs to only that set of features
        if self._feature_set is not None:
            batch_df = pd.DataFrame(feature_rows)   # Convert to a DataFrame (N, F) 
            batch_df = batch_df[self._feature_set]  # Slice to get only the needed features
            arr      = batch_df.to_numpy()
        else:
            arr = np.asarray(feature_rows, dtype=np.float64)  # (N, F)

        # Make sure the models are loaded
        models = self._check_loaded()
        if not models: return [random.random() for _ in feature_rows]

        # --------------------------------------------------------------------------------
        # Ranking Models
        # --------------------------------------------------------------------------------
        # Percentile-rank each model's predictions against its training distribution
        # Get a list of scores of shape (1, n_samples)
        if self._train_preds:

            # Make a prediction with each fold model & scale it according to that same models predictions on the training set
            batch_scores = predict_and_scale(
                models = models,  # List of fold models, each exposing .predict(X) -> 1-D raw scores
                X      = arr,     # Input inference data -- can be a single row (1-D array / Series) or many rows (2-D array / DataFrame)

                # Reference data for scaling
                ref_preds = self._train_preds,  # List (one per model) of ASCENDING-SORTED reference predictions
                y_ref     = self._y_ref,        # 1-D array of reference target values (e.g. training MMSE/MoCA)
                
                # Prediction scaling configuration
                mode = "percentile_smooth",  # Scaling mode: "percentile" (hard np.quantile) | "percentile_smooth" (continuous)
                lo   =  0.0,                 # Lower target bound (used by "percentile_smooth" tails)
                hi   = 30.0,                 # Upper target bound (used by "percentile_smooth" tails)
            )
        
        # --------------------------------------------------------------------------------
        # Regression Models (or no reference data saved)
        # --------------------------------------------------------------------------------
        else:
            # Make predictions with each model & aggregate via taking the mean
            ensemble_preds = np.stack([m.predict(arr) for m in models], axis=0) # (N, F) -> (M, N)
            batch_scores   = ensemble_preds.mean(axis=0)

        return batch_scores.tolist()


    # Singular prediction (forward it as a batch of 1)
    def predict(self, features: Iterable[float]) -> float:
        result = self.predict_batch([list(features)])
        return result[0]

