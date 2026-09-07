// overlay/zones.mjs — the world's shape, read live from the adapter's sidecar (U12).
//
// Bot Crossing's page fetches /api/threads and /api/state and knows one layout file. This module
// wraps window.fetch before src/main.js boots (index.html mounts the overlay first) so that:
//   - /api/threads only ever carries the planet on screen (a planet never shows another's runs);
//   - a non-home planet's /api/state goes to its own data/colony.<key>.json through the sidecar,
//     leaving data/colony.json to the API exactly as upstream wrote it.
// The planet on screen is this browser's choice (localStorage), like the hide list — never state
// on the server. No token ever reaches this file: the sidecar hands out names and packs only.
//   - residents (U17: skills silent 30 days, sent by the adapter as sleeping figures) never take a
//     figure slot from a run: they fill what is left under Bot Crossing's maxAgents, and go last.
import { benchResidents } from './signals.mjs'

const PORT = Number(window.AW_OVERLAY_PORT) || 5275
export const SIDECAR = `${location.protocol}//${location.hostname}:${PORT}`
const STORE = 'aw.planet'

let world = null
let current = ''

const stored = () => {
  try {
    return localStorage.getItem(STORE) || ''
  } catch {
    return ''
  }
}

/** One read of the sidecar; a world that is not there (port off, sidecar down) means home only. */
async function loadWorld() {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 2500)
  try {
    const res = await fetch(`${SIDECAR}/world`, { signal: ctl.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`${res.status}`)
    world = await res.json()
    const want = stored()
    current = world.planets.some((p) => p.key === want) ? want : world.home
  } catch (err) {
    console.warn('[world] sidecar unavailable — home planet only:', err?.message || err)
    world = null
    current = ''
  } finally {
    clearTimeout(timer)
  }
  return world
}

/** Resolves once the world is known (or known to be unavailable); the fetch seam waits on it. */
export const ready = loadWorld()

// A page that loads in the seconds after ./dev.sh starts finds the sidecar not listening yet (it starts on
// the adapter's first detect). Keep asking for a minute; the first answer lights up the switcher, the
// residents' bench and the planet filter — until then the seam passes everything through (home only).
ready.then((w) => {
  if (w) return
  let tries = 0
  const timer = setInterval(async () => {
    if (world || ++tries > 12) return clearInterval(timer)
    const got = await loadWorld()
    if (got) {
      clearInterval(timer)
      console.info('[world] sidecar reached after a retry — planets, towns and signals are live')
      for (const fn of lateListeners) fn(got)
    }
  }, 5000)
})
const lateListeners = new Set()
/** Called once if the world arrives late (the sidecar was not up when the page loaded). */
export const onWorldLate = (fn) => lateListeners.add(fn)

/** The signals (U17) change with every scan: re-read GET /world on the poll's own cadence, keeping the shape stable. */
const REFRESH_MS = 15_000
async function refreshWorld() {
  if (!world) return
  try {
    const res = await fetch(`${SIDECAR}/world`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(2500) })
    if (!res.ok) return
    const next = await res.json()
    world.signals = next.signals || world.signals
    world.towns = next.towns || world.towns
    world.at = next.at
  } catch {
    /* keep the last good world */
  }
}
ready.then(() => setInterval(refreshWorld, REFRESH_MS))
export const signals = () => world?.signals || { campus: { alert: [] }, towns: {}, residents: [] }

/** The Steering Room's three panels (U19), read from the sidecar; null when it is not there. Cached by the adapter, 5 min. */
export async function loadSteering() {
  try {
    const res = await fetch(`${SIDECAR}/steering`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/** How many residents stand on this planet's map, of how many the adapter sent (the rest are "on the bench"). */
let bench = { shown: 0, total: 0 }
export const residentsInfo = () => bench
/** Bot Crossing's figure cap — the page's own setting once it is up; its lowest preset until then. */
const maxAgents = () => Number(window.botCrossing?.settings?.get?.('maxAgents')) || 40

export const getWorld = () => world
export const currentKey = () => current
export const currentPlanet = () => world?.planets.find((p) => p.key === current) || null
export const isHome = () => !world || current === world.home
/** Towns on the planet on screen. */
export const townsHere = () => (world ? world.towns.filter((t) => t.planet === current) : [])

/** Pick a planet: remembered in this browser, then the page reloads onto that planet's layout file. */
export function switchTo(key) {
  if (!world || !world.planets.some((p) => p.key === key) || key === current) return
  try {
    localStorage.setItem(STORE, key)
  } catch {
    /* private mode: the switch lasts this load */
  }
  location.reload()
}

// ── the fetch seam ───────────────────────────────────────────────────────────────────────────

const realFetch = window.fetch.bind(window)
const urlOf = (input) => (typeof input === 'string' ? input : input instanceof Request ? input.url : String(input?.url || ''))
const pathOf = (u) => {
  try {
    return new URL(u, location.origin).pathname
  } catch {
    return ''
  }
}

window.fetch = async function awFetch(input, init) {
  const p = pathOf(urlOf(input))
  if (p !== '/api/threads' && p !== '/api/state') return realFetch(input, init)
  await ready
  if (!world) return realFetch(input, init)

  if (p === '/api/state' && current !== world.home) {
    // This planet's own layout file, created on first read by the sidecar. Same verb, same body.
    return realFetch(`${SIDECAR}/planets/${encodeURIComponent(current)}/state`, init)
  }
  if (p === '/api/threads') {
    const res = await realFetch(input, init)
    if (!res.ok) return res
    const body = await res.json().catch(() => ({}))
    const list = Array.isArray(body.threads) ? body.threads : []
    // Placed by the adapter; a thread with no planet (an older adapter) belongs to the home planet.
    const here = list.filter((t) => (t.planet || world.home) === current)
    const benched = benchResidents(here, maxAgents())
    bench = { shown: benched.shown, total: benched.total }
    body.threads = benched.threads
    return new Response(JSON.stringify(body), { status: res.status, headers: { 'Content-Type': 'application/json' } })
  }
  return realFetch(input, init)
}
