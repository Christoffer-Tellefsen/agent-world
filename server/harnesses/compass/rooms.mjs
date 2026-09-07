/**
 * Room panels (U31, ES-6.6) — one read-only model per room, served by the sidecar as GET /rooms, each
 * panel its own 5-minute cache (surfaces.stale), nothing editable, an empty panel names its fix. The
 * Steering Room of U19 is retired: its three panels live here (pipeline → strategy room, the milestone
 * board → workshop and corner office, the last decisions → board room). U20's warmth is a column.
 *
 * What each room reads (GET, or the one guarded data-source query):
 *   board-room        🧠 Decisions — Pending (the requests standing here), 🟡 Working (folders), next review dates
 *   strategy-room     Pipeline "Active pipeline" rows in the view's order with stage and warmth; Research briefs (NOTION_DS_RESEARCH)
 *   marketing-studio  ✍️ Content week wall Sun–Thu (NOTION_DS_CONTENT); signatures pending = the content_status requests
 *   research-lab      Research briefs with refresh due (NOTION_DS_RESEARCH)
 *   finance-office    Airtable Finance (table resolved by name): unpaid, overdue, paid, this month
 *   integration-yard  Integrations with open drift findings (NOTION_DS_INTEGRATIONS)
 *   workshop          Active Build projects with their next milestone; the Delivery-type skills as benches
 *   records-office    automations, connectors (substrate v2 — SKIPPED:WORKER-NEEDED on v1), the silent skills, the last twenty ledger runs
 *   corner-office     today's Big 3 (Tasks — the Action Items database exposes no data source today), the four numbers
 *                     (rollups — v2), the milestone heat; the in-tray is the overlay's own list
 * Skills are rows in their room by ops_skills.type with the pack's overrides; each row is lit (a run live),
 * dark (idle), dusty (silent 30 d and wanted) or red (failed 24 h). Annex III: a row is a skill, never a person.
 */
import { roomForSkill, roomsOf } from './pack.mjs'
import { nextMilestone } from './steering.mjs'
import { PANEL_MS } from './surfaces.mjs'
import { DECISIONS, envSources, resolveTasks } from './notion-sources.mjs'
import { titleOf, selectName, dateStart, multiNames, relationIds } from './notion.mjs'

const DAY_MS = 24 * 3600 * 1000
const str = (v) => (typeof v === 'string' ? v.trim() : '')
export const SKIP = Object.freeze({ env: (name) => `SKIPPED:ENV — set ${name} in .env`, worker: (what) => `SKIPPED:WORKER-NEEDED — ${what} arrives with /world/substrate v2 (Prompt B-2)`, tasks: 'SKIPPED:ENV — the Action Items database exposes no data source to the integration (GET /v1/databases → data_sources [])' })

/** Pure: warmth from days since last touch (U20's rule, now a column). */
export const warmthOf = (days) => (days == null || !Number.isFinite(days) ? 0.2 : days <= 7 ? 1.0 : days <= 30 ? 0.5 : 0.2)

/** Pure: the state of a skill row. */
export function skillState(name, { live = new Set(), failed = new Set(), silent = new Set(), wanted = new Set() } = {}) {
  if (failed.has(name)) return 'red'
  if (live.has(name)) return 'lit'
  if (silent.has(name) && wanted.has(name)) return 'dusty'
  return 'dark'
}

/** Pure: every Active skill as a row in its room. */
export function skillRows(skills, pack, states) {
  const rows = new Map()
  for (const s of Array.isArray(skills) ? skills : []) {
    if (!s || !str(s.name) || !/^active$/i.test(str(s.status))) continue
    const { room, source, wants } = roomForSkill(pack, s.name, s.type)
    if (!rows.has(room)) rows.set(room, [])
    rows.get(room).push({ name: s.name, type: str(s.type), state: skillState(s.name, states), placedBy: source, wants })
  }
  for (const list of rows.values()) list.sort((a, b) => a.name.localeCompare(b.name))
  return rows
}

/** Pure: the wanted skills — the pack override names a wants value that an Active project's Tech Stack contains (ES-6.8). */
export function wantedSkills(pack, projects) {
  const stack = new Set()
  for (const p of Array.isArray(projects) ? projects : []) for (const t of p.techStack || []) stack.add(str(t).toLowerCase())
  const out = new Set()
  for (const [name, o] of Object.entries(pack?.skills?.overrides || {})) if (str(o?.wants) && stack.has(str(o.wants).toLowerCase())) out.add(name)
  return out
}

/** Pure: Airtable Finance records → the four buckets. Amounts in OMR ("Amount in OMR" formula, else "Amount OMR (Locked)"). */
export function financeBuckets(records, now = Date.now()) {
  const d = new Date(now)
  const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const today = d.toISOString().slice(0, 10)
  const out = { unpaid: { n: 0, omr: 0, rows: [] }, overdue: { n: 0, omr: 0, rows: [] }, paid: { n: 0, omr: 0, rows: [] }, thisMonth: { n: 0, omr: 0, rows: [] } }
  const add = (b, r, f) => { b.n++; b.omr += Number(f['Amount in OMR'] ?? f['Amount OMR (Locked)'] ?? 0) || 0; if (b.rows.length < 12) b.rows.push({ id: r.id, name: str(f['Entry Name']) || str(f['Invoice Number']) || r.id, status: str(f.Status), amount: Number(f.Amount) || 0, currency: str(f.Currency), omr: Number(f['Amount in OMR'] ?? 0) || 0, due: str(f['Due Date']), issued: str(f['Issue Date']), url: r.url || '' }) }
  for (const r of Array.isArray(records) ? records : []) {
    const f = r?.fields || {}
    const status = str(f.Status)
    const due = str(f['Due Date'])
    const income = Number(f['Is Income']) === 1 || /^income/i.test(str(f.Type))
    if (/^overdue$/i.test(status) || (/^invoiced$/i.test(status) && due && due < today)) add(out.overdue, r, f)
    else if (/^invoiced$/i.test(status)) add(out.unpaid, r, f)
    else if (/^(paid|received)$/i.test(status)) add(out.paid, r, f)
    if (income && str(f['Issue Date']).startsWith(month)) add(out.thisMonth, r, f)
  }
  for (const b of Object.values(out)) b.omr = Math.round(b.omr * 100) / 100
  return { month, ...out }
}

export function createRooms(cfg, { surfaces, substrate, steering, pack, lastScan, log = () => {}, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const env = envSources()
  const packNow = () => (typeof pack === 'function' ? pack() : pack)
  const scan = () => (typeof lastScan === 'function' ? lastScan() : null) || { runs: new Map(), threads: [], projects: [], silent: [], live: new Set(), failed: new Set() }

  /** The Finance table, resolved by name through the base's metadata (GET /v0/meta/bases/<base>/tables), cached. */
  const financeTable = () =>
    surfaces.stale('finance-table', 60 * 60_000, async () => {
      if (!cfg.airtableToken) throw new Error('AIRTABLE_TOKEN is not set in .env')
      const res = await fetchImpl(`https://api.airtable.com/v0/meta/bases/${cfg.airtableBaseId}/tables`, { headers: { Authorization: `Bearer ${cfg.airtableToken}` } })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(`airtable meta ${res.status}: ${body.error?.type || ''}`.trim())
      const t = (body.tables || []).find((x) => /^finance$/i.test(x.name))
      if (!t) throw new Error('no table named Finance in the base')
      log(`rooms: Finance table resolved by name → ${t.id}`)
      return { id: t.id, name: t.name }
    }, null)

  const skillsWithStates = async () => {
    const s = scan()
    const projects = s.projects?.length ? s.projects : await surfaces.activeProjects()
    const wanted = wantedSkills(packNow(), projects)
    return skillRows((await substrate.read()).skills, packNow(), { live: s.live, failed: s.failed, silent: new Set(s.silent), wanted })
  }

  async function boardRoom() {
    return surfaces.stale('room:board', PANEL_MS, async () => {
      const rows = await surfaces.client.query(DECISIONS, { sorts: [{ property: 'Date', direction: 'descending' }], page_size: 100 }, { maxPages: 5 })
      const map = (p) => ({ id: p.id, title: titleOf(p), status: selectName(p.properties?.Status), confidence: selectName(p.properties?.Confidence), date: dateStart(p.properties?.Date), reviewDue: dateStart(p.properties?.['Review Due']), category: selectName(p.properties?.Category), url: p.url || '' })
      const all = rows.map(map)
      const working = all.filter((d) => /working/i.test(d.confidence) && !/superseded/i.test(d.status))
      const today = new Date(now()).toISOString().slice(0, 10)
      const dated = all.filter((d) => d.reviewDue && !/superseded/i.test(d.status)).sort((a, b) => a.reviewDue.localeCompare(b.reviewDue))
      // the next review dates: upcoming first (ten), the overdue ones counted
      const reviews = dated.filter((d) => d.reviewDue >= today).slice(0, 10)
      const overdueReviews = dated.filter((d) => d.reviewDue < today).length
      const recent = all.filter((d) => /^(active|pending)$/i.test(d.status)).slice(0, 3)
      return { working, reviews, overdueReviews, recent, total: all.length, error: '' }
    }, { working: [], reviews: [], overdueReviews: 0, recent: [], total: 0, error: 'reading…' }).then(async (panel) => {
      // the Pending list is the requests standing here: the same 15-s read the threads come from, never a 5-min copy
      const pending = await surfaces.pendingDecisions()
      return { ...panel, pending: pending.map((d) => ({ id: d.id, title: d.title, status: d.status, confidence: d.confidence, date: d.at ? new Date(d.at).toISOString().slice(0, 10) : '', reviewDue: d.reviewDue, url: d.url })) }
    })
  }

  async function strategyRoom() {
    const p = await steering.pipeline()
    const rows = (p.hot || []).map((r) => ({ ...r, warmth: warmthOf(r.days) }))
    const research = env.RESEARCH ? await researchBriefs() : { rows: [], skipped: SKIP.env('NOTION_DS_RESEARCH') }
    return { pipeline: { rows, view: p.view, error: p.error }, research: { rows: research.rows.filter((b) => b.handoff), skipped: research.skipped || '', error: research.error || '' } }
  }

  const researchBriefs = () =>
    surfaces.stale('room:research', PANEL_MS, async () => {
      const rows = await surfaces.client.query(env.RESEARCH, { page_size: 100 })
      return { rows: rows.map((p) => { const pr = p.properties || {}; return { id: p.id, title: titleOf(p), status: selectName(pr.Status), refreshDue: dateStart(pr['Refresh Due'] || pr['Review Due'] || pr['Next Refresh']), handoff: Boolean(relationIds(pr.Handoff).length || selectName(pr.Handoff) || relationIds(pr.Project).length), url: p.url || '', edited: p.last_edited_time || '' } }), error: '' }
    }, { rows: [], error: 'reading…' })

  async function marketingStudio() {
    const s = scan()
    const signatures = (s.threads || []).filter((t) => t.kind === 'request' && (t.request === 'content' || t.gates?.some((g) => g.surface === 'content_status'))).map((t) => ({ id: t.id, title: t.gates?.[0]?.gate || t.title, url: t.ref?.url || '', at: t.gateAt || t.lastActivityAt }))
    if (!env.CONTENT) return { week: [], signatures, skipped: SKIP.env('NOTION_DS_CONTENT') }
    const wall = await surfaces.stale('room:content', PANEL_MS, async () => {
      const rows = await surfaces.client.query(env.CONTENT, { page_size: 100 })
      const items = rows.map((p) => { const pr = p.properties || {}; const date = dateStart(pr['Publish Date'] || pr.Date || pr['Scheduled'] || pr['Planned']); return { id: p.id, title: titleOf(p), status: selectName(pr.Status), channel: selectName(pr.Channel) || multiNames(pr.Channel).join('/'), date, url: p.url || '' } })
      // the week wall: Sun–Thu of the current week (Muscat's working week)
      const d = new Date(now()); const dow = d.getDay(); const sun = new Date(d); sun.setDate(d.getDate() - dow); sun.setHours(0, 0, 0, 0)
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'].map((name, i) => { const day = new Date(sun); day.setDate(sun.getDate() + i); const iso = day.toISOString().slice(0, 10); return { name, date: iso, cards: items.filter((c) => c.date === iso) } })
      return { week: days, byStatus: items.reduce((m, c) => ((m[c.status || '∅'] = (m[c.status || '∅'] || 0) + 1), m), {}), error: '' }
    }, { week: [], byStatus: {}, error: 'reading…' })
    return { ...wall, signatures, skipped: '' }
  }

  async function researchLab() {
    if (!env.RESEARCH) return { rows: [], skipped: SKIP.env('NOTION_DS_RESEARCH') }
    const r = await researchBriefs()
    return { rows: r.rows.sort((a, b) => (a.refreshDue || '9999').localeCompare(b.refreshDue || '9999')), error: r.error, skipped: '' }
  }

  async function financeOffice() {
    return surfaces.stale('room:finance', PANEL_MS, async () => {
      const t = await financeTable()
      if (!t) throw new Error('Finance table not resolved')
      const fields = ['Entry Name', 'Status', 'Amount', 'Currency', 'Amount in OMR', 'Due Date', 'Issue Date', 'Paid Date', 'Is Income', 'Type', 'Invoice Number', 'Entry Class'].map((f) => `&fields%5B%5D=${encodeURIComponent(f)}`).join('')
      const records = (await surfaces.airtableAll(t.id, fields)).map((r) => ({ ...r, url: `https://airtable.com/${cfg.airtableBaseId}/${t.id}/${r.id}` }))
      return { table: t.id, ...financeBuckets(records, now()), error: '' }
    }, { table: '', unpaid: { n: 0, omr: 0, rows: [] }, overdue: { n: 0, omr: 0, rows: [] }, paid: { n: 0, omr: 0, rows: [] }, thisMonth: { n: 0, omr: 0, rows: [] }, error: 'reading…' })
  }

  async function integrationYard() {
    if (!env.INTEGRATIONS) return { rows: [], skipped: SKIP.env('NOTION_DS_INTEGRATIONS') }
    return surfaces.stale('room:integrations', PANEL_MS, async () => {
      const rows = await surfaces.client.query(env.INTEGRATIONS, { page_size: 100 })
      const items = rows.map((p) => { const pr = p.properties || {}; return { id: p.id, title: titleOf(p), status: selectName(pr.Status), drift: selectName(pr['Drift Status'] || pr.Drift) || (Number(pr['Open Findings']?.number) || 0), url: p.url || '' } })
      return { rows: items, open: items.filter((i) => /open|drift/i.test(String(i.drift)) || Number(i.drift) > 0), error: '', skipped: '' }
    }, { rows: [], open: [], error: 'reading…' })
  }

  async function workshop() {
    const projects = await surfaces.activeProjects()
    const build = projects.filter((p) => /build/i.test(p.engagementType || '')).map((p) => ({ id: p.id, name: p.name, clientName: p.clientName, internal: p.internal, url: p.url, done: (p.milestones?.list || []).filter((m) => m.done).length, total: (p.milestones?.list || []).length, next: nextMilestone(p.milestones?.list || []) }))
    const skills = await skillsWithStates()
    return { projects: build, benches: skills.get('workshop') || [], error: '' }
  }

  async function recordsOffice() {
    const s = scan()
    const sub = await substrate.read()
    const runs = [...(s.runs?.values?.() || [])].sort((a, b) => b.lastAt - a.lastAt).slice(0, 20).map((r) => ({ id: r.id, skill: r.skill, client: r.client || '', state: r.terminal === 'run_failed' ? 'failed' : r.gates.some((g) => !g.passed) ? 'waiting' : r.terminal === 'run_completed' ? 'completed' : s.live.has(r.skill) ? 'running' : 'idle', at: r.lastAt, gates: r.gates.length, artifacts: r.artifacts.length }))
    const skills = await skillsWithStates()
    const v2 = Number(sub.version) >= 2
    return {
      automations: v2 ? { rows: sub.automations || [], skipped: '' } : { rows: [], skipped: SKIP.worker('automations (next fire, last fire, missed)') },
      connectors: v2 ? { rows: sub.connectors || [], skipped: '' } : { rows: [], skipped: SKIP.worker('connectors') },
      silent: { rows: (s.silent || []).map((name) => ({ name, dusty: skills.get('records-office')?.some((r) => r.name === name && r.state === 'dusty') || [...skills.values()].some((list) => list.some((r) => r.name === name && r.state === 'dusty')) })), of: (sub.skills || []).filter((k) => /^active$/i.test(str(k.status))).length },
      runs, rows: skills.get('records-office') || [], error: '',
    }
  }

  async function cornerOffice() {
    const sub = await substrate.read()
    // the in-tray (U14) — the request threads standing on the scan, as the tray lists them
    const s = scan()
    const tray = (s.threads || []).filter((t) => t.kind === 'request').map((t) => ({ id: t.id, title: t.title, skill: t.skill, zone: t.project, at: t.gateAt || t.lastActivityAt, url: t.ref?.url || '', badge: t.badge })).sort((a, b) => (a.badge === b.badge ? 0 : a.badge === '!' ? -1 : 1) || a.at - b.at)
    const tasksDs = await resolveTasks((p) => surfaces.client.get(p))
    let big3 = { rows: [], skipped: SKIP.tasks }
    if (tasksDs) {
      big3 = await surfaces.stale('room:tasks', PANEL_MS, async () => {
        const rows = await surfaces.client.query(tasksDs, { page_size: 100 })
        const items = rows.map((p) => { const pr = p.properties || {}; return { id: p.id, title: titleOf(p), status: selectName(pr.Status), priority: selectName(pr.Priority), url: p.url || '' } })
        return { rows: items.filter((t) => /today/i.test(t.status) && /big 3/i.test(t.priority)).slice(0, 3), today: items.filter((t) => /today/i.test(t.status)).length, skipped: '', error: '' }
      }, { rows: [], skipped: '', error: 'reading…' })
    }
    const v2 = Number(sub.version) >= 2
    const numbers = v2 ? { unattendedShare: sub.rollups?.LAST_RUN_GOVERNANCE?.unattended_share ?? null, failureRate: sub.rollups?.LAST_RUN_GOVERNANCE?.failure_rate ?? null, medianTimeToTap: sub.rollups?.LAST_RUN_GOVERNANCE?.median_time_to_tap ?? null, openGates: sub.rollups?.LAST_RUN_GOVERNANCE?.open_gates ?? null, lastReconciliation: sub.rollups?.LAST_GATE_RECONCILIATION?.at ?? null, skipped: '' } : { skipped: SKIP.worker('the four numbers (LAST_RUN_GOVERNANCE) and LAST_GATE_RECONCILIATION') }
    const heat = await steering.milestoneBoard()
    return { tray, big3, numbers, heat: { rows: heat.rows || [], error: heat.error || '' }, error: '' }
  }

  const readers = { 'board-room': boardRoom, 'strategy-room': strategyRoom, 'marketing-studio': marketingStudio, 'research-lab': researchLab, 'finance-office': financeOffice, 'integration-yard': integrationYard, workshop, 'records-office': recordsOffice, 'corner-office': cornerOffice }

  async function one(id) {
    const fn = readers[id]
    if (!fn) return null
    try {
      const skills = id === 'workshop' || id === 'records-office' ? null : await skillsWithStates().catch(() => new Map())
      const data = await fn()
      return { id, at: new Date(now()).toISOString(), ...data, skills: skills ? skills.get(id) || [] : data.rows || data.benches || [] }
    } catch (err) {
      return { id, at: new Date(now()).toISOString(), error: err.message || String(err), skills: [] }
    }
  }
  async function all() {
    const out = {}
    for (const r of roomsOf(packNow())) if (readers[r.id]) out[r.id] = await one(r.id)
    return { at: new Date(now()).toISOString(), rooms: out, missingEnv: Object.entries(env).filter(([, v]) => !v).map(([k]) => `NOTION_DS_${k}`) }
  }
  return { one, all, readers: Object.keys(readers) }
}
