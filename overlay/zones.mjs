// overlay/zones.mjs — the world's shape, read live from the adapter's sidecar (U12).
//
// Bot Crossing's page fetches /api/threads and /api/state and knows one layout file. This module
// wraps window.fetch before src/main.js boots (index.html mounts the overlay first) so that:
//   - /api/threads only ever carries the planet on screen (a planet never shows another's runs);
//   - a non-home planet's /api/state goes to its own data/colony.<key>.json through the sidecar,
//     leaving data/colony.json to the API exactly as upstream wrote it.
// The planet on screen is this browser's choice (localStorage), like the hide list — never state
// on the server. No token ever reaches this file: the sidecar hands out names and packs only.

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
    body.threads = list.filter((t) => (t.planet || world.home) === current)
    return new Response(JSON.stringify(body), { status: res.status, headers: { 'Content-Type': 'application/json' } })
  }
  return realFetch(input, init)
}
