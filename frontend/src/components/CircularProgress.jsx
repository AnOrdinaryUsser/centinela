// Small SVG progress ring - used while an analysis run is in flight
// (MapPage.jsx) so there's an at-a-glance visual of how far along the
// batch of tile requests is, instead of only the "3/12" text that was
// there before (which is still shown, as the label in the middle - this
// wraps it, not replaces it).
export default function CircularProgress({ done, total, size = 56, strokeWidth = 5, label }) {
  const safeTotal = total > 0 ? total : 1
  const percent = Math.min(100, Math.round((done / safeTotal) * 100))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - percent / 100)

  return (
    <div className="circular-progress" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          className="circular-progress-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          className="circular-progress-value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="circular-progress-label">{label ?? `${percent}%`}</span>
    </div>
  )
}
