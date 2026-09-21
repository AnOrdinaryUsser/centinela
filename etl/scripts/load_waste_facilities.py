"""Loads the real JCyL waste management facilities registry into the
waste_facilities table.

Source: Centros de gestion de residuos de Castilla y Leon (JCyL), exported
by the project owner from the original GeoPackage to a flat JSON with
fields: nombre, tipo, municipio, provincia, latitud, longitud, url_detalle.

Expected local file: etl/data/residuos_resumen.json

Requires database/schema/005_waste_facility_subtype.sql to have been
applied first (adds the facility_subtype column this script now fills in).
"""

import json
import re
from pathlib import Path

from common.db import get_engine
from sqlalchemy import text

SOURCE_FILE = Path(__file__).resolve().parent.parent / "data" / "residuos_resumen.json"
TARGET_TABLE = "waste_facilities"

# "tipo" comes as a taxonomy path (e.g. "Canal Industrial\Tratamiento de
# RCD\Valorizacion RCD en propia obra" - the SAME categories JCyL's own
# open-data portal uses for these facilities), but a real fraction of
# records in the source JSON have a stray embedded newline inside that
# path (e.g. "Canal Industrial\Otros\nCanal Industrial" - looks like a
# copy/paste artifact upstream, not something introduced by this loader),
# which breaks a plain str.split("\\"). Splitting on backslash OR newline
# and dropping empty/duplicate-looking segments handles both the clean
# and the corrupted rows the same way.
TIPO_SEPARATOR = re.compile(r"[\\\r\n]+")


def parse_tipo(raw_tipo):
    """Returns (facility_type, facility_subtype) from a raw "tipo" taxonomy
    path - the top-level "canal" (Canal Industrial / Canal Domestico) and
    the next level down (e.g. "Punto Limpio", "Planta de Transferencia").
    Both can be None if the source record has no tipo at all."""
    if not raw_tipo:
        return None, None
    parts = [segment.strip() for segment in TIPO_SEPARATOR.split(raw_tipo) if segment.strip()]
    facility_type = parts[0] if len(parts) > 0 else None
    facility_subtype = parts[1] if len(parts) > 1 else None
    return facility_type, facility_subtype


def main():
    with open(SOURCE_FILE, encoding="utf-8") as f:
        records = json.load(f)

    engine = get_engine()

    insert_stmt = text(
        f"""
        INSERT INTO {TARGET_TABLE}
            (name, facility_type, facility_subtype, municipality, province, detail_url, source_dataset, geom)
        VALUES
            (:name, :facility_type, :facility_subtype, :municipality, :province, :detail_url, :source_dataset,
             ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326))
        """
    )

    rows = []
    for record in records:
        if record.get("longitud") is None or record.get("latitud") is None:
            continue
        facility_type, facility_subtype = parse_tipo(record.get("tipo"))
        rows.append(
            {
                "name": record["nombre"],
                "facility_type": facility_type,
                "facility_subtype": facility_subtype,
                "municipality": record.get("municipio"),
                "province": record.get("provincia"),
                "detail_url": record.get("url_detalle"),
                "source_dataset": "JCyL - Centros de gestion de residuos",
                "longitude": record["longitud"],
                "latitude": record["latitud"],
            }
        )

    with engine.begin() as conn:
        conn.execute(text(f"DELETE FROM {TARGET_TABLE} WHERE source_dataset = 'JCyL - Centros de gestion de residuos'"))
        conn.execute(insert_stmt, rows)

    print(f"Loaded {len(rows)} rows into {TARGET_TABLE}")


if __name__ == "__main__":
    main()
