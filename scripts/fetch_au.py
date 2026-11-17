"""Download the Australian Working Tariff (Schedule 3) chapter pages from the ABF website.

Usage: python3 scripts/fetch_au.py <cache_dir>
Pages are cached as HTML; run build_au.py afterwards to turn them into JSON.
"""
import os, re, sys, time, urllib.request

BASE = "https://www.abf.gov.au"
ROOT = "/importing-exporting-and-manufacturing/tariff-classification/current-tariff/schedule-3"
UA = {"User-Agent": "Mozilla/5.0 (tariff-prototype)"}


def get(path):
    req = urllib.request.Request(BASE + path, headers=UA)
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read().decode("utf-8", "ignore")


def main(cache):
    os.makedirs(cache, exist_ok=True)
    index = get(ROOT)
    sections = sorted(set(re.findall(re.escape(ROOT) + r"/section-[ivx]+(?=\")", index)))
    chapters = []
    for s in sections:
        html = get(s)
        chapters += re.findall(re.escape(s) + r"/chapter-\d+(?=\")", html)
        time.sleep(0.5)
    chapters = sorted(set(chapters), key=lambda c: int(c.rsplit("-", 1)[1]))
    print(f"{len(sections)} sections, {len(chapters)} chapters", flush=True)
    for c in chapters:
        num = int(c.rsplit("-", 1)[1])
        out = os.path.join(cache, f"chapter-{num:02d}.html")
        if os.path.exists(out) and os.path.getsize(out) > 10000:
            continue
        for attempt in range(3):
            try:
                html = get(c)
                break
            except Exception as e:  # retry transient failures
                print(f"retry {c}: {e}", flush=True)
                time.sleep(3)
        else:
            print(f"FAILED {c}", flush=True)
            continue
        with open(out, "w", encoding="utf-8") as f:
            f.write(f"<!-- section: {c.split('/')[-2]} -->\n" + html)
        print(f"ok chapter {num}", flush=True)
        time.sleep(0.5)


if __name__ == "__main__":
    main(sys.argv[1])
