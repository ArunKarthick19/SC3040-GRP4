"""Builds buyer statistics and seller comparables from HDB resale transactions.

Keeps only the current year's sales and, for every (town, flat type), stores
the sorted resale prices plus typical floor area and remaining lease, and the
median price of each block. recommender.py uses the price lists to work out
what share of this year's sales a buyer's budget would have covered.

Seller data is written separately to seller_comparables.json and retains
individual sales (address, area, lease and storey range). The buyer model's
schema and calculations are unchanged. Both outputs use this year's sales only.

Usage:
    python train_locations.py [path/to/resale.csv]
"""

import csv
import json
import statistics
import sys
from datetime import date
from pathlib import Path

DEFAULT_CSV = Path(__file__).parent.parent / "ResaleflatpricesbasedonregistrationdatefromJan2017onwards.csv"
MODEL_PATH = Path(__file__).parent / "models" / "location_stats.json"
SELLER_MODEL_PATH = Path(__file__).parent / "models" / "seller_comparables.json"


def lease_years(text):
    """'61 years 04 months' -> 61.33"""
    parts = text.split()
    years = int(parts[0])
    months = int(parts[2]) if len(parts) >= 4 else 0
    return years + months / 12


def train(csv_path, year):
    groups = {}
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if not row["month"].startswith(f"{year}-"):
                continue
            g = groups.setdefault((row["town"], row["flat_type"]), {"prices": [], "areas": [], "leases": [], "blocks": {}})
            price = int(float(row["resale_price"]))
            g["prices"].append(price)
            g["blocks"].setdefault((row["block"], row["street_name"]), []).append(price)
            g["areas"].append(float(row["floor_area_sqm"]))
            g["leases"].append(lease_years(row["remaining_lease"]))

    if not groups:
        sys.exit(f"No {year} transactions found in {csv_path}")

    stats = {}
    for (town, flat_type), g in sorted(groups.items()):
        stats.setdefault(flat_type, {})[town] = {
            "transactions": len(g["prices"]),
            "median_price": round(statistics.median(g["prices"])),
            "typical_floor_area": round(statistics.median(g["areas"])),
            "typical_remaining_lease": round(statistics.median(g["leases"])),
            "prices": sorted(g["prices"]),
            # [block, street, median price, sales]
            "blocks": [
                [block, street, round(statistics.median(p)), len(p)]
                for (block, street), p in sorted(g["blocks"].items())
            ],
        }
    return stats


def train_seller(csv_path, year):
    """Retain current-year transactions, grouped by flat type and town.

    Storeys are ranges in the source CSV, not exact floors. Lease months and
    floor area are kept without the rounding used for buyer summary statistics.
    """
    sales = {}
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if not row["month"].startswith(f"{year}-"):
                continue
            storey_min, storey_max = map(int, row["storey_range"].split(" TO "))
            sales.setdefault(row["flat_type"], {}).setdefault(row["town"], []).append({
                "month": row["month"],
                "block": row["block"],
                "street_name": row["street_name"],
                "floor_area_sqm": float(row["floor_area_sqm"]),
                "remaining_lease": lease_years(row["remaining_lease"]),
                "storey_range": row["storey_range"],
                "storey_min": storey_min,
                "storey_max": storey_max,
                "resale_price": int(float(row["resale_price"])),
            })
    if not sales:
        sys.exit(f"No {year} transactions found in {csv_path}")
    return {"year": year, "flat_types": sales}


if __name__ == "__main__":
    csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CSV
    year = date.today().year
    stats = train(csv_path, year)
    seller = train_seller(csv_path, year)

    MODEL_PATH.parent.mkdir(exist_ok=True)
    MODEL_PATH.write_text(json.dumps({"year": year, "flat_types": stats}))
    # Replace atomically so the API never reads a partially written seller file.
    seller_temp = SELLER_MODEL_PATH.with_suffix(".json.tmp")
    seller_temp.write_text(json.dumps(seller, separators=(",", ":")))
    seller_temp.replace(SELLER_MODEL_PATH)

    total = sum(t["transactions"] for towns in stats.values() for t in towns.values())
    print(f"Trained on {total:,} transactions from {year} -> {MODEL_PATH}")
    print(f"Saved {total:,} seller comparables -> {SELLER_MODEL_PATH}")
    for flat_type, towns in stats.items():
        print(f"  {flat_type:<17} {len(towns):>2} towns, {sum(t['transactions'] for t in towns.values()):>5,} sales")
