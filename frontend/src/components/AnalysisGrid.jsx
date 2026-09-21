import { Rectangle } from 'react-leaflet'

// Visual style per cell analysis status. "analyzing" gets a CSS pulse (see
// .cell-analyzing in global.css) so the grid visibly "lights up" cell by
// cell while the run is in progress, the same way MapTilesDownloader shows
// its tile-by-tile download progress.
const STATUS_STYLE = {
  // MapTilesDownloader draws its grid preview as an orange outline
  // (#fa8231 in its source) before any download starts - same color here.
  preview: { color: '#fa8231', weight: 2, fillOpacity: 0.04, dashArray: '2,5' },
  pending: { color: '#5c6b82', weight: 1, fillOpacity: 0.03, dashArray: '3,6' },
  analyzing: { color: '#f9b115', weight: 2, fillOpacity: 0.22, className: 'cell-analyzing' },
  clean: { color: '#22e3ac', weight: 1, fillOpacity: 0.16 },
  alert: { color: '#ff5d6c', weight: 2, fillOpacity: 0.4, className: 'cell-alert' },
  error: { color: '#8a93a2', weight: 1, fillOpacity: 0.04, dashArray: '2,4' },
}

// Renders the finished grid of cells for the run currently in progress (or
// just completed), one Rectangle per cell colored by its live status so
// the user can watch detection happen tile by tile instead of staring at
// a spinner.
export default function AnalysisGrid({ cells, statuses }) {
  return (
    <>
      {cells.map((cell, index) => (
        <Rectangle
          key={index}
          bounds={cell}
          pathOptions={STATUS_STYLE[statuses[index]?.status ?? 'pending']}
        />
      ))}
    </>
  )
}
