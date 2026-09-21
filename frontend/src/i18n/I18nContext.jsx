import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, TRANSLATIONS } from './translations.js'

const STORAGE_KEY = 'centinela_lang'
const SUPPORTED_CODES = SUPPORTED_LANGUAGES.map((l) => l.code)

const I18nContext = createContext(null)

// Always Spanish for anyone arriving with no prior choice saved - the
// product is aimed at Castilla y Leon specifically, so a visitor whose
// browser/OS happens to be set to English (or any other supported
// language) should still land on the Spanish UI by default, not have it
// silently guessed from navigator.language. The other 4 languages stay
// fully available; they're just an explicit choice (see LanguageSwitcher),
// never an autodetected one.
function detectInitialLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && SUPPORTED_CODES.includes(stored)) return stored
  } catch {
    // localStorage unavailable (e.g. private mode) - fall through.
  }
  return DEFAULT_LANGUAGE
}

// Lightweight i18n provider: no ICU/plural rules, just a flat dictionary
// (see translations.js) with `{placeholder}` substitution, enough for this
// app's short, mostly-static UI copy.
export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(detectInitialLanguage)

  useEffect(() => {
    document.documentElement.lang = lang
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // Ignore - non-critical persistence.
    }
  }, [lang])

  function setLang(nextLang) {
    if (SUPPORTED_CODES.includes(nextLang)) setLangState(nextLang)
  }

  const t = useMemo(() => {
    const dict = TRANSLATIONS[lang] || TRANSLATIONS[DEFAULT_LANGUAGE]
    const fallbackDict = TRANSLATIONS[DEFAULT_LANGUAGE]
    return (key, vars) => {
      let template = dict[key] ?? fallbackDict[key] ?? key
      if (vars) {
        Object.entries(vars).forEach(([varName, value]) => {
          template = template.replaceAll(`{${varName}}`, String(value))
        })
      }
      return template
    }
  }, [lang])

  const value = useMemo(() => ({ lang, setLang, t, languages: SUPPORTED_LANGUAGES }), [lang, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used within an I18nProvider')
  return context
}
