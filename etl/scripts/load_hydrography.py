"""Loads the real IGCYL water masses dataset into the hydrography table.

Source: hy.hidro_cyl_masas (IGCYL) — polygons for lakes/lagoons (LAGO),
reservoirs (EMBALSE) and river sections (RIO) across Castilla y Leon.
Original CRS: ETRS89 / UTM zone 30N (EPSG:25830); reprojected here to
EPSG:4326 (WGS84) to match the rest of the platform.

Expected local file: etl/data/hy_hidro_cyl_masas.zip (the shapefile bundle
as downloaded, zipped - geopandas can read straight out of the zip).

Note: rows are inserted with plain SQL (ST_GeomFromText) rather than
GeoDataFrame.to_postgis(), which has known compatibility issues with very
recent pandas releases (its dtype handling in to_sql changed in a way that
breaks geopandas' geometry column encoding). This approach only needs
geopandas for reading/reprojecting, which is unaffected.
"""

from pathlib import Path

import geopandas as gpd
from shapely.geometry import MultiPolygon
from sqlalchemy import text

from common.db import get_engine

SOURCE_FILE = Path(__file__).resolve().parent.parent / "data" / "hy_hidro_cyl_masas.zip"
SHAPEFILE_NAME = "hy.hidro_cyl_masas.shp"
TARGET_TABLE = "hydrography"
SOURCE_DATASET = "IGCYL - Masas de agua (hy.hidro_cyl_masas)"
SOURCE_SRID = 25830  # ETRS89 / UTM zone 30N, as declared in the shapefile's .prj
TARGET_SRID = 4326
CHUNK_SIZE = 2000  # insert in batches so one statement isn't ~25k rows wide


def to_multipolygon(geom):
    return MultiPolygon([geom]) if geom.geom_type == "Polygon" else geom


def clean_name(value):
    text_value = str(value).strip() if value is not None else ""
    return text_value if text_value and text_value.lower() != "none" else None


def main():
    gdf = gpd.read_file(f"zip://{SOURCE_FILE}!{SHAPEFILE_NAME}")
    if gdf.crs is None:
        gdf = gdf.set_crs(epsg=SOURCE_SRID)

    # Compute area while still in the original metric (UTM) CRS, then
    # reproject the geometry itself to WGS84 for storage.
    area_square_meters = gdf.geometry.area
    gdf = gdf.to_crs(epsg=TARGET_SRID)
    geometries = gdf.geometry.apply(to_multipolygon)

    rows = [
        {
            "name": clean_name(name),
            "water_type": water_type,
            "area_square_meters": float(area),
            "wkt": geom.wkt,
            "source_dataset": SOURCE_DATASET,
        }
        for name, water_type, area, geom in zip(
            gdf["NOMBRE"], gdf["FENOMENO"], area_square_meters, geometries
        )
    ]

    engine = get_engine()
    insert_stmt = text(
        f"""
        INSERT INTO {TARGET_TABLE} (name, water_type, area_square_meters, source_dataset, geom)
        VALUES (:name, :water_type, :area_square_meters, :source_dataset,
                ST_SetSRID(ST_GeomFromText(:wkt), {TARGET_SRID}))
        """
    )

    with engine.begin() as conn:
        conn.execute(text(f"DELETE FROM {TARGET_TABLE} WHERE source_dataset = :src"), {"src": SOURCE_DATASET})
        for start in range(0, len(rows), CHUNK_SIZE):
            conn.execute(insert_stmt, rows[start : start + CHUNK_SIZE])

    print(f"Loaded {len(rows)} rows into {TARGET_TABLE}")


if __name__ == "__main__":
    main()
