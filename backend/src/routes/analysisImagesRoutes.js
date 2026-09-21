import { Router } from 'express'
import { uploadImage, getImage } from '../controllers/analysisImagesController.js'
import { requireAccessToken, createRateLimiter } from '../middleware/accessControl.js'

const router = Router()

// Up to a 2mb base64 image per request (see the express.json limit in
// app.js) - a generous cap still keeps someone from filling the database
// with junk uploads.
const uploadRateLimit = createRateLimiter({
  max: 60,
  windowMs: 60_000,
  message: 'Demasiadas imagenes subidas en poco tiempo.',
})

/**
 * @openapi
 * /api/analysis-images:
 *   post:
 *     summary: Guarda la miniatura (base64) de una celda analizada en la base de datos
 *     tags: [AnalysisImages]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 description: Imagen en base64 (sin el prefijo data:...)
 *               mimeType:
 *                 type: string
 *     responses:
 *       201:
 *         description: Id de la imagen guardada
 */
router.post('/', uploadRateLimit, requireAccessToken, uploadImage)

/**
 * @openapi
 * /api/analysis-images/{id}:
 *   get:
 *     summary: Devuelve la imagen guardada como bytes crudos
 *     tags: [AnalysisImages]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Imagen (content-type segun se guardo)
 *       404:
 *         description: No existe una imagen con ese id
 */
router.get('/:id', getImage)

export default router
