"""Builds the town recommendation model from HDB resale transactions.

Keeps only the current year's sales and, for every (town, flat type), stores
the sorted resale prices plus typical floor area and remaining lease, and the
median price of each block. recommender.py uses the price lists to work out
what share of this year's sales a buyer's budget would have covered.

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


if __name__ == "__main__":
    csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CSV
    year = date.today().year
    stats = train(csv_path, year)

    MODEL_PATH.parent.mkdir(exist_ok=True)
    MODEL_PATH.write_text(json.dumps({"year": year, "flat_types": stats}))

    total = sum(t["transactions"] for towns in stats.values() for t in towns.values())
    print(f"Trained on {total:,} transactions from {year} -> {MODEL_PATH}")
    for flat_type, towns in stats.items():
        print(f"  {flat_type:<17} {len(towns):>2} towns, {sum(t['transactions'] for t in towns.values()):>5,} sales")
