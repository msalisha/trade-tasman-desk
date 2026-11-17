"""Build data/au_tariff.json from ABF Schedule 3 chapter pages saved by fetch_au.py.

Source: https://www.abf.gov.au/importing-exporting-and-manufacturing/tariff-classification/current-tariff/schedule-3

Usage: python3 scripts/build_au.py <cache_dir>
"""
import glob, html, json, os, re, sys, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data", "au_tariff.json")

ZW = dict.fromkeys(map(ord, "​‌‍﻿"), None)
CODE = re.compile(r"^(\d{4})(?:\.(\d{1,2}))?(?:\.(\d{2}))?$")
PREF = re.compile(r"\s*\b((?:[A-Z]{2,4}/)*[A-Z]{2,4}):\s*")


def clean(s):
    s = re.sub(r"<br\s*/?>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s).translate(ZW).replace("\xa0", " ")
    return s


def oneline(s):
    return " ".join(s.split())


def split_rate(raw):
    """'5% DCS:4% DCT:5%' -> ('5%', {'DCS': '4%', 'DCT': '5%'})"""
    text = oneline(raw)
    parts = PREF.split(text)
    general = current_phase(parts[0].strip())
    other = {}
    for i in range(1, len(parts) - 1, 2):
        other[parts[i]] = current_phase(parts[i + 1].strip())
    return general, other


PHASE = re.compile(r"\s*From (\d{1,2} \w+ \d{4}):\s*")


def current_phase(text):
    """'5% From 1 July 2018: 3.75% From 1 July 2019: Free' -> rate in force today (+ next step if future)."""
    bits = PHASE.split(text)
    if len(bits) == 1:
        return text
    today = datetime.date.today()
    rate, upcoming = bits[0], []
    for i in range(1, len(bits) - 1, 2):
        when = datetime.datetime.strptime(bits[i], "%d %B %Y").date()
        if when <= today:
            rate = bits[i + 1]
        else:
            upcoming.append(f"{bits[i + 1]} from {bits[i]}")
    return rate + (f" (then {'; '.join(upcoming)})" if upcoming else "")


def main(cache):
    items, chapters = [], {}
    for path in sorted(glob.glob(os.path.join(cache, "chapter-*.html"))):
        h = open(path, encoding="utf-8").read()
        ch = re.search(r"chapter-(\d+)", path).group(1)
        m = re.search(r"<h1[^>]*>(.*?)</h1>", h, re.S)
        title = oneline(clean(m.group(1))) if m else ""
        chapters[ch] = re.sub(r"^Chapter\s+\d+\s*[-–:]?\s*", "", title, flags=re.I)
        parent = None  # last 8-digit line without its own statistical code
        for row in re.findall(r"<tr[^>]*>(.*?)</tr>", h, re.S):
            cells = [clean(c) for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", row, re.S)]
            if len(cells) < 4:
                continue
            code = oneline(cells[0]).split(" ")[-1]
            if not CODE.match(code):
                # Statistical codes can sit on their own rows under an 8-digit line:
                #   0406.10.00 | | | - Fresh cheese | $1.220/kg ...
                #   41 | kg | Mozzarella
                # Each becomes a line of its own, with the parent's description and rates.
                if parent and re.fullmatch(r"\d{2}", code) and oneline(cells[2]):
                    items.append({**parent, "stat": code, "unit": oneline(cells[1]) or parent["unit"],
                                  "desc": f"{parent['desc']}: {oneline(cells[2])}"})
                continue
            if len(cells) < 5:
                continue
            desc = oneline(cells[3])
            if not desc:
                continue
            stat = oneline(cells[1]) or None
            unit = oneline(cells[2]) or None
            general, other = split_rate(cells[4]) if oneline(cells[4]) else (None, {})
            item = {"code": code, "stat": stat, "unit": unit, "desc": desc, "rate": general, "other": other}
            items.append(item)
            parent = item if (not stat and re.fullmatch(r"\d{4}\.\d{2}\.\d{2}", code) and general) else None

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump({"source": "Australian Border Force, Working Tariff Schedule 3",
                   "extracted": datetime.date.today().isoformat(),
                   "chapters": chapters, "items": items}, f, separators=(",", ":"))
    leaves = sum(1 for i in items if i["stat"])
    print(f"{len(items)} AU rows ({leaves} with statistical codes), {len(chapters)} chapters "
          f"-> {OUT} ({os.path.getsize(OUT)//1024} KB)")


if __name__ == "__main__":
    main(sys.argv[1])
