---
sidebar_position: 5
---

# API — Backend

El backend expone una API REST documentada con OpenAPI 3.0. La especificación se genera automáticamente con `swagger-jsdoc` a partir de los comentarios que acompañan a cada ruta en `backend/src/routes/*.js`, así que nunca queda desactualizada respecto al código.

**Swagger UI interactivo**: [http://localhost:4000/api-docs](http://localhost:4000/api-docs) (con el backend en marcha)
**Spec en crudo**: [http://localhost:4000/api-docs.json](http://localhost:4000/api-docs.json)

## Resumen de endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/detections/analyze` | Analiza una celda (bounding box): llama al model-service y enriquece el resultado con las capas de datos abiertos |
| `GET` | `/api/detections/{id}/context` | Devuelve el contexto de datos abiertos de una detección ya guardada |
| `GET` | `/api/stats/global` | Estadísticas públicas agregadas (superficie analizada, nº de alertas) |
| `POST` | `/api/stats/report` | Registra de forma anónima que se ha analizado una celda |
| `GET` | `/api/datasets/layers` | Metadatos de las capas de datos abiertos disponibles |

Para el detalle de parámetros, esquemas de petición/respuesta y probar los endpoints directamente desde el navegador, usa el Swagger UI enlazado arriba.
