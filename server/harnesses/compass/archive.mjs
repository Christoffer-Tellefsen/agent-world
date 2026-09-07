/**
 * The archive (U32, ES-6.7) — a shelf per client and per venture, and one per project for the fixture's
 * Archive tab. Read only, 5-min cache, newest first; a row opens only where it carries a link.
 *
 *   Deliverables      every registered artifact in the ledger window (artifact_registered, run_completed.artifacts,
 *                     the ops_skill_runs row's artifacts) — the ledger is the register; shelved by the run's client
 *                     (none → the home shelf) and by the run's project
 *                     plus the Notion 📎 Deliverables rows (NOTION_DS_DELIVERABLES) beside the ledger's register
 *   Sent Documents    the 📎 Deliverables rows at Status "Sent to Client" (2026-09-07: there is no Sent Documents
 *                     database in Notion; NOTION_DS_SENT_DOCUMENTS is not a name)
 *   settled Decisions 🧠 Decisions at Status Active, by their Client relation (the client page → Airtable name)
 *   Research briefs   NOTION_DS_RESEARCH — by "Related client" / "Related project", newest "Date completed" first
 *   Integration pages NOTION_DS_INTEGRATIONS — no Client relation: the shelf is the page's Project → that project's client
 *   Field Mappings    NOTION_DS_FIELD_MAPPINGS — no Client or Project relation: Integration → its Project → its client
 *                     (property names from each source's schema, notion-rows.mjs, 2026-09-07); each absent name skips its
 *                     section (SKIPPED:ENV, the name only); a name that is set but unreadable says so by name
 * Open targets: Open PDF (a .pdf link), Open in Notion (notion.com / notion.so), Open in Drive (drive/docs.google);
 * any other link is plain Open; a Compass reference is a label.
 */
import { DECISIONS, envSources, unreadableNote } from './notion-sources.mjs'
import { titleOf, richText, relationIds, selectName, dateStart } from './notion.mjs'
import { PANEL_MS } from './surfaces.mjs'
import { researchRow, integrationRow, fieldMappingRow, deliverableRow } from './notion-rows.mjs'

const str = (v) => (typeof v === 'string' ? v.trim() : '')
const isLink = (u) => /^https?:\/\//i.test(str(u))
const undash = (id) => str(id).replace(/-/g, '').toLowerCase()

/** Pure: the Open buttons a row earns from its links. */
export function openTargets(row) {
  const out = []
  const seen = new Set()
  const add = (label, url) => { if (isLink(url) && !seen.has(url)) { seen.add(url); out.push({ label, url }) } }
  if (isLink(row?.pdf)) add('Open PDF', row.pdf) // a PDF field is a PDF whatever its URL looks like (Drive PDF URL)
  for (const u of [row?.url, row?.notion_url, row?.drive_url, ...(row?.links || [])]) {
    if (!isLink(u)) continue
    if (/\.pdf(\?|$)/i.test(u)) add('Open PDF', u)
    else if (/notion\.(com|so)/i.test(u)) add('Open in Notion', u)
    else if (/drive\.google|docs\.google/i.test(u)) add('Open in Drive', u)
    else add('Open', u)
  }
  return out
}

/** Pure: the Sent Documents — the 📎 Deliverables rows whose Status is "Sent to Client", as their own kind. */
export const SENT_STATUS = /^sent to client$/i
export const sentDocumentsOf = (rows) => (Array.isArray(rows) ? rows : []).filter((r) => SENT_STATUS.test(str(r?.status))).map((r) => ({ ...r, kind: 'sent-document' }))

/** Pure: the ledger's artifacts as shelf rows, newest first, by client and by project. */
export function deliverablesFromRuns(runs, rowById = new Map(), { homeName = 'home' } = {}) {
  const byClient = new Map()
  const byProject = new Map()
  const push = (map, key, row) => { if (!map.has(key)) map.set(key, []); map.get(key).push(row) }
  for (const run of runs?.values?.() || []) {
    const rowArts = Array.isArray(rowById.get(run.id)?.artifacts) ? rowById.get(run.id).artifacts : []
    const seen = new Set()
    const all = [...run.artifacts.map((a) => ({ ...a })), ...rowArts.map((a) => ({ title: str(a?.title) || str(a?.name), url: isLink(a?.url) ? a.url : '', ref: isLink(a?.url) ? '' : str(a?.url), system: str(a?.system), at: run.lastAt }))]
    for (const a of all) {
      const key = a.url || a.ref || a.title
      if (!key || seen.has(key)) continue
      seen.add(key)
      const row = { kind: 'deliverable', title: a.title || a.ref || a.url, at: a.at || run.lastAt, skill: run.skill, run_id: run.id, client: run.client || '', project: undash(run.project), system: a.system || '', ref: a.ref || '', open: openTargets({ url: a.url, notion_url: a.notion_url, drive_url: a.drive_url }) }
      push(byClient, run.client || homeName, row)
      if (row.project) push(byProject, row.project, row)
    }
  }
  const newest = (list) => list.sort((a, b) => b.at - a.at)
  for (const list of byClient.values()) newest(list)
  for (const list of byProject.values()) newest(list)
  return { byClient, byProject }
}

/** Pure: the whole shelf, sections newest first, from the parts. */
export function assembleShelf({ deliverables, decisions = [], research = null, integrations = null, fieldMappings = null, sentDocuments = null, homeName = 'home', missing = {} }) {
  const shelves = new Map()
  const section = (name, key, rows, skipped) => {
    if (!shelves.has(name)) shelves.set(name, { name, deliverables: [], sentDocuments: [], decisions: [], research: [], integrations: [], fieldMappings: [], skipped: { ...missing } })
    if (skipped) shelves.get(name).skipped[key] = skipped
    else shelves.get(name)[key].push(...rows)
  }
  for (const [client, rows] of deliverables.byClient) section(client, 'deliverables', rows)
  for (const d of decisions) section(d.client || homeName, 'decisions', [d])
  for (const [key, list] of [['research', research], ['integrations', integrations], ['fieldMappings', fieldMappings], ['sentDocuments', sentDocuments]]) {
    if (!list) continue
    for (const r of list) section(r.client || homeName, key, [r])
  }
  for (const s of shelves.values()) for (const k of ['deliverables', 'sentDocuments', 'decisions', 'research', 'integrations', 'fieldMappings']) s[k].sort((a, b) => (b.at || 0) - (a.at || 0))
  return [...shelves.values()].sort((a, b) => (a.name === homeName ? 1 : b.name === homeName ? -1 : a.name.localeCompare(b.name)))
}

export function createArchive(cfg, { surfaces, lastScan, homeName = () => 'home', log = () => {}, now = Date.now } = {}) {
  const env = envSources()
  /** The notes for names that are absent; a read that failed adds its own (by name) in shelf(). */
  const missing = (failed = {}) => ({ ...(env.RESEARCH ? {} : { research: 'SKIPPED:ENV — set NOTION_DS_RESEARCH in .env' }), ...(env.INTEGRATIONS ? {} : { integrations: 'SKIPPED:ENV — set NOTION_DS_INTEGRATIONS in .env' }), ...(env.FIELD_MAPPINGS ? {} : { fieldMappings: 'SKIPPED:ENV — set NOTION_DS_FIELD_MAPPINGS in .env' }), ...(env.DELIVERABLES ? {} : { sentDocuments: 'SKIPPED:ENV — set NOTION_DS_DELIVERABLES in .env (Sent Documents = its rows at Status "Sent to Client")', notionDeliverables: 'SKIPPED:ENV — set NOTION_DS_DELIVERABLES in .env (the Deliverables section shows the ledger\'s register meanwhile)' }), ...failed })

  const clientPage = new Map() // page id → { at, name }
  async function clientName(pageId) {
    if (!pageId) return ''
    const hit = clientPage.get(pageId)
    if (hit && now() - hit.at < PANEL_MS) return hit.name
    let name = ''
    try {
      const page = await surfaces.notion(`pages/${pageId}`)
      const rec = richText(page.properties?.['Airtable Client ID']).trim()
      const names = await surfaces.clientNames()
      name = (rec && names.get(rec)) || titleOf(page).replace(/\s*[—–-]\s*client wiki\s*$/i, '').trim()
    } catch { /* unreadable page: no client */ }
    clientPage.set(pageId, { at: now(), name })
    return name
  }
  /** A project's client name: the Active projects first, else the project page's own Client relation (cached 5 min). */
  const projectClientCache = new Map() // undashed project id → { at, name }
  async function projectClientName(projectId) {
    const key = undash(projectId)
    if (!key) return ''
    const hit = projectClientCache.get(key)
    if (hit && now() - hit.at < PANEL_MS) return hit.name
    let name = ''
    try {
      const active = (await surfaces.activeProjects()).find((p) => undash(p.id) === key)
      if (active) name = active.clientName || ''
      else { const page = await surfaces.notion(`pages/${key}`); name = await clientName(relationIds(page.properties?.Client)[0]) }
    } catch { /* unreadable project: the home shelf */ }
    projectClientCache.set(key, { at: now(), name })
    return name
  }
  /** One page → a shelf row of its kind, by the source's own property names (notion-rows.mjs). */
  const rowOf = {
    decision: async (p) => { const pr = p.properties || {}; return { kind: 'decision', id: p.id, title: titleOf(p), status: selectName(pr.Status), at: Date.parse(dateStart(pr.Date) || p.last_edited_time) || 0, client: await clientName(relationIds(pr.Client)[0]), project: undash(relationIds(pr.Project)[0]), open: openTargets({ url: p.url }) } },
    deliverable: async (p) => { const r = deliverableRow(p); return { kind: 'deliverable', id: r.id, title: r.title, status: r.status, type: r.type, version: r.version, at: r.at, client: await clientName(r.clientPage), project: r.project, open: openTargets({ pdf: r.pdf, url: r.url, links: [r.docx] }) } },
    research: async (p) => { const r = researchRow(p); return { kind: 'research', id: r.id, title: r.title, status: r.status, type: r.type, refreshDue: r.refreshDue, handoff: r.handoff, at: r.at, client: (await clientName(r.clientPage)) || (await projectClientName(r.project)), project: r.project, open: openTargets({ url: r.url }) } },
    integration: async (p) => { const r = integrationRow(p); return { kind: 'integration', id: r.id, title: r.title, status: r.status, drift: r.drift, platform: r.platform, mappings: r.mappings, at: r.at, client: await projectClientName(r.project), project: r.project, open: openTargets({ url: r.url, links: r.links.map((l) => l.url) }) } },
    'field-mapping': async (p, ctx) => { const r = fieldMappingRow(p); const via = ctx.integrations?.get(r.integration); return { kind: 'field-mapping', id: r.id, title: r.title, status: r.drift, drift: r.drift, integration: r.integration, integrationTitle: via?.title || '', engagement: r.engagement, verifiedOn: r.verifiedOn, at: r.at, client: via?.client || '', project: via?.project || '', open: openTargets({ url: r.url }) } },
  }
  const pageRow = async (p, kind, ctx = {}) => rowOf[kind](p, ctx)
  const settledDecisions = () =>
    surfaces.stale('archive:decisions', PANEL_MS, async () => {
      const rows = await surfaces.client.query(DECISIONS, { filter: { property: 'Status', select: { equals: 'Active' } }, sorts: [{ property: 'Date', direction: 'descending' }], page_size: 100 }, { maxPages: 3 })
      const out = []
      for (const p of rows) out.push({ ...(await pageRow(p, 'decision')), confidence: selectName(p.properties?.Confidence) })
      return out
    }, [])
  /** One env-named section: null when the name is absent; { rows, error } otherwise — a failed read names itself (by name) and the shelf shows it. */
  const section = (key, envKey, kind, ctx = () => ({})) => {
    const ds = env[envKey]
    if (!ds) return Promise.resolve(null)
    return surfaces.stale(`archive:${key}`, PANEL_MS, async () => {
      const out = []
      const pages = await surfaces.client.query(ds, { page_size: 100 }, { maxPages: 5 }).catch((err) => { throw new Error(unreadableNote(envKey, err)) })
      const c = await ctx()
      for (const p of pages) out.push(await pageRow(p, kind, c))
      return { rows: out, error: '' }
    }, { rows: [], error: 'reading…' })
  }
  /** The integration pages by undashed id — the hop a Field Mapping takes to its project and client. */
  const integrationIndex = async () => { const part = await section('integrations', 'INTEGRATIONS', 'integration'); return { integrations: new Map((part?.rows || []).map((r) => [undash(r.id), r])) } }

  async function shelf() {
    const s = (typeof lastScan === 'function' ? lastScan() : null) || { runs: new Map(), rowById: new Map() }
    const home = homeName()
    const deliverables = deliverablesFromRuns(s.runs, s.rowById, { homeName: home })
    const [decisions, researchPart, integrationsPart, fieldMappingsPart, deliverablesPart] = await Promise.all([settledDecisions(), section('research', 'RESEARCH', 'research'), section('integrations', 'INTEGRATIONS', 'integration'), section('field-mappings', 'FIELD_MAPPINGS', 'field-mapping', integrationIndex), section('deliverables', 'DELIVERABLES', 'deliverable')])
    // a read that failed (or is still on its way) is a note on its section, by name — never an empty shelf that looks read
    const failed = {}
    const rowsOf = (part, key) => { if (!part) return null; if (part.error) failed[key] = /^SKIPPED/.test(part.error) ? part.error : `${key}: ${part.error}`; return part.rows }
    const research = rowsOf(researchPart, 'research'), integrations = rowsOf(integrationsPart, 'integrations'), fieldMappings = rowsOf(fieldMappingsPart, 'fieldMappings')
    const notionDeliverables = rowsOf(deliverablesPart, 'deliverables')
    if (failed.deliverables) failed.sentDocuments = failed.deliverables
    // Sent Documents = the 📎 Deliverables rows at Status "Sent to Client" (client-side: the same read, one status)
    const sentDocuments = notionDeliverables ? sentDocumentsOf(notionDeliverables) : null
    // a Notion 📎 Deliverables row (when NOTION_DS_DELIVERABLES is set) joins the Deliverables section beside the ledger's register
    for (const d of notionDeliverables || []) {
      const key = d.client || home
      if (!deliverables.byClient.has(key)) deliverables.byClient.set(key, [])
      deliverables.byClient.get(key).push({ ...d, skill: 'Notion', system: 'notion' })
      if (d.project) { if (!deliverables.byProject.has(d.project)) deliverables.byProject.set(d.project, []); deliverables.byProject.get(d.project).push({ ...d, skill: 'Notion', system: 'notion' }) }
    }
    for (const list of deliverables.byClient.values()) list.sort((a, b) => (b.at || 0) - (a.at || 0))
    for (const list of deliverables.byProject.values()) list.sort((a, b) => (b.at || 0) - (a.at || 0))
    const shelves = assembleShelf({ deliverables, decisions, research, integrations, fieldMappings, sentDocuments, homeName: home, missing: missing(failed) })
    // per project: the same shelf scoped to the project, plus its milestones (from the fixtures' milestone read)
    const byProject = {}
    const projects = s.projects || []
    for (const p of projects) {
      const key = undash(p.id)
      byProject[key] = {
        name: p.name, clientName: p.clientName || '', internal: Boolean(p.internal),
        deliverables: deliverables.byProject.get(key) || [],
        decisions: decisions.filter((d) => d.project === key),
        research: (research || []).filter((r) => r.project === key), integrations: (integrations || []).filter((r) => r.project === key), fieldMappings: (fieldMappings || []).filter((r) => r.project === key), sentDocuments: (sentDocuments || []).filter((r) => r.project === key),
        milestones: (p.milestones?.list || []).map((m) => ({ id: m.id, name: m.name, status: m.status, done: Boolean(m.done), committed: m.committed || 0, url: m.url || '' })),
        skipped: missing(failed),
      }
    }
    return { at: new Date(now()).toISOString(), shelves, byProject, missing: missing(failed) }
  }
  return { shelf }
}
