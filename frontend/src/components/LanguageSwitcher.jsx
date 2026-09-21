import { CDropdown, CDropdownToggle, CDropdownMenu, CDropdownItem } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilLanguage } from '@coreui/icons'
import { useI18n } from '../i18n/I18nContext.jsx'

// Language picker built on CoreUI's CDropdown, styled as a full-width row
// (icon + current language name) to match the other sidebar footer
// controls, opening towards the page (placement="left-start") since it
// lives in the right-hand sidebar and would otherwise overflow off-screen.
export default function LanguageSwitcher() {
  const { lang, setLang, t, languages } = useI18n()
  const current = languages.find((l) => l.code === lang)

  return (
    <CDropdown placement="left-start" className="app-sidebar-lang">
      <CDropdownToggle
        color="transparent"
        caret={false}
        className="app-sidebar-row"
        title={t('lang.toggle')}
      >
        <CIcon icon={cilLanguage} size="lg" aria-hidden="true" />
        <span>{current?.label}</span>
      </CDropdownToggle>
      <CDropdownMenu>
        {languages.map((language) => (
          <CDropdownItem
            key={language.code}
            active={language.code === lang}
            as="button"
            onClick={() => setLang(language.code)}
          >
            {language.label}
          </CDropdownItem>
        ))}
      </CDropdownMenu>
    </CDropdown>
  )
}
