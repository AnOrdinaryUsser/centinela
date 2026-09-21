---
sidebar_position: 6
---

# API — Servicio del modelo

El `model-service` expone el modelo de Deep Learning entrenado a través de una API en FastAPI. FastAPI genera la documentación OpenAPI automáticamente a partir de los tipos de Python definidos en `model-service/app/schemas.py`, sin necesidad de mantenerla a mano.

El modelo real es un **YOLOv8s** (Ultralytics), entrenado 200 épocas a 640×640, con una única clase: `dump_site`. Métricas finales de validación: precisión 0.96, recall 0.88, mAP50 0.94, mAP50-95 0.77.

**Swagger UI interactivo**: [http://localhost:8000/docs](http://localhost:8000/docs) (con el model-service en marcha)
**Documentación alternativa (ReDoc)**: [http://localhost:8000/redoc](http://localhost:8000/redoc)
**Spec en crudo**: [http://localhost:8000/openapi.json](http://localhost:8000/openapi.json)

## Resumen de endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/health` | Comprobación de disponibilidad del servicio |
| `POST` | `/predict` | Recibe un `bounds` (bounding box WGS84) y un `confidence_threshold` opcional (0.30-0.95 mientras se prueba el modelo; el rango de produccion previsto por el spec es 0.85-0.99); devuelve las detecciones encontradas |

Si el fichero de pesos (`model-service/weights/best.pt`) no está presente, este endpoint responde con predicciones simuladas para poder desarrollar y demostrar el resto de la plataforma sin bloquear en la integración del modelo (ver `model-service/README.md`).
