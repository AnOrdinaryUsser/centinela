import { predictCell } from '../services/modelClient.js'
import { getSpatialContext } from '../services/spatialService.js'
import { classifyDetection } from '../services/classificationService.js'
import { pool } from '../config/db.js'

// Computes the approximate area in square meters of a lat/lon bounding box.
// Good enough for statistics purposes at the scale of a single grid cell.
function boundsAreaSquareMeters(bounds) {
  const EARTH_RADIUS_METERS = 6371000
  const latDiffRad = ((bounds.north - bounds.south) * Math.PI) / 180
  const lngDiffRad = ((bounds.east - bounds.west) * Math.PI) / 180
  const midLatRad = (((bounds.north + bounds.south) / 2) * Math.PI) / 180
  const height = latDiffRad * EARTH_RADIUS_METERS
  const width = lngDiffRad * EARTH_RADIUS_METERS * Math.cos(midLatRad)
  return Math.abs(height * width)
}

// POST /api/detections/analyze
export async function analyzeCell(req, res, next) {
  try {
    const { bounds, confidenceThreshold } = req.body

    if (!bounds || typeof bounds.north !== 'number') {
      return res.status(400).json({ error: 'bounds (north, south, east, west) is required' })
    }

    const prediction = await predictCell({
      bounds,
      confidenceThreshold: confidenceThreshold ?? 0.9,
    })

    const detections = await Promise.all(
      (prediction.detections ?? []).map(async (detection) => {
        const context = await getSpatialContext({
          longitude: detection.longitude,
          latitude: detection.latitude,
        })

        const classification = classifyDetection(context)

        const insertResult = await pool.query(
          `INSERT INTO detections (longitude, latitude, confidence, class_name, land_cover_type, classification_status, geom)
           VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($1, $2), 4326))
           RETURNING id`,
          [
            detection.longitude,
            detection.latitude,
            detection.confidence,
            detection.class_name ?? detection.className ?? 'dump_site',
            context.landCoverType,
            classification.status,
          ],
        )

        return {
          id: insertResult.rows[0].id,
          confidence: detection.confidence,
          longitude: detection.longitude,
          latitude: detection.latitude,
          className: detection.class_name ?? detection.className ?? 'dump_site',
          landCoverType: context.landCoverType,
          nearestLegalFacility: context.nearestLegalFacility,
          nearestWaterBody: context.nearestWaterBody,
          protectedArea: context.protectedArea,
          classification,
        }
      }),
    )

    res.json({
      detections,
      areaSquareMeters: boundsAreaSquareMeters(bounds),
      imageBase64: prediction.image_base64 ?? '',
      bounds,
      // Kept server-side/for internal diagnostics only - the frontend does
      // not surface this filename to the user (see MapPage.jsx / log.found /
      // log.clear in translations.js: no "motor"/weights-filename per cell).
      // There is no placeholder/demo mode any more - the model-service
      // refuses to start without the real trained weights (see
      // model-service/app/model.py), so this is always the real model.
      modelVersion: prediction.model_version ?? 'unknown',
    })
  } catch (error) {
    next(error)
  }
}

// GET /api/detections
// Public, anonymized list of every detection ever logged by any user of the
// platform (not just the visitor's own local history), as GeoJSON points,
// for the community dumpsite map. Only the AI's own output plus its
// open-data classification is exposed - no user/session identifiers are
// stored on the `detections` row in the first place, so there is nothing
// to strip. minConfidence is clamped to [0.75, 1] as requested: below 75%
// this view would be too noisy to be a trustworthy public layer, and the
// per-analysis confidence slider elsewhere in the app already covers the
// full 0.5-1 range for a user's own runs.
const DETECTIONS_LIST_LIMIT = 3000

export async function listDetections(req, res, next) {
  try {
    const requested = Number(req.query.minConfidence)
    const minConfidence = Number.isFinite(requested) ? Math.min(Math.max(requested, 0.75), 1) : 0.75

    const result = await pool.query(
      `
      SELECT
        ST_AsGeoJSON(geom)::json AS geometry,
        json_build_object(
          'id', id,
          'confidence', confidence,
          'className', class_name,
          'landCoverType', land_cover_type,
          'classificationStatus', classification_status,
          'createdAt', created_at
        ) AS properties
      FROM detections
      WHERE confidence >= $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
      [minConfidence, DETECTIONS_LIST_LIMIT],
    )

    res.json({
      type: 'FeatureCollection',
      minConfidence,
      features: result.rows.map((row) => ({
        type: 'Feature',
        geometry: row.geometry,
        properties: row.properties,
      })),
    })
  } catch (error) {
    next(error)
  }
}

// GET /api/detections/:id/context
export async function getDetectionContext(req, res, next) {
  try {
    const { id } = req.params
    const result = await pool.query('SELECT longitude, latitude FROM detections WHERE id = $1', [id])

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Detection not found' })
    }

    const { longitude, latitude } = result.rows[0]
    const context = await getSpatialContext({ longitude, latitude })
    res.json({ ...context, classification: classifyDetection(context) })
  } catch (error) {
    next(error)
  }
}
