-- AI detections produced by the model-service and enriched by the backend
-- with the open-data context layers (see src/services/spatialService.js).
CREATE TABLE IF NOT EXISTS detections (
    id                SERIAL PRIMARY KEY,
    longitude         DOUBLE PRECISION NOT NULL,
    latitude          DOUBLE PRECISION NOT NULL,
    confidence        DOUBLE PRECISION NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    class_name        TEXT NOT NULL DEFAULT 'dump_site',
    land_cover_type   TEXT,
    classification_status TEXT,
    geom              geometry(Point, 4326) NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_detections_geom ON detections USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_detections_created_at ON detections (created_at);
