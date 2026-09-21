import { useEffect, useRef, useState } from 'react'
import CIcon from '@coreui/icons-react'
import { cilSearch, cilLocationPin } from '@coreui/icons'
import { parseCoordinates, searchPlaces } from '../services/geocoding.js'
import { useI18n } from '../i18n/I18nContext.jsx'

const DEBOUNCE_MS = 400

// Floating search box over the map: type coordinates ("41.65, -4.73") or a
// place name (municipio, provincia...) and jump the map there, the same
// way Google Maps' search box works. onSelect receives {lat, lon, label}.
export default function SearchBar({ onSelect }) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    const coordinateMatch = parseCoordinates(query)
    if (coordinateMatch) {
      setResults([coordinateMatch])
      setOpen(true)
      setLoading(false)
      return undefined
    }

    if (query.trim().length < 3) {
      setResults([])
      setOpen(false)
      return undefined
    }

    setLoading(true)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const places = await searchPlaces(query)
      setResults(places)
      setOpen(true)
      setLoading(false)
    }, DEBOUNCE_MS)

    return () => clearTimeout(debounceRef.current)
  }, [query])

  function handleSelect(place) {
    onSelect(place)
    setQuery(place.label)
    setOpen(false)
  }

  return (
    <div className="map-search-bar">
      <div className="glass-panel map-search-input-wrap">
        <CIcon icon={cilSearch} size="sm" aria-hidden="true" />
        <input
          type="text"
          value={query}
          placeholder={t('search.placeholder')}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {loading && <span className="text-medium-emphasis small">...</span>}
      </div>
      {open && results.length > 0 && (
        <div className="glass-panel map-search-results">
          {results.map((place, index) => (
            <div key={index} className="map-search-result" onClick={() => handleSelect(place)}>
              {place.isCoordinate ? (
                <>
                  <CIcon icon={cilLocationPin} size="sm" className="me-1" />
                  <strong>{t('search.coordinates')}</strong> — {place.label}
                </>
              ) : (
                place.label
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
