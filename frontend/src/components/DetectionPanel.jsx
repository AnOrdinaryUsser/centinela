import { CCard, CCardBody, CCardHeader, CBadge, CFormRange, CFormLabel, CTooltip } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilInfo } from '@coreui/icons'
import { useI18n } from '../i18n/I18nContext.jsx'

// Maps a classification severity (see backend/src/services/classificationService.js)
// to a CoreUI badge color.
const SEVERITY_BADGE_COLOR = {
  critical: 'danger',
  warning: 'warning',
  info: 'secondary',
}

// Shows the list of AI detections for the currently analyzed cell(s), their
// confidence score, their legal/illegal classification, and a slider to
// filter by minimum confidence. PURELY a client-side display filter now:
// every analysis run always asks the model for everything from 50% up
// (see MapPage.jsx: ANALYSIS_CONFIDENCE_FLOOR), so this slider just
// shows/hides detections already in hand - no re-fetch, no re-running
// "Analizar" needed, moving it does something immediately every time. Its
// range (50%-99%) matches that floor at the low end, since there is
// nothing fetched below it to reveal.
// Tooltip content for one detection's info icon - the "cubierta, que
// hidrografía hay cercana, si hay detectado un vertedero potencialmente
// peligroso, y cuál es la instalación de gestión más cercana registrada"
// asked for, all in one place instead of scattered across the inline
// summary line below (which stays, for the two facts worth always seeing
// without hovering: coverage and nearest facility).
export function DetectionTooltipContent({ detection, t }) {
  const water = detection.nearestWaterBody
  const facility = detection.nearestLegalFacility
  const classification = detection.classification

  return (
    <div className="detection-tooltip">
      <div>
        <strong>{t('detections.coverage')}:</strong> {detection.landCoverType ?? t('detections.noCoverage')}
      </div>
      <div>
        <strong>{t('detections.tooltipWaterLabel')}:</strong>{' '}
        {water
          ? t('detections.tooltipWaterValue', { name: water.name ?? t('detections.tooltipWaterUnnamed'), distance: Math.round(water.distance_meters) })
          : t('detections.tooltipWaterNone')}
      </div>
      <div>
        <strong>{t('detections.tooltipFacilityLabel')}:</strong>{' '}
        {facility
          ? t('detections.tooltipFacilityValue', { name: facility.name, distance: Math.round(facility.distance_meters) })
          : t('detections.tooltipFacilityNone')}
      </div>
      {classification?.reason && (
        <div className="detection-tooltip-danger">
          <strong>{classification.label ?? t('detections.tooltipDangerLabel')}:</strong> {classification.reason}
        </div>
      )}
    </div>
  )
}

export default function DetectionPanel({ detections = [], threshold, onThresholdChange }) {
  const { t } = useI18n()
  const visibleDetections = detections.filter((d) => d.confidence >= threshold)

  return (
    <CCard>
      <CCardHeader>{t('detections.title', { count: visibleDetections.length })}</CCardHeader>
      <CCardBody>
        <CFormLabel htmlFor="thresholdRange">
          {t('detections.threshold', { value: Math.round(threshold * 100) })}
        </CFormLabel>
        <CFormRange
          id="thresholdRange"
          min={0.5}
          max={0.99}
          step={0.01}
          value={threshold}
          onChange={(event) => onThresholdChange(Number(event.target.value))}
        />

        <ul className="list-unstyled mt-3">
          {visibleDetections.map((detection) => (
            <li key={detection.id} className="mb-3">
              <div className="d-flex align-items-center gap-2">
                <CBadge color={SEVERITY_BADGE_COLOR[detection.classification?.severity] ?? 'warning'}>
                  {Math.round(detection.confidence * 100)}%
                </CBadge>
                <strong>{detection.classification?.label ?? detection.className ?? 'dump_site'}</strong>
                <CTooltip content={<DetectionTooltipContent detection={detection} t={t} />} placement="top">
                  <span className="detection-info-icon" role="button" tabIndex={0} aria-label={t('detections.tooltipTitle')}>
                    <CIcon icon={cilInfo} size="sm" />
                  </span>
                </CTooltip>
              </div>
              <div className="text-medium-emphasis small">
                {t('detections.coverage')}: {detection.landCoverType ?? t('detections.noCoverage')}
                {detection.nearestLegalFacility && (
                  <>
                    {' · '}
                    {t('detections.nearestFacility', {
                      name: detection.nearestLegalFacility.name,
                      distance: Math.round(detection.nearestLegalFacility.distance_meters),
                    })}
                  </>
                )}
              </div>
            </li>
          ))}
          {visibleDetections.length === 0 && (
            <li className="text-medium-emphasis">{t('detections.empty')}</li>
          )}
        </ul>
      </CCardBody>
    </CCard>
  )
}
