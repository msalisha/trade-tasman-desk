"""Watch DFAT and MFAT agreement lists for changes that need a manual review.

The FTA, export-rule and origin files are maintained by hand, so this script doesn't edit
them. It compares the agreements each government lists with a saved snapshot and writes a
short report when something is added or removed.

Usage: python3 scripts/check_agreements.py [report_path]
Prints changed=true|false (also to $GITHUB_OUTPUT when set).
"""
import json, os, re, sys, urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SNAP = os.path.join(ROOT, "data", "watch", "agreements_snapshot.json")
SOURCES = {
    "AU in force (DFAT)": ("https://www.dfat.gov.au/trade/agreements/in-force",
                           r'href="(?:https://www\.dfat\.gov\.au)?/trade/agreements/in-force/([a-z0-9-]+)/?"'),
    "AU not yet in force (DFAT)": ("https://www.dfat.gov.au/trade/agreements/not-yet-in-force",
                                   r'href="(?:https://www\.dfat\.gov\.au)?/trade/agreements/not-yet-in-force/([a-z0-9-]+)/?"'),
    "NZ in force (MFAT)": ("https://www.mfat.govt.nz/en/trade/free-trade-agreements/free-trade-agreements-in-force",
                           r'href="(?:https://www\.mfat\.govt\.nz)?/en/trade/free-trade-agreements/free-trade-agreements-in-force/([a-z0-9-]+)/?"'),
    "NZ concluded, not in force (MFAT)": ("https://www.mfat.govt.nz/en/trade/free-trade-agreements/free-trade-agreements-concluded-but-not-in-force",
                                          r'href="(?:https://www\.mfat\.govt\.nz)?/en/trade/free-trade-agreements/free-trade-agreements-concluded-but-not-in-force/([a-z0-9-]+)/?"'),
}


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (trade-desk agreement watcher)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "ignore")


def main(report_path):
    old = json.load(open(SNAP)) if os.path.exists(SNAP) else {}
    new, lines, unreachable = dict(old), [], []
    for label, (url, pattern) in SOURCES.items():
        try:
            slugs = sorted(set(re.findall(pattern, fetch(url))))
        except Exception as e:
            unreachable.append(f"- {label}: couldn’t fetch ({e})")
            continue
        if not slugs:
            unreachable.append(f"- {label}: page fetched but no agreements found (layout may have changed)")
            continue
        new[label] = slugs
        if label not in old:
            continue  # first sighting: just record it
        added = sorted(set(slugs) - set(old[label]))
        removed = sorted(set(old[label]) - set(slugs))
        if added or removed:
            lines.append(f"### {label}\n{url}\n")
            lines += [f"- Added: `{s}`" for s in added]
            lines += [f"- Removed: `{s}`" for s in removed]
            lines.append("")

    os.makedirs(os.path.dirname(SNAP), exist_ok=True)
    json.dump(new, open(SNAP, "w"), indent=1, sort_keys=True)

    changed = bool(lines)
    if changed:
        body = ["The weekly check found changes to the agreement lists. Review and update "
                "`data/ftas.json`, `data/export_rules.json` and `data/origin.json` as needed.", ""] + lines
        if unreachable:
            body += ["Sources that couldn’t be checked this week:"] + unreachable
        open(report_path, "w").write("\n".join(body) + "\n")
    print("changed=" + ("true" if changed else "false"))
    for u in unreachable:
        print(u)
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            f.write(f"changed={'true' if changed else 'false'}\n")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "agreement-changes.md")
