---
sidebar_position: 2
---

# Arquitectura

Centinela CyL está dividido en servicios independientes que se comunican por HTTP:

```
┌────────────┐      ┌────────────┐      ┌──────────────────┐
│  Frontend  │ ───▶ │  Backend   │ ───▶ │   Model service   │
│ React+Vite │      │ Node/Expr. │      │  Python/FastAPI   │
└────────────┘      └─────┬──────┘      └───────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │  PostgreSQL +   │
                  │     PostGIS     │
                  └─────────────────┘
```

## Flujo de un análisis

1. El usuario dibuja una zona en el mapa (frontend). La zona se divide en una cuadrícula de celdas más pequeñas.
2. Por cada celda, el frontend llama a `POST /api/detections/analyze` en el **backend**.
3. El backend pide la predicción de esa celda al **model-service** (`POST /predict`), que pide esa zona al WMS de PNOA, ejecuta el modelo YOLOv8s ya entrenado (clase `dump_site`) sobre la imagen, y devuelve las coordenadas, confianza y clase de cada detección.
4. Por cada detección, el backend consulta **PostGIS** para calcular el contexto: distancia al centro de gestión de residuos legal más cercano, tipo de cubierta del suelo, distancia al curso de agua más cercano, y si cae dentro de un espacio natural protegido.
5. Con ese contexto, `classifyDetection()` (`backend/src/services/classificationService.js`) decide si la detección es probablemente la propia instalación legal (falso positivo, si está a menos de `LEGAL_FACILITY_RADIUS_METERS` de un centro registrado), un vertedero ilegal dentro de un espacio protegido (crítico), o un vertedero ilegal probable en cualquier otro caso.
6. El backend guarda la detección enriquecida (con su clasificación) y devuelve el resultado al frontend, que lo muestra en el mapa y en el panel lateral con un color e icono según la gravedad.
6. De forma anónima, el backend registra la celda analizada en `usage_stats`, lo que alimenta el dashboard público.

## Por qué estas decisiones técnicas

- **PostgreSQL + PostGIS en vez de MySQL**: todo el cruce de datos abiertos es consulta geométrica (distancias, intersecciones de polígonos). PostGIS ofrece tipos de dato geométricos nativos, índices espaciales (`GIST`) y funciones como `ST_Distance` o `ST_Contains` que MySQL no iguala. Usar una sola base de datos para geodatos y estadísticas evita duplicar infraestructura.
- **Model-service como proceso Python separado**: el modelo de Deep Learning corre en su propio runtime (PyTorch/TensorFlow), independiente de Node.js. Esto permite escalar o sustituir el modelo sin tocar el backend, y viceversa.
- **PNOA vía WMS como imagen base**: resolución suficiente (25–50 cm/píxel) para que un vertedero sea identificable visualmente y por el modelo, servido gratuitamente por el IGN sin necesidad de almacenar ni procesar las imágenes en nuestro propio servidor.
- **Sin login obligatorio + `localStorage`**: prioriza la accesibilidad total. El historial de análisis vive en el navegador de cada usuario; las estadísticas globales se agregan de forma anónima en el backend.
- **OpenAPI/Swagger en ambos servicios**: el backend genera su spec con `swagger-jsdoc` a partir de comentarios en las rutas; el model-service lo genera automáticamente FastAPI a partir de los tipos de Python. En ambos casos la documentación de la API nunca se desincroniza del código porque vive en el mismo sitio.

## Estructura del repositorio

| Carpeta | Contenido |
|---|---|
| `frontend/` | React + Vite + CoreUI + Leaflet |
| `backend/` | API REST Node/Express + Swagger UI en `/api-docs` |
| `model-service/` | FastAPI sirviendo el modelo entrenado + Swagger UI en `/docs` |
| `database/` | Esquema SQL de PostgreSQL/PostGIS |
| `etl/` | Scripts de carga de los datasets abiertos de la JCyL |
| `docs/` | Este sitio de documentación (Docusaurus) |
