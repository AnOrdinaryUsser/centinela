import { useEffect, useMemo, useState } from 'react'
import { CWidgetStatsA } from '@coreui/react'
import { CChartBar, CChartDoughnut, CChartLine } from '@coreui/react-chartjs'
import { getGlobalStats } from '../services/api.js'
import { getAnalysisRuns } from '../services/analyses.js'
import { useI18n } from '../i18n/I18nContext.jsx'

const CHART_GRID_COLOR = 'rgba(120,130,150,0.18)'
const CHART_TICK_COLOR = '#8b97ac'

const baseScales = {
  x: { grid: { color: CHART_GRID_COLOR }, ticks: { color: CHART_TICK_COLOR } },
  y: { grid: { color: CHART_GRID_COLOR }, ticks: { color: CHART_TICK_COLOR }, beginAtZero: true },
}

// "Datos" tab: platform-wide statistics from the backend (anonymous,
// aggregated) plus this visitor's own local activity, laid out with
// CoreUI's stat widgets and Chart.js charts.
export default function DashboardPage() {
  const { t } = useI18n()
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)
  const [runs, setRuns] = useState([])

  useEffect(() => {
    getGlobalStats()
      .then(setStats)
      .catch((err) => {
        console.error('Error loading global stats', err)
        setError(t('stats.error'))
      })
    setRuns(getAnalysisRuns())
  }, [t])

  const severityCounts = useMemo(() => {
    const counts = { critical: 0, warning: 0, info: 0 }
    runs.forEach((run) =>
      run.cells.forEach((cell) =>
        cell.detections.forEach((detection) => {
          const severity = detection.classification?.severity ?? 'warning'
          counts[severity] = (counts[severity] ?? 0) + 1
        }),
      ),
    )
    return counts
  }, [runs])

  const activityByRun = useMemo(() => [...runs].reverse(), [runs])

  return (
    <div>
      <div className="page-heading">
        <div className="page-heading-eyebrow">{t('stats.eyebrow')}</div>
        <h1>{t('stats.title')}</h1>
        <p>{t('stats.description')}</p>
      </div>

      <div className="px-4 pb-5">
        {error && <div className="text-danger mb-3">{error}</div>}

        <div className="widget-row">
          <CWidgetStatsA
            className="stat-widget"
            color="success"
            value={stats ? `${stats.totalAreaSquareKm} km²` : '...'}
            title={t('stats.area')}
          />
          <CWidgetStatsA
            className="stat-widget"
            color="danger"
            value={stats ? stats.totalDetections : '...'}
            title={t('stats.globalDetections')}
          />
          <CWidgetStatsA
            className="stat-widget"
            color="info"
            value={stats ? stats.totalCellsAnalyzed : '...'}
            title={t('stats.globalCells')}
          />
          <CWidgetStatsA className="stat-widget" color="warning" value={runs.length} title={t('stats.yourRuns')} />
        </div>

        <div className="row g-3">
          <div className="col-lg-8">
            <div className="glass-panel chart-card">
              <h3>{t('stats.activityTitle')}</h3>
              <p>{t('stats.activityDescription')}</p>
              {activityByRun.length > 0 ? (
                <CChartLine
                  style={{ height: 260 }}
                  data={{
                    labels: activityByRun.map((run, i) => `#${i + 1}`),
                    datasets: [
                      {
                        label: t('stats.detectionsLabel'),
                        data: activityByRun.map((run) => run.detectionsCount),
                        borderColor: '#22e3ac',
                        backgroundColor: 'rgba(34, 227, 172, 0.18)',
                        tension: 0.35,
                        fill: true,
                        pointBackgroundColor: '#22e3ac',
                      },
                    ],
                  }}
                  options={{
                    plugins: { legend: { display: false } },
                    scales: baseScales,
                  }}
                />
              ) : (
                <EmptyChartHint />
              )}
            </div>
          </div>

          <div className="col-lg-4">
            <div className="glass-panel chart-card">
              <h3>{t('stats.severityTitle')}</h3>
              <p>{t('stats.severityDescription')}</p>
              {runs.length > 0 ? (
                <CChartDoughnut
                  style={{ height: 220 }}
                  data={{
                    labels: [t('stats.severityCritical'), t('stats.severityWarning'), t('stats.severityInfo')],
                    datasets: [
                      {
                        // No borderColor/borderWidth here on purpose: a
                        // fixed dark color (used to be '#101828') only
                        // looked right on the old dark-only theme - on the
                        // light theme (now the default, see ThemeContext)
                        // it drew a heavy near-black outline around every
                        // slice and the ring's edges, which is the "se ve
                        // raro" reported. borderWidth: 0 removes it
                        // entirely instead of trying to theme-match a color.
                        data: [severityCounts.critical, severityCounts.warning, severityCounts.info],
                        backgroundColor: ['#ff5d6c', '#f9b115', '#8a93a2'],
                        borderWidth: 0,
                      },
                    ],
                  }}
                  options={{
                    plugins: { legend: { position: 'bottom', labels: { color: CHART_TICK_COLOR, boxWidth: 12 } } },
                  }}
                />
              ) : (
                <EmptyChartHint />
              )}
            </div>
          </div>
        </div>

        <div className="glass-panel chart-card">
          <h3>{t('stats.tilesTitle')}</h3>
          <p>{t('stats.tilesDescription')}</p>
          {activityByRun.length > 0 ? (
            <CChartBar
              style={{ height: 220 }}
              data={{
                labels: activityByRun.map((run, i) => `#${i + 1}`),
                datasets: [
                  {
                    label: t('map.panel.tiles'),
                    data: activityByRun.map((run) => run.cellCount),
                    backgroundColor: '#4c8dff',
                    borderRadius: 6,
                  },
                ],
              }}
              options={{
                plugins: { legend: { display: false } },
                scales: baseScales,
              }}
            />
          ) : (
            <EmptyChartHint />
          )}
        </div>
      </div>
    </div>
  )
}

function EmptyChartHint() {
  const { t } = useI18n()
  return <p className="text-medium-emphasis small mb-4">{t('stats.emptyChart')}</p>
}
