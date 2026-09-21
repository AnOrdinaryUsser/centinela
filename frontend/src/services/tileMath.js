// Standard "slippy map" tile math — the exact same formulas used by
// AliFlux/MapTilesDownloader (src/UI/main.js: long2tile/lat2tile/tile2long/
// tile2lat) and by every XYZ tile server (OSM, Bing, Google, ...). Given a
// zoom level, the whole world is divided into 2^zoom × 2^zoom square tiles
// in Web Mercator projection; this file finds which tiles a drawn
// rectangle covers and the exact lat/lon bounds of each one, so our grid
// is snapped to a real, well-defined tile size instead of an arbitrary
// degrees-based approximation.
//
// This is what "un tamaño concreto" means here: at a given zoom, every
// tile has the same size in meters (varying only with latitude, same as
// any XYZ tile scheme) - see tileSizeMeters below.

export function lon2tile(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom)
}

export function lat2tile(lat, zoom) {
  const latRad = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** zoom)
}

export function tile2lon(x, zoom) {
  return (x / 2 ** zoom) * 360 - 180
}

export function tile2lat(y, zoom) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** zoom
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}

// Exact lat/lon bounds of tile (x, y) at `zoom`. In XYZ tile schemes y
// grows southward, so (x, y) is the tile's north-west corner and
// (x + 1, y + 1) is its south-east corner.
export function tileBounds(x, y, zoom) {
  return {
    north: tile2lat(y, zoom),
    south: tile2lat(y + 1, zoom),
    west: tile2lon(x, zoom),
    east: tile2lon(x + 1, zoom),
  }
}

// Approximate ground size (meters, roughly square) of a tile at `zoom` and
// `atLatitude` - same formula MapTilesDownloader-style tools use to explain
// tile size to the user (Web Mercator tile size shrinks by cos(latitude)).
export function tileSizeMeters(zoom, atLatitude) {
  const earthCircumference = 40075016.686
  return (earthCircumference * Math.cos((atLatitude * Math.PI) / 180)) / 2 ** zoom
}

// Every XYZ tile that intersects `bounds` (a Leaflet LatLngBounds) at
// `zoom`, as { x, y, z, north, south, east, west }. Since our drawing tool
// only produces rectangles (not arbitrary polygons), a simple tile-range
// enumeration over the bounding box is exactly equivalent to
// MapTilesDownloader's turf.booleanDisjoint intersection test against the
// drawn shape.
export function tilesForBounds(bounds, zoom) {
  const north = bounds.getNorth()
  const south = bounds.getSouth()
  const west = bounds.getWest()
  const east = bounds.getEast()

  const minX = lon2tile(west, zoom)
  const maxX = lon2tile(east, zoom)
  const minY = lat2tile(north, zoom)
  const maxY = lat2tile(south, zoom)

  const tiles = []
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      tiles.push({ x, y, z: zoom, ...tileBounds(x, y, zoom) })
    }
  }
  return tiles
}

// Cheap count-only version of tilesForBounds, for live estimates while
// dragging (no need to materialize every tile on every mousemove).
export function estimateTileCount(bounds, zoom) {
  const minX = lon2tile(bounds.getWest(), zoom)
  const maxX = lon2tile(bounds.getEast(), zoom)
  const minY = lat2tile(bounds.getNorth(), zoom)
  const maxY = lat2tile(bounds.getSouth(), zoom)
  return Math.max(0, maxX - minX + 1) * Math.max(0, maxY - minY + 1)
}
