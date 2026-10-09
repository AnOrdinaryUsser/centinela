import axios from 'axios'
import 'dotenv/config'

const MODEL_SERVICE_URL = process.env.MODEL_SERVICE_URL || 'http://localhost:8000'

// 190s (2026-09): model-service corre con un único worker de uvicorn (ver
// model-service/Dockerfile), así que una inferencia real de YOLO en CPU
// puede tardar bastante bajo carga - debe quedar POR DEBAJO del timeout
// del frontend (200s, ver frontend/src/services/api.js) para que sea este
// el que corte primero si algo se cuelga de verdad.
const client = axios.create({
  baseURL: MODEL_SERVICE_URL,
  timeout: 190000,
})

// ---------------------------------------------------------------------
// Limitador de concurrencia GLOBAL hacia model-service.
//
// El problema real no era solo "una petición tarda mucho": era que
// model-service tiene un único worker de uvicorn (un solo proceso), así
// que cualquier numero de peticiones /predict que le lleguen a la vez -
// ya sea de un usuario analizando varias celdas en paralelo (ver
// MapPage.jsx CONCURRENCY) o de VARIOS usuarios distintos pidiendo un
// análisis al mismo tiempo, algo que este backend no controlaba en
// absoluto antes de esto - compiten por la misma CPU y se ralentizan
// todas entre sí, hasta que las últimas de la cola superan cualquier
// timeout por generoso que sea.
//
// Este backend es un único proceso Node compartido por TODOS los
// visitantes de la web, así que un semáforo a nivel de módulo (no por
// petición, no por sesión) es exactamente lo que hace falta: sea cual
// sea el origen de las peticiones, nunca hay más de
// MODEL_SERVICE_CONCURRENCY inferencias en marcha a la vez contra
// model-service - el resto espera aquí, en el propio backend, ANTES de
// que se envíe la petición HTTP real (por eso el reloj del timeout de
// arriba ni siquiera empieza a contar mientras una petición está en
// cola: solo cuenta la inferencia en sí, no la espera).
//
// MODEL_SERVICE_CONCURRENCY (variable de entorno, ver
// docker-compose.prod.yml / .env.docker.example) por defecto es 2 - a
// juego con el único worker de model-service. Si en el futuro
// model-service se ejecuta con más workers/CPU, subir este valor a la
// vez que ese numero de workers.
class Semaphore {
  constructor(max) {
    this.max = max
    this.active = 0
    this.queue = []
  }

  acquire() {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        if (this.active < this.max) {
          this.active += 1
          resolve()
        } else {
          this.queue.push(tryAcquire)
        }
      }
      tryAcquire()
    })
  }

  release() {
    this.active -= 1
    const next = this.queue.shift()
    if (next) next()
  }
}

const MODEL_SERVICE_CONCURRENCY = Number(process.env.MODEL_SERVICE_CONCURRENCY) || 2
const inferenceSemaphore = new Semaphore(MODEL_SERVICE_CONCURRENCY)

// Calls the model-service's /predict endpoint with the bounding box of a
// grid cell. The model-service is responsible for fetching/cropping the
// corresponding PNOA imagery and running the trained detection model on it.
export async function predictCell({ bounds, confidenceThreshold }) {
  await inferenceSemaphore.acquire()
  try {
    const { data } = await client.post('/predict', {
      bounds,
      confidence_threshold: confidenceThreshold,
    })
    return data
  } finally {
    inferenceSemaphore.release()
  }
}

export default client
