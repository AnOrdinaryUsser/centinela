import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@coreui/coreui/dist/css/coreui.min.css'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import './styles/global.css'
import App from './App.jsx'
import { ThemeProvider } from './theme/ThemeContext.jsx'
import { I18nProvider } from './i18n/I18nContext.jsx'

// Application entry point.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </I18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
