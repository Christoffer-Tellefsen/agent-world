// overlay/artifacts.mjs — artifact bubbles and card rows (U13). Pure: no DOM, no fetch, no clock
// of its own — node runs it under npm test. The DOM side (the bubble sprite, the card section)
// lives in overlay/main.js and only calls what is here.
//
// A thread carries `artifacts` from the adapter: [{ title, url, ref, system, at, openable }],
// newest first. `url` is a real link and opens; `ref` is a Compass reference (ops_config:KEY,
// ops_skills:<id> …) — a label on the card, never an Open target (M1 data-shape note).

/** How long a bubble stays up after an artifact is new: ES-4.3 says "within one poll"; 60 s reads as an event, not a state. */
export const BUBBLE_MS = 60_000

const str = (v) => (typeof v === 'string' ? v : '')
const isLink = (u) => /^https?:\/\//i.test(str(u))

/** A short, readable name for the system an artifact lives in. */
export const SYSTEM_LABEL = { notion: 'Notion', drive: 'Drive', github: 'GitHub', airtable: 'Airtable', compass: 'Compass reference', pdf: 'PDF' }
export function systemOf(a) {
  const s = str(a?.system).toLowerCase()
  if (s) return SYSTEM_LABEL[s] || s
  const u = str(a?.url)
  if (/notion\.(com|so)/i.test(u)) return SYSTEM_LABEL.notion
  if (/\.pdf(\?|$)/i.test(u)) return SYSTEM_LABEL.pdf
  if (/drive\.google|docs\.google/i.test(u)) return SYSTEM_LABEL.drive
  if (/github\.com/i.test(u)) return SYSTEM_LABEL.github
  if (/airtable\.com/i.test(u)) return SYSTEM_LABEL.airtable
  if (str(a?.ref)) return SYSTEM_LABEL.compass
  return u ? 'link' : ''
}

/** What to call an artifact on the card: its title, else its reference, else the link's last path segment. */
export function nameOf(a) {
  if (str(a?.title)) return a.title
  if (str(a?.ref)) return a.ref
  const u = str(a?.url)
  try {
    const path = new URL(u).pathname.replace(/\/+$/, '')
    return decodeURIComponent(path.split('/').pop() || new URL(u).hostname)
  } catch {
    return u || 'artifact'
  }
}

/** Card rows: one per artifact, newest first. `open` is the Open target or '' (a Compass reference has none). */
export function artifactRows(thread) {
  const list = Array.isArray(thread?.artifacts) ? thread.artifacts : []
  return list.map((a) => ({
    name: nameOf(a),
    system: systemOf(a),
    open: isLink(a.url) ? a.url : '',
    reference: !isLink(a.url),
    at: Number(a.at) || 0,
  }))
}

/** The newest artifact's ledger time on a thread, 0 when it left none. */
export const newestArtifactAt = (thread) => (Array.isArray(thread?.artifacts) ? thread.artifacts : []).reduce((m, a) => Math.max(m, Number(a.at) || 0), 0)

/**
 * Which agents wear a bubble right now. Fed every poll with the roster; remembers, per thread, the
 * newest artifact it has seen and until when its bubble shows.
 *   - on the first poll a bubble shows only for an artifact younger than BUBBLE_MS (the world just
 *     opened; everything older is history, not news)
 *   - later, an artifact newer than the one seen before is news: its bubble shows for BUBBLE_MS from
 *     now (or from its own time, whichever is later — a late-registered artifact still gets its moment)
 *   - a thread that leaves the roster forgets its bubble; it is news again only if it comes back newer
 */
export class BubbleTracker {
  constructor({ ms = BUBBLE_MS } = {}) {
    this.ms = ms
    this.seen = new Map() // thread id → { newestAt, until }
    this.primed = false
  }

  /** @returns Map<thread id, { title, until }> for every bubble active at `now` */
  update(threads, now = Date.now()) {
    const list = Array.isArray(threads) ? threads : []
    const ids = new Set()
    for (const t of list) {
      if (!t?.id) continue
      ids.add(t.id)
      const newestAt = newestArtifactAt(t)
      const prev = this.seen.get(t.id)
      if (!newestAt) {
        this.seen.set(t.id, { newestAt: 0, until: 0 })
        continue
      }
      if (!prev) {
        // First sight of this thread. On the opening poll only a fresh artifact is news. Later, a thread
        // that walks in with a recent artifact (a run that completed between polls) is news from now —
        // the ledger's clock may lag the viewer's by more than the bubble lasts.
        const fresh = now - newestAt < this.ms
        const recent = now - newestAt < 10 * this.ms
        this.seen.set(t.id, { newestAt, until: !this.primed ? (fresh ? newestAt + this.ms : 0) : recent ? now + this.ms : 0 })
      } else if (newestAt > prev.newestAt) {
        this.seen.set(t.id, { newestAt, until: Math.max(newestAt, now) + this.ms })
      }
    }
    for (const id of [...this.seen.keys()]) if (!ids.has(id)) this.seen.delete(id)
    this.primed = true

    const active = new Map()
    for (const t of list) {
      const s = this.seen.get(t?.id)
      if (!s || s.until <= now) continue
      // The bubble names what is worth shouting about: of the burst that made the news (artifacts within a
      // minute of the newest), the one that opens; else the newest itself.
      const burst = (t.artifacts || []).filter((a) => s.newestAt - (Number(a.at) || 0) < this.ms)
      const newest = burst.find((a) => isLink(a.url)) || burst[0] || t.artifacts?.[0]
      active.set(t.id, { title: newest ? nameOf(newest) : 'artifact', system: newest ? systemOf(newest) : '', until: s.until })
    }
    return active
  }
}

/**
 * U32 (ES-6.7) amends U13: a bubble fires only when the artifact's run has an open gate — under the still map that is
 * a gate request carrying artifacts. An artifact on a run without a gate appears on the archive shelf only.
 */
export const bubbleEligible = (t) => Boolean(t && t.kind === 'request' && t.request === 'gate' && Array.isArray(t.gates) && t.gates.length && Array.isArray(t.artifacts) && t.artifacts.length)
