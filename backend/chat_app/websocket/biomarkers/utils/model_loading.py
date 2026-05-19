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
            logger.info(f"{TAG} No features saved for {BOLD}{self._folder.name}{UNBOLD}; will use all given data to make inferences. .{RESET}")

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
        # Make sure we actually have input data
        if not feature_rows: return []

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
        # Ranker Models
        # --------------------------------------------------------------------------------
        # Percentile-rank each model's predictions against its training distribution
        if self._train_preds:
            ensemble_preds = []

            # Make a prediction with each fold model & **percentile** scale it according to that same models predictions on the training set
            for model, sorted_train in zip(models, self._train_preds):
                raw = model.predict(arr)

                # Search sorted finds the first index a value could be inserted at 
                # ("right" means it goes to the right of any ties; though these should be rare with float predictions)
                indices = np.searchsorted(sorted_train, raw, side="right") 

                # Dividing by the total number of training predictions converts that index to a percentile rank
                percentiles = indices / len(sorted_train)
                ensemble_preds.append(percentiles)

            # Take the average once the predictions are in percentile form
            ensemble_average = np.stack(ensemble_preds, axis=0).mean(axis=0)  # (average of percentile-scaled ensemble predictions)

            # Map to MoCA scale through training target quantiles & divide by the maximum score
            if (self._y_ref is not None): 
                ensemble_average = np.quantile(self._y_ref, ensemble_average)  # Mapped to MoCA scale through training target quantiles
                ensemble_average = np.clip(ensemble_average / 30.0, 0.0, 1.0)  # Divide by 30 and clip between 0 and 1
        
        # --------------------------------------------------------------------------------
        # Regression Models (or no reference data saved)
        # --------------------------------------------------------------------------------
        else:
            # Make predictions with each model & aggregate via taking the mean
            ensemble_preds   = np.stack([m.predict(arr) for m in models], axis=0) # (N, F) -> (M, N)
            ensemble_average = ensemble_preds.mean(axis=0)

        return ensemble_average.tolist()


    # Singular prediction (forward it as a batch of 1)
    def predict(self, features: Iterable[float]) -> float:
        result = self.predict_batch([list(features)])
        return result[0]

