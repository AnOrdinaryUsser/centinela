# Imagen para ejecutar los scripts ETL (etl/scripts/*.py) dentro de la red
# interna de Docker, sin depender de la version de Python instalada en el
# host ni de exponer el puerto de postgis hacia fuera.
#
# No es un servicio "de siempre encendido": no tiene restart policy ni un
# proceso de fondo, se usa solo con "docker compose run --rm etl <comando>"
# (ver deploy.sh, paso 5). Por eso vive detras del profile "etl" en
# docker-compose.prod.yml - así "docker compose up" no intenta arrancarlo.
#
# Python 3.12 (no 3.11): en Ubuntu 24.04 python3.11 no esta en los
# repositorios por defecto (requeriria añadir el PPA deadsnakes), y estos
# paquetes (geopandas/shapely/etc, ver requirements.txt) tienen rueda
# precompilada para 3.12 igual que para 3.11 - la fijación a 3.11 en el
# README de esta carpeta es solo para tener rueda en Windows en el entorno
# de desarrollo local, no una necesidad real de esta imagen Linux.
FROM python:3.12-slim

WORKDIR /app

# gcc + libpq-dev: red de seguridad por si alguna dependencia (p.ej.
# psycopg2-binary en una arquitectura sin wheel precompilada, como ARM)
# tiene que compilarse en vez de instalar un wheel ya hecho.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# etl/data NO se copia a la imagen (ver .dockerignore) - se monta como
# volumen de solo lectura desde el host (docker-compose.prod.yml), igual
# que model-service/weights, porque son los ficheros pesados que subes por
# SFTP y no viven en la imagen ni en el repo.
COPY . .

CMD ["true"]
