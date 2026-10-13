"""Resale price predictions from the model built by train_price_model.py.

Used to suggest flat types to buyers (what a typical flat of each type costs
in each town today) and to value a seller's flat.
"""

import json
from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np

MODEL_PATH = Path(__file__).parent / "models" / "price_model.joblib"
METRICS_PATH = Path(__file__).parent / "models" / "price_model_metrics.json"
TYPICAL_STOREY = 8  # mid-height floor, used when the storey isn't known


@lru_cache(maxsize=1)
def _load():
    return joblib.load(MODEL_PATH) if MODEL_PATH.exists() else None


def available():
    return _load() is not None


def metrics():
    return json.loads(METRICS_PATH.read_text()) if METRICS_PATH.exists() else None


def predict_many(flats):
    """Predicted prices today for a list of flats.

    Each flat is a dict with town, flat_type, floor_area_sqm, remaining_lease
    (years) and optionally storey. Returns None if the model hasn't been
    trained; raises ValueError for a town or flat type it doesn't know.
    """
    bundle = _load()
    if bundle is None:
        return None
    rows = []
    for f in flats:
        if f["town"] not in bundle["towns"]:
            raise ValueError(f"Unknown town: {f['town']}")
        if f["flat_type"] not in bundle["flat_types"]:
            raise ValueError(f"Unknown flat type: {f['flat_type']}")
        rows.append([
            bundle["towns"].index(f["town"]),
            bundle["flat_types"].index(f["flat_type"]),
            f["floor_area_sqm"],
            f["remaining_lease"],
            f.get("storey") or TYPICAL_STOREY,
            bundle["latest_month"],  # price as of the latest sales in the data
        ])
    return [round(p) for p in np.exp(bundle["model"].predict(np.array(rows, dtype=float)))]


def predict(**flat):
    prices = predict_many([flat])
    return prices[0] if prices else None
