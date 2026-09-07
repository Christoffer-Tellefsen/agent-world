/**
 * Compass adapter — surface reads: milestone progress (U4) and the gate cross-check (U6).
 *
 * Read only, and mechanically so: every request in this file is a GET (npm test proves it).
 * Every failure degrades to the safe answer — the progress floor, the ? still shown — and warns
 * once a minute. The world never hides a ? because a read failed, and it never writes gate_passed:
 * the sweep and the pollers own that. This file only stops the world lying in the meantime.
 *
 * Surfaces cross-checked (SPEC.md §4.6):
 *   pending_approval  Airtable HQ row     resolved when Status is Approved / Sent / Rejected
 *   decision          Notion Decision     resolved when Status has moved on from Pending
 *   content_status    Notion Content row  resolved when Status has moved on from In Review
 *                     (added 2026-09-06: Christoffer signed a draft and the ? stayed until the
 *                      20:00 poller — the poller owns the write, not the read)
 *   class_b_gate, client_gate — no surface to read; never checked.
 */

const NOTION_VERSION = '2025-09-03'
const DONE = /delivered|done|accepted|complete/i // 🎯 Engagement Milestones → Status "🟢 Delivered"
const PA_RESOLVED = /^(approved|sent|rejected)$/i
const CROSS = new Set(['pending_approval', 'decision', 'content_status'])

/** 32-hex or dashed → dashed uuid; '' when it is neither (project ids arrive both ways in the ledger). */
export function dash(id) {
  const h = String(id || '').replace(/-/g, '')
  return /^[0-9a-f]{32}$/i.test(h) ? `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` : ''
}
/** The page id at the end of any Notion URL shape (app.notion.com/p/<id>, notion.so/<slug>-<id>, ?pvs=…). */
export function notionId(url) {
  const s = String(url || '').split(/[?#]/)[0]
  const m = s.match(/([0-9a-f]{32})$/i) || s.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
  return m ? dash(m[1]) : ''
}
/** base / table / record out of an Airtable record URL, with or without a view segment. */
export function airtableRef(url) {
  const m = String(url || '').match(/(app[A-Za-z0-9]+)\/(tbl[A-Za-z0-9]+)(?:\/viw[A-Za-z0-9]+)?\/(rec[A-Za-z0-9]+)/)
  return m ? { base: m[1], table: m[2], record: m[3] } : null
}
const selectName = (prop) => {
  const t = prop?.type
  return t === 'select' || t === 'status' ? prop[t]?.name || '' : ''
}

/** Pure: can this gate be verified on a surface at all? (needs a cross-checkable surface and a real link) */
export const crossCheckable = (gate) => Boolean(gate && CROSS.has(gate.surface) && /^https?:\/\//.test(gate.ref_url || ''))

export function createSurfaces(cfg, { fetchImpl = globalThis.fetch, log = () => {}, now = Date.now } = {}) {
  const warned = new Map()
  const warn = (key, msg) => {
    const t = now()
    if (t - (warned.get(key) || 0) > 60_000) {
      warned.set(key, t)
      console.warn('bot-crossing: compass —', msg)
    }
  }

  async function notion(path) {
    if (!cfg.notionToken) throw new Error('NOTION_TOKEN is not set in .env')
    const res = await fetchImpl(`https://api.notion.com/v1/${path}`, {
      headers: { Authorization: `Bearer ${cfg.notionToken}`, 'Notion-Version': NOTION_VERSION },
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const hint = res.status === 404 ? ' (share the database with the "Tellefsen - Agent world" integration)' : ''
      throw new Error(`notion ${res.status} on ${path}: ${body.code || ''} ${hint}`.trim())
    }
    return body
  }

  // ── U4: 🎯 Engagement Milestones done ÷ total for the run's project, 5-min cache ──────────
  const progressCache = new Map() // dashed project id → { at, value, doneAt: newest last_edited_time of a Done milestone }
  /** One read per project per 5 min: progress (U4) and the newest time a milestone was edited while Done (U17's ✓). */
  async function milestones(projectId) {
    const id = dash(projectId)
    if (!id) return { value: 0.05, doneAt: 0, list: [] }
    const hit = progressCache.get(id)
    if (hit && now() - hit.at < 5 * 60_000) return hit
    let value = 0.05
    let doneAt = 0
    let list = []
    try {
      const page = await notion(`pages/${id}`)
      const rel = page.properties?.Milestones
      let ids = (rel?.relation || []).map((r) => r.id)
      if (rel?.has_more && rel.id) {
        const more = await notion(`pages/${id}/properties/${encodeURIComponent(rel.id)}?page_size=100`)
        ids = (more.results || []).map((r) => r.relation?.id).filter(Boolean)
      }
      if (ids.length) {
        const pages = await Promise.all(
          ids.map((m) =>
            notion(`pages/${m}`)
              .then((p) => {
                const pr = p.properties || {}
                const title = Object.values(pr).find((x) => x?.type === 'title')
                return {
                  id: m,
                  name: (title?.title || []).map((t) => t.plain_text).join('') || m,
                  status: selectName(pr.Status),
                  edited: Date.parse(p.last_edited_time) || 0,
                  committed: Date.parse(pr['Committed Date']?.date?.start || '') || 0,
                  sequence: typeof pr.Sequence?.number === 'number' ? pr.Sequence.number : null,
                  url: p.url || '',
                }
              })
              .catch(() => ({ id: m, name: m, status: '', edited: 0, committed: 0, sequence: null, url: '' }))
          )
        )
        list = pages.map((p) => ({ ...p, done: DONE.test(p.status) }))
        const done = list.filter((p) => p.done)
        value = Math.max(0.05, done.length / ids.length)
        doneAt = done.reduce((m, p) => Math.max(m, p.edited), 0)
      }
      log(`progress ${id}: ${value} (${ids.length} milestones)`)
    } catch (err) {
      warn(`progress:${id}`, `milestone progress unavailable for project ${id} — ${err.message}`)
    }
    const entry = { at: now(), value, doneAt, list }
    progressCache.set(id, entry)
    return entry
  }
  const progress = async (projectId) => (await milestones(projectId)).value
  /** U17: a milestone of this project was Done and edited within the window (Notion's last_edited_time is the only clock it offers). */
  const recentDone = async (projectId, windowMs = 24 * 3600 * 1000) => {
    const { doneAt } = await milestones(projectId)
    return Boolean(doneAt) && now() - doneAt <= windowMs
  }

  // ── U6: has the surface already resolved this gate? ─────────────────────────────────────────

  async function readResolved(gate) {
    if (gate.surface === 'pending_approval') {
      const ref = airtableRef(gate.ref_url)
      if (!ref) return false
      if (!cfg.airtableToken) throw new Error('AIRTABLE_TOKEN is not set in .env')
      const res = await fetchImpl(`https://api.airtable.com/v0/${ref.base}/${ref.table}/${ref.record}`, {
        headers: { Authorization: `Bearer ${cfg.airtableToken}` },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(`airtable ${res.status} on ${ref.record}: ${body.error?.type || body.error || ''}`.trim())
      return PA_RESOLVED.test(String(body.fields?.Status || '').trim())
    }
    const id = notionId(gate.ref_url)
    if (!id) return false
    const status = selectName((await notion(`pages/${id}`)).properties?.Status)
    if (!status) return false
    if (gate.surface === 'decision') return !/pending/i.test(status)
    if (gate.surface === 'content_status') return !/in review/i.test(status)
    return false
  }

  // Keyed by run_id + gate (+ surface + ref_url), never by ref_url alone: a Pending Approval row that
  // is re-armed for a NEW run (same record, new gate_waiting) must be read again, or its ? would stay
  // hidden until the process restarts (defect found 2026-09-07 at the M1 rechecks). Within one run a
  // gate seen resolved stays resolved — no surface read every poll for it.
  const gateCache = new Map() // run_id|gate|surface|ref_url → { at, resolved }
  async function gateResolved(gate) {
    if (!crossCheckable(gate)) return false
    const key = `${gate.run_id || ''}|${gate.gate || ''}|${gate.surface}|${gate.ref_url}`
    const hit = gateCache.get(key)
    if (hit && (hit.resolved || now() - hit.at < 5_000)) return hit.resolved
    let resolved = false
    try {
      resolved = await readResolved(gate)
      if (resolved) log(`gate resolved on its surface: ${key}`)
    } catch (err) {
      warn(`gate:${key}`, `cross-check unavailable for ${gate.surface} — ${err.message}`)
    }
    gateCache.set(key, { at: now(), resolved })
    return resolved
  }

  return { progress, recentDone, milestones, gateResolved, crossCheckable, _cache: { progressCache, gateCache } }
}
