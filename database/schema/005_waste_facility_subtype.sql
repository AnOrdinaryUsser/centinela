-- The real JCyL source data (etl/data/residuos_resumen.json) encodes each
-- facility's type as a taxonomy path, e.g. "Canal Industrial\Tratamiento
-- de RCD\Valorizacion RCD en propia obra" - the same categories used on
-- the JCyL open-data portal itself. facility_type has only ever stored
-- the top-level "canal" (Canal Industrial / Canal Domestico); this adds a
-- second column for the next level down (e.g. "Punto Limpio", "Planta de
-- Transferencia", "Vertedero de residuos domesticos"...), which is real,
-- already-present detail the ETL load was discarding. See
-- etl/scripts/load_waste_facilities.py for how it's populated.
ALTER TABLE waste_facilities ADD COLUMN IF NOT EXISTS facility_subtype TEXT;
