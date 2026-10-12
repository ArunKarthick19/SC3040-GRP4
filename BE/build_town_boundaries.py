"""Builds the town outlines used by the buyer heat map.

Downloads URA's Master Plan 2019 planning area boundaries from data.gov.sg,
tags each area with the HDB town it belongs to, simplifies the shapes and
writes FE/public/sg_towns.geojson. Only needs re-running if the boundaries change.

Usage:
    python build_town_boundaries.py
"""

import json
from pathlib import Path

import httpx

DATASET = "d_4765db0e87b9c86336792efe8a1f7a66"  # Master Plan 2019 Planning Area Boundary (No Sea)
OUT_PATH = Path(__file__).parent.parent / "FE" / "public" / "sg_towns.geojson"
TOLERANCE = 0.0002  # degrees, about 20 m; smaller keeps more detail but a bigger file

# HDB towns whose names don't match a single planning area
TOWN_AREAS = {
    "KALLANG/WHAMPOA": ["KALLANG", "NOVENA"],
    "CENTRAL AREA": ["DOWNTOWN CORE", "OUTRAM", "ROCHOR"],
}
AREA_TOWN = {area: town for town, areas in TOWN_AREAS.items() for area in areas}


def simplify(points, tol):
    """Ramer-Douglas-Peucker line simplification."""
    if len(points) < 3:
        return points
    (x1, y1), (x2, y2) = points[0], points[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = (dx * dx + dy * dy) ** 0.5
    best, idx = 0.0, 0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        dist = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / norm if norm else ((px - x1) ** 2 + (py - y1) ** 2) ** 0.5
        if dist > best:
            best, idx = dist, i
    if best <= tol:
        return [points[0], points[-1]]
    return simplify(points[: idx + 1], tol)[:-1] + simplify(points[idx:], tol)


def clean_ring(ring):
    pts = simplify([(round(x, 5), round(y, 5)) for x, y, *_ in ring], TOLERANCE)
    return [list(p) for p in pts] if len(pts) >= 4 else None


def clean_polygon(rings):
    rings = [r for r in (clean_ring(r) for r in rings) if r]
    return rings or None


def main():
    meta = httpx.get(f"https://api-open.data.gov.sg/v1/public/api/datasets/{DATASET}/poll-download", timeout=30)
    meta.raise_for_status()
    source = httpx.get(meta.json()["data"]["url"], timeout=120).json()

    features = []
    for f in source["features"]:
        area = f["properties"]["PLN_AREA_N"]
        geom = f["geometry"]
        polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
        polys = [p for p in (clean_polygon(p) for p in polys) if p]
        if not polys:
            continue
        features.append({
            "type": "Feature",
            "properties": {"area": area, "town": AREA_TOWN.get(area, area)},
            "geometry": {"type": "MultiPolygon", "coordinates": polys},
        })

    OUT_PATH.write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")))
    print(f"Wrote {len(features)} areas to {OUT_PATH} ({OUT_PATH.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
