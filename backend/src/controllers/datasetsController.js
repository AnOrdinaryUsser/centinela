import { pool } from '../config/db.js'

// Static metadata describing the open-data layers used by the platform,
// including how complete each one actually is right now. Kept in code
// (rather than the database) since it changes rarely and is mostly
// documentation-facing; see /etl for how each layer is actually loaded
// into PostGIS.
const OPEN_DATA_LAYERS = [
  {
    id: 'waste_facilities',
    name: 'Centros de gestion de residuos',
    source: 'Junta de Castilla y Leon',
    format: 'JSON (exportado desde GeoPackage)',
    status: 'loaded',
    recordCount: 963,
    url: 'https://datosabiertos.jcyl.es/web/jcyl/set/es/medio-ambiente/cubierta-terrestre-poligonos/1284687161791',
  },
  {
    id: 'hydrography',
    name: 'Masas de agua (lagos, embalses, rios)',
    source: 'IGCYL (hy.hidro_cyl_masas)',
    format: 'Shapefile',
    status: 'loaded',
    recordCount: 24915,
    url: 'https://datosabiertos.jcyl.es/web/es/catalogo-datos/buscador-conjuntos-datos.html',
  },
  {
    id: 'protected_areas',
    name: 'Red de Espacios Naturales Protegidos (REN)',
    source: 'Junta de Castilla y Leon',
    format: 'Excel (solo atributos, sin geometria de limites)',
    status: 'attributes_only',
    recordCount: 38,
    note: 'Los 38 espacios estan cargados pero sin poligono de limites: la comprobacion de "dentro de un espacio protegido" no puede activarse todavia para estos registros.',
    url: 'https://datosabiertos.jcyl.es/web/es/catalogo-datos/buscador-conjuntos-datos.html',
  },
  {
    id: 'land_cover',
    name: 'Cubierta terrestre y usos del suelo (mapacyl1)',
    source: 'Junta de Castilla y Leon',
    format: 'Shapefile, organizado por provincia y municipio',
    status: 'pending',
    recordCount: 0,
    note: 'Dataset muy voluminoso (una carpeta por provincia); pendiente de descargar al menos la provincia de interes para la demo.',
    url: 'https://opendata.jcyl.es/ficheros/carto/mapacyl/mapacyl1/',
  },
]

// GET /api/datasets/layers
//
// land_cover's status/recordCount/note used to be hardcoded to "pending, 0"
// because at the time nobody had downloaded or loaded any of it. Now that
// etl/scripts/download_land_cover.py + load_land_cover.py exist and can
// really populate the table (per-province, per-municipality), this queries
// the real row count instead of trusting a static guess - so as soon as a
// province is loaded, the panel and the "Fuentes de datos" popup reflect
// that automatically, with no code change needed for the next province.
//
// protected_areas used to be the same kind of hardcoded guess ("38 espacios
// cargados pero sin poligono de limites"), written back when the only
// source was the attributes-only xlsx (load_protected_areas.py). Now that
// etl/scripts/load_protected_area_boundaries.py can fill in real boundary
// polygons for at least some of those 38 rows, that text needs to reflect
// how many actually have geom - otherwise it keeps saying "sin poligono"
// forever, even after real polygons were loaded, which is exactly the
// confusing state Sergio ran into.
export async function getLayers(req, res, next) {
  try {
    const [landCoverResult, protectedAreasResult] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM land_cover'),
      pool.query(
        'SELECT COUNT(*)::int AS total, COUNT(geom)::int AS with_geometry FROM protected_areas',
      ),
    ])
    const landCoverCount = landCoverResult.rows[0].count
    const { total: protectedAreasTotal, with_geometry: protectedAreasWithGeometry } =
      protectedAreasResult.rows[0]

    const layers = OPEN_DATA_LAYERS.map((layer) => {
      if (layer.id === 'land_cover') {
        if (landCoverCount === 0) return layer
        return {
          ...layer,
          status: 'loaded',
          recordCount: landCoverCount,
          note: 'Cargado por provincia/municipio segun se va descargando (ver el selector de la capa en el mapa).',
        }
      }
      if (layer.id === 'protected_areas') {
        if (protectedAreasWithGeometry === 0) return { ...layer, recordCount: protectedAreasTotal }
        const allLoaded = protectedAreasWithGeometry >= protectedAreasTotal
        return {
          ...layer,
          status: allLoaded ? 'loaded' : 'partial',
          recordCount: protectedAreasTotal,
          note: allLoaded
            ? `Los ${protectedAreasTotal} espacios estan cargados con su poligono de limites: la comprobacion de "dentro de un espacio protegido" ya puede activarse para todos ellos.`
            : `${protectedAreasWithGeometry} de ${protectedAreasTotal} espacios tienen ya poligono de limites real (ver la capa en el mapa); el resto solo tiene los datos del Excel (nombre, categoria, superficie) y todavia no puede activarse la comprobacion de "dentro de un espacio protegido" para ellos.`,
        }
      }
      return layer
    })
    res.json(layers)
  } catch (error) {
    next(error)
  }
}

// GET /api/datasets/geo/protected-areas
// Real boundary polygons for whichever protected_areas rows already have
// one (see etl/scripts/load_protected_area_boundaries.py - as of writing
// that's still a subset of the 38 REN spaces, not all of them). Rows with
// geom IS NULL are intentionally left out here rather than sent with a
// null geometry, since GeoJSON has no sane way to render "no boundary yet"
// and the frontend already lists those as attributes-only via GET
// /api/datasets/layers.
export async function getProtectedAreasGeo(req, res, next) {
  try {
    const result = await pool.query(`
      SELECT
        ST_AsGeoJSON(geom)::json AS geometry,
        json_build_object(
          'id', id,
          'name', name,
          'siteCode', site_code,
          'protectionCategory', protection_category,
          'declaredAreaHectares', declared_area_hectares,
          'infoUrl', info_url
        ) AS properties
      FROM protected_areas
      WHERE geom IS NOT NULL
      ORDER BY id
    `)
    res.json(toFeatureCollection(result.rows))
  } catch (error) {
    next(error)
  }
}

// Wraps a set of rows (each already carrying its own `geometry` and
// `properties` json) into a standard GeoJSON FeatureCollection object.
function toFeatureCollection(rows) {
  return {
    type: 'FeatureCollection',
    features: rows.map((row) => ({
      type: 'Feature',
      geometry: row.geometry,
      properties: row.properties,
    })),
  }
}

// GET /api/datasets/geo/waste-facilities
// Real point geometries (963 records) for the legal waste-management /
// "punto limpio" facilities layer, so the frontend can render it as an
// actual toggleable map layer instead of just the metadata from
// GET /api/datasets/layers. Includes both facility_type (the top-level
// "canal" - Industrial/Domestico) and facility_subtype (the next level
// down in the same taxonomy JCyL's own portal uses - "Punto Limpio",
// "Planta de Transferencia", "Vertedero de residuos domesticos"...- see
// etl/scripts/load_waste_facilities.py) so the frontend can offer the
// same sub-classification the source data actually carries.
export async function getWasteFacilitiesGeo(req, res, next) {
  try {
    const result = await pool.query(`
      SELECT
        ST_AsGeoJSON(geom)::json AS geometry,
        json_build_object(
          'id', id,
          'name', name,
          'facilityType', facility_type,
          'facilitySubtype', facility_subtype,
          'municipality', municipality,
          'province', province,
          'detailUrl', detail_url
        ) AS properties
      FROM waste_facilities
      ORDER BY id
    `)
    res.json(toFeatureCollection(result.rows))
  } catch (error) {
    next(error)
  }
}

// GET /api/datasets/geo/hydrography
// Water-body polygons (lakes, reservoirs, mapped river sections). The
// source table has ~25k records, which is too heavy to ship whole as raw
// geometry, so this picks the largest water bodies by area (real
// reservoirs and lakes, not the thousands of tiny mapped ponds), then
// simplifies each polygon - plenty to make the "we really do use the
// hydrography dataset" point on the map without a multi-megabyte payload.
//
// This endpoint used to come back completely empty on screen even though
// the HTTP request itself succeeded (963 facilities rendered fine, 0
// water bodies did). Verified end-to-end against the real IGCYL dataset
// (24,915 polygons) to find out why - it was actually two separate
// problems stacking:
//   1. A real correctness bug: the old simplify tolerance (0.0008 deg,
//      ~80-90m at this latitude) is wide enough that
//      ST_SimplifyPreserveTopology can legally collapse a polygon
//      narrower than that into an empty geometry - a real risk for
//      mapped river-channel ribbons. ST_AsGeoJSON on an empty geometry
//      still returns a well-formed Feature with an empty coordinates
//      array, which Leaflet's GeoJSON layer silently skips (no error, no
//      console warning - it just doesn't draw anything). Fixed with an
//      explicit filter dropping anything that comes back empty/invalid
//      after simplifying, so the response never contains a feature the
//      map can't draw, plus ST_MakeValid first since a few source
//      polygons in real hydrography datasets are self-intersecting.
//   2. A real performance bug, and the one that actually explains what
//      was seen in practice: the old query (LIMIT 4000, full-precision
//      coordinates) shipped a ~5MB GeoJSON response that took Leaflet
//      several seconds just to parse and turn into ~4000 individual SVG
//      <path> elements - on a real connection (not this sandbox's local
//      Postgres) that's long enough to look "broken" rather than
//      "loading". Cut down with a lower feature cap, coarser (but still
//      validated non-empty) simplification, and trimmed coordinate
//      precision (5 decimal digits, ~1m - far finer than this layer is
//      ever viewed at) - about a 3x smaller payload. Paired with
//      `preferCanvas` on the map itself (see OpenDataMapPage.jsx) so the
//      browser doesn't have to build one DOM node per polygon either.
const HYDROGRAPHY_LIMIT = 1500
const HYDROGRAPHY_SIMPLIFY_TOLERANCE = 0.0003
const HYDROGRAPHY_COORDINATE_PRECISION = 5

// ST_MakeValid + ST_SimplifyPreserveTopology over 1500 real polygons is
// genuinely CPU-heavy (measured ~3s server-side against the real IGCYL
// dataset, EXPLAIN ANALYZE confirmed the cost sits entirely in that
// step, not the sort/limit) - and the source data never changes at
// runtime (it's loaded once, offline, by etl/scripts/load_hydrography.py
// - see that script's own DELETE+INSERT pattern), so there is nothing to
// invalidate this on. A plain in-process cache turns "3s on every single
// visitor's first click" into "3s once per server process lifetime".
let hydrographyGeoCache = null

export async function getHydrographyGeo(req, res, next) {
  try {
    if (hydrographyGeoCache) {
      res.json(hydrographyGeoCache)
      return
    }

    const result = await pool.query(
      `
      SELECT geometry, id, name, water_type, area_square_meters
      FROM (
        SELECT
          id,
          name,
          water_type,
          area_square_meters,
          ST_SimplifyPreserveTopology(ST_MakeValid(geom), $1) AS simplified_geom
        FROM hydrography
        ORDER BY area_square_meters DESC NULLS LAST
        LIMIT $2
      ) simplified
      CROSS JOIN LATERAL (SELECT ST_AsGeoJSON(simplified_geom, $3)::json AS geometry) g
      WHERE simplified_geom IS NOT NULL AND NOT ST_IsEmpty(simplified_geom)
      ORDER BY area_square_meters DESC NULLS LAST
    `,
      [HYDROGRAPHY_SIMPLIFY_TOLERANCE, HYDROGRAPHY_LIMIT, HYDROGRAPHY_COORDINATE_PRECISION],
    )

    const featureCollection = toFeatureCollection(
      result.rows.map((row) => ({
        geometry: row.geometry,
        properties: {
          id: row.id,
          name: row.name,
          waterType: row.water_type,
          areaSquareMeters: row.area_square_meters,
        },
      })),
    )

    // Only cache a real result. Confirmed against a real case: the very
    // first request against a freshly-migrated, not-yet-ETL'd database
    // returned zero rows, and because an empty FeatureCollection object is
    // still truthy, `if (hydrographyGeoCache)` above happily served that
    // empty result forever afterwards - even once load_hydrography.py had
    // since populated the table - until the backend process itself was
    // restarted. Guarding the cache write on there being at least one
    // feature means an empty table just gets queried again (cheap - the
    // real cost is the simplify step over thousands of real rows) instead
    // of getting permanently stuck empty.
    if (featureCollection.features.length > 0) {
      hydrographyGeoCache = featureCollection
    }
    res.json(featureCollection)
  } catch (error) {
    next(error)
  }
}

// GET /api/datasets/geo/land-cover/meta
// Land cover is loaded per-municipality (etl/scripts/download_land_cover.py
// downloads one shapefile per municipality) and a single province can
// already be tens of thousands of polygons, so unlike waste_facilities /
// hydrography this layer is never fetched "whole" - the frontend needs to
// know which province/municipality combinations actually have data loaded
// *before* it can offer a selector, which is exactly what the user asked
// for ("selecciona por provincia y municipio"). This is intentionally a
// separate, cheap endpoint (GROUP BY, no geometry) from the actual geometry
// fetch below.
export async function getLandCoverMeta(req, res, next) {
  try {
    const result = await pool.query(`
      SELECT province, municipality, COUNT(*)::int AS count
      FROM land_cover
      WHERE province IS NOT NULL AND municipality IS NOT NULL
      GROUP BY province, municipality
      ORDER BY province, municipality
    `)
    const byProvince = new Map()
    for (const row of result.rows) {
      if (!byProvince.has(row.province)) byProvince.set(row.province, { province: row.province, totalCount: 0, municipalities: [] })
      const entry = byProvince.get(row.province)
      entry.totalCount += row.count
      entry.municipalities.push({ municipality: row.municipality, count: row.count })
    }
    res.json(Array.from(byProvince.values()))
  } catch (error) {
    next(error)
  }
}

// GET /api/datasets/geo/land-cover?province=X[&municipality=Y]
// province is required; municipality is optional - omitting it returns
// every polygon loaded for the whole province in one response ("todos los
// municipios", explicitly asked for after the per-municipality selector
// shipped). A whole province is real tens of thousands of parcels (a full
// Valladolid load came back at ~20k), which is the same order of magnitude
// hydrography already ships whole after simplification, so this reuses
// that same approach - ST_MakeValid + ST_SimplifyPreserveTopology at a
// coarser tolerance, fewer coordinate decimals - only when no municipality
// is given, so picking one specific municipality still gets full-detail
// parcel boundaries (that response is already small enough not to need it).
const LAND_COVER_SIMPLIFY_TOLERANCE = 0.00005
const LAND_COVER_COORDINATE_PRECISION = 6
const LAND_COVER_PROVINCE_SIMPLIFY_TOLERANCE = 0.0002
const LAND_COVER_PROVINCE_COORDINATE_PRECISION = 5
const LAND_COVER_PROVINCE_LIMIT = 60000

export async function getLandCoverGeo(req, res, next) {
  try {
    const { province, municipality } = req.query
    if (!province) {
      res.status(400).json({ error: 'El parametro "province" es obligatorio (ver GET /api/datasets/geo/land-cover/meta para los valores validos).' })
      return
    }

    const result = municipality
      ? await pool.query(
          `
          SELECT ST_AsGeoJSON(ST_SimplifyPreserveTopology(ST_MakeValid(geom), $1), $2)::json AS geometry, cover_type
          FROM land_cover
          WHERE province = $3 AND municipality = $4
        `,
          [LAND_COVER_SIMPLIFY_TOLERANCE, LAND_COVER_COORDINATE_PRECISION, province, municipality],
        )
      : await pool.query(
          `
          SELECT ST_AsGeoJSON(ST_SimplifyPreserveTopology(ST_MakeValid(geom), $1), $2)::json AS geometry, cover_type
          FROM land_cover
          WHERE province = $3
          LIMIT $4
        `,
          [LAND_COVER_PROVINCE_SIMPLIFY_TOLERANCE, LAND_COVER_PROVINCE_COORDINATE_PRECISION, province, LAND_COVER_PROVINCE_LIMIT],
        )

    const features = result.rows
      .filter((row) => row.geometry && row.geometry.coordinates && row.geometry.coordinates.length > 0)
      .map((row) => ({ geometry: row.geometry, properties: { coverType: row.cover_type } }))

    res.json(toFeatureCollection(features))
  } catch (error) {
    next(error)
  }
}
