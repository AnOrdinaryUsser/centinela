import { useRef, useState } from 'react'
import { Rectangle, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { estimateTileCount } from '../services/tileMath.js'

// Lets the user draw a rectangle on the map by click-drag while `active` is
// true — same interaction as MapTilesDownloader's rectangle tool. While
// dragging, reports a live tile-count estimate via onDraftChange (using
// the real XYZ tile grid at `tileZoom`, see services/tileMath.js) so the
// UI can show "se analizaran N tiles" before the user even lets go. On
// mouse release it does NOT start analysis itself — it only hands the
// finished rectangle to the parent via onRectangleDrawn, which computes
// the tile grid and shows it as a preview (exactly like MapTilesDownloader's
// "Preview Grid" step) before the user explicitly starts the analysis.
export default function GridSelector({ active, onRectangleDrawn, onDraftChange, tileZoom }) {
  const [draftBounds, setDraftBounds] = useState(null)
  const startPointRef = useRef(null)

  const map = useMapEvents({
    mousedown(event) {
      if (!active) return
      startPointRef.current = event.latlng
      setDraftBounds(L.latLngBounds(event.latlng, event.latlng))
      map.dragging.disable()
    },
    mousemove(event) {
      if (!active || !startPointRef.current) return
      const bounds = L.latLngBounds(startPointRef.current, event.latlng)
      setDraftBounds(bounds)
      if (onDraftChange) {
        onDraftChange({ count: estimateTileCount(bounds, tileZoom), bounds })
      }
    },
    mouseup() {
      if (!active || !startPointRef.current) return
      const finishedBounds = draftBounds
      startPointRef.current = null
      setDraftBounds(null)
      map.dragging.enable()
      if (onDraftChange) onDraftChange({ count: 0, bounds: null })

      if (finishedBounds && finishedBounds.isValid()) {
        onRectangleDrawn(finishedBounds)
      }
    },
  })

  return draftBounds ? (
    <Rectangle bounds={draftBounds} pathOptions={{ color: '#f9b115', weight: 2, dashArray: '4' }} />
  ) : null
}
