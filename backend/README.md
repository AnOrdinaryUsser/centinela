# Backend — Centinela CyL

API REST en Node.js + Express. Orquesta el análisis de cuadrículas (llamando al `model-service`), enriquece cada detección cruzándola espacialmente contra las capas de datos abiertos cargadas en PostGIS, y expone las estadísticas globales del dashboard.

## Puesta en marcha

```bash
npm install
cp .env.example .env   # edita host/usuario/clave de PostgreSQL y la URL del model-service
npm run dev
```

Servidor en `http://localhost:4000`. Documentación interactiva de la API (Swagger UI) en `http://localhost:4000/api-docs`, generada automáticamente a partir de los comentarios JSDoc en `src/routes/*.js` mediante `swagger-jsdoc`.

## Estructura

- `src/index.js` — arranque del servidor.
- `src/app.js` — configuración de Express (middlewares, rutas, Swagger UI).
- `src/config/db.js` — pool de conexión a PostgreSQL/PostGIS.
- `src/routes/` — definición de endpoints y anotaciones OpenAPI.
- `src/controllers/` — lógica de cada endpoint.
- `src/services/modelClient.js` — cliente HTTP hacia el `model-service` (FastAPI).
- `src/services/spatialService.js` — consultas espaciales contra PostGIS (distancias, intersecciones con capas de la JCyL).
- `src/docs/swagger.js` — configuración de `swagger-jsdoc`.

## Endpoints principales

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/detections/analyze` | Envía una celda (bounding box) a analizar: llama al model-service y enriquece con contexto espacial |
| `GET` | `/api/detections/:id/context` | Devuelve el contexto de datos abiertos de una detección ya calculada |
| `GET` | `/api/stats/global` | Estadísticas públicas agregadas (superficie analizada, nº de alertas) |
| `POST` | `/api/stats/report` | Registra de forma anónima que se ha analizado una celda (alimenta el dashboard) |
| `GET` | `/api/datasets/layers` | Metadatos de las capas de datos abiertos disponibles |

El detalle completo de cada endpoint (parámetros, esquemas de petición/respuesta, ejemplos) está en el Swagger UI (`/api-docs`) y también se enlaza desde el sitio de documentación general (`/docs`).
