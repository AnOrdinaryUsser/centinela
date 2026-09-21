-- Lets the frontend store each analyzed cell's PNOA thumbnail server-side
-- instead of embedding it as base64 inside the localStorage-persisted
-- "centinela_analysis_runs" entry (see frontend/src/services/analyses.js).
-- localStorage is typically capped around 5MB/origin, and each thumbnail
-- is ~40-120KB - a handful of runs with many cells would fill that up on
-- their own, on top of colliding with any OTHER app sharing the same
-- origin's quota. Images stored here have no owner/session concept (the
-- product has no login), so there is nothing to key them by except their
-- own id - the frontend keeps that id (not the image bytes) in
-- localStorage and fetches the actual image from GET /api/analysis-images/:id
-- when it needs to display it.
CREATE TABLE IF NOT EXISTS analysis_images (
    id          SERIAL PRIMARY KEY,
    image_data  BYTEA NOT NULL,
    mime_type   TEXT NOT NULL DEFAULT 'image/jpeg',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
