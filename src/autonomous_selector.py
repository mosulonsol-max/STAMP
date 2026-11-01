"""Causal autonomous candidate selection using only the earlier selection window.

No future holdout scores, unverified news or manually assigned confidence enter
selection. Approval remains exclusively with model_governor.
"""
import math
import numpy as np

def choose_candidate(actual, predictions, minimum_recent=12):
    """Return (candidate, audit). Predictions align with matured selection labels."""
    if not predictions:
        raise ValueError("No valid candidates")
    y=np.asarray(actual,dtype=float)
    if not len(y) or not np.all(np.isfinite(y)):
        raise ValueError("Invalid matured selection labels")
    scored={}
    window=min(len(y),max(minimum_recent,len(y)//2))
    old=np.abs(y[:-window])
    recent=np.abs(y[-window:])
    drift=(float(np.mean(recent))/max(float(np.mean(old)),1e-12)) if len(old) else None
    for name,values in predictions.items():
        p=np.asarray(values,dtype=float)
        if p.shape!=y.shape or not np.all(np.isfinite(p)):
            continue
        full=float(np.mean(np.abs(y-p)))
        tail=float(np.mean(np.abs(y[-window:]-p[-window:])))
        # Recent error has more weight when volatility regime has shifted.
        recent_weight=0.7 if drift is not None and (drift>=2 or drift<=0.5) else 0.4
        weighted=(1-recent_weight)*full+recent_weight*tail
        scored[name]={"full_mae":full,"recent_mae":tail,"weighted_mae":weighted}
    if not scored:
        raise ValueError("No finite candidate forecasts")
    # Tie-breaking is deterministic; no-change wins exact ties.
    chosen=min(scored,key=lambda name:(scored[name]["weighted_mae"],name!="no_change",name))
    return chosen,{"policy":"selection-only drift-aware MAE; independent later holdout untouched",
                   "selection_samples":len(y),"recent_window":window,
                   "volatility_ratio":drift,"candidates":scored,
                   "selected":chosen,"approved":False}
