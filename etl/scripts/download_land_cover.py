"""Downloads the real JCyL land cover / land use dataset (mapacyl1) from
opendata.jcyl.es, one province at a time.

This is a separate script from load_land_cover.py on purpose: the source
data is NOT one shapefile (the original load_land_cover.py assumed that -
it was wrong, written before anyone had actually looked at the real
directory structure). It's organised as one small shapefile-in-a-zip per
MUNICIPALITY, grouped in a folder per province:

  https://opendata.jcyl.es/ficheros/carto/mapacyl/mapacyl1/<Province>/shp_e1/<code>_<Municipality>_mapacyl1.zip

Confirmed provinces (the 9 subfolders under mapacyl1/):
  Avila, Burgos, Leon, Palencia, Salamanca, Segovia, Soria, Valladolid, Zamora

This is a genuinely large dataset - Valladolid alone is 249 municipality
files, Soria (a smaller province) is still ~465MB across 247 files - so
downloading all 9 provinces is multiple GB and not something to run
lightly. Run this per-province, and only for the province(s) you actually
need, e.g.:

    python scripts/download_land_cover.py --province Valladolid

Downloaded files land in etl/data/mapacyl1/<Province>/ and are skipped on
a re-run if already present (safe to re-run / resume after an interrupted
download), so you can fetch a few provinces over several runs instead of
one long one.

NOTE: this script was written from a directory listing of the real portal
(confirmed file naming pattern, folder structure, and approximate sizes)
but has not been run end-to-end in the environment that wrote it - that
sandbox's network egress doesn't reach opendata.jcyl.es at all. Please
run it here, on your own machine, and let me know if the site's HTML
listing format trips up the parsing below (it uses a plain regex over the
Apache/IIS-style directory index, which is normally stable but not
guaranteed).
"""

import argparse
import re
import time
import zipfile
from pathlib import Path
from urllib.parse import quote, urljoin

import requests

BASE_URL = "https://opendata.jcyl.es/ficheros/carto/mapacyl/mapacyl1/"
PROVINCES = [
    "Avila",
    "Burgos",
    "Leon",
    "Palencia",
    "Salamanca",
    "Segovia",
    "Soria",
    "Valladolid",
    "Zamora",
]
DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "mapacyl1"

# Matches an <a href="...zip">filename.zip</a> row in the portal's plain
# Apache/IIS-style directory listing.
ZIP_LINK_RE = re.compile(r'href="([^"]+\.zip)"', re.IGNORECASE)


def list_zip_files(province_url):
    resp = requests.get(province_url, timeout=30)
    resp.raise_for_status()
    names = sorted(set(ZIP_LINK_RE.findall(resp.text)))
    if not names:
        raise RuntimeError(
            f"No .zip links found at {province_url} - the portal's directory "
            "listing format may have changed. Open that URL in a browser and "
            "check ZIP_LINK_RE in this script against the actual HTML."
        )
    return names


# A real run against Valladolid (223 municipalities) came back with 4
# corrupted zips - "not recognized as being in a supported file format"
# when load_land_cover.py tried to open them - all municipalities with
# accents/spaces in their name (Arroyo de la Encomienda, Laguna de Duero,
# Renedo de Esgueva, Zaratan). resp.raise_for_status() only checks the
# HTTP status code, not that the body actually arrived intact, so a
# connection that drops mid-transfer after a 200 OK can still write a
# truncated file to disk with no error raised anywhere. Verifying the
# downloaded bytes are a real zip before accepting them - and retrying a
# couple of times if not - catches that instead of silently leaving a
# corrupt file behind for load_land_cover.py to trip over later.
DOWNLOAD_RETRIES = 3


def download_one(url, dest_path):
    last_error = None
    for attempt in range(1, DOWNLOAD_RETRIES + 1):
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
        dest_path.write_bytes(resp.content)
        if zipfile.is_zipfile(dest_path):
            return len(resp.content)
        last_error = f"downloaded {len(resp.content)} bytes but it is not a valid zip"
        time.sleep(1)
    dest_path.unlink(missing_ok=True)
    raise RuntimeError(f"{dest_path.name}: {last_error} after {DOWNLOAD_RETRIES} attempts (likely a flaky connection to the portal)")


def download_province(province, limit=None, delay_seconds=0.3):
    # The portal's folder names don't have accents (Leon, not León) even
    # though the province's real name does - matches what the earlier
    # directory listing showed.
    province_url = urljoin(BASE_URL, f"{quote(province)}/shp_e1/")
    dest_dir = DATA_DIR / province
    dest_dir.mkdir(parents=True, exist_ok=True)

    zip_names = list_zip_files(province_url)
    if limit:
        zip_names = zip_names[:limit]

    print(f"{province}: {len(zip_names)} municipality files to fetch")

    downloaded = 0
    skipped = 0
    for href in zip_names:
        # The portal's hrefs turned out to be absolute paths (e.g.
        # "/ficheros/carto/mapacyl/mapacyl1/Valladolid/shp_e1/47001_..."),
        # not bare filenames. urljoin(province_url, href) handles that
        # fine for building the download URL either way, but
        # `dest_dir / href` does NOT: pathlib treats a rooted right-hand
        # side as replacing the whole path (keeping only dest_dir's drive
        # letter on Windows), which is what actually happened here - so
        # the local filename is deliberately taken from just the last
        # path segment of the href, never the href itself.
        filename = href.rsplit("/", 1)[-1]
        dest_path = dest_dir / filename
        if dest_path.exists() and dest_path.stat().st_size > 0:
            skipped += 1
            continue

        url = urljoin(province_url, href)
        try:
            byte_count = download_one(url, dest_path)
        except RuntimeError as exc:
            print(f"  FAILED {filename}: {exc}")
            continue
        downloaded += 1
        print(f"  [{downloaded + skipped}/{len(zip_names)}] {filename} ({byte_count / 1024:.0f} KB)")
        time.sleep(delay_seconds)  # be polite to the portal

    print(f"{province}: done - {downloaded} downloaded, {skipped} already present")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--province",
        action="append",
        choices=PROVINCES,
        help="Province to download (repeat --province for more than one). Default: all 9 (several GB - only do this if you really want the whole region).",
    )
    parser.add_argument("--limit", type=int, default=None, help="Only fetch the first N municipalities per province (useful for a quick test run).")
    args = parser.parse_args()

    provinces = args.province or PROVINCES
    for province in provinces:
        download_province(province, limit=args.limit)


if __name__ == "__main__":
    main()
