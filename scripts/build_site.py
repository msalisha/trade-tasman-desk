"""Assemble the deployable static site in _site/.

index.html is written without <html>/<head>/<body> (the Claude artifact publisher adds them),
so this wraps it in a full document for ordinary web hosting.

Usage: python3 scripts/build_site.py [out_dir]
"""
import os, shutil, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "_site")

HEAD = """<!doctype html>
<html lang="en-AU">
<head>
<meta name="description" content="Australian and New Zealand trade desk: import tariff lookup, export checker, origin criteria, FTA finder and an Incoterms 2020 guide.">
"""


def main():
    src = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    # Everything up to the closing </style> belongs in <head>; the rest is the body.
    cut = src.index("</style>") + len("</style>")
    head, body = src[:cut], src[cut:]
    if "<meta charset" not in head:
        head = '<meta charset="utf-8">\n' + head
    if 'name="viewport"' not in head:
        head = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' + head
    page = HEAD + head + "\n</head>\n<body>\n" + body.strip() + "\n</body>\n</html>\n"

    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    os.makedirs(os.path.join(OUT, "data"))
    open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(page)
    shutil.copy(os.path.join(ROOT, "app.js"), OUT)
    for f in sorted(os.listdir(os.path.join(ROOT, "data"))):
        if f.endswith(".json"):
            shutil.copy(os.path.join(ROOT, "data", f), os.path.join(OUT, "data", f))
    open(os.path.join(OUT, ".nojekyll"), "w").close()
    size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(OUT) for f in fs)
    print(f"Site built in {OUT} ({size // 1024} KB)")


if __name__ == "__main__":
    main()
