# Documentación — Centinela CyL

Sitio de documentación del proyecto, construido con [Docusaurus](https://docusaurus.io/). Todo el contenido está en español.

## Puesta en marcha

```bash
npm install
npm run start
```

Se abre en `http://localhost:3000`. Enlaza también al Swagger UI del backend (`/api-docs`) y del model-service (`/docs`), así que para verlos integrados conviene tener esos dos servicios levantados en paralelo.

## Contenido

- `docs/intro.md` — qué es Centinela CyL y objetivos del MVP.
- `docs/arquitectura.md` — los servicios, cómo se comunican, decisiones de diseño (PostGIS vs MySQL, PNOA vs Sentinel-2, etc.).
- `docs/instalacion.md` — guía paso a paso para levantar todo el proyecto en local.
- `docs/diccionario-datos.md` — diccionario de datos: cada dataset de la JCyL, su formato original, y las columnas de la tabla PostGIS resultante.
- `docs/api-backend.md` / `docs/api-modelo.md` — resumen de cada API y enlace a su Swagger UI correspondiente.
