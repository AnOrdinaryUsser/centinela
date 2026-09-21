---
sidebar_position: 3
---

# Guía de instalación

Requisitos previos: Node.js 20+, **Python 3.11 exactamente** (no una versión más nueva — ver nota más abajo), PostgreSQL 15+ con la extensión PostGIS (o Docker, para levantarlo con el `docker-compose.yml` incluido).

:::caution Por qué Python 3.11 y no la última versión
Las dependencias geoespaciales (`shapely`, `geopandas`) y de IA (`torch`, `ultralytics`) de este proyecto se instalan como ruedas (wheels) precompiladas — sin eso, `pip install` intenta compilarlas localmente y falla en Windows si no tienes Visual Studio Build Tools, GEOS o GDAL instalados. Esas ruedas tardan meses en publicarse para cada versión nueva de Python, así que una versión muy reciente (3.13, 3.14...) puede no tener todavía rueda para alguna de ellas. Python 3.11 es la versión estable con más cobertura de ruedas ahora mismo, de ahí la recomendación.
:::

## 1. Base de datos

Con Docker (recomendado para desarrollo local):

```bash
docker compose up -d
```

Sin Docker, con un PostgreSQL/PostGIS ya instalado:

```bash
createdb centinela_cyl
psql -d centinela_cyl -f database/schema/001_extensions.sql
psql -d centinela_cyl -f database/schema/002_geodata_layers.sql
psql -d centinela_cyl -f database/schema/003_detections.sql
psql -d centinela_cyl -f database/schema/004_statistics.sql
```

## 2. Cargar los datasets de la JCyL (opcional para desarrollo inicial)

```powershell
cd etl
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
python scripts\load_waste_facilities.py
python scripts\load_hydrography.py
python scripts\load_protected_areas.py
python scripts\load_land_cover.py    # solo si ya tienes el dataset descargado
```

Los tres primeros scripts usan datos reales ya incluidos en `etl/data/` (residuos, masas de agua, espacios protegidos); el de cubierta del suelo necesita que descargues antes el dataset (ver `etl/README.md`). Si te saltas alguno, el backend sigue funcionando igual: las consultas de contexto para esa capa simplemente devuelven `null`.

## 3. Servicio del modelo de IA

```powershell
cd model-service
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

Si `model-service/weights/best.pt` no está presente, el servicio arranca igualmente en modo simulado (ver `model-service/README.md`), para poder desarrollar y probar el resto de la plataforma de extremo a extremo.

## 4. Backend

```powershell
cd backend
npm install
copy .env.example .env
npm run dev
```

Disponible en `http://localhost:4000`, con Swagger UI en `http://localhost:4000/api-docs`.

## 5. Frontend

```powershell
cd frontend
npm install
copy .env.example .env
npm run dev
```

Disponible en `http://localhost:5173`.

## 6. Este sitio de documentación

```bash
cd docs
npm install
npm run start
```

Disponible en `http://localhost:3000`.
