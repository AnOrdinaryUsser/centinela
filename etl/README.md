# ETL — Carga de datos abiertos de la JCyL

Scripts en Python (GeoPandas) que descargan/leen los datasets oficiales de la Junta de Castilla y León y de IDECYL, los normalizan a un mismo sistema de referencia (EPSG:4326, WGS84) y los cargan en las tablas de PostGIS definidas en `/database/schema/002_geodata_layers.sql`.

Estos scripts **no corren en cada petición del usuario**: son carga previa (o periódica, si la Junta actualiza los datasets), no parte del flujo en caliente de la aplicación.

## Puesta en marcha

**Requiere Python 3.11** (no una versión más nueva): es la versión para la que todas las dependencias geoespaciales de este proyecto tienen rueda precompilada en Windows, así que la instalación no necesita compilador de C/C++. Si no la tienes, descárgala de [python.org](https://www.python.org/downloads/release/python-3119/) (marca "Add python.exe to PATH" al instalar).

En Windows (PowerShell), usando el selector de versiones `py`:

```powershell
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

En Linux/macOS:

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Comprueba que el venv usa la versión correcta con `python --version` (debe decir `Python 3.11.x`) antes de seguir.

**Residuos (ya listo):** `etl/data/residuos_resumen.json` contiene el registro real de centros de gestión de residuos de la JCyL (963 centros), exportado desde el GeoPackage oficial. `load_waste_facilities.py` lo carga tal cual, sin necesidad de descargar nada:

```bash
python scripts/load_waste_facilities.py
```

**Masas de agua (ya listo):** `etl/data/hy_hidro_cyl_masas.zip` contiene el shapefile real del IGCYL (24.915 polígonos: lagos, embalses y ríos). `load_hydrography.py` lo lee directamente del zip, reproyecta de ETRS89/UTM 30N a WGS84 y lo carga:

```bash
python scripts/load_hydrography.py
```

**Espacios protegidos (cargado solo en parte):** `etl/data/en_cyl_ren_limites.xlsx` tiene los 38 espacios naturales protegidos de la REN con nombre, categoría, superficie y un `c_sitecode` — pero **sin geometría de los límites**. `load_protected_areas.py` los carga igualmente (con `geom = NULL`), útil para listados y estadísticas, pero la comprobación de "¿esta detección cae dentro de un espacio protegido?" no se activará para estos registros hasta que consigamos los polígonos reales:

```bash
python scripts/load_protected_areas.py
```

Pista concreta para encontrar esos límites: cada fila trae un `url_info` a la ficha de ese espacio en patrimonionatural.org (p. ej. https://patrimonionatural.org/espacios-naturales/parque-natural/parque-natural-canon-del-rio-lobos), y esa ficha enlaza a un visor de mapa interactivo en `mapas.patrimonionatural.org` que casi con toda seguridad consulta un servicio WMS/WFS (probablemente GeoServer) por debajo. No hemos podido localizar ese endpoint desde este entorno (ni un GetCapabilities en la ruta habitual, ni acceso de red al geoportal de IDECYL). La forma más rápida de encontrarlo: abre ese visor en el navegador, abre las herramientas de desarrollador (pestaña Red/Network), y mira qué URL se pide al cargar el mapa — normalmente algo con `wms`, `wfs` o `geoserver` en la ruta. Con esa URL (o con un shapefile/GeoJSON descargado de ahí) el loader se puede escribir en minutos: solo hace falta cruzar por `c_sitecode` (o el nombre) con las 38 filas que ya tenemos.

**Cubierta del suelo:** el dataset `mapacyl1` está organizado por provincia, con un shapefile por MUNICIPIO dentro de cada una (`opendata.jcyl.es/ficheros/carto/mapacyl/mapacyl1/<Provincia>/shp_e1/<codigo>_<Municipio>_mapacyl1.zip` — confirmado inspeccionando el listado real; Valladolid son 249 ficheros, Soria 247 (~465 MB) y así por provincia, varios GB en total para toda la comunidad). Es un proceso en dos pasos:

```bash
# 1. Descarga una o varias provincias (repite --province para varias; sin
#    ninguna, descarga las 9 - varios GB, hazlo solo si de verdad quieres
#    toda la comunidad de una vez):
python scripts/download_land_cover.py --province Valladolid

# 2. Carga en PostGIS todo lo que haya en etl/data/mapacyl1/ (todas las
#    provincias descargadas hasta ahora), etiquetando cada polígono con su
#    municipio y provincia reales (ver database/schema/006_land_cover_province_municipality.sql):
python scripts/load_land_cover.py
```

`download_land_cover.py` no se ha podido ejecutar de extremo a extremo en el entorno donde se escribió (sin salida de red hacia opendata.jcyl.es desde ahí) — la estructura de carpetas y el patrón de nombres de fichero sí están confirmados contra el listado real, pero si el parseo del listado HTML da problemas, dímelo y se ajusta. `load_land_cover.py` tiene una lista de nombres de columna candidatos para la categoría de uso del suelo (`USO`, `USO_SUELO`, `CODIGO_USO`...) por la misma razón - si ninguno coincide, el script para con un error que lista las columnas reales del shapefile, y con ese nombre real es un cambio de una línea.

## Datasets de origen

| Script | Dataset | Formato original | Fuente |
|---|---|---|---|
| `load_waste_facilities.py` | Instalaciones de tratamiento de residuos | GeoPackage (.gpkg) | [Datos Abiertos JCyL](https://datosabiertos.jcyl.es/web/jcyl/set/es/medio-ambiente/cubierta-terrestre-poligonos/1284687161791) |
| `load_land_cover.py` | Cubierta terrestre y usos del suelo (mapacyl1) | Shapefile (.shp) | [Directorio de descargas](https://opendata.jcyl.es/ficheros/carto/mapacyl/mapacyl1/) |
| `load_hydrography.py` | Red hidrográfica y masas de agua | Shapefile / WFS | [Catálogo IDECYL](https://datosabiertos.jcyl.es/web/es/catalogo-datos/buscador-conjuntos-datos.html) |
| `load_protected_areas.py` | Red de Espacios Naturales Protegidos (REN) | Shapefile / WFS | [Catálogo Datos Abiertos JCyL](https://datosabiertos.jcyl.es/web/es/catalogo-datos/buscador-conjuntos-datos.html) |

Cada script está preparado para: leer el fichero fuente con GeoPandas, reproyectar a EPSG:4326 si hace falta, seleccionar/renombrar las columnas relevantes, y volcar el resultado a la tabla PostGIS correspondiente con `to_postgis`. Los TODOs marcados en cada fichero indican dónde ajustar los nombres de columna reales del dataset descargado (pueden variar ligeramente en cada actualización de la Junta).

El diccionario de datos completo (qué columnas tiene cada tabla resultante y qué significan) está en `docs/docs/diccionario-datos.md`.
