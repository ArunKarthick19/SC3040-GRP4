"""Looks up coordinates for every HDB block sold in the current year, via OneMap.

Results are cached in models/block_coords.json, so re-running only looks up
blocks that are new since the last run. Without an API token OneMap only
allows about one request a second, so the first run takes around 2 hours.
It saves progress as it goes and can be stopped and re-run safely.

Usage:
    python geocode_blocks.py [path/to/resale.csv]
"""

import csv
import json
import sys
import time
from datetime import date
from pathlib import Path

import httpx

from train_locations import DEFAULT_CSV

COORDS_PATH = Path(__file__).parent / "models" / "block_coords.json"
SEARCH_URL = "https://www.onemap.gov.sg/api/common/elastic/search"
REQUEST_GAP = 1.0  # seconds between requests, faster gets 429 Too Many Requests


def block_key(block, street):
    return f"{block} {street}"


def lookup(client, block, street):
    """Returns [lat, lng] for the block, or None if OneMap can't find it."""
    resp = client.get(SEARCH_URL, params={
        "searchVal": block_key(block, street),
        "returnGeom": "Y",
        "getAddrDetails": "Y",
        "pageNum": 1,
    })
    resp.raise_for_status()
    results = resp.json().get("results", [])
    # Prefer the result whose block number matches exactly
    match = next((r for r in results if r["BLK_NO"] == block), results[0] if results else None)
    if not match:
        return None
    return [round(float(match["LATITUDE"]), 6), round(float(match["LONGITUDE"]), 6)]


def main():
    csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CSV
    year = date.today().year

    blocks = set()
    with open(csv_path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["month"].startswith(f"{year}-"):
                blocks.add((row["block"], row["street_name"]))

    coords = json.loads(COORDS_PATH.read_text()) if COORDS_PATH.exists() else {}
    todo = sorted(b for b in blocks if block_key(*b) not in coords)
    print(f"{len(blocks):,} blocks sold in {year}, {len(todo):,} still to look up", flush=True)

    COORDS_PATH.parent.mkdir(exist_ok=True)
    with httpx.Client(timeout=20) as client:
        for i, (block, street) in enumerate(todo, 1):
            for attempt in range(3):
                try:
                    coords[block_key(block, street)] = lookup(client, block, street)
                    break
                except httpx.HTTPError as err:
                    print(f"  retry {block} {street}: {err}", flush=True)
                    time.sleep(30 * (attempt + 1))
            time.sleep(REQUEST_GAP)
            if i % 200 == 0 or i == len(todo):
                COORDS_PATH.write_text(json.dumps(coords))
                print(f"  {i:,}/{len(todo):,} done", flush=True)

    missing = [k for k in coords if coords[k] is None]
    print(f"Saved {COORDS_PATH}. {len(missing)} blocks could not be located.")


if __name__ == "__main__":
    main()
