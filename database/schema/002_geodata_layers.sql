-- Open-data layers from the Junta de Castilla y Leon, normalized to
-- EPSG:4326 (WGS84) by the ETL scripts in /etl. See docs/docs/diccionario-datos.md
-- for the full data dictionary.

-- Legal waste treatment facilities and "puntos limpios" (clean points),
-- used to compute distance-to-nearest-legal-facility for each detection.
CREATE TABLE IF NOT EXISTS waste_facilities (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    facility_type   TEXT,
    -- Next level down in the same taxonomy JCyL's own portal uses for
    -- these facilities (e.g. "Punto Limpio", "Planta de Transferencia",
    -- "Vertedero de residuos domesticos") - see
    -- etl/scripts/load_waste_facilities.py and, for existing databases,
    -- 005_waste_facility_subtype.sql.
    facility_subtype TEXT,
    municipality    TEXT,
    province        TEXT,
    detail_url      TEXT,
    source_dataset  TEXT DEFAULT 'JCyL - Centros de gestion de residuos',
    geom            geometry(Point, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_waste_facilities_geom ON waste_facilities USING GIST (geom);

-- Land cover / land use polygons (forestal, agricola, industrial, etc.).
-- The real mapacyl1 source is published as one shapefile per municipality
-- (see etl/scripts/download_land_cover.py), so municipality/province are
-- real, known values here - not left NULL like waste_facilities' were
-- before 005_waste_facility_subtype.sql.
CREATE TABLE IF NOT EXISTS land_cover (
    id              SERIAL PRIMARY KEY,
    cover_type      TEXT NOT NULL,
    municipality    TEXT,
    province        TEXT,
    source_dataset  TEXT DEFAULT 'JCyL - Cubierta terrestre (mapacyl1)',
    geom            geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_land_cover_geom ON land_cover USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_land_cover_province ON land_cover (province);
CREATE INDEX IF NOT EXISTS idx_land_cover_municipality ON land_cover (municipality);

-- Water masses (lakes/lagoons, reservoirs, river sections mapped as
-- polygons) used to flag proximity to water, a key environmental-risk
-- factor for illegal dumping. Source dataset: hy.hidro_cyl_masas (IGCYL).
-- Note: despite the table name this is polygon data, not a line network —
-- the source dataset maps water bodies as areas, not centerlines.
CREATE TABLE IF NOT EXISTS hydrography (
    id                  SERIAL PRIMARY KEY,
    name                TEXT,
    water_type          TEXT,   -- LAGO | RIO | EMBALSE (from FENOMENO)
    area_square_meters  DOUBLE PRECISION,
    source_dataset      TEXT DEFAULT 'IGCYL - Masas de agua (hy.hidro_cyl_masas)',
    geom                geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hydrography_geom ON hydrography USING GIST (geom);

-- Protected natural areas (REN - Red de Espacios Naturales Protegidos).
-- A detection falling inside one of these polygons is a critical alert.
-- geom is nullable: the attribute table (en_cyl_ren_limites.xlsx) currently
-- loaded has no boundary geometries, only metadata about each protected
-- area (name, category, declared area in hectares...). Until real boundary
-- polygons are loaded, rows here are informational only and will simply
-- never match a detection's ST_Contains check.
CREATE TABLE IF NOT EXISTS protected_areas (
    id                  SERIAL PRIMARY KEY,
    site_code           TEXT,
    name                TEXT NOT NULL,
    protection_category TEXT,
    declared_area_hectares DOUBLE PRECISION,
    info_url            TEXT,
    source_dataset      TEXT DEFAULT 'JCyL - Red de Espacios Naturales Protegidos (REN)',
    geom                geometry(MultiPolygon, 4326)
);
CREATE INDEX IF NOT EXISTS idx_protected_areas_geom ON protected_areas USING GIST (geom);
