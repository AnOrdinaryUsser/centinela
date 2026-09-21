"""Fills in the boundary polygons for the Red de Espacios Naturales
Protegidos (REN) rows that load_protected_areas.py already inserted (with
geom = NULL - see that script's docstring and the comment on the
`protected_areas` table in database/schema/002_geodata_layers.sql).

Source: the REAL IGCYL GeoPackage for this same layer -
en_cyl_ren_limites.gpkg (downloaded from the IDECyL WMS/catalog, see
Licencia-IGCYL.txt for terms) - NOT the JCyL opendata portal's PORN
ambito/zonificacion files an earlier version of this script tried (those
only covered 1-2 of the 38 spaces; this GeoPackage is the actual
boundary layer and has all 38, confirmed against a real run 2026-09).

Crucially, this is the SAME attribute table as en_cyl_ren_limites.xlsx
(identical columns: fid, c_sitecode, n_espacio, c_figura, n_figura,
d_estado, ..., m_sup_ha, url_info, f_actualiz) that load_protected_areas.py
already loaded - just with a real MultiPolygon geometry column added. That
means matching is a simple, reliable exact-name join (n_espacio ==
protected_areas.name) rather than the grouping/dissolving/prefix-stripping
this script used to need for the old zonif dataset, which was one row per
internal PORN zone rather than one row per protected space.

5 of the 38 rows have no c_sitecode (4 "Zona periferica de proteccion de
<monumento>" buffer zones + 1 "Sitio Paleontologico" with no PORN of its
own) - those are matched by name too, same as the other 33.

Expected local file: etl/data/en_cyl_ren_limites.gpkg

Per Sergio's standing rule for these ETL scripts: nothing here raises and
aborts the whole run over one row failing - each row is handled
independently, failures/mismatches are reported by name, and the script
always finishes with a summary of what happened.

Usage:
    python scripts/load_protected_area_boundaries.py
"""

import unicodedata
from pathlib import Path

import geopandas as gpd
from shapely.geometry import MultiPolygon
from shapely.ops import transform
from sqlalchemy import text

from common.db import get_engine

SOURCE_FILE = Path(__file__).resolve().parent.parent / "data" / "en_cyl_ren_limites.gpkg"
TARGET_TABLE = "protected_areas"
TARGET_SRID = 4326

# Synthetic aggregate rows an earlier version of this script inserted when
# it only had the JCyL PORN "ambito" file (a single, unnamed aggregate
# boundary) to work with. Real per-space polygons from the GeoPackage make
# those redundant and potentially confusing (a generic extra row sitting
# next to the 38 real ones), so they're removed once real geometry is
# loaded - see main().
LEGACY_AGGREGATE_SITE_CODE_PATTERN = "REN_%_AGREGADO"


def to_2d(geometry):
    """Same fix as load_land_cover.py's to_2d: a MULTIPOLYGON Z (3D)
    geometry doesn't match this table's MultiPolygon(4326) 2D column."""
    if geometry is None or not geometry.has_z:
        return geometry
    return transform(lambda *coords: coords[:2], geometry)


def to_multipolygon(geometry):
    if geometry is None:
        return None
    return MultiPolygon([geometry]) if geometry.geom_type == "Polygon" else geometry


def normalize_text(value):
    """Lowercase + accent-stripped + whitespace-collapsed, so a stray
    encoding/whitespace difference between the xlsx and the GeoPackage
    (both ultimately from the same JCyL source table, but exported
    separately) doesn't cause a real match to be missed."""
    if value is None:
        return None
    text_value = str(value).strip()
    if not text_value or text_value.lower() == "none":
        return None
    decomposed = unicodedata.normalize("NFD", text_value.lower())
    stripped = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    return " ".join(stripped.split())


def main():
    if not SOURCE_FILE.exists():
        print(f"FAILED: {SOURCE_FILE} not found. Copy en_cyl_ren_limites.gpkg into etl/data/ and re-run.")
        return

    engine = get_engine()
    with engine.begin() as conn:
        existing_rows = conn.execute(
            text(f"SELECT id, site_code, name FROM {TARGET_TABLE}")
        ).mappings().all()
    print(f"{len(existing_rows)} existing row(s) in {TARGET_TABLE} to match against.\n")

    by_name = {normalize_text(r["name"]): r for r in existing_rows if r["name"]}

    gdf = gpd.read_file(SOURCE_FILE)
    print(f"Read {len(gdf)} feature(s) from {SOURCE_FILE.name}. Columns: {list(gdf.columns)}")
    if gdf.crs is None:
        print("WARNING: no CRS declared on the GeoPackage - assuming it's already EPSG:4326.")
    elif gdf.crs.to_epsg() != TARGET_SRID:
        gdf = gdf.to_crs(epsg=TARGET_SRID)

    updated = 0
    failed = 0
    unmatched = []

    with engine.begin() as conn:
        for _, feature in gdf.iterrows():
            raw_name = feature.get("n_espacio")
            geom = to_multipolygon(to_2d(feature.geometry))
            if geom is None or geom.is_empty:
                print(f"[skip] '{raw_name}': empty/missing geometry in the source row.")
                continue

            match = by_name.get(normalize_text(raw_name))
            if not match:
                unmatched.append(raw_name)
                continue

            try:
                conn.execute(
                    text(
                        f"UPDATE {TARGET_TABLE} SET geom = ST_SetSRID(ST_GeomFromText(:wkt), {TARGET_SRID}) "
                        "WHERE id = :id"
                    ),
                    {"wkt": geom.wkt, "id": match["id"]},
                )
                updated += 1
                print(f"matched '{raw_name}' -> protected_areas '{match['name']}' (id={match['id']}).")
            except Exception as exc:  # noqa: BLE001 - report this row, keep going
                failed += 1
                print(f"FAILED updating protected_areas.id={match['id']} ({match['name']}): {exc}")

        # The old ambito/zonif-based aggregate rows are superseded by this
        # GeoPackage's real per-space polygons (which include Sierra de
        # Guadarrama itself, what "ambito" was standing in for) - remove
        # them so they don't linger as a confusing, generically-named extra
        # row once every real space has its own accurate boundary.
        removed_aggregates = conn.execute(
            text(f"DELETE FROM {TARGET_TABLE} WHERE site_code LIKE :pattern RETURNING site_code"),
            {"pattern": LEGACY_AGGREGATE_SITE_CODE_PATTERN},
        ).fetchall()

    print()
    print("=== Summary ===")
    print(f"Updated geometry on {updated} of {len(existing_rows)} named {TARGET_TABLE} row(s) ({failed} failed).")
    if unmatched:
        print(f"{len(unmatched)} row(s) in the GeoPackage did not match any existing protected_areas row by name:")
        for name in unmatched:
            print(f"  - {name!r}")
    if removed_aggregates:
        print(
            f"Removed {len(removed_aggregates)} legacy aggregate row(s) from an earlier, less complete "
            f"load: {[r[0] for r in removed_aggregates]}"
        )

    with engine.begin() as conn:
        still_null = conn.execute(text(f"SELECT count(*) FROM {TARGET_TABLE} WHERE geom IS NULL")).scalar()
    print(f"{still_null} row(s) still have geom = NULL.")


if __name__ == "__main__":
    main()
