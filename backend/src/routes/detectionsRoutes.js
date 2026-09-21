import { Router } from 'express'
import { analyzeCell, getDetectionContext, listDetections } from '../controllers/detectionsController.js'
import { requireAccessToken, createRateLimiter } from '../middleware/accessControl.js'

const router = Router()

// This is real YOLO inference plus a live PNOA WMS fetch per cell - the
// single most expensive thing this backend does - so it gets both the
// access-token gate (a no-op unless ACCESS_TOKEN is set, see
// accessControl.js) and a tight per-IP cap (20 cells/minute is already
// generous for one person drawing zones by hand; well short of what a
// script hammering the endpoint would do).
const analyzeRateLimit = createRateLimiter({
  max: 20,
  windowMs: 60_000,
  message: 'Demasiados analisis en poco tiempo. Espera un momento antes de dibujar mas zonas.',
})

/**
 * @openapi
 * components:
 *   schemas:
 *     Bounds:
 *       type: object
 *       required: [north, south, east, west]
 *       properties:
 *         north: { type: number, example: 41.66 }
 *         south: { type: number, example: 41.65 }
 *         east: { type: number, example: -4.72 }
 *         west: { type: number, example: -4.73 }
 *     Detection:
 *       type: object
 *       properties:
 *         id: { type: integer, example: 42 }
 *         confidence: { type: number, example: 0.93 }
 *         longitude: { type: number, example: -4.7284 }
 *         latitude: { type: number, example: 41.6523 }
 *         className: { type: string, example: "dump_site" }
 *         landCoverType: { type: string, example: "forestal" }
 *         nearestLegalFacility:
 *           type: object
 *           nullable: true
 *           properties:
 *             name: { type: string }
 *             facility_type: { type: string }
 *             distance_meters: { type: number }
 *         nearestWaterBody:
 *           type: object
 *           nullable: true
 *           properties:
 *             name: { type: string }
 *             distance_meters: { type: number }
 *         protectedArea:
 *           type: object
 *           nullable: true
 *           properties:
 *             name: { type: string }
 *             protection_category: { type: string }
 *         classification:
 *           type: object
 *           properties:
 *             status: { type: string, enum: [legal_probable, illegal_probable, illegal_critical], example: "illegal_probable" }
 *             label: { type: string, example: "Vertedero ilegal probable" }
 *             severity: { type: string, enum: [info, warning, critical], example: "warning" }
 *             reason: { type: string, example: "No hay ninguna instalacion de gestion de residuos legal registrada en las proximidades." }
 *
 * /api/detections/analyze:
 *   post:
 *     summary: Analiza una celda de la cuadricula con el modelo de IA y la enriquece con datos abiertos
 *     tags: [Detecciones]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bounds]
 *             properties:
 *               bounds:
 *                 $ref: '#/components/schemas/Bounds'
 *               confidenceThreshold:
 *                 type: number
 *                 minimum: 0.30
 *                 maximum: 0.95
 *                 example: 0.9
 *     responses:
 *       200:
 *         description: Resultado del analisis de la celda
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 areaSquareMeters: { type: number }
 *                 detections:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Detection'
 *       400:
 *         description: Parametros invalidos
 */
router.post('/analyze', analyzeRateLimit, requireAccessToken, analyzeCell)

/**
 * @openapi
 * /api/detections:
 *   get:
 *     summary: Listado publico y anonimo de detecciones de todos los usuarios (para el mapa comunitario)
 *     tags: [Detecciones]
 *     parameters:
 *       - in: query
 *         name: minConfidence
 *         schema: { type: number, minimum: 0.75, maximum: 1, default: 0.75 }
 *         description: Umbral minimo de confianza (se acota siempre entre 0.75 y 1)
 *     responses:
 *       200:
 *         description: FeatureCollection GeoJSON de detecciones
 */
router.get('/', listDetections)

/**
 * @openapi
 * /api/detections/{id}/context:
 *   get:
 *     summary: Devuelve el contexto de datos abiertos de una deteccion ya calculada
 *     tags: [Detecciones]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Contexto espacial de la deteccion
 *       404:
 *         description: Deteccion no encontrada
 */
router.get('/:id/context', getDetectionContext)

export default router
