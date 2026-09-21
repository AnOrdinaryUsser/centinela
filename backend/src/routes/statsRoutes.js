import { Router } from 'express'
import { getGlobalStats, reportCellAnalyzed } from '../controllers/statsController.js'
import { requireAccessToken, createRateLimiter } from '../middleware/accessControl.js'

const router = Router()

// Cheap (just increments a counter), but still gated + capped so it
// can't be used to poison the public "platform activity" stats with junk.
const reportRateLimit = createRateLimiter({ max: 60, windowMs: 60_000 })

/**
 * @openapi
 * /api/stats/global:
 *   get:
 *     summary: Estadisticas publicas y anonimas de uso de la plataforma
 *     tags: [Estadisticas]
 *     responses:
 *       200:
 *         description: Estadisticas agregadas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalAreaSquareKm: { type: string, example: "128.45" }
 *                 totalDetections: { type: integer, example: 37 }
 *                 totalCellsAnalyzed: { type: integer, example: 512 }
 */
router.get('/global', getGlobalStats)

/**
 * @openapi
 * /api/stats/report:
 *   post:
 *     summary: Registra de forma anonima que se ha analizado una celda
 *     tags: [Estadisticas]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               areaSquareMeters: { type: number }
 *               detectionsCount: { type: integer }
 *     responses:
 *       201:
 *         description: Registrado correctamente
 */
router.post('/report', reportRateLimit, requireAccessToken, reportCellAnalyzed)

export default router
