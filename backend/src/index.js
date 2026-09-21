import 'dotenv/config'
import { createApp } from './app.js'

const PORT = process.env.BACKEND_PORT || 4000
const app = createApp()

app.listen(PORT, () => {
  console.log(`Centinela backend listening on http://localhost:${PORT}`)
  console.log(`Swagger UI available at http://localhost:${PORT}/api-docs`)
})
