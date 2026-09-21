import { useState } from 'react'
import { CModal, CModalHeader, CModalTitle, CModalBody, CBadge } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilImage } from '@coreui/icons'
import { useI18n } from '../i18n/I18nContext.jsx'
import { getCellImageSrc } from '../services/analyses.js'

// Horizontal strip of thumbnails, one per tile of the current/last run, in
// the same left-to-right/grid order as the map — the same idea as
// MapTilesDownloader's ".tile-strip" (main.js: showTinyTile shows each
// downloaded tile's image as it arrives), but every tile is kept (not
// just the last four) and, importantly, tiles that FAILED to analyze are
// shown too (with a red "!" mark) instead of silently vanishing - that
// silent disappearance was the bug: a cell whose request errored out
// never got a thumbnail before, so it looked like it was never saved.
//
// `tiles` and `entries` are parallel arrays (same index = same cell):
// tiles[i] is the tile descriptor (x, y, z), entries[i] is
// `{ image, detections, errored } | null` (null while still
// pending/analyzing - not shown yet).
export default function TileStrip({ tiles, entries }) {
  const { t } = useI18n()
  const [openIndex, setOpenIndex] = useState(null)

  const items = tiles
    .map((tile, index) => ({ index, tile, entry: entries[index] }))
    .filter((item) => item.entry != null)

  if (!items.length) return null

  const openItem = openIndex != null ? { tile: tiles[openIndex], entry: entries[openIndex] } : null

  return (
    <>
      <div className="tile-strip glass-panel">
        <div className="tile-strip-title">
          <CIcon icon={cilImage} size="sm" className="me-1" />
          {t('map.strip.title')} ({items.length}/{tiles.length})
        </div>
        <div className="tile-strip-row">
          {items.map(({ index, tile, entry }) => (
            <button
              key={index}
              type="button"
              className={`tile-strip-item${entry.errored ? ' has-error' : entry.detections.length > 0 ? ' has-alert' : ''}`}
              onClick={() => setOpenIndex(index)}
              title={`x${tile.x}, y${tile.y}, z${tile.z}`}
            >
              {getCellImageSrc(entry) ? (
                <img src={getCellImageSrc(entry)} alt="" />
              ) : (
                <span className="tile-strip-placeholder" />
              )}
              {entry.errored ? (
                <span className="tile-strip-badge tile-strip-badge-error">!</span>
              ) : (
                entry.detections.length > 0 && <span className="tile-strip-badge">{entry.detections.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <CModal visible={!!openItem} onClose={() => setOpenIndex(null)} size="lg" alignment="center">
        {openItem && (
          <>
            <CModalHeader>
              <CModalTitle>
                {t('map.tile.title', { x: openItem.tile.x, y: openItem.tile.y, z: openItem.tile.z })}
              </CModalTitle>
            </CModalHeader>
            <CModalBody>
              {openItem.entry.errored ? (
                <p className="text-medium-emphasis mb-0">{t('map.tile.errored')}</p>
              ) : (
                <>
                  {getCellImageSrc(openItem.entry) ? (
                    <img
                      src={getCellImageSrc(openItem.entry)}
                      alt=""
                      className="tile-modal-image"
                    />
                  ) : (
                    <p className="text-medium-emphasis">{t('map.tile.noImage')}</p>
                  )}
                  <div className="mt-3">
                    {openItem.entry.detections.length > 0 ? (
                      <>
                        <CBadge color="danger" className="mb-2">
                          {t('map.tile.detectionsCount', { count: openItem.entry.detections.length })}
                        </CBadge>
                        <ul className="list-unstyled small mb-0">
                          {openItem.entry.detections.map((detection) => (
                            <li key={detection.id} className="mb-2">
                              <strong>
                                {detection.classification?.label ?? detection.className ?? 'dump_site'}
                              </strong>
                              {' · '}
                              {Math.round(detection.confidence * 100)}%
                              {detection.classification?.reason && (
                                <>
                                  <br />
                                  <em className="text-medium-emphasis">{detection.classification.reason}</em>
                                </>
                              )}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <p className="text-medium-emphasis mb-0">{t('map.tile.noDetections')}</p>
                    )}
                  </div>
                </>
              )}
            </CModalBody>
          </>
        )}
      </CModal>
    </>
  )
}
