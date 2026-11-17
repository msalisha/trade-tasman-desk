"""Sanity-check a freshly built data file before it replaces the published one.

Usage: python3 scripts/validate_data.py nz|au
Exits non-zero if the file looks broken (e.g. a source page changed format), so the
workflow can keep the previous data instead of publishing an empty tariff.
"""
import json, os, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")

CHECKS = {
    # name: (file, minimum line count, extra check)
    "nz": ("nz_tariff.json", 15000, lambda d: sum(1 for i in d["items"] if i.get("normal")) > 15000),
    "au": ("au_tariff.json", 8000, lambda d: sum(1 for i in d["items"] if i.get("stat")) > 5000),
}


def main(which):
    name, minimum, extra = CHECKS[which]
    try:
        data = json.load(open(os.path.join(ROOT, name)))
    except Exception as e:  # unreadable or missing
        sys.exit(f"{name}: could not read ({e})")
    n = len(data.get("items", []))
    if n < minimum:
        sys.exit(f"{name}: only {n} lines (expected at least {minimum})")
    if not extra(data):
        sys.exit(f"{name}: too few lines with rates")
    print(f"{name}: OK ({n} lines)")


if __name__ == "__main__":
    main(sys.argv[1])
