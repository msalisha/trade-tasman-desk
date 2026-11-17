"""Build data/nz_tariff.json from the NZ Customs CusMod tariff files.

Source: https://www.customs.govt.nz/business/tariffs/tariff-classifications-and-rates
  (tariff.tar.gz, refreshed nightly; readme explains the formulas)

Usage: python3 scripts/build_nz.py <dir with Tariff_Details.csv etc> [YYYY-MM-DD]
"""
import csv, datetime, json, os, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "nz_tariff.json")


def parse_date(s):
    return datetime.datetime.strptime(" ".join(s.split()), "%b %d %Y %I:%M%p")


def num(s):
    if not s:
        return None
    v = float(s)
    return int(v) if v == int(v) else round(v, 4)


def fmt_rate(formula, a, b):
    """Turn a CusMod formula + factors into readable text (formulas 1-6 cover >99% of lines)."""
    a, b = num(a), num(b)
    if formula == "1":
        return "Free"
    if formula == "3":
        return f"{a}%"
    if formula == "4":
        return f"${a}/unit"
    if formula == "5":
        return f"{a}% + ${b}/unit"
    if formula == "6":
        return f"${a}/unit less {b}%"
    if formula == "2":
        return "Manual calculation"
    return f"Formula {formula} (see tariff)"


def rows(path):
    with open(path, encoding="latin-1", newline="") as f:
        r = csv.reader(f, delimiter="~")
        next(r)
        for row in r:
            yield row


def main(src, on):
    now = datetime.datetime.strptime(on, "%Y-%m-%d")
    live = lambda s, e: parse_date(s) <= now <= parse_date(e)

    items = {}
    for r in rows(os.path.join(src, "Tariff_Details.csv")):
        if live(r[12], r[13]):
            key = "".join(r[:5])
            items[key] = {
                "code": key,
                "check": r[5],
                "unit": r[7] or None,
                "gstExempt": r[11] == "Y",
                "desc": " ".join(r[14].split()),
            }

    rates = defaultdict(dict)
    for r in rows(os.path.join(src, "Tariff_Rates.csv")):
        if live(r[6], r[7]):
            rates["".join(r[:5])][r[5].upper()] = fmt_rate(r[9], r[10], r[11])

    out = []
    for key in sorted(items):
        it = items[key]
        rt = rates.get(key, {})
        normal = rt.pop("NML", None)
        # Keep only preferential rates that differ from normal, to keep the file small.
        it["normal"] = normal
        it["pref"] = {g: v for g, v in sorted(rt.items()) if v != normal}
        out.append(it)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    stamp = open(os.path.join(src, "time_stamp.txt")).read().strip()
    with open(OUT, "w") as f:
        json.dump({"source": "NZ Customs Service, CusMod tariff data", "extracted": stamp,
                   "asOf": on, "items": out}, f, separators=(",", ":"))
    print(f"{len(out)} NZ lines -> {OUT} ({os.path.getsize(OUT)//1024} KB)")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else datetime.date.today().isoformat())
