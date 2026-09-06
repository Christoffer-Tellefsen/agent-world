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
import { toThread } from './compass/threads.mjs'
import { makeViewer } from './compass/viewer.mjs'
import { createSurfaces } from './compass/surfaces.mjs'

const cfg = loadConfig()
const log = cfg.debug ? (...a) => console.error('[world]', ...a) : () => {}
const viewer = makeViewer({ tenant: cfg.tenant, preset: cfg.viewerPreset })
const surfaces = createSurfaces(cfg, { log })
let ledger = null
let scanCache = { at: 0, threads: [] }
let lastErrorAt = 0

/** Present on this machine = the Worker's ledger route is reachable in principle. Cheap; runs every poll. */
const detect = async () => Boolean(cfg.ledgerUrl && cfg.eventsBearerToken)

async function scan(now = Date.now()) {
  ledger ||= createLedgerClient(cfg, { log })
  const since = new Date(now - cfg.windowDays * 24 * 3600 * 1000).toISOString()
  const { events, rows } = await ledger.scanSince(since)
  const runs = fold(events)
  const rowById = new Map(rows.map((r) => [r.id, r]))

  const threads = []
  for (const run of runs.values()) {
    threads.push(await toThread(run, rowById.get(run.id) || null, viewer, surfaces, now, { runningTtlMs: cfg.runningTtlMs, claudeProjectUrl: cfg.claudeProjectUrl }))
  }
  log(`scan: ${runs.size} runs → ${threads.length} threads (${threads.filter((t) => t.unread).length} waiting)`)
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
export const _internals = { scan, cfg, viewer, invalidate: () => (scanCache = { at: 0, threads: scanCache.threads }) }
