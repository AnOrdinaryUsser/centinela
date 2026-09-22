#!/usr/bin/env bash
# Instala Docker (si hace falta) y levanta el stack completo de produccion
# de Centinela CYL (docker-compose.prod.yml) en un servidor Ubuntu.
#
# Uso:
#   1. Sube el repo al servidor (ver DEPLOYMENT.md / la lista de carpetas
#      que te dio Claude) a, por ejemplo, /opt/centinela-cyl
#   2. cd /opt/centinela-cyl
#   3. chmod +x deploy.sh && sudo ./deploy.sh
#
# El script es idempotente: puedes volver a ejecutarlo tras un "git pull"
# / una nueva subida por SFTP y solo reconstruira lo que haya cambiado.

set -euo pipefail

# ---------- Colores para que los mensajes destaquen en la terminal ----------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}==>${NC} $1"; }
warn()  { echo -e "${YELLOW}==>${NC} $1"; }
error() { echo -e "${RED}==>${NC} $1"; }

# ---------- 0. Comprobaciones basicas ----------
if [ "$EUID" -ne 0 ]; then
  error "Este script necesita permisos de root (instala paquetes y toca el firewall). Ejecuta: sudo ./deploy.sh"
  exit 1
fi

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"
info "Directorio del proyecto: $PROJECT_DIR"

if [ ! -f "docker-compose.prod.yml" ]; then
  error "No se encuentra docker-compose.prod.yml en este directorio. ¿Has subido el repo entero por SFTP?"
  exit 1
fi

# ---------- 1. Instalar Docker si no esta presente ----------
if ! command -v docker &> /dev/null; then
  info "Docker no esta instalado. Instalando (script oficial get.docker.com)..."
  curl -fsSL https://get.docker.com | sh
  if [ -n "${SUDO_USER:-}" ]; then
    usermod -aG docker "$SUDO_USER"
    warn "Se ha añadido $SUDO_USER al grupo 'docker'. Cierra sesión y vuelve a entrar (o ejecuta 'newgrp docker') para no tener que usar sudo con docker en el futuro."
  fi
else
  info "Docker ya esta instalado ($(docker --version))."
fi

if ! docker compose version &> /dev/null; then
  error "El plugin 'docker compose' no esta disponible aunque Docker sí lo está. Reinstala Docker con el script oficial (incluye el plugin) o instala 'docker-compose-plugin' manualmente."
  exit 1
fi

# ---------- 2. Comprobar los ficheros que no van en git (pesos y .env) ----------
MISSING=0

if [ ! -f "model-service/weights/best.pt" ]; then
  error "Falta model-service/weights/best.pt (los pesos entrenados del modelo). Sin ellos, el servicio arrancará en modo simulado (detecciones aleatorias)."
  warn "Cópialo por SFTP a model-service/weights/best.pt y vuelve a ejecutar este script."
  MISSING=1
fi

if [ ! -f ".env" ]; then
  if [ -f ".env.docker.example" ]; then
    cp ".env.docker.example" ".env"
    warn "No existía .env - se ha creado una copia de .env.docker.example."
    warn "Por defecto DOMAIN=:80, así que se puede desplegar tal cual (HTTP plano, sin dominio todavía) - solo revisa POSTGRES_PASSWORD antes de continuar."
  else
    error "No existe .env ni .env.docker.example. No se puede continuar."
    exit 1
  fi
fi

# Docker Compose exige que DOMAIN, POSTGRES_PASSWORD, etc. tengan un valor
# no vacío (ver docker-compose.prod.yml, "${DOMAIN:?...}") - si editaste
# .env a mano (p.ej. con "nano .env" antes de la primera ejecución de este
# script) y esas claves faltan o quedaron en blanco, "docker compose up"
# falla con un error bastante críptico ("required variable ... is missing
# a value"). Se comprueba aquí primero para dar un mensaje claro.
require_nonempty() {
  local key="$1"
  local value
  value=$(grep -E "^${key}=" .env 2>/dev/null | tail -n1 | cut -d '=' -f2- || true)
  if [ -z "$value" ]; then
    error "Falta (o está vacía) la variable ${key} en .env."
    MISSING=1
    return 1
  fi
  return 0
}

require_nonempty "DOMAIN" || true
require_nonempty "POSTGRES_PASSWORD" || true
require_nonempty "POSTGRES_DB" || true
require_nonempty "POSTGRES_USER" || true

# DOMAIN=:80 es un valor válido (modo HTTP sin dominio, ver .env.docker.example)
# - solo se avisa, no bloquea el despliegue. Sí bloquea si sigue con la
# contraseña de ejemplo, porque eso es un riesgo real en cuanto el
# servidor sea accesible desde internet.
if grep -q '^DOMAIN=:80' .env 2>/dev/null; then
  warn "DOMAIN=:80 - se desplegará en HTTP plano por el puerto 80, sin dominio ni HTTPS. Cuando el DNS de tu dominio propague, cambia DOMAIN en .env y vuelve a ejecutar este script."
fi
if grep -q '^POSTGRES_PASSWORD=change_me' .env 2>/dev/null; then
  error "POSTGRES_PASSWORD sigue siendo 'change_me' en .env. Cámbiala antes de exponer esto a internet."
  MISSING=1
fi

if [ "$MISSING" -eq 1 ]; then
  error "Corrige lo anterior y vuelve a ejecutar: sudo ./deploy.sh"
  exit 1
fi

info "Pesos del modelo y .env presentes y configurados."

# ---------- 3. Firewall (solo si ufw esta instalado y activo) ----------
if command -v ufw &> /dev/null; then
  if ufw status | grep -q "Status: active"; then
    info "Abriendo los puertos 80 (HTTP) y 443 (HTTPS) en ufw..."
    ufw allow 80/tcp  &> /dev/null || true
    ufw allow 443/tcp &> /dev/null || true
  else
    warn "ufw está instalado pero inactivo - no se toca. Asegúrate de que los puertos 80 y 443 llegan al servidor por algún otro medio (proveedor cloud, router doméstico...)."
  fi
else
  warn "ufw no está instalado - asegúrate por tu cuenta de que los puertos 80 y 443 están abiertos hacia este servidor."
fi

# ---------- 4. Construir y levantar el stack ----------
info "Construyendo las imágenes y levantando el stack (esto puede tardar varios minutos la primera vez)..."
docker compose -f docker-compose.prod.yml up -d --build

info "Estado de los contenedores:"
docker compose -f docker-compose.prod.yml ps

DOMAIN_VALUE=$(grep '^DOMAIN=' .env | cut -d '=' -f2-)
echo ""
if [ "$DOMAIN_VALUE" = ":80" ]; then
  SERVER_IP=$(curl -s -4 ifconfig.me 2>/dev/null || echo "<ip-de-este-servidor>")
  info "Despliegue lanzado en modo HTTP (sin dominio). En uno o dos minutos, http://${SERVER_IP} debería responder."
else
  info "Despliegue lanzado. En uno o dos minutos, https://${DOMAIN_VALUE} debería responder con el certificado HTTPS ya emitido."
fi
info "Sigue el progreso de Caddy con:"
echo "    docker compose -f docker-compose.prod.yml logs -f frontend"
info "Para cargar los datasets de datos abiertos, ver la sección correspondiente de DEPLOYMENT.md."
