import express from 'express'
import cors from 'cors'
import swaggerUi from 'swagger-ui-express'
import { swaggerSpec } from './docs/swagger.js'
import detectionsRoutes from './routes/detectionsRoutes.js'
import statsRoutes from './routes/statsRoutes.js'
import datasetsRoutes from './routes/datasetsRoutes.js'
import analysisImagesRoutes from './routes/analysisImagesRoutes.js'

// Express application setup: middlewares, routes, and Swagger UI.
export function createApp() {
  const app = express()

  app.use(cors())
  // Default express.json() limit is 100kb, which a base64-encoded PNOA
  // tile thumbnail (a ~40-120KB JPEG becomes ~55-165KB as base64) can
  // exceed - see POST /api/analysis-images below, the endpoint that lets
  // the frontend keep those images out of localStorage entirely.
  app.use(express.json({ limit: '2mb' }))

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))
  app.get('/api-docs.json', (req, res) => res.json(swaggerSpec))

  app.get('/health', (req, res) => res.json({ status: 'ok' }))

  app.use('/api/detections', detectionsRoutes)
  app.use('/api/stats', statsRoutes)
  app.use('/api/datasets', datasetsRoutes)
  app.use('/api/analysis-images', analysisImagesRoutes)

  // Centralized error handler.
  app.use((err, req, res, next) => {
    console.error(err)
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
  })

  return app
}

export default createApp
