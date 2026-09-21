import { CFormSwitch } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilMoon, cilSun } from '@coreui/icons'
import { useTheme } from '../theme/ThemeContext.jsx'
import { useI18n } from '../i18n/I18nContext.jsx'

// Light/dark switch built on CoreUI's own CFormSwitch, styled to sit in the
// sidebar as a small icon toggle. Flips the data-coreui-theme attribute
// (see ThemeContext) that both CoreUI and our own CSS variables key off.
export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const { t } = useI18n()
  const isDark = theme === 'dark'

  return (
    <div className="app-sidebar-row app-sidebar-theme-toggle">
      <CIcon icon={isDark ? cilMoon : cilSun} size="lg" aria-hidden="true" />
      <span>{isDark ? t('theme.dark') : t('theme.light')}</span>
      <CFormSwitch
        aria-label={t('theme.toggle')}
        checked={!isDark}
        onChange={toggleTheme}
        className="app-sidebar-row-switch"
      />
    </div>
  )
}
