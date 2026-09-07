/**
 * The archive (U32, ES-6.7) — a shelf per client and per venture, and one per project for the fixture's
 * Archive tab. Read only, 5-min cache, newest first; a row opens only where it carries a link.
 *
 *   Deliverables      every registered artifact in the ledger window (artifact_registered, run_completed.artifacts,
 *                     the ops_skill_runs row's artifacts) — the ledger is the register; shelved by the run's client
 *                     (none → the home shelf) and by the run's project
 *   Sent Documents    the Project page's table — no data source id is named for it (NOTION_DS_SENT_DOCUMENTS, optional)
 *   settled Decisions 🧠 Decisions at Status Active, by their Client relation (the client page → Airtable name)
 *   Research briefs   NOTION_DS_RESEARCH        Integration pages  NOTION_DS_INTEGRATIONS
 *   Field Mappings    NOTION_DS_FIELD_MAPPINGS  — each absent name skips its section (SKIPPED:ENV, the name only)
 * Open targets: Open PDF (a .pdf link), Open in Notion (notion.com / notion.so), Open in Drive (drive/docs.google);
 * any other link is plain Open; a Compass reference is a label.
 */
import { DECISIONS, envSources } from './notion-sources.mjs'
import { titleOf, selectName, dateStart, relationIds, urlOf, filesOf, richText } from './notion.mjs'
import { PANEL_MS } from './surfaces.mjs'

const str = (v) => (typeof v === 'string' ? v.trim() : '')
const isLink = (u) => /^https?:\/\//i.test(str(u))
const undash = (id) => str(id).replace(/-/g, '').toLowerCase()

/** Pure: the Open buttons a row earns from its links. */
export function openTargets(row) {
  const out = []
  const seen = new Set()
  const add = (label, url) => { if (isLink(url) && !seen.has(url)) { seen.add(url); out.push({ label, url }) } }
  for (const u of [row?.pdf, row?.url, row?.notion_url, row?.drive_url, ...(row?.links || [])]) {
    if (!isLink(u)) continue
    if (/\.pdf(\?|$)/i.test(u)) add('Open PDF', u)
    else if (/notion\.(com|so)/i.test(u)) add('Open in Notion', u)
    else if (/drive\.google|docs\.google/i.test(u)) add('Open in Drive', u)
    else add('Open', u)
  }
  return out
}

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
  const sentDs = env.SENT_DOCUMENTS
  const missing = () => ({ ...(env.RESEARCH ? {} : { research: 'SKIPPED:ENV — set NOTION_DS_RESEARCH in .env' }), ...(env.INTEGRATIONS ? {} : { integrations: 'SKIPPED:ENV — set NOTION_DS_INTEGRATIONS in .env' }), ...(env.FIELD_MAPPINGS ? {} : { fieldMappings: 'SKIPPED:ENV — set NOTION_DS_FIELD_MAPPINGS in .env' }), ...(sentDs ? {} : { sentDocuments: 'SKIPPED:ENV — no data source id is named for Sent Documents (set NOTION_DS_SENT_DOCUMENTS in .env)' }), ...(env.DELIVERABLES ? {} : { notionDeliverables: 'SKIPPED:ENV — set NOTION_DS_DELIVERABLES in .env (the Deliverables section shows the ledger\'s register meanwhile)' }) })

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
  const pageRow = async (p, kind) => {
    const pr = p.properties || {}
    const links = [urlOf(pr.URL), urlOf(pr.Link), urlOf(pr['PDF']), urlOf(pr['Drive Link']), urlOf(pr['Drive']), ...filesOf(pr.File), ...filesOf(pr.Files), ...filesOf(pr.Attachment)].filter(isLink)
    return { kind, id: p.id, title: titleOf(p), status: selectName(pr.Status), at: Date.parse(dateStart(pr.Date) || p.last_edited_time) || 0, client: await clientName(relationIds(pr.Client)[0]), project: undash(relationIds(pr.Project)[0]), open: openTargets({ url: p.url, links }) }
  }
  const settledDecisions = () =>
    surfaces.stale('archive:decisions', PANEL_MS, async () => {
      const rows = await surfaces.client.query(DECISIONS, { filter: { property: 'Status', select: { equals: 'Active' } }, sorts: [{ property: 'Date', direction: 'descending' }], page_size: 100 }, { maxPages: 3 })
      const out = []
      for (const p of rows) out.push({ ...(await pageRow(p, 'decision')), confidence: selectName(p.properties?.Confidence) })
      return out
    }, [])
  const section = (key, ds, kind) => (!ds ? Promise.resolve(null) : surfaces.stale(`archive:${key}`, PANEL_MS, async () => { const out = []; for (const p of await surfaces.client.query(ds, { page_size: 100 })) out.push(await pageRow(p, kind)); return out }, []))

  async function shelf() {
    const s = (typeof lastScan === 'function' ? lastScan() : null) || { runs: new Map(), rowById: new Map() }
    const home = homeName()
    const deliverables = deliverablesFromRuns(s.runs, s.rowById, { homeName: home })
    const [decisions, research, integrations, fieldMappings, sentDocuments, notionDeliverables] = await Promise.all([settledDecisions(), section('research', env.RESEARCH, 'research'), section('integrations', env.INTEGRATIONS, 'integration'), section('field-mappings', env.FIELD_MAPPINGS, 'field-mapping'), section('sent-documents', sentDs, 'sent-document'), section('deliverables', env.DELIVERABLES, 'deliverable')])
    // a Notion 📎 Deliverables row (when NOTION_DS_DELIVERABLES is set) joins the Deliverables section beside the ledger's register
    for (const d of notionDeliverables || []) {
      const key = d.client || home
      if (!deliverables.byClient.has(key)) deliverables.byClient.set(key, [])
      deliverables.byClient.get(key).push({ ...d, skill: 'Notion', system: 'notion' })
      if (d.project) { if (!deliverables.byProject.has(d.project)) deliverables.byProject.set(d.project, []); deliverables.byProject.get(d.project).push({ ...d, skill: 'Notion', system: 'notion' }) }
    }
    for (const list of deliverables.byClient.values()) list.sort((a, b) => (b.at || 0) - (a.at || 0))
    for (const list of deliverables.byProject.values()) list.sort((a, b) => (b.at || 0) - (a.at || 0))
    const shelves = assembleShelf({ deliverables, decisions, research, integrations, fieldMappings, sentDocuments, homeName: home, missing: missing() })
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
        skipped: missing(),
      }
    }
    return { at: new Date(now()).toISOString(), shelves, byProject, missing: missing() }
  }
  return { shelf }
}
