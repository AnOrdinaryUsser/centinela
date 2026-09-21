# CENTINELA CYL

[![Licencia: CC BY-NC-SA 4.0](https://licensebuttons.net/l/by-nc-sa/4.0/88x31.png)](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.es)
![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)
![Python](https://img.shields.io/badge/python-3.11-3776AB?logo=python&logoColor=white)
![React](https://img.shields.io/badge/react-18-61DAFB?logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)
![YOLOv8](https://img.shields.io/badge/YOLOv8-Ultralytics-00FFFF?logo=yolo&logoColor=black)
![PostGIS](https://img.shields.io/badge/PostgreSQL%2FPostGIS-16-336791?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/docker-compose-2496ED?logo=docker&logoColor=white)
![Estado](https://img.shields.io/badge/estado-en%20desarrollo-yellow)

Sistema de detección y análisis de vertederos ilegales con Inteligencia Artificial y Datos Abiertos de la Junta de Castilla y León.

Proyecto presentado al **Concurso de Datos Abiertos de la Comunidad de Castilla y León**, categoría *Productos y Servicios*.

## Índice

- [¿Qué es Centinela CYL?](#qué-es-centinela-cyl)
- [Cómo se ha construido](#cómo-se-ha-construido)
- [Arquitectura](#arquitectura)
- [Puesta en marcha rápida (desarrollo local)](#puesta-en-marcha-rápida-desarrollo-local)
- [Despliegue en producción](#despliegue-en-producción)
- [Seguridad y acceso en red](#seguridad-y-acceso-en-red)
- [Datasets de Datos Abiertos utilizados](#datasets-de-datos-abiertos-utilizados)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Licencia](#licencia)

## ¿Qué es Centinela CYL?

Una plataforma web de acceso libre (sin registro obligatorio) que permite a cualquier ciudadano o técnico:

1. Seleccionar una zona de Castilla y León sobre un mapa interactivo, dividida en una cuadrícula de celdas analizables.
2. Analizar cada celda con un modelo de Deep Learning entrenado específicamente para detectar posibles vertederos ilegales en imagen aérea (PNOA, Plan Nacional de Ortofotografía Aérea).
3. Ver cada detección enriquecida automáticamente con datos abiertos oficiales de la Junta: distancia al punto limpio o vertedero legal más cercano, tipo de cubierta del suelo, proximidad a cauces y si cae dentro de un espacio natural protegido.
4. Consultar un mapa público y un dashboard con estadísticas agregadas y anónimas de uso de la plataforma (superficie analizada, alertas detectadas, etc.), para que el impacto del proyecto sea visible más allá de cada búsqueda individual.

## Cómo se ha construido

### El modelo de detección

El núcleo del proyecto es un modelo **YOLOv8s (Ultralytics)** entrenado como detector de una sola clase (`dump_site`) sobre imágenes aéreas PNOA anotadas manualmente. El entrenamiento de referencia (`exp_1_e200_b8_lr0.001`) usó 200 épocas, batch size 8 y resolución de entrada 640×640, alcanzando en la época final una precisión de 0.96, recall de 0.88, mAP50 de 0.94 y mAP50-95 de 0.77.

En producción, el `model-service` (FastAPI) recibe el `bounds` (bounding box WGS84) de una celda del grid, pide esa zona al servicio WMS público de PNOA como una imagen configurable (960×960 por defecto, vía `MODEL_TILE_SIZE`), la reescala a la resolución de entrenamiento del modelo (640×640, independiente del tamaño de tile para no desajustar la escala que el modelo espera) y convierte cada caja detectada de vuelta a coordenadas geográficas reales usando el propio `bounds` de la petición. Si no hay un checkpoint entrenado disponible (`weights/best.pt` no existe — está excluido de git a propósito), el servicio arranca igualmente en modo simulado, generando detecciones aleatorias, para no bloquear el desarrollo del resto de la plataforma mientras se entrena o se integra el modelo real.

### La plataforma alrededor del modelo

El modelo por sí solo solo da una caja y una confianza; el valor añadido de Centinela CYL está en la orquestación alrededor de esa predicción:

- El **backend** (Node.js/Express) es la única pieza que habla tanto con PostgreSQL/PostGIS como con el `model-service`, y expone una API REST documentada con Swagger/OpenAPI (`/api-docs`). Cuando una celda se analiza, además de reenviar la petición al modelo, resuelve en la misma pasada las consultas espaciales sobre las capas de datos abiertos (distancia a instalaciones de residuos, hidrografía, cubierta del suelo, espacios protegidos) para que el frontend reciba una detección ya enriquecida, sin peticiones adicionales.
- El **frontend** (React + Vite + CoreUI + Leaflet) es donde vive la experiencia real: selección interactiva de zona y tamaño de celda, análisis por lotes con concurrencia limitada (para no saturar ni el WMS de PNOA ni el propio modelo), un log de inferencia en vivo, un visor de detecciones con umbral de confianza ajustable en el cliente (todas las celdas se analizan siempre a partir de 0.5 de confianza; el slider solo filtra lo ya recibido, sin volver a llamar al modelo), un mapa público de datos abiertos con leyenda plegable, y un dashboard de estadísticas globales.
- La **base de datos** (PostgreSQL 16 + PostGIS 3.4) almacena tanto las capas geoespaciales de datos abiertos normalizadas como las estadísticas agregadas de uso — nunca datos personales: las estadísticas globales son contadores anónimos (superficie analizada, número de detecciones), no un histórico por usuario.
- Los **scripts ETL** (Python + GeoPandas) cargan y normalizan los datasets originales de la JCyL/IDECYL (que llegan en formatos y proyecciones distintos entre sí) a un esquema PostGIS común, para que el backend pueda hacer las mismas consultas espaciales sin preocuparse del origen de cada capa.

### Decisiones de diseño que han ido surgiendo con el uso real

Varias piezas del proyecto existen por problemas concretos encontrados probando la plataforma en condiciones reales, no solo en el diseño inicial en el papel:

- **Acceso desde otros dispositivos de la misma red** (por ejemplo, un móvil o el ordenador de otra persona en el mismo WiFi): el servidor de desarrollo de Vite solo escucha en `localhost` por defecto, así que se activó `host: true` en `vite.config.js` para que escuche en todas las interfaces de red, y el cliente de la API (`frontend/src/services/api.js`) dejó de asumir `localhost:4000` fijo — ahora usa el mismo host con el que se cargó la propia página, para que funcione igual desde `localhost`, `127.0.0.1` o una IP de LAN sin tocar ningún `.env`.
- **Generación de IDs sin `crypto.randomUUID()`**: esa función solo existe en un "contexto seguro" del navegador (HTTPS, o `localhost` de la propia página); abrir la app desde otro dispositivo por `http://<ip-de-lan>:5173` no lo es, así que los IDs del log de inferencia se generan con `Date.now()` + un sufijo aleatorio, sin depender de ninguna API específica del navegador.
- **Acceso controlado sin un sistema de usuarios completo**: para poder abrir el backend a la red (o a internet, en producción) sin que cualquiera pueda lanzar inferencia gratis contra el modelo, se añadió una cabecera compartida opcional (`X-App-Token` / `ACCESS_TOKEN`, ver `backend/src/middleware/accessControl.js`) que es un no-op si no se configura, más un limitador de peticiones por IP que está siempre activo, configuración aparte. Ver [Seguridad y acceso en red](#seguridad-y-acceso-en-red).

## Arquitectura

El proyecto está dividido en servicios independientes:

| Carpeta | Tecnología | Responsabilidad |
|---|---|---|
| `frontend` | React + Vite + CoreUI + Leaflet | Interfaz web: mapa, selección de cuadrícula, visor de predicciones, dashboard |
| `backend` | Node.js + Express | API REST, orquestación de peticiones, consultas espaciales, estadísticas |
| `model-service` | Python + FastAPI + Ultralytics (YOLOv8) | Sirve el modelo de Deep Learning entrenado (detección de vertederos) |
| `database` | PostgreSQL + PostGIS | Capas geoespaciales de datos abiertos + estadísticas globales |
| `etl` | Python + GeoPandas | Scripts de carga y normalización de los datasets abiertos de la JCyL a PostGIS |
| `docs` | Docusaurus | Documentación completa del proyecto (arquitectura, instalación, diccionario de datos) |
| `deploy` | systemd | Unidades de servicio para el despliegue nativo (sin Docker) en Ubuntu |

En producción, un quinto "servicio" entra en juego solo detrás de un dominio propio: **Caddy**, que sirve el `frontend` ya compilado y hace de proxy inverso hacia el `backend`, terminando HTTPS automáticamente. Ver [Despliegue en producción](#despliegue-en-producción).

Para el detalle completo de la arquitectura, cómo se comunican los servicios entre sí y las decisiones de diseño, consulta el sitio de documentación en `/docs` (ver más abajo cómo arrancarlo).

Convención del proyecto: **todo el código (nombres de variables, funciones, comentarios en el código) está en inglés**; **toda la documentación (READMEs, sitio de docs, comentarios de negocio) está en español**.

## Puesta en marcha rápida (desarrollo local)

Requisitos previos: Node.js 20+, **Python 3.11 exactamente** (las dependencias geoespaciales y de IA solo tienen rueda precompilada para Windows en esa versión — una versión más nueva puede forzar una compilación local que falle), PostgreSQL 15+ con la extensión PostGIS (o Docker Desktop, ver más abajo).

```powershell
# 1. Base de datos (PostGIS) - con Docker Desktop instalado y en marcha
docker compose up -d

# 2. Cargar los datasets reales ya incluidos en /etl/data
cd etl
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
python scripts\load_waste_facilities.py
python scripts\load_hydrography.py
python scripts\load_protected_areas.py
cd ..

# 3. Servicio del modelo de IA (copia antes tu best.pt en model-service\weights\)
cd model-service
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000

# 4. Backend (en otra terminal)
cd backend
copy .env.example .env
npm install
npm run dev             # http://localhost:4000  |  Swagger UI en /api-docs

# 5. Frontend (en otra terminal)
cd frontend
copy .env.example .env
npm install
npm run dev             # http://localhost:5173 (y accesible desde otros
                         # dispositivos de tu misma red, ver más abajo)

# 6. Documentación (opcional, en otra terminal)
cd docs
npm install
npm run start            # http://localhost:3000
```

También hay un `docker-compose.yml` en la raíz para levantar solo PostgreSQL/PostGIS rápidamente en local — no confundir con `docker-compose.prod.yml`, que levanta el stack completo (ver siguiente sección).

### Acceder desde otro dispositivo de tu misma red (durante el desarrollo)

Con el frontend arrancado (`npm run dev`), la propia terminal de Vite imprime, además de `http://localhost:5173`, una URL de red (`http://<tu-ip-lan>:5173`). Cualquier otro dispositivo en la misma red WiFi/LAN puede abrir esa URL y usar la app con normalidad — el frontend detecta automáticamente el host correcto para hablar con el backend. Si tu `frontend/.env` tiene la línea `VITE_BACKEND_URL=http://localhost:4000` sin comentar, cámbiala o coméntala: forzaría a cualquier dispositivo a intentar conectarse a "su propio" localhost, no al tuyo.

## Despliegue en producción

Para poner Centinela CYL en un dominio propio (Ubuntu Server o Windows), con HTTPS automático, hay una guía completa paso a paso en **[`DEPLOYMENT.md`](./DEPLOYMENT.md)**, con dos caminos:

- **Opción A — Docker Compose** (recomendada, idéntica en Ubuntu con Docker Engine o en Windows con Docker Desktop): `docker-compose.prod.yml` levanta los cuatro servicios (`postgis`, `model-service`, `backend`, `frontend`+Caddy) con un solo comando, y Caddy gestiona el certificado HTTPS de tu dominio automáticamente.
- **Opción B — instalación nativa en Ubuntu** (sin contenedores): unidades `systemd` en `deploy/systemd/` para el backend y el model-service, más Caddy instalado como paquete del sistema.

## Seguridad y acceso en red

Por defecto, CORS está completamente abierto (necesario para que la app se pueda abrir desde cualquier IP de tu propia red o dominio sin configurar nada), pero **CORS solo protege frente a peticiones hechas desde un navegador** — no impide que alguien con `curl`, Postman o un script llame directamente a la API si conoce la URL. Por eso, además de CORS, el backend tiene dos capas de protección explícitas:

1. **Limitador de peticiones por IP** (siempre activo, sin configuración): `backend/src/middleware/accessControl.js` limita cuántas veces por minuto se puede llamar a `/api/detections/analyze`, `/api/analysis-images` y `/api/stats/report` desde una misma IP, devolviendo `429` con `Retry-After` al superarlo.
2. **Token de acceso compartido** (opcional, desactivado por defecto): definiendo `ACCESS_TOKEN` en `backend/.env` (y el mismo valor en `VITE_ACCESS_TOKEN` en `frontend/.env`), esas mismas rutas exigen la cabecera `X-App-Token` con ese valor. Sin `ACCESS_TOKEN` definido, esta comprobación es un no-op: no cambia nada del comportamiento actual en desarrollo o en una red de confianza.

Este diseño responde a un caso de uso concreto: permitir que cualquiera en tu misma red (o, en producción, cualquier visitante de tu dominio) pueda analizar celdas igual que tú, sin necesidad de usuarios ni contraseñas — el token es para el caso en que quieras restringir quién puede ejecutar inferencia (por ejemplo, si abres el backend a todo internet y quieres evitar abuso), no para un control de acceso por usuario.

## Datasets de Datos Abiertos utilizados

- Instalaciones de tratamiento de residuos (JCyL)
- Cubierta terrestre y usos del suelo (JCyL)
- Red hidrográfica y masas de agua (IDECYL)
- Red de Espacios Naturales Protegidos - REN (JCyL)

El detalle de cada dataset, su formato original y cómo se normaliza a PostGIS está documentado en `docs/docs/diccionario-datos.md` y en `etl/README.md`.

## Estructura del repositorio

```
/frontend        -> Aplicación React (mapa, dashboard, visor de predicciones)
/backend         -> API REST Node/Express (orquestación, PostGIS, estadísticas)
/model-service   -> Servicio Python/FastAPI que sirve el modelo de detección
/database        -> Esquema SQL de PostgreSQL/PostGIS
/etl             -> Scripts de carga de los datasets abiertos de la JCyL
/docs            -> Sitio de documentación (Docusaurus)
/deploy/systemd  -> Unidades systemd para el despliegue nativo en Ubuntu
DEPLOYMENT.md    -> Guía paso a paso de despliegue en producción (dominio propio + HTTPS)
docker-compose.yml       -> Solo PostGIS, para desarrollo local
docker-compose.prod.yml  -> Stack completo de producción
Caddyfile                -> Configuración del proxy inverso/HTTPS para producción
```

## Licencia

Este proyecto se publica bajo **Creative Commons Atribución-NoComercial-CompartirIgual 4.0 Internacional (CC BY-NC-SA 4.0)**.

En resumen (esto no sustituye al texto legal completo, ver `LICENSE`):

- **Puedes**: copiar, redistribuir y modificar/adaptar el proyecto, en cualquier medio o formato.
- **Debes**: citar la autoría (Sergio, Esalab) y enlazar a la licencia; indicar claramente si has hecho cambios; y, si redistribuyes una versión modificada, hacerlo bajo esta misma licencia (CC BY-NC-SA 4.0) — es lo que se llama "copyleft" o "compartir igual".
- **No puedes**: darle un uso comercial al proyecto ni a tus versiones modificadas de él, sin permiso explícito del autor.

Texto legal completo: [`LICENSE`](./LICENSE) o [creativecommons.org/licenses/by-nc-sa/4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.es).

Nota: los propios *datasets* de datos abiertos que consume el proyecto (JCyL, IDECYL) conservan su licencia de origen — esta licencia cubre el software de Centinela CYL, no esos datos.
