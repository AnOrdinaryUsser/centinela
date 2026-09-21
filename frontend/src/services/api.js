import axios from 'axios'

// A hardcoded 'http://localhost:4000' fallback only ever works when the
// page itself was opened as "localhost" - open the app from another
// device on the network via the PC's LAN IP (e.g. http://192.168.1.50:5173)
// and "localhost" in that request would resolve to the OTHER device, not
// this PC, so every API call would fail. Falling back to the page's own
// hostname instead means the backend is reached the same way the page
// itself was, whether that's localhost, 127.0.0.1 or a LAN IP - no .env
// needed just to test on a phone.
//
// The `!== undefined` check (rather than `||`) matters for production:
// there, the frontend and backend sit behind the same reverse proxy on
// one domain (see /Caddyfile - "/api/*" proxied to the backend, the
// build's own dist/ served for everything else), so the right base URL
// is "" (same origin, a plain relative "/api/..." request) - and "" is
// falsy, so `||` would wrongly skip straight past it to the ":4000"
// fallback above. Explicitly setting VITE_BACKEND_URL="" (see
// frontend/Dockerfile's build arg) is how production opts into that,
// while leaving the var completely unset (the local dev default) still
// gets the LAN-friendly fallback.
const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL !== undefined
    ? import.meta.env.VITE_BACKEND_URL
    : `${window.location.protocol}//${window.location.hostname}:4000`

// 65s: must stay ABOVE the backend's own timeout when it calls the
// model-service (60s, see backend/src/services/modelClient.js). Real YOLO
// inference on CPU plus a PNOA WMS fetch can take a while, and with
// several cells analyzed in parallel (see MapPage's CONCURRENCY) later
// ones in the batch queue behind earlier ones - if this timeout were
// SHORTER than the backend's, cells that the backend would have finished
// successfully were being aborted here first, which is why some cells in
// a run used to silently come back as "error" with nothing saved.
const client = axios.create({
  baseURL: BACKEND_URL,
  timeout: 65000,
})

// Only set when you've opted into the backend's access-token gate (see
// backend/src/middleware/accessControl.js and backend/.env.example) -
// meant for when you're exposing the backend beyond localhost and don't
// want anyone else who can reach it to trigger free inference. Left
// unset (the default), this header is simply never added and the
// backend's own default is to not require it either, so nothing changes
// for normal local development.
const ACCESS_TOKEN = import.meta.env.VITE_ACCESS_TOKEN
if (ACCESS_TOKEN) {
  client.defaults.headers.common['X-App-Token'] = ACCESS_TOKEN
}

// Sends a grid cell (bounding box) to the backend for AI analysis.
// confidenceThreshold is always ANALYSIS_CONFIDENCE_FLOOR (0.5, see
// MapPage.jsx) regardless of what the user's slider shows - every run
// fetches the full 0.5-1.0 confidence band in one go, so the slider in
// DetectionPanel.jsx can filter the results client-side afterward with
// no re-analysis ever needed.
export async function analyzeCell({ bounds, confidenceThreshold }) {
  const { data } = await client.post('/api/detections/analyze', {
    bounds,
    confidenceThreshold,
  })
  return data
}

// Fetches the open-data context layers (protected areas, hydrography, land
// cover, legal waste facilities) for a given detection.
export async function getDetectionContext(detectionId) {
  const { data } = await client.get(`/api/detections/${detectionId}/context`)
  return data
}

// Fetches aggregated, anonymous global usage statistics for the dashboard.
export async function getGlobalStats() {
  const { data } = await client.get('/api/stats/global')
  return data
}

// Reports an analyzed cell to the backend so it counts towards the public,
// anonymous global statistics (no personal data is sent).
export async function reportCellAnalyzed({ areaSquareMeters, detectionsCount }) {
  const { data } = await client.post('/api/stats/report', {
    areaSquareMeters,
    detectionsCount,
  })
  return data
}

// Metadata for every open-data layer the platform consumes (source, format,
// load status - includes datasets that are only partially usable today,
// e.g. protected areas with no boundary geometry yet).
export async function getDatasetLayers() {
  const { data } = await client.get('/api/datasets/layers')
  return data
}

// Real point geometries (GeoJSON) for the legal waste-management facilities
// layer, for the interactive open-data map.
export async function getWasteFacilitiesGeo() {
  const { data } = await client.get('/api/datasets/geo/waste-facilities')
  return data
}

// Simplified polygon geometries (GeoJSON) for the hydrography (water
// bodies) layer, for the interactive open-data map.
export async function getHydrographyGeo() {
  const { data } = await client.get('/api/datasets/geo/hydrography')
  return data
}

// Real boundary polygons (GeoJSON) for whichever protected-area (REN) rows
// already have one loaded - see etl/scripts/load_protected_area_boundaries.py.
// Rows still waiting on a real polygon are simply not included; those stay
// attributes-only per GET /api/datasets/layers.
export async function getProtectedAreasGeo() {
  const { data } = await client.get('/api/datasets/geo/protected-areas')
  return data
}

// Public, cross-user list of logged detections (GeoJSON), for the
// community dumpsite map. minConfidence is clamped server-side to [0.75, 1].
export async function getPublicDetections(minConfidence) {
  const { data } = await client.get('/api/detections', { params: { minConfidence } })
  return data
}

// Which provinces/municipalities of the land-cover (mapacyl1) dataset are
// actually loaded right now, with their polygon counts - used to build the
// province/municipality selector, since this layer is never fetched whole.
export async function getLandCoverMeta() {
  const { data } = await client.get('/api/datasets/geo/land-cover/meta')
  return data
}

// Land-cover polygon geometries (GeoJSON) for one specific municipality, or
// for the whole province when municipality is omitted ("todos los
// municipios" - the backend simplifies more aggressively in that case).
export async function getLandCoverGeo(province, municipality) {
  const params = municipality ? { province, municipality } : { province }
  const { data } = await client.get('/api/datasets/geo/land-cover', { params })
  return data
}

// Uploads one analyzed cell's thumbnail (base64, no "data:" prefix) to the
// backend so analyses.js can keep it out of localStorage - see
// 007_analysis_images.sql for why. Returns the new row's id.
export async function uploadAnalysisImage(base64Image) {
  const { data } = await client.post('/api/analysis-images', { image: base64Image, mimeType: 'image/jpeg' })
  return data.id
}

// Absolute URL for a previously uploaded cell image - safe to use directly
// as an <img src>, no fetch/decode needed on the frontend's side.
export function getAnalysisImageUrl(imageId) {
  return `${BACKEND_URL}/api/analysis-images/${imageId}`
}

export default client
