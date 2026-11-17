"""Build data/au_export.json from the ABS AHECC workbooks (CompleteAHECC.zip, unzipped).

Source: https://www.abs.gov.au/statistics/classifications/australian-harmonized-export-commodity-classification-ahecc/latest-release

Usage: python3 scripts/build_ahecc.py <dir with 1233xx.xlsx files>
"""
import glob, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import xlsx  # noqa: E402

OUT = os.path.join(HERE, "..", "data", "au_export.json")


def tidy(s):
    s = " ".join((s or "").split())
    return s


def main(src):
    items = []
    for path in sorted(glob.glob(os.path.join(src, "*.xlsx"))):
        book = xlsx.read(path)
        for name, rows in book.items():
            if not re.fullmatch(r"Chapter \d+", name):
                continue
            heading, stack = "", []
            notes = {}
            for r in rows:
                m = re.match(r"^\(([a-z])\)\s*(.+)", tidy(r[0]) if r else "")
                if m:
                    notes[m.group(1)] = m.group(2)
            start = len(items)
            for r in rows:
                r = (r + [""] * 6)[:6]
                chap, head, hs, stat, unit, desc = [tidy(x) for x in r]
                marks = re.findall(r"\(([a-z])\)", stat)
                stat = re.sub(r"\([a-z]\)", "", stat).strip()
                if not desc or desc == "Description":
                    continue
                if head:
                    heading = re.sub(r":$", "", desc)
                    stack = []
                depth = len(re.match(r"^-*", desc).group(0))
                text = re.sub(r"^-+\s*", "", desc).rstrip(":")
                if depth:
                    stack[depth:] = []
                    while len(stack) < depth:
                        stack.append("")
                    stack[depth - 1] = text
                if unit and stat.isdigit() and len(stat) == 7:
                    stat = "0" + stat  # numeric cells lose the leading zero (chapter 01)
                if len(stat) == 8 and stat.isdigit():
                    parents = [p for p in stack[: max(depth - 1, 0)] if p]
                    item = {"code": stat, "unit": unit or None, "desc": text,
                            "path": " › ".join([heading] + parents) if heading != desc else ""}
                    if marks:
                        item["notes"] = marks
                    items.append(item)
            for it in items[start:]:
                if "notes" in it:
                    it["notes"] = [notes[k] for k in it["notes"] if k in notes]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump({"source": "ABS, Australian Harmonized Export Commodity Classification (AHECC) 2022",
                   "edition": "2022 (HS2022), released 13 April 2022", "items": items}, f, separators=(",", ":"))
    print(f"{len(items)} AHECC codes -> {OUT} ({os.path.getsize(OUT)//1024} KB)")


if __name__ == "__main__":
    main(sys.argv[1])
