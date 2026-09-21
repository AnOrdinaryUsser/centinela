import { useEffect, useState } from 'react'
import { CBadge, CButton } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilLocationPin } from '@coreui/icons'
import { getAnalysisRuns, clearAnalysisRuns, getCellImageSrc } from '../services/analyses.js'
import { reverseGeocode } from '../services/geocoding.js'
import { useI18n } from '../i18n/I18nContext.jsx'
import { DetectionTooltipContent } from '../components/DetectionPanel.jsx'

// Center point of a saved cell's bounds ({ south, west, north, east }, see
// MapPage.jsx: analyzeOneTile) - what gets shown as the cell's coordinates
// and what reverse geocoding is queried for.
function cellCenter(bounds) {
  return {
    lat: (bounds.north + bounds.south) / 2,
    lon: (bounds.east + bounds.west) / 2,
  }
}

const SEVERITY_BADGE_COLOR = {
  critical: 'danger',
  warning: 'warning',
  info: 'secondary',
}

function formatDate(iso, lang) {
  return new Date(iso).toLocaleString(lang, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// "Analisis" tab: every zone the visitor has analyzed this browser
// (localStorage, see services/analyses.js), each expandable into the
// individual grid cells: the exact (watermarked) image sent to the model,
// what it found, and the open-data context used to decide legal vs ilegal.
export default function AnalysisPage() {
  const { t, lang } = useI18n()
  const [runs, setRuns] = useState([])
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    setRuns(getAnalysisRuns())
  }, [])

  function handleClear() {
    clearAnalysisRuns()
    setRuns([])
  }

  return (
    <div>
      <div className="page-heading d-flex justify-content-between align-items-end flex-wrap gap-3">
        <div>
          <div className="page-heading-eyebrow">{t('analysis.eyebrow')}</div>
          <h1>{t('analysis.title')}</h1>
          <p>{t('analysis.description')}</p>
        </div>
        {runs.length > 0 && (
          <CButton color="outline-light" size="sm" onClick={handleClear}>
            {t('analysis.clear')}
          </CButton>
        )}
      </div>

      <div className="px-4 pb-5">
        {runs.length === 0 && (
          <div className="analysis-empty glass-panel">
            <p className="mb-2">{t('analysis.emptyTitle')}</p>
            <p className="text-medium-emphasis small mb-0">{t('analysis.emptyHint')}</p>
          </div>
        )}

        {runs.map((run) => (
          <AnalysisRunCard
            key={run.id}
            run={run}
            lang={lang}
            expanded={expandedId === run.id}
            onToggle={() => setExpandedId(expandedId === run.id ? null : run.id)}
          />
        ))}
      </div>
    </div>
  )
}

function AnalysisRunCard({ run, lang, expanded, onToggle }) {
  const { t } = useI18n()
  const areaHectares = (run.areaSquareMeters / 10000).toFixed(1)
  const hasIllegal = run.cells.some((cell) =>
    cell.detections.some((d) => d.classification?.status?.startsWith('illegal')),
  )

  return (
    <div className="glass-panel analysis-run-card">
      <div className="analysis-run-header" onClick={onToggle}>
        <div>
          <div className="analysis-run-title">{t('analysis.runTitle', { count: run.cellCount })}</div>
          <div className="analysis-run-meta">
            {t('analysis.runMeta', { date: formatDate(run.analyzedAt, lang), hectares: areaHectares, zoom: run.zoom })}
          </div>
        </div>
        <div className="analysis-run-stats">
          <CBadge color={hasIllegal ? 'danger' : 'success'}>
            {t('analysis.detectionsBadge', { count: run.detectionsCount })}
          </CBadge>
          <span className="text-medium-emphasis">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div className="analysis-run-body">
          {run.cells.map((cell, index) => (
            <CellCard key={index} cell={cell} index={index} />
          ))}
        </div>
      )}
    </div>
  )
}

function CellCard({ cell, index }) {
  const { t } = useI18n()
  const center = cellCenter(cell.bounds)
  const [location, setLocation] = useState(null)
  const [locating, setLocating] = useState(true)

  // Reverse-geocoded lazily per card (only while its run is expanded and
  // this card is actually mounted) rather than for every cell in every
  // saved run up front - see services/geocoding.js for the shared
  // throttling/cache that keeps this polite to Nominatim's free API.
  useEffect(() => {
    let cancelled = false
    setLocating(true)
    reverseGeocode(center.lat, center.lon).then((result) => {
      if (!cancelled) {
        setLocation(result)
        setLocating(false)
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lon])

  const locationLine = location ? [location.road, location.municipality, location.province].filter(Boolean).join(', ') : null

  return (
    <div className="cell-card">
      {getCellImageSrc(cell) ? (
        <img
          className="cell-card-image"
          src={getCellImageSrc(cell)}
          alt={`${t('analysis.cellLabel', { index: index + 1 })}`}
        />
      ) : (
        <div className="cell-card-image d-flex align-items-center justify-content-center text-medium-emphasis small">
          {t('analysis.noImage')}
        </div>
      )}
      <div className="cell-card-body">
        <div className="text-medium-emphasis small mb-1">{t('analysis.cellLabel', { index: index + 1 })}</div>

        <div className="cell-card-location">
          <div className="cell-card-coords">
            <CIcon icon={cilLocationPin} size="sm" />
            {center.lat.toFixed(5)}, {center.lon.toFixed(5)}
          </div>
          {locating && <div className="cell-card-location-text text-medium-emphasis">{t('analysis.locating')}</div>}
          {!locating && locationLine && <div className="cell-card-location-text">{locationLine}</div>}
          {!locating && !locationLine && (
            <div className="cell-card-location-text text-medium-emphasis">{t('analysis.locationUnknown')}</div>
          )}
          {!locating && location?.community && <span className="cell-card-community">{location.community}</span>}
        </div>

        {cell.detections.length === 0 && <div className="cell-card-empty">{t('analysis.noDetections')}</div>}
        {cell.detections.map((detection, dIndex) => (
          <div key={dIndex} className="cell-detection-row">
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <CBadge color={SEVERITY_BADGE_COLOR[detection.classification?.severity] ?? 'warning'}>
                {Math.round(detection.confidence * 100)}%
              </CBadge>
              <strong>{detection.classification?.label ?? detection.className}</strong>
            </div>
            {/* Mismo contenido que el tooltip (ⓘ) de la sección de detecciones
                en el mapa - cubierta, hidrografía cercana, posible peligro y
                la instalación de gestión más cercana - para que no haya que
                pasar el ratón por encima para verlo aquí. */}
            <div className="cell-detection-reason">
              <DetectionTooltipContent detection={detection} t={t} />
              {detection.protectedArea && <div>{t('analysis.protectedArea')}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
