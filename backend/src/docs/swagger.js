import swaggerJSDoc from 'swagger-jsdoc'

// OpenAPI 3.0 spec, generated from JSDoc annotations placed above each route
// handler in src/routes/*.js. Served as interactive Swagger UI at /api-docs.
const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Centinela — API Backend',
      version: '0.1.0',
      description:
        'API REST para el analisis de vertederos ilegales, cruce con datos abiertos de la Junta de Castilla y Leon, y estadisticas publicas de uso.',
      contact: {
        name: 'Centinela',
      },
    },
    servers: [
      {
        url: 'http://localhost:4000',
        description: 'Entorno local de desarrollo',
      },
    ],
    tags: [
      { name: 'Detecciones', description: 'Analisis de celdas y contexto de cada deteccion' },
      { name: 'Estadisticas', description: 'Metricas publicas y anonimas de uso de la plataforma' },
      { name: 'Datasets', description: 'Metadatos de las capas de datos abiertos utilizadas' },
    ],
  },
  apis: ['./src/routes/*.js'],
}

export const swaggerSpec = swaggerJSDoc(options)
