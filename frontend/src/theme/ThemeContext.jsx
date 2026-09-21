import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'centinela_theme'
const ThemeContext = createContext(null)

// The very first time anyone opens the app (nothing saved yet), it always
// starts in light mode - explicitly requested, so this ignores the
// system's prefers-color-scheme entirely rather than following it. Once
// the person actually toggles the theme (or picks one before this ever
// ships, from an old stored value), that stored choice always wins on
// every later visit - only the untouched first-run case is forced light.
function detectInitialTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // localStorage unavailable - nothing was stored, so this is
    // indistinguishable from a first run anyway.
  }
  return 'light'
}

// Drives CoreUI's own light/dark theming (data-coreui-theme on <html>) plus
// the custom CSS variables in global.css, which mirror the same attribute.
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(detectInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-coreui-theme', theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Ignore - non-critical persistence.
    }
  }, [theme])

  function toggleTheme() {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  const value = useMemo(() => ({ theme, setTheme: setThemeState, toggleTheme }), [theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within a ThemeProvider')
  return context
}
