import axios from 'axios'
import 'dotenv/config'

const MODEL_SERVICE_URL = process.env.MODEL_SERVICE_URL || 'http://localhost:8000'

const client = axios.create({
  baseURL: MODEL_SERVICE_URL,
  timeout: 60000,
})

// Calls the model-service's /predict endpoint with the bounding box of a
// grid cell. The model-service is responsible for fetching/cropping the
// corresponding PNOA imagery and running the trained detection model on it.
export async function predictCell({ bounds, confidenceThreshold }) {
  const { data } = await client.post('/predict', {
    bounds,
    confidence_threshold: confidenceThreshold,
  })
  return data
}

export default client
