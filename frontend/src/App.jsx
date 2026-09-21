import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import IntroAnimation from './components/IntroAnimation.jsx'
import TutorialTour, { TUTORIAL_SEEN_KEY } from './components/TutorialTour.jsx'
import MapPage from './pages/MapPage.jsx'
import AnalysisPage from './pages/AnalysisPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import OpenDataMapPage from './pages/OpenDataMapPage.jsx'

// Root shell: fixed right-hand nav (Sidebar) + the active page filling the
// rest of the viewport, with the one-time cinematic intro and the guided
// tutorial layered on top.
export default function App() {
  const [tutorialActive, setTutorialActive] = useState(false)

  // TutorialTour navigates to each step's own route itself (see its
  // route-sync effect) - starting it is just flipping this flag,
  // regardless of which page is currently showing.
  function startTutorial() {
    setTutorialActive(true)
  }

  // Fired the moment the intro's "hold to enter" gesture completes (see
  // IntroAnimation.jsx: dismiss()). Only auto-starts the tour the very
  // first time ever (localStorage, not the intro's own per-session
  // sessionStorage) - after that it's only reachable via the "Tutorial"
  // row in the sidebar footer (see Sidebar.jsx).
  function handleIntroDismiss() {
    let alreadySeen = null
    try {
      alreadySeen = localStorage.getItem(TUTORIAL_SEEN_KEY)
    } catch (error) {
      // Treat an inaccessible localStorage as "already seen" - showing an
      // unrequested full-screen tour is worse than not showing one.
      alreadySeen = 'true'
    }
    if (!alreadySeen) startTutorial()
  }

  return (
    <div className="app-shell">
      <IntroAnimation onDismiss={handleIntroDismiss} />
      <Sidebar onStartTutorial={startTutorial} />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/analisis" element={<AnalysisPage />} />
          <Route path="/estadisticas" element={<DashboardPage />} />
          <Route path="/datos-abiertos" element={<OpenDataMapPage />} />
        </Routes>
      </main>
      <TutorialTour active={tutorialActive} onFinish={() => setTutorialActive(false)} />
    </div>
  )
}
