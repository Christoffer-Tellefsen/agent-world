/**
 * Compass harness — the one file that knows Tellefsen's ontology.
 *
 * Reads the Run Ledger (Supabase) and turns every governed run into a Bot Crossing thread:
 * zone = client, thread = run, badges from the events stream. Read only: the world is a mirror.
 * Contract: server/harnesses/README.md. Design: SPEC.md §4.
 */
import { loadConfig } from './compass/config.mjs'
import { createLedgerClient } from './compass/supabase.mjs'
import { fold } from './compass/fold.mjs'
import { toThread, residentThread } from './compass/threads.mjs'
import { trustOf, staleSkills, ranSkillsOf, campusAlert, projectsByClient, STALE_DAYS } from './compass/signals.mjs'
import { makeViewer } from './compass/viewer.mjs'
import { createSurfaces } from './compass/surfaces.mjs'
import { createSubstrate } from './compass/substrate.mjs'
import { deriveWorld, worldDescriptor } from './compass/zones.mjs'
import { createOverlayApi, startOverlayApi } from './compass/overlay-api.mjs'
import { createSteering } from './compass/steering.mjs'
import { CAMPUS } from './compass/config.mjs'

const cfg = loadConfig()
const log = cfg.debug ? (...a) => console.error('[world]', ...a) : () => {}
const viewer = makeViewer({ tenant: cfg.tenant, preset: cfg.viewerPreset })
const surfaces = createSurfaces(cfg, { log })
const substrate = createSubstrate(cfg, { log })
const steering = createSteering(cfg, { surfaces, substrate, log }) // U19: three panels, 5-min caches, served by the sidecar
let ledger = null
let world = null // the derived zone map from the last substrate read (U12)
let overlayApi = null
let scanCache = { at: 0, threads: [] }
let lastErrorAt = 0
/** U17: which skills ran in the last 30 days — a second, wider scan, refreshed every 5 min. */
let ranCache = { at: 0, ran: null }
const RAN_MS = 5 * 60_000
/** U17: the world's signals from the last scan — the campus flag, town ✓s, residents — served with GET /world. */
let signals = { at: '', campus: { alert: [] }, towns: {}, residents: [] }

/** Planets, towns and the campus, derived from the substrate at scan time (U12). Never stored. */
async function currentWorld() {
  world = deriveWorld(await substrate.read(), { campus: CAMPUS, tenant: cfg.tenant })
  viewer.pack = world.planets.find((p) => p.home)?.pack || ''
  return world
}

/** The overlay sidecar (overlay-api.mjs), started once the harness is detected; never in tests. */
function ensureOverlayApi() {
  if (overlayApi || !cfg.overlayPort) return
  const handle = createOverlayApi({
    getWorld: async () => world || currentWorld(),
    // Awaited: a page that loads right after a restart must not see a town-less world (seen 2026-09-07 — "plot" for a town).
    steering: () => steering.all(),
    descriptor: async () => ({ ...worldDescriptor(world || (await currentWorld().catch(() => deriveWorld(null, { campus: CAMPUS, tenant: cfg.tenant }))), viewer), signals }),
    log,
  })
  overlayApi = startOverlayApi(handle, { port: cfg.overlayPort, log })
}

/** Present on this machine = the Worker's ledger route is reachable in principle. Cheap; runs every poll. */
const detect = async () => {
  const on = Boolean(cfg.ledgerUrl && cfg.eventsBearerToken)
  if (on) ensureOverlayApi()
  return on
}

/** The skills with any event in the last STALE_DAYS days (U17 hand-raise). Last-good on failure; null until the first read. */
async function ranSkills(now) {
  if (ranCache.ran && now - ranCache.at < RAN_MS) return ranCache.ran
  try {
    const { events } = await ledger.scanSince(new Date(now - STALE_DAYS * 24 * 3600 * 1000).toISOString())
    ranCache = { at: now, ran: ranSkillsOf(events) }
  } catch (err) {
    console.warn('bot-crossing: compass — 30-day scan unavailable —', err?.message || err)
    ranCache.at = now
  }
  return ranCache.ran
}

async function scan(now = Date.now()) {
  ledger ||= createLedgerClient(cfg, { log })
  const since = new Date(now - cfg.windowDays * 24 * 3600 * 1000).toISOString()
  const { events, rows } = await ledger.scanSince(since)
  const runs = fold(events)
  const rowById = new Map(rows.map((r) => [r.id, r]))
  const substrateNow = await substrate.read()
  const { place, towns, campus } = await currentWorld()
  const policy = substrateNow.auto_run_policy
  const trust = (skill, runClass) => trustOf(skill, runClass, policy)

  const threads = []
  for (const run of runs.values()) {
    threads.push(await toThread(run, rowById.get(run.id) || null, viewer, surfaces, now, { runningTtlMs: cfg.runningTtlMs, claudeProjectUrl: cfg.claudeProjectUrl, place, trustOf: trust }))
  }

  // U17 — residents: Active skills silent for 30 days stand on the campus with a hand up.
  const ran = await ranSkills(now)
  const stale = ran ? staleSkills(substrateNow.skills, ran) : []
  for (const skill of stale) threads.push(residentThread(skill, { now, place, trust: trust(skill.name, '') }))

  // U17 — the campus flag (!) and the town ✓s, read once per scan and served with GET /world.
  const byClient = projectsByClient(runs)
  const townSignals = {}
  for (const town of towns) {
    const projects = [...(byClient.get(town.name) || [])]
    let check = false
    for (const p of projects) if (await surfaces.recentDone(p)) check = true
    if (projects.length) townSignals[town.name] = { check, projects }
  }
  signals = { at: new Date(now).toISOString(), campus: { name: campus.name, alert: campusAlert(runs, now) }, towns: townSignals, residents: stale.map((s) => s.name) }

  log(`scan: ${runs.size} runs → ${threads.length} threads (${threads.filter((t) => t.unread).length} waiting, ${stale.length} hands, ${signals.campus.alert.length} on the flag)`)
  return threads
}

/** The scan, cached so the browser's 15 s poll costs one query burst; the last good result survives a failed read. */
async function scanThreads() {
  const now = Date.now()
  if (now - scanCache.at < cfg.scanCacheMs) return scanCache.threads
  try {
    scanCache = { at: now, threads: await scan(now) }
  } catch (err) {
    if (now - lastErrorAt > 60_000) {
      lastErrorAt = now
      console.warn('bot-crossing: compass —', err?.message || err)
    }
    scanCache = { at: now, threads: scanCache.threads }
  }
  return scanCache.threads
}

/** Open lands on the surface to tap; ref.url was resolved at scan time (SPEC.md §4.4). */
function openThread(ref) {
  const url = ref && typeof ref.url === 'string' ? ref.url : ''
  if (/^https?:\/\//.test(url)) return { ok: true, url }
  return { ok: false, error: 'This run has no surface to open' }
}

const newSession = () => ({ ok: false, error: 'Runs start in Claude, Cowork or Claude Code — not from the world' })
const setArchived = async () => ({ ok: false, error: 'The world is a mirror; runs cannot be archived here' })

export default { id: 'compass', name: 'Compass', detect, scanThreads, openThread, newSession, setArchived }

/** Exposed for tests and the console — never for the browser. */
export const _internals = { scan, cfg, viewer, world: () => world, currentWorld, signals: () => signals, steering, invalidate: () => (scanCache = { at: 0, threads: scanCache.threads }) }
