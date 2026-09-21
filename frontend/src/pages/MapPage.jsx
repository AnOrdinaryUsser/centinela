import { useRef, useState } from 'react'
import { MapContainer, TileLayer, WMSTileLayer, CircleMarker, Popup } from 'react-leaflet'
import { CAlert } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilStorage, cilCheckCircle, cilSatelite } from '@coreui/icons'
import L from 'leaflet'
import GridSelector from '../components/GridSelector.jsx'
import AnalysisGrid from '../components/AnalysisGrid.jsx'
import DetectionPanel from '../components/DetectionPanel.jsx'
import TileStrip from '../components/TileStrip.jsx'
import SearchBar from '../components/SearchBar.jsx'
import MapController from '../components/MapController.jsx'
import LayersControl from '../components/LayersControl.jsx'
import InferenceLog from '../components/InferenceLog.jsx'
import CircularProgress from '../components/CircularProgress.jsx'
import { tilesForBounds, tileSizeMeters } from '../services/tileMath.js'
import { analyzeCell, reportCellAnalyzed } from '../services/api.js'
import { addAnalysisRun, updateAnalysisRun } from '../services/analyses.js'
import { useI18n } from '../i18n/I18nContext.jsx'

const PNOA_WMS_URL = import.meta.env.VITE_PNOA_WMS_URL || 'https://www.ign.es/wms-inspire/pnoa-ma'

// Castilla y Leon approximate geographic center, used as the initial map view.
const CYL_CENTER = [41.65, -4.73]
const CYL_INITIAL_ZOOM = 8

// How close the map itself can zoom in (mouse wheel / double-click / +-).
// PNOA is fetched via WMS (a rendered image per view, not pre-baked XYZ
// tiles), so nothing stops it being requested at zoom 20 - the real limit
// is the source orthophoto's own ground resolution (PNOA is typically
// 25cm/pixel, ~10cm in some recent flights), not this app. The OSM/topo
// basemaps DO have a native tile limit lower than this (see
// maxNativeZoom below); past that Leaflet just upscales their tiles,
// which is expected/fine since PNOA is the one used for actual analysis.
const MAP_MAX_ZOOM = 20

// Default XYZ tile zoom the drawn area is split into (see
// services/tileMath.js) - a real, standard slippy-map tile grid, exactly
// like AliFlux/MapTilesDownloader, instead of an arbitrary degrees-based
// square. Each tile is rendered by the model-service at a fixed pixel size
// (see model-service/app/model.py: TILE_SIZE, currently 960px), so the
// ground resolution actually delivered is (tile side in meters) / 960 -
// PNOA "Maxima Actualidad" itself is natively ~0.25-0.50m/px (confirmed
// against IGN's WMS capabilities), so:
//   zoom <= ~16  -> coarser than native: WMS has real detail we're not
//                   asking for (this used to be the problem at zoom 15).
//   zoom ~17     -> matches native (~0.24-0.36m/px) - the sharpest a tile
//                   can be without the WMS server having to invent pixels.
//   zoom >= 18   -> FINER than native: the requested ground footprint is
//                   smaller than PNOA's own pixel size, so the WMS server
//                   has no choice but to interpolate/upsample to fill the
//                   request - this is what produces a blurry, mushy tile
//                   (this is what zoom 19-20 was doing before this cap;
//                   the "muy cercano" the tile looked like was real, the
//                   sharpness it lost chasing it wasn't recoverable by any
//                   amount of extra pixels requested, only by asking for a
//                   ground footprint PNOA can actually resolve).
// MAX_TILE_ZOOM is capped at 18 (mildly past native, still usable) rather
// than letting it go further, exactly to avoid handing back tiles that
// LOOK "muy cercano" but are actually just blurred - MAP_MAX_ZOOM above
// (free map browsing) is a separate, unaffected setting.
const DEFAULT_TILE_ZOOM = 17
const MIN_TILE_ZOOM = 13
const MAX_TILE_ZOOM = 18

// Hard cap on how many tiles a single drawn zone can be split into. Each
// tile is a real network round-trip (WMS fetch + YOLO inference), so an
// uncapped huge selection would either take forever or silently look
// "broken" - refusing early (before the user even clicks "Analizar") with
// a clear message is much better UX.
const MAX_CELLS = 200

// How many tiles are analyzed at once. Sequential (1) would be safest on
// a weak model-service but painfully slow for "muchas tiles"; a small
// pool keeps the UI responsive without hammering the WMS/model-service —
// mirrors MapTilesDownloader's own "Parallel threads" option.
const CONCURRENCY = 4

// The confidence threshold ALWAYS sent to the model when analyzing - not
// whatever the slider happens to show. This is the fix for "el deslizador
// no hace nada una vez le doy a analizar": before, the slider value WAS
// the network request's confidenceThreshold, so the model only ever
// returned detections above wherever the slider sat at request time - drag
// it down afterward and there's nothing to reveal below that, because it
// was never fetched. Fetching at this fixed floor once captures every
// detection from 0.5 to 1.0 in a single request, so the slider (see
// `threshold` state below) becomes a pure, always-reversible CLIENT-SIDE
// filter over that already-fetched range - move it up or down after
// analyzing and it actually does something, every time, with no re-fetch.
const ANALYSIS_CONFIDENCE_FLOOR = 0.5

// Marker color by classification severity (see backend/src/services/classificationService.js).
const SEVERITY_COLORS = {
  critical: '#ff5d6c',
  warning: '#f9b115',
  info: '#8a93a2',
}

// maxNativeZoom is each provider's own highest pre-rendered zoom level;
// past it Leaflet just upscales the last real tile (blurry but zoomable)
// instead of requesting a tile that doesn't exist and getting a 404.
const BASEMAP_TILES = {
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxNativeZoom: 19,
  },
  topo: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors, SRTM | &copy; OpenTopoMap (CC-BY-SA)',
    maxNativeZoom: 17,
  },
}
const LABELS_TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png'
const LABELS_MAX_NATIVE_ZOOM = 19

function formatCoordinate(latLng) {
  if (!latLng) return null
  return `${latLng.lat.toFixed(4)}, ${latLng.lng.toFixed(4)}`
}

function tileLatLngBounds(tile) {
  return L.latLngBounds([tile.south, tile.west], [tile.north, tile.east])
}

// Runs `worker(item, index)` over `items` with at most `limit` calls in
// flight at once. Used to analyze several grid tiles in parallel without
// unbounded concurrency.
async function runWithConcurrency(items, limit, worker) {
  let cursor = 0
  async function next() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      await worker(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next))
}

// Main screen: interactive map over PNOA imagery where the user searches a
// place (or coordinates), picks a basemap/layers, and draws a rectangle —
// exactly the AliFlux/MapTilesDownloader workflow: (1) draw a rectangle,
// (2) the rectangle is split into a real XYZ tile grid and shown as a
// preview (orange outline, tile count) *before* anything is sent to the
// backend, (3) the user explicitly starts the analysis, which then walks
// every tile - showing its live status on the map (see AnalysisGrid), a
// scrolling log of the real backend responses (see InferenceLog), and a
// strip of every tile's thumbnail as it completes (see TileStrip), each
// one clickable to see its bounding boxes and legal/illegal info. The
// whole run (images included) is kept in the local analysis history.
export default function MapPage() {
  const { t } = useI18n()
  const [drawingActive, setDrawingActive] = useState(false)
  const [draft, setDraft] = useState({ count: 0, bounds: null })
  const [zoom, setZoom] = useState(CYL_INITIAL_ZOOM)
  const [tileZoom, setTileZoom] = useState(DEFAULT_TILE_ZOOM)
  const [lastDrawnBounds, setLastDrawnBounds] = useState(null)
  const [previewTiles, setPreviewTiles] = useState([])
  const [gridCells, setGridCells] = useState([])
  const [cellStatuses, setCellStatuses] = useState([])
  // `runTiles` are the tile descriptors (x, y, z, bounds) of the run
  // currently shown, in the same order/index as gridCells/cellStatuses.
  // `tileEntries` is the parallel result per tile: null while
  // pending/analyzing, otherwise { image, detections, errored }. Both stay
  // populated after the run finishes so "Reintentar celdas fallidas" can
  // redo just the tiles that failed without losing the ones that worked.
  const [runTiles, setRunTiles] = useState([])
  const [tileEntries, setTileEntries] = useState([])
  // Mirrors tileEntries synchronously (state updates are batched/async, so
  // after `await runWithConcurrency(...)` the `tileEntries` *state* var in
  // this closure can be stale — this ref is always current the instant a
  // tile finishes, which retryFailedCells needs to rebuild the full cells
  // list to save).
  const tileEntriesRef = useRef([])
  const [currentRunId, setCurrentRunId] = useState(null)
  // True right after addAnalysisRun/updateAnalysisRun had to drop images
  // to fit the run in localStorage (or couldn't save it at all) - see
  // services/analyses.js. Previously this only ever reached
  // console.error, so the only way to notice was opening DevTools.
  const [storageFull, setStorageFull] = useState(false)
  const [detections, setDetections] = useState([])
  const [logEntries, setLogEntries] = useState([])
  const [modelVersion, setModelVersion] = useState(null)
  // Purely a DISPLAY filter now (see ANALYSIS_CONFIDENCE_FLOOR above for
  // what actually gets sent to the model): hides detections/map markers
  // below this value out of the full 0.5-1.0 range that's always fetched.
  // Starts at the floor (0.5) so nothing is hidden right after a fresh
  // analysis - drag it up from there to raise the bar.
  const [threshold, setThreshold] = useState(ANALYSIS_CONFIDENCE_FLOOR)
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [errorMessage, setErrorMessage] = useState(null)
  const [flyToTarget, setFlyToTarget] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [basemap, setBasemap] = useState('pnoa')
  const [showLabels, setShowLabels] = useState(false)

  function addLog(text, level = 'info') {
    // A plain module-level counter used to live here, which meant its
    // value reset to 0 on every Vite HMR reload of this file - React Fast
    // Refresh keeps the component's own state (logEntries) across that
    // reload, so the freshly-reset counter started handing out ids (1, 2,
    // 3...) that collided with entries already sitting in state from
    // before the reload - which is exactly the "two children with the
    // same key" warning this caused.
    //
    // crypto.randomUUID() would fix that, but it only exists in a
    // "secure context" (HTTPS, or the page's own localhost) - open the
    // app from another device over plain http://<lan-ip>:5173 (exactly
    // the setup this app now supports) and the browser doesn't expose it
    // at all, throwing "crypto.randomUUID is not a function" instead.
    // Date.now() + Math.random() needs no browser API and can't repeat
    // in practice either, so it works the same over http and https.
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setLogEntries((prev) => [...prev.slice(-60), { id, text, level }])
  }

  function updateCellStatus(index, status) {
    setCellStatuses((prev) => {
      const next = [...prev]
      next[index] = status
      return next
    })
  }

  // Step 1: rectangle drawn -> compute the real tile grid it covers and
  // show it as a preview (does NOT start analysis). Mirrors
  // MapTilesDownloader's "Preview Grid" button/toast.
  function showGridPreview(bounds, zoomLevel) {
    const tiles = tilesForBounds(bounds, zoomLevel)
    setPreviewTiles(tiles)
    setErrorMessage(tiles.length > MAX_CELLS ? t('map.tooManyCells', { count: tiles.length, max: MAX_CELLS }) : null)
  }

  function handleRectangleDrawn(bounds) {
    setDrawingActive(false)
    setLastDrawnBounds(bounds)
    showGridPreview(bounds, tileZoom)
  }

  function changeTileZoom(delta) {
    const next = Math.min(MAX_TILE_ZOOM, Math.max(MIN_TILE_ZOOM, tileZoom + delta))
    if (next === tileZoom) return
    setTileZoom(next)
    if (lastDrawnBounds) showGridPreview(lastDrawnBounds, next)
  }

  function cancelPreview() {
    setPreviewTiles([])
    setLastDrawnBounds(null)
    setErrorMessage(null)
  }

  // Analyzes ONE tile and records its result everywhere it needs to show
  // up (cell color on the map, log line, detections list, tile-strip
  // thumbnail). Shared by both startAnalysis (the first pass over every
  // tile) and retryFailedCells (a second pass over only the tiles that
  // errored the first time) so a retried tile behaves exactly like a
  // first-time one instead of a separate code path that could drift.
  //
  // IMPORTANT: this never throws — analyzeCell() failing (network error,
  // or the axios timeout, see services/api.js) is caught here and recorded
  // as a normal "errored" result, not silently dropped. That silent drop
  // is exactly what used to make some cells in a run disappear without a
  // trace: their promise rejected, nothing ever wrote a tile-strip entry
  // for them, and the console.error was the only sign anything happened.
  async function analyzeOneTile(tile, index, totalForLog) {
    const bounds = { south: tile.south, west: tile.west, north: tile.north, east: tile.east }
    updateCellStatus(index, { status: 'analyzing' })
    addLog(t('log.requesting', { index: index + 1, total: totalForLog }))

    let entry
    try {
      const result = await analyzeCell({ bounds, confidenceThreshold: ANALYSIS_CONFIDENCE_FLOOR })
      if (result.modelVersion) setModelVersion(result.modelVersion)
      const cellDetections = result.detections ?? []
      updateCellStatus(index, { status: cellDetections.length > 0 ? 'alert' : 'clean' })
      addLog(
        t(cellDetections.length > 0 ? 'log.found' : 'log.clear', {
          index: index + 1,
          count: cellDetections.length,
        }),
        cellDetections.length > 0 ? 'alert' : 'clean',
      )
      entry = { image: result.imageBase64 || null, detections: cellDetections, errored: false }
      setDetections((prev) => [...prev, ...cellDetections])
    } catch (error) {
      console.error('Error analyzing cell', error)
      updateCellStatus(index, { status: 'error' })
      addLog(t('log.error', { index: index + 1 }), 'error')
      entry = { image: null, detections: [], errored: true }
    }

    tileEntriesRef.current[index] = entry
    setTileEntries((prev) => {
      const next = [...prev]
      next[index] = entry
      return next
    })
    setProgress((prev) => ({ ...prev, done: prev.done + 1 }))
    return { bounds, ...entry }
  }

  // Step 2: user confirms the preview -> actually run the analysis, tile
  // by tile, exactly the count/order shown in the preview grid.
  async function startAnalysis() {
    const tiles = previewTiles
    if (!tiles.length || tiles.length > MAX_CELLS) return

    const cells = tiles.map(tileLatLngBounds)

    setPreviewTiles([])
    setRunTiles(tiles)
    setGridCells(cells)
    setCellStatuses(cells.map(() => ({ status: 'pending' })))
    tileEntriesRef.current = cells.map(() => null)
    setTileEntries(tileEntriesRef.current)
    setCurrentRunId(null)
    setDetections([])
    setLogEntries([])
    setModelVersion(null)
    setErrorMessage(null)
    setAnalyzing(true)
    setDrawerOpen(true)
    setProgress({ done: 0, total: cells.length })
    addLog(t('log.start', { count: cells.length, concurrency: CONCURRENCY }))

    const runCells = new Array(cells.length)
    let hadError = false

    await runWithConcurrency(tiles, CONCURRENCY, async (tile, index) => {
      const result = await analyzeOneTile(tile, index, tiles.length)
      runCells[index] = result
      if (result.errored) hadError = true
    })

    const totalDetections = runCells.reduce((sum, cell) => sum + (cell?.detections.length ?? 0), 0)
    addLog(t('log.done', { detections: totalDetections, count: cells.length }), 'done')
    if (hadError) setErrorMessage(t('map.error'))

    const areaSquareMeters = runCells.reduce((sum, cell) => {
      const { north, south, east, west } = cell.bounds
      return sum + Math.abs((north - south) * (east - west)) * 111000 * 111000
    }, 0)

    const overall = cells.reduce(
      (acc, cell) => ({
        north: Math.max(acc.north, cell.getNorth()),
        south: Math.min(acc.south, cell.getSouth()),
        east: Math.max(acc.east, cell.getEast()),
        west: Math.min(acc.west, cell.getWest()),
      }),
      { north: -90, south: 90, east: -180, west: 180 },
    )

    const { runs: updatedRuns, imagesDropped } = await addAnalysisRun({
      boundsSummary: overall,
      zoom,
      cellCount: cells.length,
      areaSquareMeters,
      cells: runCells,
    })
    setCurrentRunId(updatedRuns[0]?.id ?? null)
    setStorageFull(imagesDropped)
    if (imagesDropped) addLog(t('log.storageFull'), 'error')

    try {
      await reportCellAnalyzed({ areaSquareMeters, detectionsCount: totalDetections })
    } catch (error) {
      console.error('Error reporting stats', error)
    }

    setAnalyzing(false)
  }

  // Re-runs analysis ONLY for the tiles currently marked "error" (network
  // hiccup, PNOA WMS rate limit, or the analysis simply taking longer than
  // the frontend's timeout under load - see services/api.js). Every other
  // tile's result is left untouched. Once done, the saved history entry
  // for this run is patched in place (see services/analyses.js) so the
  // fixed cells are actually kept, not just fixed on screen until reload.
  async function retryFailedCells() {
    const failedIndices = cellStatuses
      .map((status, index) => (status?.status === 'error' ? index : null))
      .filter((index) => index !== null)
    if (!failedIndices.length || !runTiles.length || analyzing) return

    setErrorMessage(null)
    setAnalyzing(true)
    setDrawerOpen(true)
    setProgress({ done: 0, total: failedIndices.length })
    addLog(t('log.retryStart', { count: failedIndices.length }))

    let stillHadError = false

    await runWithConcurrency(failedIndices, CONCURRENCY, async (index) => {
      const result = await analyzeOneTile(runTiles[index], index, runTiles.length)
      if (result.errored) stillHadError = true
    })

    addLog(t('log.retryDone'), stillHadError ? 'error' : 'done')
    setErrorMessage(stillHadError ? t('map.error') : null)

    if (currentRunId) {
      const cells = runTiles.map((tile, index) => {
        const entry = tileEntriesRef.current[index] ?? { image: null, detections: [], errored: true }
        const bounds = { south: tile.south, west: tile.west, north: tile.north, east: tile.east }
        return { bounds, image: entry.image, detections: entry.detections }
      })
      const detectionsCount = cells.reduce((sum, cell) => sum + cell.detections.length, 0)
      const { imagesDropped } = await updateAnalysisRun(currentRunId, { cells, detectionsCount })
      setStorageFull(imagesDropped)
      if (imagesDropped) addLog(t('log.storageFull'), 'error')
    }

    setAnalyzing(false)
  }

  const visibleDetections = detections.filter((d) => d.confidence >= threshold)
  const startCorner = draft.bounds
    ? { lat: draft.bounds.getSouth(), lng: draft.bounds.getWest() }
    : lastDrawnBounds
      ? { lat: lastDrawnBounds.getSouth(), lng: lastDrawnBounds.getWest() }
      : null
  const endCorner = draft.bounds
    ? { lat: draft.bounds.getNorth(), lng: draft.bounds.getEast() }
    : lastDrawnBounds
      ? { lat: lastDrawnBounds.getNorth(), lng: lastDrawnBounds.getEast() }
      : null
  const previewCount = draft.bounds ? draft.count : previewTiles.length
  const previewTooMany = previewTiles.length > MAX_CELLS
  const tileMeters = Math.round(tileSizeMeters(tileZoom, CYL_CENTER[0]))
  const displayCells = previewTiles.length ? previewTiles.map(tileLatLngBounds) : gridCells
  const displayStatuses = previewTiles.length ? previewTiles.map(() => ({ status: 'preview' })) : cellStatuses
  const failedCount = cellStatuses.filter((status) => status?.status === 'error').length

  return (
    <div className="map-shell">
      <SearchBar onSelect={setFlyToTarget} />

      <MapContainer
        center={CYL_CENTER}
        zoom={CYL_INITIAL_ZOOM}
        maxZoom={MAP_MAX_ZOOM}
        className="map-container"
        dragging={!drawingActive}
        zoomControl={false}
      >
        {basemap === 'pnoa' && (
          <WMSTileLayer
            url={PNOA_WMS_URL}
            layers="OI.OrthoimageCoverage"
            format="image/jpeg"
            transparent={false}
            attribution="PNOA / IGN, CC BY 4.0 scne.es"
            maxZoom={MAP_MAX_ZOOM}
          />
        )}
        {basemap !== 'pnoa' && (
          <TileLayer
            url={BASEMAP_TILES[basemap].url}
            attribution={BASEMAP_TILES[basemap].attribution}
            maxZoom={MAP_MAX_ZOOM}
            maxNativeZoom={BASEMAP_TILES[basemap].maxNativeZoom}
          />
        )}
        {showLabels && basemap !== 'osm' && (
          <TileLayer
            url={LABELS_TILE_URL}
            attribution="&copy; CARTO"
            maxZoom={MAP_MAX_ZOOM}
            maxNativeZoom={LABELS_MAX_NATIVE_ZOOM}
          />
        )}

        <MapController flyToTarget={flyToTarget} onZoomChange={setZoom} />
        <GridSelector
          active={drawingActive}
          onRectangleDrawn={handleRectangleDrawn}
          onDraftChange={setDraft}
          tileZoom={tileZoom}
        />
        <AnalysisGrid cells={displayCells} statuses={displayStatuses} />
        {visibleDetections.map((detection) => (
          <CircleMarker
            key={detection.id}
            center={[detection.latitude, detection.longitude]}
            radius={8}
            pathOptions={{
              color: SEVERITY_COLORS[detection.classification?.severity] ?? '#f9b115',
              fillOpacity: 0.7,
            }}
          >
            <Popup>
              <strong>{detection.classification?.label ?? detection.className ?? 'dump_site'}</strong>
              <br />
              Confianza: {Math.round(detection.confidence * 100)}%
              <br />
              {t('detections.coverage')}: {detection.landCoverType ?? t('detections.noCoverage')}
              {detection.nearestLegalFacility && (
                <>
                  <br />
                  {t('detections.nearestFacility', {
                    name: detection.nearestLegalFacility.name,
                    distance: Math.round(detection.nearestLegalFacility.distance_meters),
                  })}
                </>
              )}
              {detection.classification?.reason && (
                <>
                  <br />
                  <em>{detection.classification.reason}</em>
                </>
              )}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      <div className="map-zoom-pill glass-panel">
        {t('map.zoom')}: <strong>{zoom}</strong>
      </div>

      <LayersControl
        basemap={basemap}
        onBasemapChange={setBasemap}
        showLabels={showLabels}
        onShowLabelsChange={setShowLabels}
      />

      <div className="map-draw-fab">
        <div className="glass-panel map-tiles-panel">
          <div className="map-tiles-panel-title">
            {previewTiles.length ? t('map.panel.previewTitle') : t('map.panel.title')}
          </div>
          <div className="map-tiles-field">
            <span>{t('map.panel.start')}</span>
            <span>{formatCoordinate(startCorner) ?? t('map.panel.empty')}</span>
          </div>
          <div className="map-tiles-field">
            <span>{t('map.panel.end')}</span>
            <span>{formatCoordinate(endCorner) ?? t('map.panel.empty')}</span>
          </div>
          <div className="map-tiles-field">
            <span>{t('map.panel.tileZoom')}</span>
            <span className="map-tiles-stepper">
              <button
                type="button"
                disabled={tileZoom <= MIN_TILE_ZOOM || analyzing}
                onClick={() => changeTileZoom(-1)}
              >
                −
              </button>
              {tileZoom}
              <button
                type="button"
                disabled={tileZoom >= MAX_TILE_ZOOM || analyzing}
                onClick={() => changeTileZoom(1)}
              >
                +
              </button>
            </span>
          </div>
          <div className="map-tiles-field">
            <span>{t('map.panel.tiles')}</span>
            <span>
              {previewCount > 0 ? previewCount : gridCells.length || t('map.panel.empty')} · ~{tileMeters} m
            </span>
          </div>
          <div className="map-tiles-hint">
            {drawingActive
              ? t('map.panel.hintDragging')
              : previewTiles.length
                ? t('map.panel.previewHint', { count: previewTiles.length, zoom: tileZoom })
                : t('map.panel.hintIdle')}
          </div>

          {previewTiles.length > 0 && !analyzing && (
            <div className="map-tiles-actions">
              <button type="button" className="btn-preview-cancel" onClick={cancelPreview}>
                {t('map.cancelPreview')}
              </button>
              <button
                type="button"
                className="btn-preview-analyze"
                disabled={previewTooMany}
                onClick={startAnalysis}
              >
                {t('map.analyzeButton', { count: previewTiles.length })}
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          className={`map-draw-button${drawingActive ? ' active' : ''}`}
          onClick={() => {
            if (!drawingActive) cancelPreview()
            setDrawingActive((prev) => !prev)
          }}
        >
          <span className="dot" />
          {drawingActive ? t('map.drawCancel') : t('map.draw')}
        </button>
      </div>

      <div className={`map-results-drawer${drawerOpen ? ' open' : ''}`}>
        <button type="button" className="map-results-close" onClick={() => setDrawerOpen(false)}>
          &times;
        </button>
        <div className="mt-4">
          {errorMessage && (
            <CAlert color="danger" className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
              <span>{errorMessage}</span>
              {failedCount > 0 && !analyzing && (
                <button type="button" className="btn-retry-failed" onClick={retryFailedCells}>
                  {t('map.retryFailed', { count: failedCount })}
                </button>
              )}
            </CAlert>
          )}
          {storageFull && (
            <CAlert color="warning">
              <CIcon icon={cilStorage} className="me-2" />
              {t('map.storageFull')}
            </CAlert>
          )}
          {modelVersion && (
            <div className="map-engine-badge real">
              <CIcon icon={cilCheckCircle} size="sm" />{' '}
              {t('map.engineReal')}
            </div>
          )}
          {(analyzing || runTiles.length > 0) && (
            <div className="map-analysis-progress glass-panel">
              {analyzing && (
                <div className="map-analysis-progress-circle">
                  <CircularProgress
                    done={progress.done}
                    total={progress.total}
                    size={64}
                    strokeWidth={5}
                    label={`${progress.done}/${progress.total}`}
                  />
                  <span className="map-analysis-progress-caption">{t('map.progress')}</span>
                </div>
              )}
              {runTiles.length > 0 && <TileStrip tiles={runTiles} entries={tileEntries} />}
            </div>
          )}
          <InferenceLog entries={logEntries} />
          <DetectionPanel
            detections={detections}
            threshold={threshold}
            onThresholdChange={setThreshold}
          />
          {detections.length > 0 && (
            <p className="text-medium-emphasis small mt-3 mb-0">
              <CIcon icon={cilSatelite} size="sm" className="me-1" />
              {t('map.watermarkNote')}
            </p>
          )}
        </div>
      </div>

      {!drawerOpen && (analyzing || detections.length > 0) && (
        <button
          type="button"
          className="btn btn-outline-light position-absolute"
          style={{ top: 20, right: 20, zIndex: 1000 }}
          onClick={() => setDrawerOpen(true)}
        >
          {analyzing
            ? t('map.viewProgress', { done: progress.done, total: progress.total })
            : t('map.viewResults', { count: detections.length })}
        </button>
      )}
    </div>
  )
}
