"""Base seller estimates from similar resale transactions in the current year.

This is a comparable-sales estimate, with no photo/condition adjustment.
Prefer the same block, then street, then town; never borrow another town's
sales or another flat type to produce an estimate. If too few sales match the
physical details, use the median of all same-town, same-flat-type sales and
identify it as a broad estimate.
"""

import json
import re
import statistics
from datetime import date
from functools import lru_cache

from train_locations import SELLER_MODEL_PATH

MIN_COMPARABLES = 3
MAX_COMPARABLES = 10
MAX_AREA_DIFFERENCE = 0.10  # relative to the seller's floor area
MAX_LEASE_DIFFERENCE = 5  # years
MAX_STOREY_DIFFERENCE = 3  # floors from the recorded storey range


class SellerDataUnavailable(RuntimeError):
    """The current year's seller dataset has not been built."""


def normalise_address(text):
    words = text.strip().upper().split()
    abbreviations = {
        "AVENUE": "AVE", "STREET": "ST", "ROAD": "RD", "DRIVE": "DR",
        "CRESCENT": "CRES", "PLACE": "PL", "CLOSE": "CL", "TERRACE": "TER",
    }
    return " ".join(abbreviations.get(word, word) for word in words)


@lru_cache(maxsize=1)
def _load_model(mtime_ns):
    return json.loads(SELLER_MODEL_PATH.read_text())


def _model():
    try:
        mtime_ns = SELLER_MODEL_PATH.stat().st_mtime_ns
    except FileNotFoundError:
        raise SellerDataUnavailable("Seller data is unavailable. Run python train_locations.py in BE.") from None
    model = _load_model(mtime_ns)
    if model["year"] != date.today().year:
        raise SellerDataUnavailable("Seller data is from a previous year. Re-run python train_locations.py with this year's CSV.")
    return model


def seller_options():
    model = _model()
    return {
        "year": model["year"],
        "towns": sorted({town for towns in model["flat_types"].values() for town in towns}),
    }


def estimate_price(town, block, street, flat_type, floor_area, remaining_lease, storey):
    model = _model()
    town = " ".join(town.upper().split())
    if not any(town in towns for towns in model["flat_types"].values()):
        raise ValueError("Choose a town from the available seller towns.")
    block = re.sub(r"\s+", "", block.upper())
    street = normalise_address(street)
    sales = model["flat_types"].get(flat_type, {}).get(town, [])

    # A floor inside the recorded range has distance zero: the CSV does not
    # identify the exact floor of each transaction.
    similar = []
    for sale in sales:
        area_gap = abs(sale["floor_area_sqm"] - floor_area) / floor_area
        lease_gap = abs(sale["remaining_lease"] - remaining_lease)
        storey_gap = max(sale["storey_min"] - storey, storey - sale["storey_max"], 0)
        if (area_gap <= MAX_AREA_DIFFERENCE + 1e-9
                and lease_gap <= MAX_LEASE_DIFFERENCE
                and storey_gap <= MAX_STOREY_DIFFERENCE):
            score = (area_gap / MAX_AREA_DIFFERENCE
                     + lease_gap / MAX_LEASE_DIFFERENCE
                     + storey_gap / MAX_STOREY_DIFFERENCE)
            similar.append((score, sale))

    tiers = (
        ("block", [s for s in similar if normalise_address(s[1]["street_name"]) == street
                   and re.sub(r"\s+", "", s[1]["block"].upper()) == block]),
        ("street", [s for s in similar if normalise_address(s[1]["street_name"]) == street]),
        ("town", similar),
    )
    result = {
        "year": model["year"], "town": town, "flat_type": flat_type,
        "remaining_lease": remaining_lease,
    }
    for level, candidates in tiers:
        if len(candidates) < MIN_COMPARABLES:
            continue
        # Prefer closer physical matches, then newer transactions for ties.
        candidates.sort(key=lambda s: (s[0], -int(s[1]["month"].replace("-", ""))))
        chosen = [sale for _, sale in candidates[:MAX_COMPARABLES]]
        prices = [s["resale_price"] for s in chosen]
        return {
            **result,
            "available": True,
            "base_valuation": round(statistics.median(prices)),
            "match_level": level,
            "comparable_count": len(chosen),
            "candidate_count": len(candidates),
            "comparable_price_range": {"low": min(prices), "high": max(prices)},
            "comparables": chosen,
        }
    if len(sales) >= MIN_COMPARABLES:
        # Use every sale in this town/type for the median, rather than choosing
        # prices using the physical details that failed to find enough matches.
        # Return only a short preview to keep the response and UI manageable.
        prices = [s["resale_price"] for s in sales]
        preview = sorted(sales, key=lambda s: s["month"], reverse=True)[:MAX_COMPARABLES]
        return {
            **result,
            "available": True,
            "base_valuation": round(statistics.median(prices)),
            "match_level": "town_flat_type",
            "comparable_count": len(sales),
            "candidate_count": len(sales),
            "comparable_price_range": {"low": min(prices), "high": max(prices)},
            "comparables": preview,
        }
    return {
        **result,
        "available": False,
        "base_valuation": None,
        "comparable_count": len(sales),
        "comparables": [],
        "reason": (
            f"Only {len(sales)} {flat_type.lower()} sale(s) were found in {town.title()} "
            f"in {model['year']}. At least {MIN_COMPARABLES} are needed for an estimate."
        ),
    }
