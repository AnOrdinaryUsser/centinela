// Client-side store of full analysis runs (one drawn zone -> one or more
// grid cells, each with the PNOA image the model looked at and the
// detections found in it), kept in localStorage so each visitor keeps a
// private record without needing an account (see product spec: no login).
//
// The run's metadata (bounds, detections, classification) always lives in
// localStorage - but each cell's base64 JPEG thumbnail (~40-120KB) is
// offloaded to the backend's analysis_images table first (see
// 007_analysis_images.sql and analysisImagesController.js), and only the
// resulting numeric id is kept here. That's what removed the old MAX_RUNS
// cap this file used to enforce: the thing that actually filled up
// localStorage's few-MB-per-origin quota was the images, not the run
// metadata, so once images live in Postgres instead there's no longer a
// real reason to throw away old runs. The image upload can still fail
// (backend unreachable, e.g. offline demo) - when it does, the raw base64
// is kept embedded in the run exactly like before, so nothing is lost,
// just potentially quota-limited the old way for that one run.

import { uploadAnalysisImage, getAnalysisImageUrl } from './api.js'

const STORAGE_KEY = 'centinela_analysis_runs'

// Browsers don't expose an API to ask "how much localStorage do I actually
// have left" (navigator.storage.estimate() covers IndexedDB/caches, not
// localStorage specifically) - 5MB/origin is the conservative, long-
// standing de-facto minimum every major browser grants, so it's used here
// only to give an honest, rough "how full am I" reading, not an exact one.
const ESTIMATED_QUOTA_BYTES = 5 * 1024 * 1024

export function getAnalysisRuns() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (error) {
    console.error('Could not read analysis runs from localStorage', error)
    return []
  }
}

// How much of the estimated quota centinela_analysis_runs is actually
// using right now, so the UI can show it instead of the user having to
// dig through DevTools - see AnalysisPage.jsx.
export function getStorageUsage() {
  let usedBytes = 0
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) usedBytes = new Blob([raw]).size
  } catch (error) {
    console.error('Could not estimate localStorage usage', error)
  }
  return {
    usedBytes,
    estimatedQuotaBytes: ESTIMATED_QUOTA_BYTES,
    percent: Math.min(100, Math.round((usedBytes / ESTIMATED_QUOTA_BYTES) * 100)),
  }
}

// Returns a usable <img src> for a cell, whichever way its image is
// currently stored: freshly-embedded base64 (upload still pending/failed),
// or an id pointing at the backend (the normal case once offloading
// succeeds). null when the cell genuinely has no image (e.g. its analysis
// errored before a thumbnail came back).
export function getCellImageSrc(cell) {
  if (cell?.image) return `data:image/jpeg;base64,${cell.image}`
  if (cell?.imageId != null) return getAnalysisImageUrl(cell.imageId)
  return null
}

// Uploads every cell's base64 image to the backend and swaps it for the
// returned id, one cell at a time so a single slow/failed upload doesn't
// abort the rest. A cell that already has an imageId (e.g. re-saving after
// "Reintentar celdas fallidas" touched only some cells) is left alone -
// no point re-uploading an image that's already stored.
async function offloadImagesToServer(cells) {
  return Promise.all(
    cells.map(async (cell) => {
      if (!cell.image || cell.imageId != null) return cell
      try {
        const imageId = await uploadAnalysisImage(cell.image)
        return { ...cell, image: null, imageId }
      } catch (error) {
        console.error('Could not upload cell image to the backend, keeping it embedded locally', error)
        return cell
      }
    }),
  )
}

// Writes `buildList(entry)` (given the full-fidelity entry) to
// localStorage; if that's refused (quota/QuotaExceededError - almost
// always because of a base64 image that couldn't be offloaded above),
// retries with the SAME entry but any remaining embedded images stripped
// out, saving everything else (bounds, detections, classification) rather
// than losing the run entirely. Either way the caller finds out via
// `imagesDropped`.
function persistWithFallback(runs, entry, buildList) {
  const updated = buildList(entry)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    return { runs: updated, imagesDropped: false }
  } catch (error) {
    console.error('Could not persist analysis run (localStorage full?), retrying without embedded images', error)
    try {
      const lightEntry = { ...entry, cells: entry.cells.map((cell) => ({ ...cell, image: null })) }
      const lightUpdated = buildList(lightEntry)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lightUpdated))
      return { runs: lightUpdated, imagesDropped: true }
    } catch (innerError) {
      console.error('Could not persist analysis run at all (localStorage full)', innerError)
      return { runs, imagesDropped: true }
    }
  }
}

// run: { boundsSummary, zoom, cellCount, areaSquareMeters, cells: [{ bounds, image, detections }] }
// Returns { runs, imagesDropped }: imagesDropped is true when a cell image
// couldn't be offloaded to the backend AND localStorage was too full to
// keep it embedded either (or couldn't save the run at all) - see
// getStorageUsage() above for how the UI shows this before it becomes a
// problem. Now async (it awaits the image uploads) - callers need `await`.
export async function addAnalysisRun(run) {
  const cells = await offloadImagesToServer(run.cells)
  const runs = getAnalysisRuns()
  const entry = {
    id: `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    analyzedAt: new Date().toISOString(),
    detectionsCount: cells.reduce((sum, cell) => sum + cell.detections.length, 0),
    ...run,
    cells,
  }
  return persistWithFallback(runs, entry, (e) => [e, ...runs])
}

// Overwrites a previously saved run's cells in place, keeping its original
// position in the history (used after "Reintentar celdas fallidas" fixes
// up cells that failed the first time - see MapPage.jsx retryFailedCells -
// so the saved history reflects the corrected result instead of keeping
// the original errors forever). Silently does nothing (imagesDropped:
// false) if the run is no longer in history. Same { runs, imagesDropped }
// shape as addAnalysisRun, and also async now.
export async function updateAnalysisRun(runId, patch) {
  const runs = getAnalysisRuns()
  const index = runs.findIndex((run) => run.id === runId)
  if (index === -1) return { runs, imagesDropped: false }

  const cells = patch.cells ? await offloadImagesToServer(patch.cells) : undefined
  const entry = { ...runs[index], ...patch, ...(cells ? { cells } : {}) }
  return persistWithFallback(runs, entry, (e) => {
    const updated = [...runs]
    updated[index] = e
    return updated
  })
}

export function clearAnalysisRuns() {
  localStorage.removeItem(STORAGE_KEY)
}
