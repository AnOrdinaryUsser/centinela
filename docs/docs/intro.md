---
sidebar_position: 1
---

# Introducción

**Centinela CyL** es una plataforma web de código abierto y orientada al servicio público para identificar, analizar y reportar posibles vertederos ilegales en la Comunidad de Castilla y León.

El sistema combina un modelo de Deep Learning / Computer Vision, capaz de detectar posibles vertederos en imágenes aéreas/satelitales, con varias capas de Datos Abiertos de la Junta de Castilla y León que enriquecen cada predicción con contexto ambiental, legal y territorial.

Se presenta al **Concurso de Datos Abiertos de la Comunidad de Castilla y León**, en la categoría de **Productos y Servicios**.

## Objetivos del MVP

1. **Mapa interactivo de selección** — el usuario selecciona una cuadrícula sobre el mapa de Castilla y León, que se divide automáticamente en celdas más pequeñas para su análisis.
2. **Visor de predicciones e imágenes** — muestra las zonas analizadas junto con el porcentaje de confianza de la IA, con un selector de umbral (85%–99%).
3. **Cruce masivo de datos abiertos** — cada detección se cruza espacialmente con las capas oficiales de la Junta para generar una alerta ambiental y de uso del suelo.
4. **Dashboard de estadísticas globales** — métricas públicas del impacto de la app (superficie analizada, alertas detectadas, etc.).

## Principios de diseño

- **Cero fricción**: no hace falta registrarse ni iniciar sesión para usar el mapa.
- **Privacidad por defecto**: el historial de análisis de cada usuario se guarda solo en su navegador (`localStorage`), nunca se asocia a una identidad.
- **Datos abiertos como valor diferencial**: la detección por sí sola es solo el punto de partida; el cruce con las capas oficiales es lo que convierte una detección en una alerta accionable.

Sigue con [Arquitectura](./arquitectura.md) para ver cómo están organizados los servicios.
