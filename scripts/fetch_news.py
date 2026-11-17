"""Collect trade news for the News & updates tab into data/news.json.

Sources (see news-sources.json to switch them on or off):
- MFAT Weekly Global Economic Reports (NZ). Content is Crown copyright, CC BY 4.0.
  MFAT has no feed, so this checks each recent date's predictable report address,
  e.g. /en/trade/mfat-market-reports/weekly-global-economic-report-17-november-2026.
  Keeps the title, date and MFAT's own one-line description.
- IFCBAA Latest News (AU). © IFCBAA, all rights reserved, so this keeps only the
  headline, date, reference and a link back. Items that need a member login are skipped.

Usage: python3 scripts/fetch_news.py
"""
import datetime, html, json, os, re, time, urllib.error, urllib.parse, urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "data", "news.json")
CONFIG = os.path.join(ROOT, "news-sources.json")
UA = {"User-Agent": "Mozilla/5.0 (Tasman Trade Desk news collector; +https://msalisha.github.io/trade-tasman-desk/)"}

MFAT_URL = "https://www.mfat.govt.nz/en/trade/mfat-market-reports/weekly-global-economic-report-{d}-{m}-{y}"
IFCBAA_LIST = "https://www.ifcbaa.com/IFCBAA/News/IFCBAA/News/LatestNews.aspx"
KEEP = 20            # items kept per source
BACKFILL_DAYS = 63   # how far back to look the first time
LOGIN_WORDS = ("sign in to view", "members only", "member login", "you must be logged in",
               "do not have access", "access denied", "not authorized", "signin.aspx")


def get(url, timeout=60, tries=3):
    """Fetch a page, retrying brief network glitches. A 404 or other HTTP error is raised at once."""
    req = urllib.request.Request(url, headers=UA)
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", "ignore"), r.geturl()
        except urllib.error.HTTPError:
            raise
        except Exception:
            if attempt == tries - 1:
                raise
            time.sleep(3 * (attempt + 1))


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None  # surface the 3xx so we can see where it points


def needs_login(url):
    """True if the page redirects to a login form (IFCBAA members-only articles do)."""
    opener = urllib.request.build_opener(_NoRedirect)
    try:
        with opener.open(urllib.request.Request(url, headers=UA), timeout=25) as r:
            text = clean(r.read().decode("utf-8", "ignore")).lower()
            return any(w in text for w in LOGIN_WORDS)
    except urllib.error.HTTPError as e:
        if 300 <= e.code < 400:
            return any(w in (e.headers.get("Location") or "").lower() for w in ("login", "signin", "authentication"))
        raise


def meta(page, name):
    m = re.search(r'<meta[^>]+(?:name|property)="%s"[^>]+content="([^"]*)"' % re.escape(name), page)
    return html.unescape(m.group(1)).strip() if m else ""


def clean(s):
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", s)).split())


# ---------- MFAT ----------
def mfat(existing):
    known = {i["url"] for i in existing}
    today = datetime.date.today()
    latest = max((datetime.date.fromisoformat(i["date"]) for i in existing), default=None)
    start = (latest + datetime.timedelta(days=1)) if latest else today - datetime.timedelta(days=BACKFILL_DAYS)
    found = []
    day = start
    while day <= today:
        url = MFAT_URL.format(d=day.day, m=day.strftime("%B").lower(), y=day.year)
        if url not in known:
            try:
                page, _ = get(url, timeout=40)
                title = meta(page, "og:title") or clean(re.search(r"<h1[^>]*>(.*?)</h1>", page, re.S).group(1))
                if "weekly global economic report" in title.lower():
                    found.append({"title": title, "date": day.isoformat(), "url": url,
                                  "summary": meta(page, "og:description") or meta(page, "description")})
                    print("MFAT  +", title)
            except urllib.error.HTTPError as e:
                if e.code != 404:
                    print("MFAT  ", day, "HTTP", e.code)
            except Exception as e:
                print("MFAT  ", day, "error:", e)
            time.sleep(0.3)
        day += datetime.timedelta(days=1)
    items = found + existing
    items.sort(key=lambda i: i["date"], reverse=True)
    return items[:KEEP]


# ---------- IFCBAA ----------
SKIPPED = set()  # members-only IFCBAA links, remembered between runs


def ifcbaa(existing):
    page, base = get(IFCBAA_LIST)
    rows = re.findall(
        r'<div class="BlockTLItem">\s*<h4><a[^>]+href="([^"]+)"[^>]*>(.*?)</a></h4>\s*'
        r'<p><span class="PublishDate"><span>([^<]+)</span></span>(?:<br\s*/?>\s*<span>([^<]*)</span>)?', page, re.S)
    if not rows:
        raise RuntimeError("no items found on the IFCBAA news page (layout may have changed)")
    known = {i["url"]: i for i in existing}
    items = []
    for href, title, date, ref in rows[:KEEP]:
        url = urllib.parse.urljoin(base, html.unescape(href))
        if url in known:
            items.append(known[url])
            continue
        if url in SKIPPED:
            continue
        try:
            d = datetime.datetime.strptime(date.strip(), "%d/%m/%Y").date().isoformat()
        except ValueError:
            continue
        # Skip anything that sends a visitor to a login page.
        try:
            if needs_login(url):
                print("IFCBAA skip (members only):", clean(title))
                SKIPPED.add(url)
                continue
        except Exception as e:
            print("IFCBAA skip (couldn’t open):", clean(title), e)
            continue
        items.append({"title": clean(title), "date": d, "ref": clean(ref or ""), "url": url})
        print("IFCBAA +", clean(title))
        time.sleep(0.3)
    items.sort(key=lambda i: i["date"], reverse=True)
    return items[:KEEP]


def main():
    config = json.load(open(CONFIG))
    old = json.load(open(OUT)) if os.path.exists(OUT) else {"sources": {}}
    out = {"updated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "sources": {}}
    failed = []
    SKIPPED.update(old.get("sources", {}).get("ifcbaa", {}).get("membersOnly", []))
    for key, fn in (("mfat", mfat), ("ifcbaa", ifcbaa)):
        if not config.get(key):
            out["sources"][key] = {"enabled": False, "items": []}
            print(key, "switched off")
            continue
        prev = old.get("sources", {}).get(key, {}).get("items", [])
        try:
            out["sources"][key] = {"enabled": True, "items": fn(prev)}
        except Exception as e:
            print(key, "failed:", e)
            failed.append(key)
            out["sources"][key] = {"enabled": True, "items": prev}  # keep what we had
    if out["sources"].get("ifcbaa", {}).get("enabled"):
        out["sources"]["ifcbaa"]["membersOnly"] = sorted(SKIPPED)[-200:]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1)
    print("Saved", OUT, {k: len(v["items"]) for k, v in out["sources"].items()})
    if failed:
        raise SystemExit("Failed sources: " + ", ".join(failed))


if __name__ == "__main__":
    main()
