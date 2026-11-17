"""Download and unpack the NZ Customs CusMod tariff files.

Finds the current tariff.tar.gz link on the NZ Customs page (the /media/... path changes
when they republish), falling back to the last known link.

Usage: python3 scripts/fetch_nz.py <out_dir>
"""
import io, os, re, sys, tarfile, urllib.request

PAGE = "https://www.customs.govt.nz/business/tariffs/tariff-classifications-and-rates"
FALLBACK = "https://www.customs.govt.nz/media/0nmaamqd/tariff.tar.gz"
UA = {"User-Agent": "Mozilla/5.0 (trade-desk tariff refresh)"}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return r.read()


def main(out):
    url = FALLBACK
    try:
        html = get(PAGE).decode("utf-8", "ignore")
        m = re.search(r'href="([^"]*tariff\.tar\.gz)"', html)
        if m:
            url = m.group(1) if m.group(1).startswith("http") else "https://www.customs.govt.nz" + m.group(1)
    except Exception as e:
        print(f"Couldn’t read {PAGE} ({e}); using the last known link")
    print("Downloading", url)
    data = get(url)
    os.makedirs(out, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
        for member in tar.getmembers():
            # Only plain files with simple names: never follow paths out of the target folder.
            if member.isfile() and "/" not in member.name.strip("./") and not member.name.startswith(".."):
                member.name = os.path.basename(member.name)
                tar.extract(member, out)
    files = sorted(os.listdir(out))
    if "Tariff_Details.csv" not in files:
        sys.exit(f"Tariff_Details.csv missing from download: {files}")
    print("Unpacked:", ", ".join(files))


if __name__ == "__main__":
    main(sys.argv[1])
