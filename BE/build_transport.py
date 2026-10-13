"""Downloads every MRT/LRT station and bus stop in Singapore from OneMap.

Writes models/transport.json, which location.py uses to find the stations and
bus stops nearest to a flat. OneMap's search returns 10 results a page,
stops at 100 pages, and allows about one request a second. There are over
5,000 bus stops, so they're fetched by the first two digits of their stop code
("44 BUS STOP" finds 44xxx). Takes around 15 minutes. Only needs re-running
when stations or bus stops change.

Usage:
    python build_transport.py
"""

import json
import re
import time
from pathlib import Path

import httpx

OUT_PATH = Path(__file__).parent / "models" / "transport.json"
SEARCH_URL = "https://www.onemap.gov.sg/api/common/elastic/search"
REQUEST_GAP = 1.0  # seconds between requests, faster gets 429 Too Many Requests
MAX_PAGES = 100  # OneMap refuses pages past this

# "JURONG EAST MRT STATION (EW24 / NS1)" -> name, kind, line codes
STATION = re.compile(r"^(.+?) (MRT|LRT) STATION \(([A-Z0-9 /]+)\)$")
BUS_STOP = re.compile(r"^(\d{5}) \(BUS STOP\)$")


def search_all(client, query):
    """Every result for `query`, across all pages."""
    results, page, pages = [], 1, 1
    while page <= pages:
        for attempt in range(3):
            try:
                resp = client.get(SEARCH_URL, params={
                    "searchVal": query, "returnGeom": "Y", "getAddrDetails": "Y", "pageNum": page,
                })
                resp.raise_for_status()
                break
            except httpx.HTTPError as err:
                print(f"  retry page {page}: {err}", flush=True)
                time.sleep(30 * (attempt + 1))
        else:
            raise SystemExit(f"Gave up on '{query}' page {page}")
        data = resp.json()
        pages = data["totalNumPages"]
        if pages > MAX_PAGES:
            print(f"  warning: '{query}' has {pages} pages, only the first {MAX_PAGES} can be fetched", flush=True)
            pages = MAX_PAGES
        results += data["results"]
        if page % 50 == 0 or (page == pages and pages > 5):
            print(f"  {query}: page {page}/{pages}", flush=True)
        page += 1
        time.sleep(REQUEST_GAP)
    return results


def latlng(r):
    return [round(float(r["LATITUDE"]), 6), round(float(r["LONGITUDE"]), 6)]


def main():
    with httpx.Client(timeout=30) as client:
        # Station entries also include exits and nearby buildings; keep the stations themselves
        stations = {}
        for query in ("MRT STATION", "LRT STATION"):
            for r in search_all(client, query):
                m = STATION.match(r["SEARCHVAL"])
                if m and r["SEARCHVAL"] not in stations:
                    name, kind, codes = m.groups()
                    stations[r["SEARCHVAL"]] = {
                        "name": f"{name.title()} {kind}",
                        "codes": [c.strip() for c in codes.split("/")],
                        "kind": kind,
                        "latlng": latlng(r),
                    }

        print(f"{len(stations)} stations found", flush=True)
        save(stations, {})  # keep the stations even if the bus stops fail part-way

        bus_stops = {}
        for prefix in (f"{i:02d}" for i in range(100)):
            for r in search_all(client, f"{prefix} BUS STOP"):
                m = BUS_STOP.match(r["SEARCHVAL"])
                code = m and m.group(1)
                if code and code.startswith(prefix) and code not in bus_stops:
                    road = r["ROAD_NAME"] if r["ROAD_NAME"] != "NIL" else ""
                    bus_stops[code] = {"code": code, "road": road.title(), "latlng": latlng(r)}
            if prefix.endswith("9"):
                print(f"  bus stops up to {prefix}xxx: {len(bus_stops):,} so far", flush=True)

    save(stations, bus_stops)
    print(f"Saved {len(stations)} stations and {len(bus_stops):,} bus stops to {OUT_PATH}")


def save(stations, bus_stops):
    OUT_PATH.parent.mkdir(exist_ok=True)
    OUT_PATH.write_text(json.dumps({
        "stations": sorted(stations.values(), key=lambda s: s["name"]),
        "bus_stops": sorted(bus_stops.values(), key=lambda s: s["code"]),
    }))


if __name__ == "__main__":
    main()
