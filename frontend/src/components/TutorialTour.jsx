import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n/I18nContext.jsx'

export const TUTORIAL_SEEN_KEY = 'centinela_tutorial_seen'

// Each step targets a real, currently-on-screen element by CSS selector,
// and names the route it needs to be on to exist (the sidebar itself is
// mounted on every route, so the nav/controls steps could target any
// route, but search/draw/layers only exist on MapPage and the history/
// stat widgets only exist on their own pages). This component navigates
// there itself (see the route-sync effect below) as each step is entered,
// so the tour can walk through all three sections instead of only ever
// explaining the Map page. `selector: null` (the welcome step) has no
// target - it centers on screen instead.
const STEPS = [
  { key: 'welcome', route: '/', selector: null },
  { key: 'search', route: '/', selector: '.map-search-bar', placement: 'bottom' },
  { key: 'draw', route: '/', selector: '.map-draw-fab', placement: 'left' },
  { key: 'layers', route: '/', selector: '.map-layers-control', placement: 'top' },
  { key: 'nav', route: '/', selector: '.app-sidebar-nav', placement: 'left' },
  { key: 'analysisIntro', route: '/analisis', selector: '.page-heading', placement: 'bottom' },
  { key: 'statsIntro', route: '/estadisticas', selector: '.widget-row', placement: 'bottom' },
  // Ends back on the Map page rather than wherever statsIntro left off, so
  // finishing (or skipping from) the tour always lands somewhere useful.
  { key: 'controls', route: '/', selector: '.app-sidebar-footer', placement: 'left' },
]

const TOOLTIP_WIDTH = 320
const TOOLTIP_EST_HEIGHT = 210
const MARGIN = 16
const SPOTLIGHT_PADDING = 10

// Where to place the tooltip box for a given target rect + preferred side,
// clamped so it never renders off-screen. Viewport coordinates throughout
// (both the target rect from getBoundingClientRect and this component's
// own `position: fixed` styling), so no scroll-offset math is needed.
function computeTooltipStyle(rect, placement) {
  const vw = window.innerWidth
  const vh = window.innerHeight

  if (!rect || (rect.width === 0 && rect.height === 0)) {
    return {
      top: Math.max(MARGIN, vh / 2 - TOOLTIP_EST_HEIGHT / 2),
      left: Math.max(MARGIN, vw / 2 - TOOLTIP_WIDTH / 2),
    }
  }

  let top
  let left
  if (placement === 'left') {
    top = rect.top
    left = rect.left - TOOLTIP_WIDTH - 20
  } else if (placement === 'top') {
    top = rect.top - TOOLTIP_EST_HEIGHT - 20
    left = rect.left
  } else if (placement === 'right') {
    top = rect.top
    left = rect.right + 20
  } else {
    top = rect.bottom + 20
    left = rect.left
  }

  left = Math.min(Math.max(MARGIN, left), vw - TOOLTIP_WIDTH - MARGIN)
  top = Math.min(Math.max(MARGIN, top), vh - TOOLTIP_EST_HEIGHT - MARGIN)
  return { top, left }
}

// Full-screen guided walkthrough shown after the intro on a visitor's
// first ever visit (see App.jsx), and replayable anytime via the
// "Tutorial" row in the sidebar footer. Dims everything except the
// current target element (a "spotlight" box whose own huge box-shadow
// darkens the rest of the screen - simpler and more robust across
// browsers than a clip-path/SVG mask hole), with a small tooltip card
// (title, body, Back/Next/Skip) that fades in on every step change.
export default function TutorialTour({ active, onFinish }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const [stepIndex, setStepIndex] = useState(0)
  const [rect, setRect] = useState(null)

  useEffect(() => {
    if (active) setStepIndex(0)
  }, [active])

  // Keeps the URL in sync with whatever the current step needs (see the
  // per-step `route` above) - this is what lets the tour walk through
  // Map, Analisis and Estadisticas in turn instead of only ever
  // explaining whichever page it happened to start on.
  useEffect(() => {
    if (!active) return
    const step = STEPS[stepIndex]
    if (step.route && location.pathname !== step.route) navigate(step.route)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex])

  useEffect(() => {
    if (!active) return undefined

    function measure() {
      const step = STEPS[stepIndex]
      if (!step.selector) {
        setRect(null)
        return
      }
      const el = document.querySelector(step.selector)
      setRect(el ? el.getBoundingClientRect() : null)
    }

    // Runs once immediately, and again over the next couple of frames in
    // case the step just changed route (navigate() above) and the new
    // page - possibly still fetching its own data, e.g. DashboardPage's
    // stat widgets - hasn't finished mounting/settling layout yet.
    measure()
    const raf1 = requestAnimationFrame(measure)
    const raf2 = requestAnimationFrame(() => requestAnimationFrame(measure))
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      window.removeEventListener('resize', measure)
    }
  }, [active, stepIndex, location.pathname])

  if (!active) return null

  const step = STEPS[stepIndex]
  const isFirst = stepIndex === 0
  const isLast = stepIndex === STEPS.length - 1

  function finish() {
    try {
      localStorage.setItem(TUTORIAL_SEEN_KEY, 'true')
    } catch (error) {
      // Non-critical: worst case the tour just offers itself again next visit.
    }
    onFinish()
  }

  function next() {
    if (isLast) {
      finish()
      return
    }
    setStepIndex((index) => index + 1)
  }

  function back() {
    setStepIndex((index) => Math.max(0, index - 1))
  }

  const spotlightStyle = rect
    ? {
        top: rect.top - SPOTLIGHT_PADDING,
        left: rect.left - SPOTLIGHT_PADDING,
        width: rect.width + SPOTLIGHT_PADDING * 2,
        height: rect.height + SPOTLIGHT_PADDING * 2,
      }
    : {
        // No target (welcome step): a zero-size box centered on screen -
        // its box-shadow still darkens the whole viewport, just with no
        // visible "hole" cut into it.
        top: window.innerHeight / 2,
        left: window.innerWidth / 2,
        width: 0,
        height: 0,
      }

  const tooltipStyle = computeTooltipStyle(rect, step.placement)

  return (
    <div className="tutorial-tour" role="dialog" aria-modal="true" aria-label={t('tutorial.button')}>
      <div className="tutorial-clickblock" />
      <div className="tutorial-spotlight" style={spotlightStyle} />
      <div key={step.key} className="tutorial-tooltip" style={tooltipStyle}>
        <div className="tutorial-tooltip-progress">
          {stepIndex + 1} / {STEPS.length}
        </div>
        <h3>{t(`tutorial.${step.key}.title`)}</h3>
        <p>{t(`tutorial.${step.key}.body`)}</p>
        <div className="tutorial-tooltip-actions">
          <button type="button" className="tutorial-skip-btn" onClick={finish}>
            {t('tutorial.skip')}
          </button>
          <div className="tutorial-tooltip-nav">
            {!isFirst && (
              <button type="button" className="tutorial-back-btn" onClick={back}>
                {t('tutorial.back')}
              </button>
            )}
            <button type="button" className="tutorial-next-btn" onClick={next}>
              {isLast ? t('tutorial.finish') : t('tutorial.next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
