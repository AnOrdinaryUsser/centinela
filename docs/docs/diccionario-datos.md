---
sidebar_position: 4
---

# Diccionario de datos

Detalle de cada dataset de datos abiertos utilizado, su formato original y cómo queda modelado tras pasar por el proceso de ETL (`/etl`) hacia PostGIS.

## `waste_facilities` — Centros de gestión de residuos

- **Fuente**: Junta de Castilla y León — registro de centros de gestión de residuos, exportado desde el GeoPackage oficial a `etl/data/residuos_resumen.json` (963 centros).
- **Formato del fichero cargado**: JSON plano (`nombre`, `tipo`, `municipio`, `provincia`, `latitud`, `longitud`, `url_detalle`), ya en WGS84.
- **Uso en la plataforma**: calcular la distancia desde cada detección al centro de gestión de residuos legal más cercano, y decidir si la detección es probablemente esa misma instalación (falso positivo) o un vertedero ilegal — ver `classifyDetection` en `backend/src/services/classificationService.js`.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | serial | Identificador interno |
| `name` | text | Nombre del centro |
| `facility_type` | text | Categoría (p. ej. "Canal Industrial", "Canal Doméstico") |
| `municipality` | text | Municipio |
| `province` | text | Provincia |
| `detail_url` | text | Ficha oficial del centro en la Junta |
| `geom` | geometry(Point, 4326) | Ubicación del centro |

## `land_cover` — Cubierta terrestre y usos del suelo

- **Fuente**: Junta de Castilla y León (mapacyl1) — [directorio de descargas](https://opendata.jcyl.es/ficheros/carto/mapacyl/mapacyl1/)
- **Formato original**: Shapefile (`.shp`)
- **Uso en la plataforma**: identificar el tipo de terreno (forestal, agrícola, industrial, etc.) sobre el que cae cada detección.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | serial | Identificador interno |
| `cover_type` | text | Categoría de uso del suelo |
| `geom` | geometry(MultiPolygon, 4326) | Polígono de la parcela/zona |

## `hydrography` — Masas de agua

- **Fuente**: IGCYL, dataset `hy.hidro_cyl_masas` (cargado, 24.915 registros).
- **Formato original**: Shapefile, CRS ETRS89/UTM zona 30N (EPSG:25830), reproyectado a WGS84 en el ETL.
- **Contenido real**: no es una red de líneas de cauces, sino polígonos de masas de agua — lagos/lagunas (`LAGO`, la inmensa mayoría), embalses (`EMBALSE`) y tramos de río mapeados como área (`RIO`).
- **Uso en la plataforma**: calcular la distancia desde cada detección a la masa de agua más cercana (riesgo ambiental por proximidad a ríos, lagos o embalses).

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | serial | Identificador interno |
| `name` | text | Nombre de la masa de agua, si lo tiene |
| `water_type` | text | `LAGO`, `RIO` o `EMBALSE` |
| `area_square_meters` | double precision | Superficie de la masa de agua |
| `geom` | geometry(MultiPolygon, 4326) | Polígono de la masa de agua |

## `protected_areas` — Red de Espacios Naturales Protegidos (REN)

- **Fuente**: Junta de Castilla y León — 38 espacios protegidos (cargados solo como atributos, sin límites geográficos todavía).
- **Formato original**: Excel (`en_cyl_ren_limites.xlsx`), sin columna de geometría.
- **Uso en la plataforma**: detectar si una detección cae dentro de un espacio natural protegido (infracción crítica) — **pendiente de activarse** hasta cargar los polígonos de límites reales; mientras tanto `geom` es `NULL` para todos los registros.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | serial | Identificador interno |
| `site_code` | text | Código oficial del espacio (p. ej. `ES410001`) |
| `name` | text | Nombre del espacio protegido |
| `protection_category` | text | Categoría de protección (parque natural, reserva, paisaje protegido, etc.) |
| `declared_area_hectares` | double precision | Superficie declarada, en hectáreas |
| `info_url` | text | Ficha oficial del espacio |
| `geom` | geometry(MultiPolygon, 4326), nullable | Límite del espacio protegido — `NULL` hasta que se cargue la geometría real |

## `detections` — Detecciones del modelo de IA

Generada por la plataforma (no proviene de un dataset externo), pero enriquecida con las cuatro tablas anteriores en el momento de la detección. El modelo (YOLOv8s) tiene una única clase entrenada, `dump_site`, guardada en la columna `class_name`. La columna `classification_status` guarda el resultado de la clasificación legal/ilegal (`legal_probable`, `illegal_probable` o `illegal_critical`), calculada por `classifyDetection()` a partir de la distancia al centro de residuos legal más cercano y de si la detección cae dentro de un espacio protegido. Ver `database/schema/003_detections.sql`.

## `usage_stats` — Estadísticas de uso

Generada por la plataforma. Registro anónimo y agregado de cada celda analizada, usado únicamente para alimentar el dashboard público. Ver `database/schema/004_statistics.sql`.

## Sistema de referencia de coordenadas (SRID)

Todas las tablas geoespaciales se normalizan a **EPSG:4326 (WGS84)** durante el ETL, independientemente del SRID en el que la Junta publique el dataset original (habitualmente ETRS89 / UTM zona 30N, EPSG:25830), para que todas las capas sean directamente comparables entre sí y con las coordenadas que produce el modelo de IA.
