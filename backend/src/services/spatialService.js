import { pool } from '../config/db.js'

// Given a detection's coordinates (WGS84 lon/lat), enriches it with
// environmental and legal context by querying the open-data layers already
// loaded into PostGIS by the ETL scripts (see /etl).
//
// All distances are computed in meters using geography casts, so results are
// accurate regardless of latitude.
export async function getSpatialContext({ longitude, latitude }) {
  const point = `ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography`

  const nearestLegalFacilityQuery = `
    SELECT name, facility_type, ST_Distance(${point}, geom::geography) AS distance_meters
    FROM waste_facilities
    ORDER BY geom::geography <-> ${point}
    LIMIT 1;
  `

  const landCoverQuery = `
    SELECT cover_type
    FROM land_cover
    WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
    LIMIT 1;
  `

  const nearestWaterBodyQuery = `
    SELECT name, ST_Distance(${point}, geom::geography) AS distance_meters
    FROM hydrography
    ORDER BY geom::geography <-> ${point}
    LIMIT 1;
  `

  const protectedAreaQuery = `
    SELECT name, protection_category
    FROM protected_areas
    WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
    LIMIT 1;
  `

  const [legalFacility, landCover, waterBody, protectedArea] = await Promise.all([
    pool.query(nearestLegalFacilityQuery, [longitude, latitude]),
    pool.query(landCoverQuery, [longitude, latitude]),
    pool.query(nearestWaterBodyQuery, [longitude, latitude]),
    pool.query(protectedAreaQuery, [longitude, latitude]),
  ])

  return {
    nearestLegalFacility: legalFacility.rows[0] ?? null,
    landCoverType: landCover.rows[0]?.cover_type ?? null,
    nearestWaterBody: waterBody.rows[0] ?? null,
    protectedArea: protectedArea.rows[0] ?? null,
  }
}
