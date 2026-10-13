"""Trains the resale price model on every HDB resale transaction since 2017.

A gradient boosting model learns the price from town, flat type, floor area,
remaining lease, storey and sale month (so it picks up how prices move over
time). It is tested on the most recent 6 months of sales, which it never sees
during that test, then retrained on everything and saved for price_model.py.

Usage:
    python train_price_model.py [path/to/resale.csv]
"""

import csv
import json
import sys
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_absolute_percentage_error, r2_score

from train_locations import DEFAULT_CSV, lease_years

MODEL_PATH = Path(__file__).parent / "models" / "price_model.joblib"
METRICS_PATH = Path(__file__).parent / "models" / "price_model_metrics.json"
BASE_YEAR = 2017
TEST_MONTHS = 6

FEATURES = ["town", "flat_type", "floor_area_sqm", "remaining_lease", "storey", "month"]
CATEGORICAL = [True, True, False, False, False, False]


def month_index(text):
    """'2019-03' -> months since Jan 2017 (26)"""
    year, month = text.split("-")
    return (int(year) - BASE_YEAR) * 12 + int(month) - 1


def storey_mid(text):
    """'10 TO 12' -> 11"""
    low, _, high = text.split()
    return (int(low) + int(high)) / 2


def load(csv_path):
    with open(csv_path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    towns = sorted({r["town"] for r in rows})
    flat_types = sorted({r["flat_type"] for r in rows})
    X = np.array([
        [
            towns.index(r["town"]),
            flat_types.index(r["flat_type"]),
            float(r["floor_area_sqm"]),
            lease_years(r["remaining_lease"]),
            storey_mid(r["storey_range"]),
            month_index(r["month"]),
        ]
        for r in rows
    ])
    y = np.array([float(r["resale_price"]) for r in rows])
    return X, y, towns, flat_types


def new_model():
    return HistGradientBoostingRegressor(
        categorical_features=CATEGORICAL,
        max_iter=500,
        learning_rate=0.1,
        max_leaf_nodes=63,
        random_state=42,
    )


def main():
    csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CSV
    X, y, towns, flat_types = load(csv_path)
    latest = int(X[:, 5].max())

    # Test on the latest months only, like predicting prices the model hasn't seen yet
    test = X[:, 5] > latest - TEST_MONTHS
    model = new_model().fit(X[~test], np.log(y[~test]))  # log price: errors scale with price
    pred = np.exp(model.predict(X[test]))
    metrics = {
        "train_sales": int((~test).sum()),
        "test_sales": int(test.sum()),
        "test_period_months": TEST_MONTHS,
        "mae": round(mean_absolute_error(y[test], pred)),
        "mape": round(mean_absolute_percentage_error(y[test], pred) * 100, 2),
        "r2": round(r2_score(y[test], pred), 4),
    }
    print(
        f"Tested on the last {TEST_MONTHS} months ({metrics['test_sales']:,} sales): "
        f"typical error ${metrics['mae']:,} ({metrics['mape']}%), R^2 {metrics['r2']}"
    )

    # Final model uses every sale, including the most recent
    model = new_model().fit(X, np.log(y))
    MODEL_PATH.parent.mkdir(exist_ok=True)
    joblib.dump(
        {"model": model, "towns": towns, "flat_types": flat_types, "latest_month": latest},
        MODEL_PATH,
        compress=3,
    )
    METRICS_PATH.write_text(json.dumps({**metrics, "total_sales": len(y)}, indent=2))
    print(f"Saved {MODEL_PATH} ({MODEL_PATH.stat().st_size / 1024:.0f} KB), trained on {len(y):,} sales")


if __name__ == "__main__":
    main()
