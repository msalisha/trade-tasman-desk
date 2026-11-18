"""Build data/world_map.json: one SVG path per country for the FTA finder map.

Source: Natural Earth 1:50m countries (public domain), as TopoJSON from the
world-atlas npm package, plus an ISO 3166 code table to turn numeric ids into
the two-letter codes used in data/ftas.json.

Usage:
  curl -sfLO https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json
  curl -sfLO https://cdn.jsdelivr.net/npm/i18n-iso-countries@7.11.0/codes.json
  python3 scripts/build_map.py countries-50m.json codes.json

The map uses the Equal Earth projection centred on 150°E, so Australia,
New Zealand and the Pacific sit in the middle. Antarctica is left out.
"""
import json
import math
import sys
from pathlib import Path

CENTRE = 150.0          # central meridian, degrees east
WIDTH = 1000.0          # SVG units
MIN_STEP = 1.2          # drop points closer than this to the last kept one
SMALL = 6.0             # countries smaller than this (width and height) also get a dot

EXTRA_DOTS = {"TV": (179.2, -8.5)}   # Tuvalu

A1, A2, A3, A4 = 1.340264, -0.081106, 0.000893, 0.003796
M = math.sqrt(3) / 2


def equal_earth(lon, lat):
    lam, phi = math.radians(lon), math.radians(lat)
    t = math.asin(M * math.sin(phi))
    t2, t6 = t * t, t ** 6
    x = lam * math.cos(t) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)))
    y = t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2))
    return x, y


X_MAX = equal_earth(180, 0)[0]
Y_MAX = equal_earth(0, 90)[1]
SCALE = WIDTH / (2 * X_MAX)
# Crop to 84°N–58°S: nothing but ice and ocean lies outside (no Antarctica).
Y_TOP = equal_earth(0, 84)[1] * SCALE
HEIGHT = round(Y_TOP - equal_earth(0, -58)[1] * SCALE, 1)


def project(lon, lat):
    x, y = equal_earth(lon, lat)
    return x * SCALE + WIDTH / 2, Y_TOP - y * SCALE


def decode_arcs(topo):
    tx = topo.get("transform")
    out = []
    for arc in topo["arcs"]:
        pts, x, y = [], 0, 0
        for p in arc:
            if tx:
                x, y = x + p[0], y + p[1]
                pts.append((x * tx["scale"][0] + tx["translate"][0], y * tx["scale"][1] + tx["translate"][1]))
            else:
                pts.append((p[0], p[1]))
        out.append(pts)
    return out


def ring_coords(ring, arcs):
    pts = []
    for i in ring:
        a = arcs[i] if i >= 0 else arcs[~i][::-1]
        pts.extend(a if not pts else a[1:])
    return pts


def shift(lon):
    v = lon - CENTRE
    while v < -180:
        v += 360
    while v >= 180:
        v -= 360
    return v


def ring_path(pts):
    # Re-centre longitudes, keeping each ring continuous (rings cut by the new
    # seam simply run past the map edge and are clipped by the SVG).
    lons = [shift(p[0]) for p in pts]
    for i in range(1, len(lons)):
        while lons[i] - lons[i - 1] > 180:
            lons[i] -= 360
        while lons[i] - lons[i - 1] < -180:
            lons[i] += 360
    xy = [project(lo, la) if -180 <= lo <= 180 else project_far(lo, la)
          for lo, la in zip(lons, (p[1] for p in pts))]
    kept = [xy[0]]
    for p in xy[1:-1]:
        if abs(p[0] - kept[-1][0]) + abs(p[1] - kept[-1][1]) >= MIN_STEP:
            kept.append(p)
    if len(kept) < 3:
        return None, xy
    d = "M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in kept) + "Z"
    return d, xy


def project_far(lon, lat):
    # Beyond ±180 after unwrapping: project the wrapped point, then move it a
    # full map width so the ring stays in one piece.
    base = lon - 360 if lon > 180 else lon + 360
    x, y = project(base, lat)
    return (x + WIDTH if lon > 180 else x - WIDTH), y


def main(topo_path, codes_path, out_path):
    topo = json.loads(Path(topo_path).read_text())
    num_to_a2 = {row[2]: row[0] for row in json.loads(Path(codes_path).read_text())}
    arcs = decode_arcs(topo)
    out = {}
    for g in topo["objects"]["countries"]["geometries"]:
        num = str(g.get("id", "")).zfill(3)
        a2 = num_to_a2.get(num)
        if not a2 or a2 == "AQ" or g["type"] not in ("Polygon", "MultiPolygon"):
            continue
        polys = [g["arcs"]] if g["type"] == "Polygon" else g["arcs"]
        parts, best = [], None
        for poly in polys:
            for k, ring in enumerate(poly):
                d, xy = ring_path(ring_coords(ring, arcs))
                if d:
                    parts.append(d)
                if k == 0 and xy:
                    xs, ys = [p[0] for p in xy], [p[1] for p in xy]
                    area = (max(xs) - min(xs)) * (max(ys) - min(ys))
                    if best is None or area > best[0]:
                        best = (area, (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, max(xs) - min(xs), max(ys) - min(ys))
        if best is None:
            continue
        entry = out.setdefault(a2, {"d": "", "c": [round(best[1], 1), round(best[2], 1)], "sz": 0})
        entry["d"] += "".join(parts)
        entry["sz"] = max(entry["sz"], round(max(best[3], best[4]), 1))
    # Countries too small for the 1:50m data: a dot only.
    for a2, (lon, lat) in EXTRA_DOTS.items():
        if a2 not in out:
            x, y = project(shift(lon), lat)
            out[a2] = {"c": [round(x, 1), round(y, 1)], "sz": 0}
    for e in out.values():
        e["small"] = e.pop("sz") < SMALL
        if not e.get("d", True):
            del e["d"]
    data = {"source": "Natural Earth 1:50m (public domain), via world-atlas 2.0.2",
            "projection": f"Equal Earth, centred on {CENTRE:g}°E",
            "w": WIDTH, "h": HEIGHT, "countries": dict(sorted(out.items()))}
    Path(out_path).write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False))
    print(f"{len(out)} countries, {Path(out_path).stat().st_size // 1024} KB -> {out_path}")


if __name__ == "__main__":
    here = Path(__file__).resolve().parent.parent
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else here / "data" / "world_map.json")
