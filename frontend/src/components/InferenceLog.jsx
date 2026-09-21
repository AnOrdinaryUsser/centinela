import { useEffect, useRef } from 'react'
import CIcon from '@coreui/icons-react'
import { cilTerminal } from '@coreui/icons'
import { useI18n } from '../i18n/I18nContext.jsx'

const LEVEL_COLOR = {
  info: 'var(--text-muted)',
  clean: 'var(--accent)',
  alert: '#ff5d6c',
  error: '#ff5d6c',
  done: 'var(--text)',
}

// Small scrolling "console" of what's actually happening on each analyzed
// cell (PNOA fetch -> model inference -> open-data cross-check), so the
// process isn't a black box: this is what backs the "no me fio" concern —
// every line here reflects a real backend/model-service response, nothing
// is simulated client-side.
export default function InferenceLog({ entries }) {
  const { t } = useI18n()
  const listRef = useRef(null)

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [entries])

  if (entries.length === 0) return null

  return (
    <div className="inference-log glass-panel">
      <div className="inference-log-header">
        <span>
          <CIcon icon={cilTerminal} size="sm" className="me-1" />
          {t('log.panelTitle')}
        </span>
        <span className="inference-log-terminal-tag">
          <span className="inference-log-terminal-dot" />
          {t('log.terminalTag')}
        </span>
      </div>
      <div className="inference-log-body" ref={listRef}>
        {entries.map((entry) => (
          <div key={entry.id} className="inference-log-line" style={{ color: LEVEL_COLOR[entry.level] ?? LEVEL_COLOR.info }}>
            {entry.text}
          </div>
        ))}
      </div>
    </div>
  )
}
