import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { CSidebar, CSidebarBrand, CSidebarNav, CSidebarFooter } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilMap, cilGrid, cilChart, cilGlobeAlt, cilLightbulb, cilMenu, cilX } from '@coreui/icons'
import { useI18n } from '../i18n/I18nContext.jsx'
import ThemeToggle from './ThemeToggle.jsx'
import LanguageSwitcher from './LanguageSwitcher.jsx'
import satelliteMark from '../assets/satellite-mark.png'

// Fixed right-hand navigation bar, built on CoreUI's own CSidebar /
// CSidebarNav / CSidebarBrand template components (rather than plain
// custom markup) so it carries CoreUI's real "sidebar", "sidebar-nav" and
// "nav-link" structure/classes. Visual sizing/position/colors still come
// from our own CSS (see global.css .app-sidebar*), applied on top via
// className, the same pattern CoreUI's own template uses to theme itself.
export default function Sidebar({ onStartTutorial }) {
  const { t } = useI18n()
  const location = useLocation()
  // Off-canvas state for phone-width viewports only (see the
  // @media (max-width: 640px) rules in global.css). On desktop/tablet the
  // toggle button is hidden (display:none) so this state is simply never
  // reachable there - the sidebar keeps rendering permanently visible via
  // its normal fixed positioning, unaffected by this flag.
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close automatically on route change (picking a page) and make sure a
  // stale "open" state never survives back into a resize to desktop width.
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const navItems = [
    { to: '/', label: t('nav.map'), icon: cilMap, end: true },
    { to: '/analisis', label: t('nav.analysis'), icon: cilGrid },
    { to: '/estadisticas', label: t('nav.stats'), icon: cilChart },
    { to: '/datos-abiertos', label: t('nav.opendata'), icon: cilGlobeAlt },
  ]

  return (
    <>
      <button
        type="button"
        className="app-sidebar-toggle"
        onClick={() => setMobileOpen((open) => !open)}
        aria-label={mobileOpen ? t('nav.closeMenu') : t('nav.openMenu')}
        aria-expanded={mobileOpen}
      >
        <CIcon icon={mobileOpen ? cilX : cilMenu} size="lg" />
      </button>

      {mobileOpen ? (
        <div
          className="app-sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <CSidebar
        as="nav"
        className={`app-sidebar${mobileOpen ? ' mobile-open' : ''}`}
        placement="end"
        position="fixed"
        aria-label="Navegacion principal"
      >
        <CSidebarBrand as={NavLink} to="/" className="app-sidebar-brand" title="Centinela">
          <span className="app-sidebar-brand-mark">
            <img src={satelliteMark} alt="" className="app-sidebar-brand-mark-img" />
          </span>
          <span className="app-sidebar-brand-text">
            <strong>Centinela</strong>
            <small>{t('nav.brandSubtitle')}</small>
          </span>
        </CSidebarBrand>

        <CSidebarNav as="div" className="app-sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link app-sidebar-link${isActive ? ' active' : ''}`}
            >
              <CIcon icon={item.icon} size="lg" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </CSidebarNav>

        <CSidebarFooter className="app-sidebar-footer">
          <div className="app-sidebar-controls">
            <button type="button" className="app-sidebar-row" onClick={onStartTutorial}>
              <CIcon icon={cilLightbulb} size="lg" aria-hidden="true" />
              <span>{t('tutorial.button')}</span>
            </button>
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
          <p className="app-sidebar-copy">
            {t('nav.footer').split('\n').map((line, index) => (
              <span key={index}>
                {line}
                <br />
              </span>
            ))}
          </p>
        </CSidebarFooter>
      </CSidebar>
    </>
  )
}
