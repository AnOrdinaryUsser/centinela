"""Loads the JCyL land cover / land use dataset (mapacyl1) into the
land_cover table.

Source: https://opendata.jcyl.es/ficheros/carto/mapacyl/mapacyl1/ - fetched
first with download_land_cover.py (run that one first; see its own
docstring for why this is a separate step and what it actually downloads).

Expected local files: etl/data/mapacyl1/<Province>/<code>_<Municipality>_mapacyl1.zip
(one zip per municipality, grouped in a folder per province - NOT a single
combined shapefile, which is what this script originally, incorrectly,
assumed before anyone had looked at the real source structure).

Requires database/schema/006_land_cover_province_municipality.sql to have
been applied first (adds the province/municipality columns this script
fills in from each file's folder/filename).
"""

import re
import sys
from pathlib import Path
from urllib.parse import unquote

import geopandas as gpd
import pandas as pd
import pyogrio
from shapely.geometry import MultiPolygon
from shapely.ops import transform
from sqlalchemy import text

from common.db import get_engine

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "mapacyl1"
TARGET_TABLE = "land_cover"
TARGET_SRID = 4326
SOURCE_DATASET = "JCyL - Cubierta terrestre (mapacyl1)"
# Matches load_hydrography.py's own chunk size for the same kind of bulk
# parameterized INSERT - keeps each execute() call's parameter list to a
# sane size for a dataset that can run into the tens of thousands of rows
# for a whole province.
CHUNK_SIZE = 1000

# Confirmed against a real run (see the "more than one layer found"
# warnings gpd.read_file prints when no layer= is given): each municipality
# zip is NOT one shapefile, it's a whole family of layers - altimetr
# (elevation/contours), cubterre (land cover - what we actually want),
# edifcons (buildings), hidrogra (hydrography), redtrans (transport),
# servinst (services/facilities), uniadmin (admin units), each split into
# _l/_s/_p/_t (line/surface-polygon/point/text-label) variants. Without an
# explicit layer=, geopandas silently picks the alphabetically-first one -
# "altimetr", which is why the very first version of this script "found"
# columns ['TTGGSS', 'FENOMENO', 'COTA', 'SHAPE_Leng', 'geometry'] (that's
# contour-line attributes, not land cover) and then failed to find a
# category column - it was reading entirely the wrong layer.
# find_land_cover_layer() below picks the real one: "*_cubterre_s" (the
# polygon/surface variant of the land-cover layer specifically).
COVER_TYPE_LAYER_SUFFIX = "_cubterre_s"

# FENOMENO is the same categorical column load_hydrography.py already reads
# water_type from (see database/schema/002_geodata_layers.sql's comment on
# hydrography.water_type) - this whole IGCYL/mapacyl family of datasets
# reuses that field name for "what kind of thing is this feature" across
# every layer, so it's tried first here too. The rest are kept as a
# fallback in case this particular layer breaks that pattern, and the
# script still fails loudly with the real column list if none match.
COVER_TYPE_COLUMN_CANDIDATES = ["FENOMENO", "TTGGSS", "USO", "USO_SUELO", "CODIGO_USO", "LEYENDA", "TIPO", "CLASE", "COBERTURA"]


def find_land_cover_layer(zip_path):
    layers = pyogrio.list_layers(f"zip://{zip_path}")
    names = [row[0] for row in layers]
    matches = [n for n in names if n.lower().endswith(COVER_TYPE_LAYER_SUFFIX)]
    if not matches:
        raise RuntimeError(
            f"{zip_path.name}: no layer ending in '{COVER_TYPE_LAYER_SUFFIX}' found. "
            f"Layers actually present: {names}"
        )
    return matches[0]

# "<code>_<Municipality name, possibly with underscores>_mapacyl1"
FILENAME_RE = re.compile(r"^\d+_(.+)_mapacyl1$", re.IGNORECASE)


def municipality_from_filename(zip_path):
    # The portal's directory-listing hrefs are URL-encoded ("%20" for
    # spaces, "%C3%AD" for accented letters like í), and
    # download_land_cover.py saves each file under that raw encoded name
    # (see its own comment on why - matching the href exactly kept the
    # download logic simple). Confirmed against a real load: without
    # unquoting first, municipality ended up stored as literal garbage like
    # "Villagarc%C3%ADa%20de%20Campos" instead of "Villagarcía de Campos" -
    # which is also why municipalities sorted oddly in the selector ('%'
    # sorts before letters). Unquoting here, at read time, fixes it without
    # needing to rename anything already downloaded.
    stem = unquote(zip_path.stem)
    match = FILENAME_RE.match(stem)
    if not match:
        return stem
    return match.group(1).replace("_", " ")


def find_cover_type_column(columns):
    for candidate in COVER_TYPE_COLUMN_CANDIDATES:
        if candidate in columns:
            return candidate
    return None


# The real source geometries turned out to be 3D (MULTIPOLYGON Z - a real
# elevation/COTA value baked into every vertex, consistent with this whole
# IGCYL family of cartographic layers), but land_cover.geom is declared as
# plain 2D geometry(MultiPolygon, 4326) - the app never needs elevation for
# this layer. geopandas' geom_type stays "MultiPolygon" whether the data is
# 2D or 3D (shapely doesn't fold Z into that name), so the previous
# `g.geom_type == "MultiPolygon"` check silently let 3D polygons through
# unchanged - which is what made to_postgis choke with "geometry
# (geometry(MULTIPOLYGONZ,4326)) not a string" once it tried to write them
# into a 2D column. Dropping Z explicitly here, before the MultiPolygon
# wrap, fixes that at the source.
def to_2d(geometry):
    return transform(lambda *coords: coords[:2], geometry)


def load_one_zip(zip_path, province):
    layer_name = find_land_cover_layer(zip_path)
    gdf = gpd.read_file(f"zip://{zip_path}", layer=layer_name)

    if gdf.crs is None:
        # Same source family and provider as hydrography (IGCYL/JCyL
        # cartography), which declares ETRS89 / UTM zone 30N - the safe
        # assumption if this file's own .prj is missing, but to_crs below
        # is a no-op if gdf.crs was already set correctly from the .prj.
        gdf = gdf.set_crs(epsg=25830)
    gdf = gdf.to_crs(epsg=TARGET_SRID)

    cover_column = find_cover_type_column(gdf.columns)
    if cover_column is None:
        raise RuntimeError(
            f"{zip_path.name}: could not find the land-cover category column. "
            f"Actual columns in this shapefile: {list(gdf.columns)}. "
            "Add whichever one holds the land-cover category to "
            "COVER_TYPE_COLUMN_CANDIDATES at the top of this script and re-run."
        )

    gdf["cover_type"] = gdf[cover_column]
    gdf["municipality"] = municipality_from_filename(zip_path)
    gdf["province"] = province
    flattened = gdf.geometry.apply(to_2d)
    gdf["geom"] = flattened.apply(lambda g: g if g.geom_type == "MultiPolygon" else MultiPolygon([g]))
    return gdf[["cover_type", "municipality", "province", "geom"]]


def main():
    if not DATA_DIR.exists():
        print(
            f"No data found at {DATA_DIR} - run download_land_cover.py first "
            "(see its docstring for usage).",
            file=sys.stderr,
        )
        sys.exit(1)

    province_dirs = sorted(p for p in DATA_DIR.iterdir() if p.is_dir())
    if not province_dirs:
        print(f"{DATA_DIR} exists but has no province subfolders - run download_land_cover.py first.", file=sys.stderr)
        sys.exit(1)

    frames = []
    skipped = 0
    for province_dir in province_dirs:
        zip_paths = sorted(province_dir.glob("*.zip"))
        print(f"{province_dir.name}: loading {len(zip_paths)} municipality files...")
        for zip_path in zip_paths:
            try:
                frames.append(load_one_zip(zip_path, province_dir.name))
            except Exception as exc:  # noqa: BLE001 - report and keep going
                # Two real, different reasons this happens in practice
                # (both confirmed against the real Valladolid dataset):
                # some smaller municipalities only publish cubterre as a
                # line/label layer (no _cubterre_s polygon layer exists at
                # all - genuinely missing upstream, not a bug here), and a
                # handful of zips (the ones with accents/spaces in their
                # name, e.g. Zaratan) come back corrupted - not a valid
                # zip - most likely from a flaky connection to the portal
                # during download. Either way this is per-municipality, not
                # fatal to the whole run, so it's reported and skipped.
                skipped += 1
                print(f"  SKIPPED {zip_path.name}: {exc}", file=sys.stderr)

    print(f"{sum(len(sorted(p.glob('*.zip'))) for p in province_dirs)} files total, {skipped} skipped, {len(frames)} loaded successfully")

    if not frames:
        print("Nothing loaded - see errors above.", file=sys.stderr)
        sys.exit(1)

    combined = pd.concat(frames, ignore_index=True)
    combined = gpd.GeoDataFrame(combined, geometry="geom", crs=f"EPSG:{TARGET_SRID}")

    # Deliberately NOT combined.to_postgis() here (that's what the previous
    # version of this script used, and it's the standard GeoPandas way) -
    # confirmed against a real run that it fails in this exact venv with
    # "geom (geometry(MULTIPOLYGON,4326)) not a string", regardless of 2D
    # vs 3D. That error comes from pandas.to_sql() rejecting the
    # geoalchemy2 Geometry dtype object that to_postgis builds internally -
    # a real pandas/SQLAlchemy/geoalchemy2 version mismatch in this venv
    # (the accompanying "pandas only supports SQLAlchemy connectable..."
    # warning is pandas failing to recognize the SQLAlchemy engine
    # connection as connectable, which then makes it validate `dtype`
    # values as plain strings instead of SQLAlchemy types). Rather than
    # chase exact package versions, this reuses the same WKT + parameterized
    # INSERT / ST_GeomFromText approach load_hydrography.py already uses
    # successfully in this same environment (see that script) - it never
    # touches to_postgis/geoalchemy2 at all, so the same failure can't happen.
    engine = get_engine()
    rows = [
        {
            "cover_type": cover_type,
            "municipality": municipality,
            "province": province,
            "source_dataset": SOURCE_DATASET,
            "wkt": geom.wkt,
        }
        for cover_type, municipality, province, geom in zip(
            combined["cover_type"], combined["municipality"], combined["province"], combined.geometry
        )
    ]

    insert_stmt = text(
        f"""
        INSERT INTO {TARGET_TABLE} (cover_type, municipality, province, source_dataset, geom)
        VALUES (:cover_type, :municipality, :province, :source_dataset,
                ST_SetSRID(ST_GeomFromText(:wkt), {TARGET_SRID}))
        """
    )

    with engine.begin() as conn:
        conn.execute(text(f"DELETE FROM {TARGET_TABLE} WHERE source_dataset = :src"), {"src": SOURCE_DATASET})

    # Each chunk gets its OWN transaction (not one single transaction for
    # the whole load) specifically so that one bad row - an invalid/empty
    # geometry ST_GeomFromText chokes on, say - can't roll back every
    # chunk that already committed successfully before it, and can't take
    # down the whole run either. If a chunk's batch insert fails, this
    # falls back to inserting that chunk's rows one at a time so the
    # single bad row is isolated, reported by name, and skipped - every
    # other row in that chunk still gets loaded, and the script always
    # reaches its final summary line instead of crashing out with a
    # traceback like the last two runs did.
    inserted = 0
    insert_failed = 0
    for start in range(0, len(rows), CHUNK_SIZE):
        chunk = rows[start : start + CHUNK_SIZE]
        try:
            with engine.begin() as conn:
                conn.execute(insert_stmt, chunk)
            inserted += len(chunk)
        except Exception as exc:  # noqa: BLE001 - isolate the bad row and keep going
            print(f"  Chunk of {len(chunk)} rows failed as a batch ({exc}); retrying one row at a time...", file=sys.stderr)
            for row in chunk:
                try:
                    with engine.begin() as conn:
                        conn.execute(insert_stmt, [row])
                    inserted += 1
                except Exception as row_exc:  # noqa: BLE001
                    insert_failed += 1
                    print(
                        f"  SKIPPED insert for {row['municipality']} ({row['cover_type']}): {row_exc}",
                        file=sys.stderr,
                    )

    print(
        f"Loaded {inserted} rows into {TARGET_TABLE} across {len(province_dirs)} province(s) "
        f"({insert_failed} rows failed to insert, {skipped} municipality files skipped before reaching the database)"
    )


if __name__ == "__main__":
    main()
