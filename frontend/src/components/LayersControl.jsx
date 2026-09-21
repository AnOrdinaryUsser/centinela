import { useState } from 'react'
import CIcon from '@coreui/icons-react'
import { cilLayers } from '@coreui/icons'
import { useI18n } from '../i18n/I18nContext.jsx'

export const BASEMAPS = {
  pnoa: { id: 'pnoa' },
  osm: { id: 'osm' },
  topo: { id: 'topo' },
}

// Floating bottom button that opens a small popover to switch the map's
// base layer (PNOA orthophoto / OSM street map / topographic) and toggle
// a place-names overlay on top of imagery basemaps.
export default function LayersControl({ basemap, onBasemapChange, showLabels, onShowLabelsChange }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)

  const options = [
    { id: 'pnoa', label: t('layers.pnoa') },
    { id: 'osm', label: t('layers.osm') },
    { id: 'topo', label: t('layers.topo') },
  ]

  return (
    <div className="map-layers-control">
      {open && (
        <div className="glass-panel map-layers-popover">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`map-layers-option${basemap === option.id ? ' active' : ''}`}
              onClick={() => onBasemapChange(option.id)}
            >
              {option.label}
            </button>
          ))}
          <label className="map-layers-checkbox">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(event) => onShowLabelsChange(event.target.checked)}
              disabled={basemap === 'osm'}
            />
            {t('layers.labels')}
          </label>
        </div>
      )}
      <button
        type="button"
        className={`glass-panel map-layers-button${open ? ' active' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <CIcon icon={cilLayers} size="sm" className="me-1" />
        {t('layers.button')}
      </button>
    </div>
  )
}
