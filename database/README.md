# Base de datos — Centinela CyL

Esquema de PostgreSQL + PostGIS. Se usa una única base de datos para las capas geoespaciales de datos abiertos y para las estadísticas de uso de la plataforma.

## Aplicar el esquema

```bash
createdb centinela_cyl
psql -d centinela_cyl -f schema/001_extensions.sql
psql -d centinela_cyl -f schema/002_geodata_layers.sql
psql -d centinela_cyl -f schema/003_detections.sql
psql -d centinela_cyl -f schema/004_statistics.sql
```

Si usas el `docker-compose.yml` de la raíz del proyecto, estos mismos ficheros se ejecutan automáticamente al crear el contenedor (montados en `docker-entrypoint-initdb.d`).

## Tablas

| Fichero | Tabla | Contenido |
|---|---|---|
| `002_geodata_layers.sql` | `waste_facilities` | Instalaciones de tratamiento de residuos / puntos limpios (legales) |
| `002_geodata_layers.sql` | `land_cover` | Cubierta terrestre y usos del suelo |
| `002_geodata_layers.sql` | `hydrography` | Red hidrográfica (ríos, arroyos) |
| `002_geodata_layers.sql` | `protected_areas` | Red de Espacios Naturales Protegidos (REN) |
| `003_detections.sql` | `detections` | Detecciones generadas por el modelo de IA, ya enriquecidas |
| `004_statistics.sql` | `usage_stats` | Registro anónimo de uso (superficie analizada, nº de detecciones) para el dashboard |

Las cuatro primeras tablas se cargan mediante los scripts de `/etl`, no manualmente. El diccionario de datos completo (procedencia de cada dataset, SRID original, transformación aplicada) está en `docs/docs/diccionario-datos.md`.
