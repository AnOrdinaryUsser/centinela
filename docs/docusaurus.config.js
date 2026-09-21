// @ts-check
// Configuracion del sitio de documentacion de Centinela.
// El contenido de todo el sitio esta en espanol, tal y como el codigo fuente
// del proyecto esta en ingles (ver convencion en el README raiz).

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Centinela',
  tagline: 'Deteccion y analisis de vertederos ilegales con IA y datos abiertos',
  favicon: 'img/favicon.ico',

  url: 'https://centinela-cyl.example.org',
  baseUrl: '/',

  organizationName: 'centinela-cyl',
  projectName: 'centinela-cyl-docs',

  i18n: {
    defaultLocale: 'es',
    locales: ['es'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.js',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: 'Centinela',
        items: [
          { to: '/', label: 'Documentacion', position: 'left' },
          {
            href: 'http://localhost:4000/api-docs',
            label: 'API Backend (Swagger)',
            position: 'right',
          },
          {
            href: 'http://localhost:8000/docs',
            label: 'API Modelo (Swagger)',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        copyright: `Centinela — Concurso de Datos Abiertos de Castilla y Leon`,
      },
    }),
}

export default config
