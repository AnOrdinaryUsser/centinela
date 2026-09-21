import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/I18nContext.jsx'

export const INTRO_SESSION_KEY = 'centinela_intro_seen'
const SESSION_KEY = INTRO_SESSION_KEY
const HOLD_DURATION_MS = 950

// Renders a slow "satellite scan" overlay on a canvas, layered on top of
// the background video (blend-mode screen) to reinforce the aerial/AI
// detection theme: a faint dot grid plus a handful of radar-style pulses.
//
// `visible` is a real, changing dependency (unlike `canvasRef`, whose
// identity never changes across renders and so would make this effect run
// exactly once, at mount, before the <canvas> even exists in the DOM -
// which is what happened here originally: the animation silently never
// started). Depending on `visible` makes the effect (re)run once the
// canvas is actually mounted, and just as importantly makes it clean up
// -cancelling the animation frame loop and the resize listener- the
// moment the intro is dismissed, instead of quietly running forever in
// the background.
function useScanCanvas(canvasRef, visible) {
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !visible) return undefined
    const ctx = canvas.getContext('2d')
    let animationFrame
    let width = 0
    let height = 0
    let dots = []
    let pulses = []

    function resize() {
      width = canvas.width = canvas.offsetWidth * window.devicePixelRatio
      height = canvas.height = canvas.offsetHeight * window.devicePixelRatio
      const cols = Math.ceil(width / 46)
      const rows = Math.ceil(height / 46)
      dots = []
      for (let x = 0; x < cols; x += 1) {
        for (let y = 0; y < rows; y += 1) {
          dots.push({ x: x * 46 + (y % 2) * 23, y: y * 46, phase: Math.random() * Math.PI * 2 })
        }
      }
      pulses = Array.from({ length: 5 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 0,
        maxR: 60 + Math.random() * 80,
        speed: 0.3 + Math.random() * 0.35,
        delay: Math.random() * 240,
        tick: -Math.random() * 240,
      }))
    }

    function draw(time) {
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = 'rgba(34, 227, 172, 0.4)'
      dots.forEach((dot) => {
        const alpha = 0.1 + 0.12 * Math.sin(time / 1400 + dot.phase)
        ctx.globalAlpha = Math.max(alpha, 0.02)
        ctx.beginPath()
        ctx.arc(dot.x, dot.y, 1.4 * window.devicePixelRatio, 0, Math.PI * 2)
        ctx.fill()
      })
      ctx.globalAlpha = 1

      pulses.forEach((pulse) => {
        pulse.tick += 1
        if (pulse.tick < pulse.delay) return
        pulse.r += pulse.speed
        if (pulse.r > pulse.maxR) {
          pulse.r = 0
          pulse.x = Math.random() * width
          pulse.y = Math.random() * height
          pulse.delay = Math.random() * 200
          pulse.tick = 0
        }
        const alpha = Math.max(0, 1 - pulse.r / pulse.maxR)
        ctx.strokeStyle = `rgba(249, 177, 21, ${alpha * 0.5})`
        ctx.lineWidth = 1.5 * window.devicePixelRatio
        ctx.beginPath()
        ctx.arc(pulse.x, pulse.y, pulse.r * window.devicePixelRatio, 0, Math.PI * 2)
        ctx.stroke()
      })

      animationFrame = requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('resize', resize)
    animationFrame = requestAnimationFrame(draw)
    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animationFrame)
    }
  }, [canvasRef])
}

// Full-screen "hold to enter" gate shown once per browser session before
// the map, in the spirit of because-recollection.com: full-bleed
// background video, animated wordmark, and a press-and-hold (spacebar or
// pointer) interaction that fills a progress pill before letting you in
// (rather than a plain click, which is too easy to trigger by accident).
export default function IntroAnimation({ onDismiss }) {
  const { t } = useI18n()
  const [visible, setVisible] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const [titleIdle, setTitleIdle] = useState(false)
  const canvasRef = useRef(null)
  const fillRef = useRef(null)
  const holdingRef = useRef(false)
  const startTimeRef = useRef(0)
  const rafRef = useRef(null)
  const releaseTimeoutRef = useRef(null)

  useEffect(() => {
    // ?intro=1 always shows the gate, regardless of sessionStorage - handy
    // for testing/demoing without opening a private window each time.
    const forced = new URLSearchParams(window.location.search).get('intro') === '1'
    const alreadySeen = sessionStorage.getItem(SESSION_KEY)
    if (forced || !alreadySeen) setVisible(true)
  }, [])

  useScanCanvas(canvasRef, visible)

  // Switches the title from its one-shot letter-by-letter entrance to the
  // endless per-letter float (see .intro-title.idle in global.css) once
  // that entrance has actually finished - computed from the same numbers
  // the entrance keyframes use (0.3s base delay + 0.035s/letter stagger +
  // the 0.7s entrance itself), so the handoff lands right as the last
  // letter settles rather than early stopping the entrance can't
  // for a mid-flight animation.
  useEffect(() => {
    if (!visible) {
      setTitleIdle(false)
      return undefined
    }
    const title = t('intro.title')
    const entranceTotalMs = 300 + Math.max(0, title.length - 1) * 35 + 700 + 80
    const timeout = window.setTimeout(() => setTitleIdle(true), entranceTotalMs)
    return () => window.clearTimeout(timeout)
  }, [visible, t])

  function dismiss() {
    if (dismissing) return
    setDismissing(true)
    sessionStorage.setItem(SESSION_KEY, 'true')
    window.setTimeout(() => setVisible(false), 550)
    // Fired immediately (not after the 550ms fade-out finishes) so the
    // tutorial's own fade-in can overlap slightly with the intro's
    // fade-out instead of leaving a blank gap between them.
    onDismiss?.()
  }

  function tick(now) {
    if (!holdingRef.current) return
    const elapsed = now - startTimeRef.current
    const progress = Math.min(1, elapsed / HOLD_DURATION_MS)
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${progress})`
    if (progress >= 1) {
      holdingRef.current = false
      dismiss()
      return
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  function startHold() {
    if (dismissing || holdingRef.current) return
    clearTimeout(releaseTimeoutRef.current)
    if (fillRef.current) fillRef.current.style.transition = 'none'
    holdingRef.current = true
    startTimeRef.current = performance.now()
    rafRef.current = requestAnimationFrame(tick)
  }

  function cancelHold() {
    if (!holdingRef.current) return
    holdingRef.current = false
    cancelAnimationFrame(rafRef.current)
    if (fillRef.current) {
      fillRef.current.style.transition = 'transform 0.3s ease'
      fillRef.current.style.transform = 'scaleX(0)'
    }
  }

  useEffect(() => {
    if (!visible) return undefined
    function handleKeyDown(event) {
      if (event.code !== 'Space' || event.repeat) return
      event.preventDefault()
      startHold()
    }
    function handleKeyUp(event) {
      if (event.code !== 'Space') return
      cancelHold()
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, dismissing])

  if (!visible) return null

  const title = t('intro.title')

  return (
    <div className={`intro-hero${dismissing ? ' dismissing' : ''}`}>
      <video
        className="intro-video"
        src="/intro-bg.mp4"
        poster="/intro-bg-poster.jpg"
        autoPlay
        muted
        loop
        playsInline
      />
      <canvas ref={canvasRef} className="intro-canvas" />
      <div className="intro-vignette" />
      <div className="intro-content">
        <div className="intro-eyebrow">{t('intro.eyebrow')}</div>
        <h1 className={`intro-title${titleIdle ? ' idle' : ''}`}>
          {/* Each word is wrapped in its own nowrap span so a line can only
              break BETWEEN words, never between two letters of the same
              word - confirmed with a real headless screenshot that without
              this, a narrower viewport happily wrapped "CyL" as "Cy" / "L"
              on two lines (any two adjacent inline-block letter spans are a
              valid line-break point per CSS, space or not). The per-letter
              stagger/float index keeps counting across word boundaries so
              the entrance/float timing is unaffected by the regrouping. */}
          {title.split(' ').map((word, wordIndex, words) => {
            const letterOffset = words.slice(0, wordIndex).join(' ').length + (wordIndex > 0 ? 1 : 0)
            return (
              <span key={wordIndex} className="intro-title-word">
                {word.split('').map((char, charIndex) => {
                  const index = letterOffset + charIndex
                  return (
                    <span key={charIndex} style={{ animationDelay: `${0.3 + index * 0.035}s`, '--i': index }}>
                      {char}
                    </span>
                  )
                })}
                {wordIndex < words.length - 1 ? ' ' : null}
              </span>
            )
          })}
        </h1>
        <p className="intro-subtitle">{t('intro.subtitle')}</p>

        <div className="intro-cta-row">
          <div className="intro-hold-row">
            <span>{t('intro.hold')}</span>
            <button
              type="button"
              className="intro-hold-pill"
              onPointerDown={startHold}
              onPointerUp={cancelHold}
              onPointerLeave={cancelHold}
              onPointerCancel={cancelHold}
            >
              <span ref={fillRef} className="intro-hold-pill-fill" />
              <span className="intro-hold-pill-label">{t('intro.holdKey')}</span>
            </button>
          </div>
          <button type="button" className="intro-skip-btn" onClick={dismiss}>
            {t('intro.skip')}
          </button>
        </div>
      </div>
    </div>
  )
}
