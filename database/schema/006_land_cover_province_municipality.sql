-- The real mapacyl1 (cubierta terrestre) source data is published as one
-- shapefile per municipality (see etl/scripts/download_land_cover.py and
-- the rewritten etl/scripts/load_land_cover.py), which is exactly the
-- province/municipio breakdown asked for - so it's worth keeping that
-- breakdown as real columns instead of just a big pile of anonymous
-- polygons, the same way waste_facilities already has municipality and
-- province.
ALTER TABLE land_cover ADD COLUMN IF NOT EXISTS municipality TEXT;
ALTER TABLE land_cover ADD COLUMN IF NOT EXISTS province TEXT;
CREATE INDEX IF NOT EXISTS idx_land_cover_province ON land_cover (province);
CREATE INDEX IF NOT EXISTS idx_land_cover_municipality ON land_cover (municipality);
