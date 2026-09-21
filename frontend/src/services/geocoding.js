// Simple geocoding helpers for the map search bar: parsing raw
// "lat, lon" input directly, and looking up place names (municipios,
// pedanias...) via the free Nominatim (OpenStreetMap) API, restricted to
// a bounding box around Castilla y Leon so results stay relevant.

// Approximate bounding box of Castilla y Leon: west, north, east, south.
const CYL_VIEWBOX = '-7.6,43.25,-1.6,39.9'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse'

// Matches inputs like "41.65, -4.73" or "41.65 -4.73".
const COORDINATE_PATTERN = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/

export function parseCoordinates(query) {
  const match = query.match(COORDINATE_PATTERN)
  if (!match) return null

  const lat = Number(match[1])
  const lon = Number(match[2])
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null

  return { label: `${lat.toFixed(5)}, ${lon.toFixed(5)}`, lat, lon, isCoordinate: true }
}

// Looks up a place name (municipio, provincia...) via Nominatim, limited
// to results inside/near Castilla y Leon. Returns [] on any network error
// so the search bar can fail silently rather than crash the map.
export async function searchPlaces(query) {
  if (!query || query.trim().length < 3) return []

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    addressdetails: '1',
    limit: '6',
    viewbox: CYL_VIEWBOX,
    bounded: '0',
    countrycodes: 'es',
  })

  try {
    const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return []
    const results = await response.json()
    return results.map((item) => ({
      label: item.display_name,
      lat: Number(item.lat),
      lon: Number(item.lon),
      isCoordinate: false,
    }))
  } catch (error) {
    console.error('Error buscando lugar', error)
    return []
  }
}

// --- Reverse geocoding (coordinates -> street/municipality/province/community) ---
//
// Used by AnalysisPage.jsx to show where each analyzed cell actually is,
// not just its raw lat/lon. Nominatim's usage policy caps free/anonymous
// use at ~1 request/second and forbids bulk/parallel querying, and an
// analysis run can have up to 120 cells shown at once - so every call
// goes through a single serialized queue (throttledFetch below) instead
// of firing one request per cell in parallel, and results are cached
// (in-memory + localStorage, keyed by rounded coordinates) so re-expanding
// a run, or several cells that round to the same ~11m bucket, cost at
// most one real network request.

const REVERSE_CACHE_KEY = 'centinela_geocode_cache'
const MAX_CACHE_ENTRIES = 400
const MIN_REQUEST_GAP_MS = 1100

let reverseGeocodeCache = null
function loadReverseCache() {
  if (reverseGeocodeCache) return reverseGeocodeCache
  try {
    const raw = localStorage.getItem(REVERSE_CACHE_KEY)
    reverseGeocodeCache = raw ? JSON.parse(raw) : {}
  } catch (error) {
    reverseGeocodeCache = {}
  }
  return reverseGeocodeCache
}

function saveReverseCache(cache) {
  reverseGeocodeCache = cache
  try {
    const entries = Object.entries(cache)
    const trimmed =
      entries.length > MAX_CACHE_ENTRIES ? Object.fromEntries(entries.slice(entries.length - MAX_CACHE_ENTRIES)) : cache
    localStorage.setItem(REVERSE_CACHE_KEY, JSON.stringify(trimmed))
  } catch (error) {
    // Non-critical (quota full, private mode...): the in-memory cache
    // above still works for the rest of this page load, it just won't
    // persist across reloads.
  }
}

// ~11m precision (4 decimal degrees) - fine-grained enough to tell two
// tiles on different streets apart, coarse enough that neighboring cells
// in the same grid run usually share a lookup.
function reverseCacheKey(lat, lon) {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`
}

let requestChain = Promise.resolve()
let lastRequestAt = 0

function throttledFetch(url) {
  const runNow = async () => {
    const wait = Math.max(0, lastRequestAt + MIN_REQUEST_GAP_MS - Date.now())
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    lastRequestAt = Date.now()
    return fetch(url, { headers: { Accept: 'application/json' } })
  }
  const result = requestChain.then(runNow, runNow)
  // Keep chaining even if this particular call fails, so one bad request
  // doesn't permanently stall every reverse-geocode call after it.
  requestChain = result.catch(() => undefined)
  return result
}

const inFlightReverse = new Map()

// Returns { label, road, municipality, province, community, postcode } for
// a point, or null if it couldn't be resolved (offline, rate-limited,
// point outside any known address). Never throws.
export async function reverseGeocode(lat, lon) {
  const key = reverseCacheKey(lat, lon)
  const cache = loadReverseCache()
  if (key in cache) return cache[key]
  if (inFlightReverse.has(key)) return inFlightReverse.get(key)

  const promise = (async () => {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      format: 'json',
      addressdetails: '1',
      zoom: '16',
    })

    try {
      const response = await throttledFetch(`${NOMINATIM_REVERSE_URL}?${params.toString()}`)
      if (!response.ok) return null
      const data = await response.json()
      const address = data.address ?? {}
      const result = {
        label: data.display_name ?? null,
        road: address.road || address.pedestrian || address.footway || address.residential || null,
        municipality: address.town || address.city || address.village || address.municipality || address.hamlet || null,
        province: address.province || address.state_district || address.county || null,
        community: address.state || null,
        postcode: address.postcode || null,
      }
      const hasAnything = Object.values(result).some(Boolean)
      const finalResult = hasAnything ? result : null
      const nextCache = { ...loadReverseCache(), [key]: finalResult }
      saveReverseCache(nextCache)
      return finalResult
    } catch (error) {
      console.error('Error en geocodificacion inversa', error)
      return null
    }
  })()

  inFlightReverse.set(key, promise)
  try {
    return await promise
  } finally {
    inFlightReverse.delete(key)
  }
}
