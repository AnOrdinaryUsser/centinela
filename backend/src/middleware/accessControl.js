// Optional protections for the app's write/expensive endpoints (AI
// inference, image storage, stat reporting). None of this is a real
// multi-user login system - it's a shared-secret gate plus a per-IP
// request cap, meant for exactly one situation: you've turned on Vite's
// `host: true` (or otherwise opened these ports) to test from another
// device on the network, and don't want *every other* device that
// happens to be able to reach that IP - including ones on a different
// subnet that a routed network (a university/corporate LAN, unlike a
// typical home router) might still let through - to be able to trigger
// free YOLO inference or fill up the database.
//
// Everything here is opt-in and a no-op by default, so the normal
// localhost-only workflow never has to think about it.

const ACCESS_TOKEN = process.env.ACCESS_TOKEN

// requireAccessToken: if ACCESS_TOKEN is set in the environment, every
// request through this middleware must send it back in the X-App-Token
// header (see frontend/src/services/api.js, which attaches
// VITE_ACCESS_TOKEN automatically whenever it's configured). Leave
// ACCESS_TOKEN unset (the default) and this middleware does nothing -
// today's fully-open behavior is unchanged until you opt in.
//
// This is deliberately simple (one shared value, not per-user accounts)
// because the app has no concept of users to begin with; it only needs
// to answer "does this caller know the value I set", not "who is this".
// It also only stops direct API calls with the wrong/missing header -
// unlike CORS (which only ever restricts browser-mediated cross-origin
// requests), this actually blocks curl/Postman/etc. too, which is the
// gap CORS alone leaves open on a shared network.
export function requireAccessToken(req, res, next) {
  if (!ACCESS_TOKEN) return next()
  const provided = req.get('x-app-token')
  if (provided === ACCESS_TOKEN) return next()
  return res.status(401).json({ error: 'Falta o es invalido el token de acceso (cabecera X-App-Token).' })
}

// Simple in-memory sliding-window rate limiter, per client IP, scoped to
// a single Express process - no Redis or other shared store needed for
// a one-machine demo app, and no extra dependency either. Each call to
// this factory gets its own independent counter, so /analyze (real YOLO
// inference, expensive) can be capped much tighter than a cheap counter
// endpoint. This runs regardless of whether ACCESS_TOKEN is set, so it
// also protects against one legitimate, over-eager client hammering the
// model service or the PNOA WMS in a tight loop.
export function createRateLimiter({ max, windowMs, message }) {
  const hits = new Map() // ip -> array of hit timestamps (ms), pruned lazily

  return function rateLimit(req, res, next) {
    const ip = req.ip
    const now = Date.now()
    const windowStart = now - windowMs
    const recent = (hits.get(ip) ?? []).filter((timestamp) => timestamp > windowStart)

    if (recent.length >= max) {
      const retryAfterSeconds = Math.ceil((recent[0] + windowMs - now) / 1000)
      res.set('Retry-After', String(Math.max(retryAfterSeconds, 1)))
      return res.status(429).json({
        error: message || `Demasiadas solicitudes. Maximo ${max} cada ${Math.round(windowMs / 1000)}s.`,
      })
    }

    recent.push(now)
    hits.set(ip, recent)
    next()
  }
}
