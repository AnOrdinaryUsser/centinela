# Frontend — Centinela CyL

Aplicación en React (Vite) con componentes de CoreUI para la interfaz y Leaflet para el mapa interactivo.

## Puesta en marcha

```bash
npm install
cp .env.example .env
npm run dev
```

Se abre en `http://localhost:5173`. Necesita que el `backend` esté levantado (por defecto en `http://localhost:4000`) para poder pedir predicciones y datos de contexto.

## Estructura

- `src/pages/MapPage.jsx` — pantalla principal: mapa PNOA, selección de cuadrícula, disparo del análisis.
- `src/pages/DashboardPage.jsx` — panel de estadísticas globales (alimentado por el backend).
- `src/components/GridSelector.jsx` — dibuja y divide en celdas la zona seleccionada por el usuario.
- `src/components/DetectionPanel.jsx` — muestra las detecciones, su % de confianza y el selector de umbral (85%–99%).
- `src/services/api.js` — cliente HTTP hacia el backend.
- `src/services/history.js` — historial de análisis del usuario guardado en `localStorage` (sin necesidad de cuenta).

## Notas de diseño

- No hay login obligatorio: cualquier visitante puede usar el mapa de inmediato.
- El historial de cuadrículas analizadas es privado del navegador del usuario (localStorage), nunca se envía al servidor salvo para contribuir de forma anónima a las estadísticas agregadas.
- El fondo de mapa usa el servicio WMS público de PNOA (IGN); las capas de datos abiertos de la Junta se sirven ya procesadas desde el backend.
