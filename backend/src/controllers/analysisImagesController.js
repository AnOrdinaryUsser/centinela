import { pool } from '../config/db.js'

// Max upload size for a single cell thumbnail (base64-decoded). The
// express.json() body limit (see app.js) already caps the request body
// itself, but this catches an oversized `image` field specifically, with
// a clearer error than a generic body-too-large one.
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024

// POST /api/analysis-images
// Stores one analyzed cell's thumbnail (sent as base64, the same encoding
// the model-service already returns it in - see modelClient.js) in
// Postgres instead of the browser's localStorage, and hands back just the
// row id. See 007_analysis_images.sql for why this exists: it's what lets
// analyses.js keep runs out of localStorage's ~5MB/origin quota regardless
// of how many cells or images they contain.
export async function uploadImage(req, res, next) {
  try {
    const { image, mimeType } = req.body ?? {}
    if (!image || typeof image !== 'string') {
      res.status(400).json({ error: 'El campo "image" (base64) es obligatorio.' })
      return
    }

    let buffer
    try {
      buffer = Buffer.from(image, 'base64')
    } catch {
      res.status(400).json({ error: 'El campo "image" no es base64 valido.' })
      return
    }

    if (buffer.length === 0) {
      res.status(400).json({ error: 'El campo "image" no puede estar vacio.' })
      return
    }
    if (buffer.length > MAX_IMAGE_BYTES) {
      res.status(413).json({ error: `La imagen supera el tamano maximo permitido (${MAX_IMAGE_BYTES} bytes).` })
      return
    }

    const result = await pool.query(
      'INSERT INTO analysis_images (image_data, mime_type) VALUES ($1, $2) RETURNING id',
      [buffer, typeof mimeType === 'string' && mimeType ? mimeType : 'image/jpeg'],
    )
    res.status(201).json({ id: result.rows[0].id })
  } catch (error) {
    next(error)
  }
}

// GET /api/analysis-images/:id
// Serves the raw image bytes back with the right content type, so the
// frontend can point an <img src="..."> straight at this URL instead of
// needing to fetch+decode JSON first.
export async function getImage(req, res, next) {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Id de imagen invalido.' })
      return
    }

    const result = await pool.query('SELECT image_data, mime_type FROM analysis_images WHERE id = $1', [id])
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Imagen no encontrada.' })
      return
    }

    const { image_data, mime_type } = result.rows[0]
    res.setHeader('Content-Type', mime_type)
    // Images are immutable once uploaded (no update endpoint), so this can
    // be cached hard by the browser.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    res.send(image_data)
  } catch (error) {
    next(error)
  }
}
