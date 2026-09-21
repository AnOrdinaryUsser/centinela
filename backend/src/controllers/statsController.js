import { pool } from '../config/db.js'

// GET /api/stats/global
export async function getGlobalStats(req, res, next) {
  try {
    const result = await pool.query(`
      SELECT
        COALESCE(SUM(area_square_meters), 0) / 1000000.0 AS total_area_square_km,
        COALESCE(SUM(detections_count), 0) AS total_detections,
        COUNT(*) AS total_cells_analyzed
      FROM usage_stats;
    `)

    const row = result.rows[0]
    res.json({
      totalAreaSquareKm: Number(row.total_area_square_km).toFixed(2),
      totalDetections: Number(row.total_detections),
      totalCellsAnalyzed: Number(row.total_cells_analyzed),
    })
  } catch (error) {
    next(error)
  }
}

// POST /api/stats/report
export async function reportCellAnalyzed(req, res, next) {
  try {
    const { areaSquareMeters, detectionsCount } = req.body

    await pool.query(
      `INSERT INTO usage_stats (area_square_meters, detections_count) VALUES ($1, $2)`,
      [areaSquareMeters ?? 0, detectionsCount ?? 0],
    )

    res.status(201).json({ status: 'recorded' })
  } catch (error) {
    next(error)
  }
}
