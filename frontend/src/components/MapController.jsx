import { useEffect } from 'react'
import { useMap, useMapEvents } from 'react-leaflet'

// Bridges imperative Leaflet map state with the rest of the React tree:
// flies to a place picked in SearchBar, and reports zoom changes upward
// so the floating draw control can show "nivel de zoom actual".
export default function MapController({ flyToTarget, onZoomChange }) {
  const map = useMap()

  useEffect(() => {
    if (!flyToTarget) return
    const targetZoom = flyToTarget.isCoordinate ? 15 : 13
    map.flyTo([flyToTarget.lat, flyToTarget.lon], targetZoom, { duration: 1.4 })
  }, [flyToTarget, map])

  useMapEvents({
    zoomend() {
      onZoomChange(map.getZoom())
    },
  })

  return null
}
