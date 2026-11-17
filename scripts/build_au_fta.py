"""Build data/au_fta.json: Australian preferential (FTA) rates from the ABF Working Tariff.

Each FTA has its own schedule in the Customs Tariff Act 1995 (Schedules 4A to 16). They all
work the same way: originating goods are Free unless the schedule lists the tariff line,
in which case the listed rate applies (often a phase-down to Free). New Zealand goods under
ANZCERTA use the "NZ" rate in Schedule 3, otherwise Free (Customs Tariff Act s 16(1)(b)),
which the app reads from au_tariff.json.

Source pages: https://www.abf.gov.au/importing-exporting-and-manufacturing/tariff-classification/current-tariff

Usage: python3 scripts/build_au_fta.py <cache_dir>   (downloads pages it hasn't cached)
"""
import datetime, html, json, os, re, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "au_fta.json")
BASE = "https://www.abf.gov.au/importing-exporting-and-manufacturing/tariff-classification/current-tariff/"
UA = {"User-Agent": "Mozilla/5.0 (Tasman Trade Desk tariff refresh)"}

# Agreement id (as used in data/ftas.json) -> ABF schedule pages. Mapping checked against
# the ABF current-tariff index, 18 Nov 2026 (note 9A is Indonesia, 13 is Hong Kong).
SCHEDULES = {
    "SAFTA": ["4a"], "AUSFTA": ["5"], "TAFTA": ["6"], "PAFTA": ["6a"], "AClFTA": ["7"],
    "AANZFTA": ["8"], "PACER Plus": ["8a"], "CPTPP": ["8b"], "MAFTA": ["9"], "IA-CEPA": ["9a"],
    "KAFTA": ["10"], "AI-ECTA": ["10a"], "JAEPA": ["11"], "ChAFTA": ["12"], "A-HKFTA": ["13"],
    "RCEP": ["14", "14-2", "14-3"], "A-UKFTA": ["15"], "UAE CEPA": ["16"],
}
COUNTRIES = ["United Kingdom", "Canada", "Mexico", "Japan", "Viet Nam", "Vietnam", "Chile", "Peru",
             "Brunei Darussalam", "Brunei", "Malaysia", "Singapore", "New Zealand", "Costa Rica"]
CODE = re.compile(r"^\d{4}(?:\.\d{1,2})?(?:\.\d{2})?$")
PHASE = re.compile(r"\s*From (\d{1,2} [A-Z][a-z]+ \d{4}):?\s*")
ZW = dict.fromkeys(map(ord, "​‌‍﻿"), None)


def fetch(cache, page):
    path = os.path.join(cache, f"schedule-{page}.html")
    if not (os.path.exists(path) and os.path.getsize(path) > 10000):
        req = urllib.request.Request(BASE + "schedule-" + page, headers=UA)
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=90) as r:
                    open(path, "wb").write(r.read())
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(5)
        time.sleep(0.5)
    return open(path, encoding="utf-8", errors="ignore").read()


def cell_text(c):
    c = re.sub(r"<br\s*/?>", " ", c, flags=re.I)
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", c)).translate(ZW).replace("\xa0", " ").split())


def to_date(s):
    """'1 January 2024' -> date; tolerates misspelt months in the source (e.g. 'Feburary')."""
    d, m, y = s.split()
    return datetime.datetime.strptime(f"{d} {m[:3]} {y}", "%d %b %Y").date()


def current(text, today):
    """Resolve 'base From DATE: rate From DATE: rate ...' to the rate in force today."""
    bits = PHASE.split(text)
    rate, upcoming = bits[0].strip(), []
    for i in range(1, len(bits) - 1, 2):
        when = to_date(bits[i])
        if when <= today:
            rate = bits[i + 1].strip()
        else:
            upcoming.append(f"{bits[i + 1].strip()} from {bits[i]}")
    if not rate:  # nothing in force yet (rare): show the first step
        return f"Not yet in force (then {'; '.join(upcoming)})" if upcoming else None
    return rate + (f" (then {upcoming[0]})" if upcoming else "")


def parse(page_html, today):
    """Return {code_digits: rate_text} for one schedule page."""
    entries, cur = [], None
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page_html, re.S):
        cells = [cell_text(c) for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", row, re.S)]
        if len(cells) < 3:
            continue
        code = cells[1].split(" ")[0] if cells[1] else ""
        if CODE.match(code):
            cur = {"code": code, "parts": [" ".join(cells[1:]).replace(code, "", 1)]}
            entries.append(cur)
        elif cur and not cells[0] and not cells[1]:
            cur["parts"].append(" ".join(cells[2:]))
    out = {}
    for e in entries:
        text = " ".join(" ".join(e["parts"]).split())
        text = re.sub(r"\(Rate No\. \d+\)\s*", "", text)
        # CPTPP lists some rates per country: "United Kingdom: From ...: $x/kg ..."
        split = re.split(r"\b(%s):\s*" % "|".join(map(re.escape, COUNTRIES)), text)
        if len(split) > 1:
            parts = []
            if split[0].strip():
                parts.append(current(split[0].strip(), today))
            for i in range(1, len(split) - 1, 2):
                r = current(split[i + 1].strip(), today)
                if r:
                    parts.append(f"{split[i]}: {r}")
            rate = "; ".join(p for p in parts if p)
        else:
            rate = current(text, today)
        if rate:
            out[e["code"].replace(".", "")] = rate
    return out


def main(cache):
    os.makedirs(cache, exist_ok=True)
    today = datetime.date.today()
    data = {"source": "Australian Border Force, Working Tariff Schedules 4A–16 (Customs Tariff Act 1995)",
            "extracted": today.isoformat(),
            "rule": "Originating goods are Free unless the agreement's schedule lists the tariff line.",
            "agreements": {}}
    for ag, pages in SCHEDULES.items():
        lines = {}
        for p in pages:
            lines.update(parse(fetch(cache, p), today))
        data["agreements"][ag] = {"schedule": pages[0].upper(), "url": BASE + "schedule-" + pages[0],
                                  "lines": dict(sorted(lines.items()))}
        print(f"{ag:<11} Schedule {pages[0].upper():<4} {len(lines):>5} listed lines")
    with open(OUT, "w") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"-> {OUT} ({os.path.getsize(OUT)//1024} KB)")


if __name__ == "__main__":
    main(sys.argv[1])
