import { Router } from 'express'
import { getLayers, getWasteFacilitiesGeo, getHydrographyGeo, getProtectedAreasGeo, getLandCoverMeta, getLandCoverGeo } from '../controllers/datasetsController.js'

const router = Router()

/**
 * @openapi
 * /api/datasets/layers:
 *   get:
 *     summary: Metadatos de las capas de datos abiertos utilizadas por la plataforma
 *     tags: [Datasets]
 *     responses:
 *       200:
 *         description: Listado de capas
 */
router.get('/layers', getLayers)

/**
 * @openapi
 * /api/datasets/geo/waste-facilities:
 *   get:
 *     summary: Geometrias (GeoJSON) de los centros de gestion de residuos legales
 *     tags: [Datasets]
 *     responses:
 *       200:
 *         description: FeatureCollection GeoJSON de puntos
 */
router.get('/geo/waste-facilities', getWasteFacilitiesGeo)

/**
 * @openapi
 * /api/datasets/geo/hydrography:
 *   get:
 *     summary: Geometrias (GeoJSON, simplificadas) de las masas de agua
 *     tags: [Datasets]
 *     responses:
 *       200:
 *         description: FeatureCollection GeoJSON de poligonos
 */
router.get('/geo/hydrography', getHydrographyGeo)

/**
 * @openapi
 * /api/datasets/geo/protected-areas:
 *   get:
 *     summary: Geometrias (GeoJSON) de los espacios protegidos (REN) que ya tienen poligono de limites real
 *     tags: [Datasets]
 *     responses:
 *       200:
 *         description: FeatureCollection GeoJSON de poligonos (solo los espacios con geom cargada)
 */
router.get('/geo/protected-areas', getProtectedAreasGeo)

/**
 * @openapi
 * /api/datasets/geo/land-cover/meta:
 *   get:
 *     summary: Provincias y municipios con cubierta terrestre (mapacyl1) ya cargada
 *     tags: [Datasets]
 *     responses:
 *       200:
 *         description: Listado de provincias, cada una con sus municipios cargados y su recuento de poligonos
 */
router.get('/geo/land-cover/meta', getLandCoverMeta)

/**
 * @openapi
 * /api/datasets/geo/land-cover:
 *   get:
 *     summary: Geometrias (GeoJSON) de cubierta terrestre para un municipio concreto
 *     tags: [Datasets]
 *     parameters:
 *       - in: query
 *         name: province
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: municipality
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: FeatureCollection GeoJSON de poligonos de uso del suelo
 *       400:
 *         description: Faltan los parametros province/municipality
 */
router.get('/geo/land-cover', getLandCoverGeo)

export default router
