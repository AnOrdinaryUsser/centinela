# Production image for the Centinela CYL frontend.
#
# Vite bakes VITE_* variables into the JS bundle at BUILD time, not at
# container start - unlike the backend, there's no "runtime env var" for
# these, so they have to arrive as build ARGs. VITE_BACKEND_URL defaults
# to an EMPTY string here (not unset): behind the reverse proxy this
# image is meant to run behind (see /Caddyfile), frontend and backend
# share one domain, so the frontend should call "/api/..." relative to
# itself rather than any absolute host:port - see the comment in
# src/services/api.js for why "" and "unset" have to be handled
# differently there.
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .

ARG VITE_BACKEND_URL=""
ARG VITE_ACCESS_TOKEN=""
ARG VITE_PNOA_WMS_URL="https://www.ign.es/wms-inspire/pnoa-ma"
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}
ENV VITE_ACCESS_TOKEN=${VITE_ACCESS_TOKEN}
ENV VITE_PNOA_WMS_URL=${VITE_PNOA_WMS_URL}
RUN npm run build

# Caddy both serves the static build AND (per /Caddyfile) reverse-proxies
# /api and /health to the backend container, so the browser only ever
# talks to one origin - simpler and safer than exposing the backend's
# own port directly to the internet.
FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
