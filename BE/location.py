"""Location analysis for a flat: its address and the nearest MRT/LRT stations and bus stops.

Addresses are looked up live through OneMap's search. Stations and bus stops
come from models/transport.json (built by build_transport.py). Distances are
straight-line; walking times are a rough estimate that allows for paths not
being straight.
"""

import json
import math
from functools import lru_cache
from pathlib import Path

import httpx
import numpy as np

TRANSPORT_PATH = Path(__file__).parent / "models" / "transport.json"
SEARCH_URL = "https://www.onemap.gov.sg/api/common/elastic/search"
NEAREST = 3
WALK_DETOUR = 1.3  # walking routes are roughly 30% longer than a straight line
WALK_SPEED = 80  # metres per minute
# Lines OneMap already lists but that aren't running yet: Cross Island (CR, CP) and Jurong Region (JS, JE, JW)
UNOPENED_LINES = ("CR", "CP", "JS", "JE", "JW")


@lru_cache(maxsize=1)
def _transport():
    return json.loads(TRANSPORT_PATH.read_text()) if TRANSPORT_PATH.exists() else None


def distance_m(a, b):
    """Straight-line distance in metres between two [lat, lng] points (haversine)."""
    lat1, lng1, lat2, lng2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 2 * 6_371_000 * math.asin(math.sqrt(h))


def _nearest(point, places):
    ranked = sorted(places, key=lambda p: distance_m(point, p["latlng"]))[:NEAREST]
    results = []
    for p in ranked:
        d = distance_m(point, p["latlng"])
        results.append({
            **{k: v for k, v in p.items() if k != "latlng"},
            "lat": p["latlng"][0],
            "lng": p["latlng"][1],
            "distance_m": round(d),
            "walk_min": max(1, math.ceil(d * WALK_DETOUR / WALK_SPEED)),
        })
    return results


def _open_stations(point, stations):
    """One entry per station that's running today.

    OneMap lists some interchanges once per line (e.g. Ang Mo Kio NS16 and
    CR11), so those are merged into the entry closest to `point`, with every
    open line's code.
    """
    merged = {}
    for s in sorted(stations, key=lambda s: distance_m(point, s["latlng"])):
        codes = [c for c in s["codes"] if not c.startswith(UNOPENED_LINES)]
        if not codes:
            continue
        if s["name"] in merged:
            merged[s["name"]]["codes"] += [c for c in codes if c not in merged[s["name"]]["codes"]]
        else:
            merged[s["name"]] = {**s, "codes": codes}
    return list(merged.values())


@lru_cache(maxsize=512)
def find_address(query, block=None):
    """Looks up an address on OneMap. Returns None if nothing matches.

    With `block`, prefers the result for that exact block number.
    """
    resp = httpx.get(SEARCH_URL, params={
        "searchVal": query, "returnGeom": "Y", "getAddrDetails": "Y", "pageNum": 1,
    }, timeout=15)
    resp.raise_for_status()
    results = [r for r in resp.json().get("results", []) if r["POSTAL"] != "NIL"]
    if block:
        results = [r for r in results if r["BLK_NO"].upper() == block.upper()] or results
    if not results:
        return None
    r = results[0]
    return {
        "address": r["ADDRESS"].title(),
        "block": r["BLK_NO"],
        "street": r["ROAD_NAME"].title(),
        "postal": r["POSTAL"],
        "lat": round(float(r["LATITUDE"]), 6),
        "lng": round(float(r["LONGITUDE"]), 6),
    }


@lru_cache(maxsize=1)
def _arrays():
    """Open stations (one row per OneMap entry, codes merged by station name) and bus stops as arrays."""
    transport = _transport()
    if transport is None:
        return None
    codes_by_name = {}
    for s in transport["stations"]:
        for c in s["codes"]:
            if not c.startswith(UNOPENED_LINES) and c not in codes_by_name.setdefault(s["name"], []):
                codes_by_name[s["name"]].append(c)
    stations = [
        {"name": s["name"], "codes": codes_by_name[s["name"]], "latlng": s["latlng"]}
        for s in transport["stations"]
        if any(not c.startswith(UNOPENED_LINES) for c in s["codes"])
    ]
    bus_stops = transport["bus_stops"]
    return (
        stations, np.radians([s["latlng"] for s in stations]),
        bus_stops, np.radians([s["latlng"] for s in bus_stops]),
    )


def _closest(points, place_rad):
    """For each [lat, lng] in `points` (radians), index of and metres to the nearest place (haversine)."""
    lat1, lng1 = points[:, :1], points[:, 1:]
    lat2, lng2 = place_rad[:, 0], place_rad[:, 1]
    h = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lng2 - lng1) / 2) ** 2
    d = 2 * 6_371_000 * np.arcsin(np.sqrt(h))
    idx = d.argmin(axis=1)
    return idx, d[np.arange(len(points)), idx]


def _summary(place, metres):
    return {
        **{k: v for k, v in place.items() if k != "latlng"},
        "lat": place["latlng"][0],
        "lng": place["latlng"][1],
        "distance_m": round(float(metres)),
        "walk_min": max(1, math.ceil(metres * WALK_DETOUR / WALK_SPEED)),
    }


def add_nearest(places):
    """Adds nearest_mrt and nearest_bus to each dict in `places` (which need lat and lng), in place.

    Does nothing if transport.json hasn't been built.
    """
    arrays = _arrays()
    if arrays is None or not places:
        return
    stations, station_rad, bus_stops, bus_rad = arrays
    points = np.radians([[p["lat"], p["lng"]] for p in places])
    for key, items, rad in (("nearest_mrt", stations, station_rad), ("nearest_bus", bus_stops, bus_rad)):
        idx, dist = _closest(points, rad)
        for p, i, d in zip(places, idx, dist):
            p[key] = _summary(items[i], d)


def analyse(query, block=None):
    """Address plus nearest stations and bus stops, or None if the address isn't found.

    Raises RuntimeError if transport.json hasn't been built.
    """
    transport = _transport()
    if transport is None:
        raise RuntimeError("Transport data missing: run build_transport.py")
    place = find_address(query, block)
    if place is None:
        return None
    point = [place["lat"], place["lng"]]
    return {
        **place,
        "mrt": _nearest(point, _open_stations(point, transport["stations"])),
        "bus_stops": _nearest(point, transport["bus_stops"]),
    }
