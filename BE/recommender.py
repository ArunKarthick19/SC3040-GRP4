"""Town recommendations for buyers, based on this year's HDB resale prices.

The model file is built by train_locations.py and block coordinates by
geocode_blocks.py. A town is recommended when enough of this year's sales of
the chosen flat type were within the budget.
"""

import json
import statistics
from bisect import bisect_right
from functools import lru_cache
from pathlib import Path

import price_model

FLAT_TYPES = ["2 ROOM", "3 ROOM", "4 ROOM", "5 ROOM", "EXECUTIVE"]

MODEL_PATH = Path(__file__).parent / "models" / "location_stats.json"
COORDS_PATH = Path(__file__).parent / "models" / "block_coords.json"
MIN_TRANSACTIONS = 10  # skip towns with too few sales to say anything reliable
MIN_SHARE = 0.10  # at least 1 in 10 of this year's sales must be within budget


@lru_cache(maxsize=1)
def _load_model():
    if not MODEL_PATH.exists():
        return None
    return json.loads(MODEL_PATH.read_text())


@lru_cache(maxsize=2)
def _load_coords(mtime):
    # mtime is part of the cache key, so the file is re-read whenever geocoding saves progress
    return json.loads(COORDS_PATH.read_text())


def _coords():
    return _load_coords(COORDS_PATH.stat().st_mtime) if COORDS_PATH.exists() else {}


def town_affordability(max_price, flat_type):
    """Share of this year's sales within budget for every town that sold `flat_type`.

    Returns {town: {...}} with no thresholds applied, or None if the model
    hasn't been trained yet.
    """
    model = _load_model()
    if model is None:
        return None

    towns = {}
    for town, s in model["flat_types"].get(flat_type, {}).items():
        towns[town] = {
            "town": town,
            "estimated_price": s["median_price"],
            "share_within_budget": round(bisect_right(s["prices"], max_price) / s["transactions"], 2),
            "transactions": s["transactions"],
            "typical_floor_area": s["typical_floor_area"],
            "typical_remaining_lease": s["typical_remaining_lease"],
        }
    return towns


def recommend_locations(max_price, flat_type):
    """Return towns where `flat_type` flats fit `max_price`, best match first.

    Each item: town, estimated_price (median this year), share_within_budget
    (0-1), transactions, typical_floor_area (sqm), typical_remaining_lease
    (years). Returns None if the model hasn't been trained yet.
    """
    towns = town_affordability(max_price, flat_type)
    if towns is None:
        return None

    results = [
        t for t in towns.values()
        if t["transactions"] >= MIN_TRANSACTIONS and t["share_within_budget"] >= MIN_SHARE
    ]
    results.sort(key=lambda r: (-r["share_within_budget"], r["estimated_price"]))
    return results


@lru_cache(maxsize=None)
def _all_prices(flat_type):
    """Sorted prices of every sale of `flat_type` this year, across all towns."""
    model = _load_model()
    towns = model["flat_types"].get(flat_type, {}) if model else {}
    return sorted(p for s in towns.values() for p in s["prices"])


def _predicted_fits(max_price, flat_type, towns):
    """Towns where the price model puts a typical `flat_type` flat within budget.

    A typical flat has the town's median floor area and remaining lease for
    that type. Returns (towns that fit, cheapest predicted price), or None if
    the price model hasn't been trained.
    """
    candidates = [t for t in towns.values() if t["transactions"] >= MIN_TRANSACTIONS]
    if not candidates:
        return [], None
    prices = price_model.predict_many([
        {
            "town": t["town"],
            "flat_type": flat_type,
            "floor_area_sqm": t["typical_floor_area"],
            "remaining_lease": t["typical_remaining_lease"],
        }
        for t in candidates
    ])
    if prices is None:
        return None
    fits = [t["town"] for t, p in zip(candidates, prices) if p <= max_price]
    return fits, min(prices)


def suggest_flat_types(max_price):
    """How well `max_price` covers each flat type, smallest type first.

    Each item: flat_type, towns (how many towns it fits), share_within_budget
    (0-1, across all of this year's sales of that type), median_price,
    typical_floor_area (sqm) and predicted_from (cheapest predicted price for
    a typical flat, or None). With the price model, a town fits when a typical
    flat there is predicted to be within budget; without it, when the town
    would be recommended. Returns None if the location model hasn't been trained.
    """
    if _load_model() is None:
        return None

    suggestions = []
    for flat_type in FLAT_TYPES:
        prices = _all_prices(flat_type)
        if not prices:
            continue
        towns = town_affordability(max_price, flat_type)
        predicted = _predicted_fits(max_price, flat_type, towns)
        suggestions.append({
            "flat_type": flat_type,
            "towns": len(predicted[0]) if predicted else len(recommend_locations(max_price, flat_type)),
            "share_within_budget": round(bisect_right(prices, max_price) / len(prices), 2),
            "median_price": round(statistics.median(prices)),
            "typical_floor_area": round(statistics.median(t["typical_floor_area"] for t in towns.values())),
            "predicted_from": predicted[1] if predicted else None,
        })
    return suggestions


def town_blocks(town, flat_type):
    """Blocks in `town` that sold `flat_type` this year, with coordinates.

    Blocks that haven't been geocoded yet are left out; `total` says how many
    there are in all.
    """
    model = _load_model()
    entry = model["flat_types"].get(flat_type, {}).get(town) if model else None
    if entry is None:
        return {"blocks": [], "total": 0}

    coords = _coords()
    blocks = []
    for block, street, median, sales in entry["blocks"]:
        latlng = coords.get(f"{block} {street}")
        if latlng:
            blocks.append({
                "block": block,
                "street": street,
                "median_price": median,
                "transactions": sales,
                "lat": latlng[0],
                "lng": latlng[1],
            })
    return {"blocks": blocks, "total": len(entry["blocks"])}


def model_year():
    model = _load_model()
    return model["year"] if model else None
