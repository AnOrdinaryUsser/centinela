import { useEffect, useState } from 'react'
import { CButton } from '@coreui/react'

const SESSION_KEY = 'centinela_intro_seen'

// Full-screen animated intro shown the first time a visitor opens the app
// in a given browser session. Purely presentational; dismiss to reach the map.
export default function IntroHero() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const alreadySeen = sessionStorage.getItem(SESSION_KEY)
    if (!alreadySeen) {
      setVisible(true)
    }
  }, [])

  function dismiss() {
    sessionStorage.setItem(SESSION_KEY, 'true')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="intro-hero" onClick={dismiss}>
      <div className="intro-hero-content">
        <h1>Centinela CyL</h1>
        <p>
          Deteccion y analisis de vertederos ilegales en Castilla y Leon
          mediante inteligencia artificial y datos abiertos.
        </p>
        <CButton color="light" onClick={dismiss}>
          Entrar al mapa
        </CButton>
      </div>
    </div>
  )
}
