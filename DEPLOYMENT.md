# Guía de despliegue — CENTINELA CYL

Esta guía explica cómo poner Centinela CYL en un servidor propio (Ubuntu Server o Windows), accesible a través de un dominio que compres, con HTTPS automático.

Hay dos caminos. Si no tienes preferencia, usa la **Opción A**: es idéntica en Ubuntu y en Windows, y es la que mantiene actualizada con más detalle este documento.

- [Requisitos previos](#requisitos-previos)
- [Dominio y DNS](#dominio-y-dns)
- [Provisionar lo que no está en el repositorio](#provisionar-lo-que-no-está-en-el-repositorio-pesos-del-modelo-y-datos)
- [Opción A — Docker Compose (recomendada)](#opción-a--docker-compose-recomendada)
- [Opción B — instalación nativa en Ubuntu (sin Docker)](#opción-b--instalación-nativa-en-ubuntu-sin-docker)
- [Referencia de variables de entorno](#referencia-de-variables-de-entorno)
- [Checklist de seguridad](#checklist-de-seguridad)
- [Solución de problemas](#solución-de-problemas)

## Requisitos previos

- Un servidor con IP pública fija (una VPS de cualquier proveedor, o un servidor en casa con la IP de tu router y los puertos abiertos — ver más abajo).
- Un dominio comprado en cualquier registrador (Namecheap, OVH, Nominalia, IONOS...). No hace falta ningún proveedor concreto.
- Puertos **80** y **443** abiertos hacia el servidor (los usa Caddy para HTTP→HTTPS y para el propio HTTPS, incluida la validación automática del certificado Let's Encrypt). Si el servidor está detrás de un router doméstico, esto significa redirigir esos dos puertos hacia la IP local del servidor desde el panel del router.
- Los pesos entrenados del modelo (`best.pt`) y, si quieres los datasets reales cargados desde el primer minuto, acceso a `etl/data` — ver [Provisionar lo que no está en el repositorio](#provisionar-lo-que-no-está-en-el-repositorio-pesos-del-modelo-y-datos).

## Dominio y DNS

El dominio de este proyecto es **`centinelajcyl.es`**.

1. En el panel de tu registrador, crea un registro **A** que apunte `centinelajcyl.es` (y, si lo quieres también accesible como `www.centinelajcyl.es`, otro registro A o un CNAME hacia el mismo dominio) a la IP pública del servidor. Un registro A es simplemente "este nombre = esta IP".
2. Espera a que se propague (puede tardar de minutos a un par de horas). Compruébalo con:
   ```bash
   nslookup centinelajcyl.es
   ```
   hasta que devuelva la IP correcta de tu servidor.
3. No sigas al siguiente paso hasta que el DNS resuelva bien — Caddy pide el certificado HTTPS la primera vez que arranca, y Let's Encrypt necesita poder llegar a tu servidor por ese dominio para verificarlo. Si el DNS todavía no propagó, Caddy fallará al pedir el certificado (reintenta solo, así que si arrancas de más y el DNS termina de propagar poco después, se recupera sin que tengas que hacer nada).

### Desplegar ya en el puerto 80, mientras el DNS de centinelajcyl.es propaga

No hace falta esperar a que el DNS resuelva para empezar a probar el stack: `.env.docker.example` trae por defecto `DOMAIN=:80`, que es la sintaxis de Caddy para "sirve en HTTP plano por el puerto 80, en cualquier interfaz, sin intentar pedir certificado". Con eso tal cual, `http://<ip-de-tu-servidor>` funciona nada más desplegar.

En cuanto `centinelajcyl.es` resuelva a la IP de tu servidor, edita `DOMAIN` en tu `.env` a `DOMAIN=centinelajcyl.es` y vuelve a ejecutar `docker compose -f docker-compose.prod.yml up -d` (o `./deploy.sh` otra vez) — Caddy pasa a HTTPS automáticamente en `https://centinelajcyl.es`, sin más cambios.

## Provisionar lo que no está en el repositorio (pesos del modelo y datos)

Dos cosas están deliberadamente excluidas de git (ver `.gitignore`) y hay que llevarlas al servidor por separado:

- **`model-service/weights/best.pt`**: tu checkpoint entrenado de YOLOv8. Cópialo al servidor con `scp`:
  ```bash
  scp best.pt usuario@tu-servidor:/ruta/al/repo/model-service/weights/best.pt
  ```
  Sin este fichero, el `model-service` arranca igualmente pero en modo simulado (detecciones aleatorias) — útil para probar que todo el resto del stack funciona, pero no lo que quieres en producción real.
- **Los datasets de `etl/data`** (si no los has cargado ya en una base de datos que vayas a reutilizar): cópialos igual con `scp -r etl/data usuario@tu-servidor:/ruta/al/repo/etl/` y sigue el paso de carga descrito en cada opción más abajo.

## Opción A — Docker Compose (recomendada)

Funciona igual en Ubuntu Server (Docker Engine) que en Windows (Docker Desktop) — los comandos son los mismos.

### 1. Instalar Docker

**Ubuntu:**
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# cierra sesión y vuelve a entrar para que el grupo surta efecto
```

**Windows:** instala [Docker Desktop](https://www.docker.com/products/docker-desktop/) (requiere WSL2, que el propio instalador te ofrece activar si no lo tienes).

### 2. Clonar el repositorio y configurar variables

```bash
git clone <url-de-tu-repositorio> centinela-cyl
cd centinela-cyl
cp .env.docker.example .env
```

Edita `.env` y como mínimo cambia:
- `DOMAIN` → tu dominio real (el que apuntaste en el paso de DNS).
- `POSTGRES_PASSWORD` → una contraseña propia, no la de ejemplo.
- `ACCESS_TOKEN` y `VITE_ACCESS_TOKEN` → opcional, ver [Checklist de seguridad](#checklist-de-seguridad).

### 3. Copiar los pesos del modelo

```bash
cp /ruta/donde/lo/hayas/copiado/best.pt model-service/weights/best.pt
```

### 4. Levantar el stack completo

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Esto construye las tres imágenes propias (`backend`, `model-service`, `frontend`) y arranca los cuatro servicios (`postgis`, `model-service`, `backend`, `frontend`). La primera vez, `postgis` ejecuta automáticamente todo `database/schema/*.sql` para crear las tablas.

Comprueba que todo está sano:
```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f frontend   # aquí verás a Caddy pidiendo el certificado HTTPS
```

En un par de minutos, `https://tudominio.es` debería responder con la app, con certificado válido.

### 5. Cargar los datasets de datos abiertos

Con los contenedores ya arriba, ejecuta los scripts ETL apuntando a la base de datos del contenedor `postgis` (expón temporalmente el puerto o ejecuta el script desde dentro de la red de Docker):

```bash
# Opción rápida: ejecutar los scripts desde tu propia máquina, apuntando
# al puerto de postgis (añade temporalmente "ports: [\"5432:5432\"]" al
# servicio postgis en docker-compose.prod.yml y recarga con
# "docker compose -f docker-compose.prod.yml up -d" antes de esto):
cd etl
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # ajusta POSTGRES_HOST=tu-servidor, POSTGRES_PORT=5432
python scripts/load_waste_facilities.py
python scripts/load_hydrography.py
python scripts/load_protected_areas.py
```

Quita de nuevo el `ports:` de `postgis` en `docker-compose.prod.yml` cuando termines, si no necesitas acceso externo a la base de datos de forma permanente (ver la nota de seguridad en ese mismo fichero).

### 6. Actualizar tras un cambio de código

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Docker Compose solo reconstruye y reinicia los servicios cuyo contexto de build cambió.

## Opción B — instalación nativa en Ubuntu (sin Docker)

### 1. Dependencias del sistema

```bash
sudo apt update
sudo apt install -y curl git postgresql postgresql-contrib postgis python3.11 python3.11-venv

# Node.js 20 (vía NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Caddy (repositorio oficial)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

### 2. Base de datos

```bash
sudo -u postgres createuser centinela --pwprompt
sudo -u postgres createdb centinela_cyl -O centinela
sudo -u postgres psql -d centinela_cyl -c "CREATE EXTENSION postgis;"
psql -h localhost -U centinela -d centinela_cyl -f database/schema/001_extensions.sql
# ... y el resto de ficheros de database/schema/ en orden numérico
```

### 3. Clonar el repo y crear el usuario de servicio

```bash
sudo useradd --system --group --home-dir /opt/centinela-cyl centinela
sudo git clone <url-de-tu-repositorio> /opt/centinela-cyl
sudo chown -R centinela:centinela /opt/centinela-cyl
cd /opt/centinela-cyl
```

### 4. Backend

```bash
cd backend
sudo -u centinela cp .env.example .env
# edita .env: POSTGRES_PASSWORD, MODEL_SERVICE_URL=http://localhost:8000
sudo -u centinela npm install --omit=dev
```

### 5. Model-service (con los pesos ya copiados en `weights/best.pt`)

```bash
cd ../model-service
sudo -u centinela python3.11 -m venv .venv
sudo -u centinela .venv/bin/pip install -r requirements.txt
sudo -u centinela cp .env.example .env
```

### 6. Habilitar los servicios con systemd

```bash
cd ..
sudo cp deploy/systemd/centinela-backend.service /etc/systemd/system/
sudo cp deploy/systemd/centinela-model.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now centinela-backend centinela-model
sudo systemctl status centinela-backend centinela-model
```

### 7. Compilar el frontend

```bash
cd frontend
sudo -u centinela cp .env.example .env
# en .env, deja VITE_BACKEND_URL="" (vacío) para que use rutas relativas
# a través de Caddy, igual que en la Opción A
sudo -u centinela npm install
sudo -u centinela npm run build   # genera frontend/dist/
```

### 8. Configurar Caddy

Edita `/etc/caddy/Caddyfile` (sustituye `tudominio.es` y la ruta al `dist/`):

```
tudominio.es {
    encode gzip
    @api path /api/* /health
    reverse_proxy @api localhost:4000
    root * /opt/centinela-cyl/frontend/dist
    file_server
    try_files {path} /index.html
}
```

```bash
sudo systemctl reload caddy
```

Caddy pedirá el certificado HTTPS automáticamente en cuanto reciba la primera petición al dominio.

### 9. Cargar los datasets

```bash
cd /opt/centinela-cyl/etl
sudo -u centinela python3.11 -m venv .venv
sudo -u centinela .venv/bin/pip install -r requirements.txt
sudo -u centinela cp .env.example .env    # POSTGRES_HOST=localhost
sudo -u centinela .venv/bin/python scripts/load_waste_facilities.py
sudo -u centinela .venv/bin/python scripts/load_hydrography.py
sudo -u centinela .venv/bin/python scripts/load_protected_areas.py
```

## Referencia de variables de entorno

| Variable | Dónde | Descripción |
|---|---|---|
| `DOMAIN` | raíz (`.env`, solo Docker) | Dominio propio; Caddy pide el certificado HTTPS para este valor exacto |
| `POSTGRES_HOST` / `PORT` / `DB` / `USER` / `PASSWORD` | backend, model-service (indirecto), raíz | Conexión a PostgreSQL/PostGIS. En Docker, `POSTGRES_HOST=postgis`; nativo, `localhost` |
| `BACKEND_PORT` | backend | Puerto donde escucha la API (4000 por defecto) |
| `MODEL_SERVICE_URL` | backend | URL del `model-service` tal y como el backend lo alcanza — `http://model-service:8000` en Docker, `http://localhost:8000` nativo |
| `ACCESS_TOKEN` | backend | Opcional. Si se define, exige la cabecera `X-App-Token` en las rutas de análisis/subida/estadísticas |
| `MODEL_WEIGHTS_PATH` | model-service | Ruta al checkpoint entrenado (`./weights/best.pt`) |
| `MODEL_TILE_SIZE` | model-service | Tamaño en píxeles del recorte pedido al WMS de PNOA por celda |
| `DEFAULT_CONFIDENCE_THRESHOLD` | model-service | Umbral de confianza por defecto del modelo |
| `PNOA_WMS_URL` / `PNOA_LAYER` | model-service | Endpoint del servicio WMS público de PNOA |
| `VITE_BACKEND_URL` | frontend (build-time) | **Vacío (`""`) en producción** para usar rutas relativas vía Caddy; sin definir en desarrollo LAN para autodetectar el host |
| `VITE_ACCESS_TOKEN` | frontend (build-time) | Debe coincidir con `ACCESS_TOKEN` del backend si lo activas |
| `VITE_PNOA_WMS_URL` | frontend (build-time) | URL del WMS de PNOA usada por el visor de mapa del propio frontend |

## Checklist de seguridad

- [ ] `POSTGRES_PASSWORD` cambiada respecto al valor de ejemplo.
- [ ] Puerto 5432 (PostgreSQL) **no** expuesto a internet — en `docker-compose.prod.yml` el servicio `postgis` no publica puertos por defecto; en la instalación nativa, PostgreSQL escucha solo en `localhost` salvo que lo cambies explícitamente en `postgresql.conf`.
- [ ] `model-service` **no** expuesto directamente a internet — solo el backend le habla, por red interna (Docker) o `localhost` (nativo); nunca debería tener un puerto público.
- [ ] Decidido si quieres activar `ACCESS_TOKEN`/`VITE_ACCESS_TOKEN`. Recuerda: CORS abierto no es un problema de seguridad por sí solo (solo afecta a peticiones hechas desde un navegador), pero cualquiera que conozca la URL de tu dominio puede llamar a la API directamente con un script — el limitador de peticiones por IP está siempre activo y ayuda con eso, pero si quieres restringir quién puede ejecutar inferencia del todo, el token es la forma de hacerlo.
- [ ] Copia de seguridad periódica del volumen `centinela_postgis_data` (o del directorio de datos de PostgreSQL en la instalación nativa) — contiene tanto los datasets cargados como las estadísticas globales acumuladas.

## Solución de problemas

Estos son bugs concretos ya diagnosticados y corregidos durante el desarrollo de este proyecto — si te encuentras con algo parecido en producción, es casi seguro que es esto:

- **La app funciona en el propio servidor pero no desde otro dispositivo/tras el dominio**: revisa que `frontend/.env` (o el build de producción) no tenga `VITE_BACKEND_URL=http://localhost:4000` sin comentar — eso fuerza a cualquier dispositivo a intentar conectar a "su propio" localhost en vez de al servidor real. En producción debe ser una cadena vacía (`VITE_BACKEND_URL=`), para que las peticiones sean relativas (`/api/...`) y pasen por Caddy.
- **`crypto.randomUUID is not a function` en la consola del navegador**: solo puede pasar si sirves la app por HTTP plano sin dominio/HTTPS (no es un "contexto seguro" del navegador). Con Caddy y un dominio real (HTTPS automático) no debería reaparecer; si aparece, comprueba que el certificado se emitió correctamente (`docker compose -f docker-compose.prod.yml logs frontend`).
- **`ImportError: libGL.so.1: cannot open shared object file` al construir/arrancar `model-service`**: falta `libgl1`/`libglib2.0-0` en la imagen — ya están incluidos en `model-service/Dockerfile`; si lo tocas, no los quites.
- **El certificado HTTPS no se emite / Caddy se queda reintentando**: casi siempre es que el DNS todavía no ha propagado, o que el puerto 80/443 no está realmente abierto hacia el servidor (revísalo con `curl -I http://tudominio.es` desde otra red). Caddy reintenta solo, no hace falta reiniciar nada una vez el DNS/puertos estén bien.
- **El modelo devuelve detecciones aleatorias que no tienen sentido**: `model-service/weights/best.pt` no está presente (modo simulado) — revisa el paso de [provisionar los pesos del modelo](#provisionar-lo-que-no-está-en-el-repositorio-pesos-del-modelo-y-datos).
