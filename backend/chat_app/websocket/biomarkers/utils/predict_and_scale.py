"""
Ensemble prediction + scaling for OFFLINE / DEPLOYED inference.
--------------------------------------------------------------------------------
`backend.chat_app.websocket.biomarkers.utils.predict_and_scale`

This module is meant to be COPY-PASTED into the deployed project. Includes
copies of the scaling math in `utils/ensemble_predict.py` (`percentile_of`,
`scale_to_target`, `smooth_quantile_map`) so that the deployed scores cannot 
drift from what was tuned and validated here. 

NOTE: If we ever change the scaling logic, it MUST also be changed here.

What it does (per input row), for ranking ensembles whose raw outputs have
arbitrary per-model scales:
    1. Each fold model predicts the row(s)              -> raw score per model
    2. Convert each raw score to its PERCENTILE within
       that model's reference (training) predictions    -> percentile per model
    3. Average the percentiles across models            -> one percentile per row
    4. Map that percentile onto the reference target
       (MMSE/MoCA) distribution                         -> one score per row

Steps 1-3 happen in "percentile space" (rank-averaging across the ensemble); the
non-linear target mapping (step 4) is applied once, at the end. The function
returns one scaled score per input row.

Inputs you need to persist at training time (see `save_models.save_ensemble`):
  * models             : the fold models (anything with a `.predict(X)` method).
  * sorted_train_preds : list (one per model) of each model's predictions on the
                         reference data, ASCENDING-SORTED. This is the percentile
                         reference for step 2.
  * y_ref              : 1-D array of the reference TARGET VALUES (e.g. training
                         MMSE/MoCA scores). This is the target distribution that 
                         the percentiles are mapped onto in step 4.

"""
import numpy  as np
import pandas as pd


# ================================================================================
# Use the provided models and reference information to generate scaled predictions
# ================================================================================
def predict_and_scale(
    models: list,                              # List of fold models, each exposing .predict(X) -> 1-D raw scores
    X: pd.DataFrame | pd.Series | np.ndarray,  # Input inference data -- can be a single row (1-D array / Series) or many rows (2-D array / DataFrame)
    *,

    # Reference data for scaling
    ref_preds : list[np.ndarray], # List (one per model) of ASCENDING-SORTED reference predictions
    y_ref     : np.ndarray,       # 1-D array of reference target values (e.g. training MMSE/MoCA)
    
    # Prediction scaling configuration
    mode : str   = "percentile_smooth",  # Scaling mode: "percentile" (hard np.quantile) | "percentile_smooth" (continuous)
    lo   : float =  0.0,                 # Lower target bound (used by "percentile_smooth" tails)
    hi   : float = 30.0,                 # Upper target bound (used by "percentile_smooth" tails)

) -> np.ndarray:
    """
    Run the fold-model ensemble over `X` and return one scaled (MMSE/MoCA-scale)
    score per input row. This handles both a single row and a batch of rows -- a
    single row is treated as a (1, n_features) matrix.

    Scaling modes:
      "percentile"        => Not "smooth" -- there will still be integer score "plateaus" ("21" or "25" for exammple)
      "percentile_smooth" => Continuous scores (results can be "21.63" for example)
    """
    # Normalize the input to something every model's .predict accepts (2-D)
    X2d, n_rows = _as_2d(X)

    # --------------------------------------------------------------------------------
    # 1-2) Per model: predict, then convert to a percentile vs. that model's reference
    # --------------------------------------------------------------------------------
    percentiles = np.empty((len(models), n_rows), dtype=float)
    for i, (model, ref) in enumerate(zip(models, ref_preds)):
        raw_preds      = np.asarray(model.predict(X2d), dtype=float).ravel()      # Flattens to 1D
        percentiles[i] = _percentile_of(raw_preds, ref, assume_sorted=ref_preds)  # Convert to percentiles 

    # --------------------------------------------------------------------------------
    # 3) Average the percentiles across models (rank-averaging), per row
    # --------------------------------------------------------------------------------
    # Take the average once the predictions are in percentile form
    avg_percentile = percentiles.mean(axis=0)

    # --------------------------------------------------------------------------------
    # 4) Map to MoCA scale through training target quantiles & divide by the maximum score
    # --------------------------------------------------------------------------------
    y_ref = np.asarray(y_ref, dtype=float)

    # Here we differentiate between the "percentile" & "percentile_smooth" scaling modes
    if mode == "percentile": scores = np.quantile         (y_ref, avg_percentile)
    else:                    scores = _smooth_quantile_map(y_ref, avg_percentile, lo=lo, hi=hi)

    # Finally, convert from 0-30 (MMSE/MoCA scale) to 0.0-1.0 scale before returning
    return np.clip(scores / hi, 0.0, 1.0)  # Divide by 30 and clip between 0 and 1
  

# ================================================================================
# Internal helpers (mirrors of utils/ensemble_predict.py -- must be kept in sync)
# ================================================================================
# Convert arbitrary magnitude ranking model predictions to percentile scores
def _percentile_of(raw_values, reference, assume_sorted: bool = True) -> np.ndarray:
    """
    Percentile rank of each entry in `values` within `reference` (both 1-D).
    Equivalent to np.mean(reference <= v) for each v, vectorized via searchsorted.

    NOTE: `reference` should be ASCENDING-SORTED (as saved by `save_ensemble`)
    """
    ref        = np.asarray(reference, dtype=float)
    sorted_ref = ref if assume_sorted else np.sort(ref)

    # Search sorted finds the first index a value could be inserted at 
    # ("right" means it goes to the right of any ties; though these should be rare with float predictions)
    indices = np.searchsorted(sorted_ref, np.asarray(raw_values, dtype=float), side="right")

    # Dividing by the total number of training predictions converts that index to a percentile rank
    percentiles = indices / len(sorted_ref)
    return percentiles

# For "percentile_smooth": Continuous version of `np.quantile(y_ref, percentiles)`.
def _smooth_quantile_map(y_ref: np.ndarray, percentiles, lo: float = 0.0, hi: float = 30.0):
    """
    When just in base "percentile" mode, `np.quantile` is a step function over
    the repeated integer targets (MMSE/MoCA 0-30), so a continuous input
    percentile snaps onto integer plateaus (e.g., "19.0" or "25.0"). To "smooth"
    scores for "percentile_smooth", we instead anchor each DISTINCT target value
    at the midpoint plotting position of its run in the empirical CDF and
    linearly interpolate, so a percentile inside a value's band maps fractionally
    toward the neighbor (e.g. "24.7"). 
    
    NOTE: The provided "theoretical" bounds (`lo`, `hi`) anchor the extreme tails.
    """
    y = np.sort(np.asarray(y_ref, dtype=float))
    N = len(y)

    # Distinct values and how many reference subjects share each one
    vals, counts = np.unique(y, return_counts=True)

    # Midpoint plotting position of each value's run within the empirical CDF
    cum       = np.cumsum(counts)
    positions = (cum - counts / 2.0) / N

    # Keep bounds outside the observed range so the anchors stay monotonic
    lo = min(lo, float(vals[ 0]))
    hi = max(hi, float(vals[-1]))

    # Anchor the theoretical bounds at the percentile extremes, then interpolate
    xp = np.concatenate(([0.0], positions, [1.0]))
    fp = np.concatenate(([lo ], vals,      [hi ]))

    return np.clip(np.interp(percentiles, xp, fp), lo, hi)

# Handle either single or batch input data of any type (pandas or numpy)
def _as_2d(X: pd.DataFrame | pd.Series | np.ndarray | list):
    """
    Return X in a 2-D form that `.predict` accepts, plus the row count.
    DataFrames / Series keep their feature names (for name-aware predictors);
    numpy input is treated positionally (you are responsible for column order).
    """
    # Pandas: handle either single (pd.Series) or batch (pd.DataFrame) input data
    if isinstance(X, pd.DataFrame): return X,              len(X)  # Multiple rows in a DataFrame
    if isinstance(X, pd.Series   ): return X.to_frame().T, 1       # Single row indexed by feature name

    # Numpy (or standard list): Convert to numpy array & shape everything as if there were multiple rows
    arr = np.asarray(X, dtype=float)             # Could also be given a list here
    if arr.ndim == 1:  arr = arr.reshape(1, -1)  # Convert a single row -> (1, n_features)
    return arr, arr.shape[0]

