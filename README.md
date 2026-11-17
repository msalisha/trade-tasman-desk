# Tasman Trade Desk

A static web app for Australian and New Zealand trade: Incoterms 2020 guide, AU/NZ tariff lookup with rates by origin, and an FTA finder.

## Hosting and weekly updates

The site is hosted on GitHub Pages and deployed by `.github/workflows/refresh-and-deploy.yml`:

- **Every Monday 18:00 UTC** (Tuesday morning in NZ and Australia) it re-downloads the NZ Customs tariff and the ABF Schedule 3 pages, rebuilds `data/nz_tariff.json` and `data/au_tariff.json`, commits any changes and redeploys.
- **Safety check:** `scripts/validate_data.py` rejects a rebuilt file that looks broken (for example, if a government page changes layout). The site then keeps last week's data, and the workflow opens an issue saying which source failed.
- **New agreements:** `scripts/check_agreements.py` compares the DFAT and MFAT agreement lists with `data/watch/agreements_snapshot.json` and opens an issue when an agreement is added or removed. The FTA, export-rule and origin files are updated by hand after review.
- **Any push to `main`** (for example, after editing `data/origin.json`) redeploys without refreshing data.
- To refresh now, go to **Actions → Refresh data and deploy → Run workflow**.

One-time setup on GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

`index.html` is written without `<html>`, `<head>` and `<body>` tags so it can also be published as a Claude artifact; `scripts/build_site.py` wraps it into a full page in `_site/` for normal hosting.

## Run locally

```bash
python3 scripts/build_site.py && python3 -m http.server 8765 --directory _site
```

Then open http://localhost:8765.

## Refresh the tariff data

New Zealand (NZ Customs publishes the CusMod tariff files nightly):

```bash
python3 scripts/fetch_nz.py /tmp/nz
python3 scripts/build_nz.py /tmp/nz
```

Australia (scrapes the ABF Working Tariff, Schedule 3, chapter by chapter):

```bash
python3 scripts/fetch_au.py /tmp/au
python3 scripts/build_au.py /tmp/au
```

Australian export codes (ABS AHECC; the 2022 edition is current, and the ABS issues a new one with each HS revision):

```bash
mkdir -p /tmp/ahecc && curl -sSL -o /tmp/ahecc.zip "https://www.abs.gov.au/statistics/classifications/australian-harmonized-export-commodity-classification-ahecc/2022/CompleteAHECC.zip" && unzip -o -q /tmp/ahecc.zip -d /tmp/ahecc
python3 scripts/build_ahecc.py /tmp/ahecc
```

NZ export codes need no separate file: NZ Customs uses the same tariff items and statistical keys for exports.

The NZ download link can change when NZ Customs updates its site. The current one is listed at
https://www.customs.govt.nz/business/tariffs/tariff-classifications-and-rates.

## Data and limits

- `data/nz_tariff.json`: every current NZ tariff line, with its normal rate and each preferential rate that differs from it (AU, CN, CPT, RCEP, UK, EU, UAE, IN and more).
- `data/au_tariff.json`: every Schedule 3 line with its general rate and the Schedule 3 preference codes (NZ, PG, FI, DC, CA and others). Australian FTA preferential rates are in other Schedules of the Customs Tariff Act and are **not loaded yet**. The app links to the DFAT FTA Portal for them.
- `data/ftas.json`: agreements in force for AU (19) and NZ (17, plus non-reciprocal schemes), hand-maintained from DFAT and MFAT. Checked 17 Nov 2026.
- `data/au_export.json`: the 6,130 AHECC export codes, with ABS footnotes.
- `data/export_rules.json`: export declaration thresholds, proof-of-origin method per agreement, permit and sanctions flags. Hand-maintained. All 36 proof-of-origin entries were checked on 17 Nov 2026; each carries `src` and `url` for the page it was checked against (mostly DFAT, ABF, NZ Customs and MFAT). Set `checked: false` on any entry you can't re-confirm, and the app labels it "Check before relying on it".
- `data/origin.json`: origin criteria explainer and a comparison of 31 agreements (value test, de minimis, accumulation), each linked to the ABF, NZ Customs or MFAT guide it was taken from (checked 17 Nov 2026). All 31 agreements are filled in; a field set to `null` would show as "Not yet checked" in the app. `rvc` holds a typical threshold used to prefill the calculator, and `dmPct` the de minimis percentage.
- Incoterms summaries are written for this app and are not ICC text. Incoterms® is a trademark of the ICC.
