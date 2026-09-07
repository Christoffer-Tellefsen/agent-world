// Agent World — M2b ENV re-run (2026-09-07): the six env-named Notion sources are read by the property names their
// schemas carry (test/fixtures/m2b-notion-rows.json is one ZZTEST page per source in the API's shape). U28: the open
// System Health findings are filtered server-side and shaped for the fold. U31: research and integration rows.
// U32: deliverables, research, integration pages and field mappings on the shelf, with the project → client hop.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'))
const fx = read('test/fixtures/m2b-notion-rows.json')

test('ENV re-run: every mapper reads the schema\'s own property names — Finding, Refresh due, Handoff ready, Drift Status, Mapping, Drive PDF URL, Task', async () => {
  const m = await import(path.join(root, 'server/harnesses/compass/notion-rows.mjs'))
  const h = m.healthRow(fx.health)
  assert.equal(h.title, 'ZZTEST Invoice INV-0000 missing Project link'); assert.equal(h.status, 'Open'); assert.equal(h.severity, '🟡 Warning'); assert.equal(h.source, 'Outcome Validation'); assert.equal(h.table, 'Finance'); assert.equal(h.ruleId, 'OV-03')
  assert.equal(h.at, Date.parse('2026-09-05T10:46:00.000+00:00'), 'at = Detected At, not created_time'); assert.equal(m.isOpenFinding(h), true); assert.equal(m.isOpenFinding(m.healthRow(fx.healthFixed)), false)
  assert.deepEqual(m.HEALTH_OPEN_FILTER, { property: 'Status', select: { equals: 'Open' } }, 'the read is filtered server-side (500+ rows, nearly all Fixed)')
  const r = m.researchRow(fx.research)
  assert.equal(r.refreshDue, '2026-10-21', '"Refresh due" (lower-case d — "Refresh Due" does not exist)'); assert.equal(r.handoff, true, '"Handoff ready" is a checkbox'); assert.equal(r.type, 'Company Brief')
  assert.equal(r.clientPage, 'cccc0001-0000-4000-8000-0000000000c1', '"Related client"'); assert.equal(r.project, 'dddd00010000400080000000000000d1', '"Related project", undashed'); assert.equal(r.at, Date.parse('2026-08-20'), 'newest by "Date completed"')
  assert.equal(m.needsRefresh(r, '2026-09-07'), false); assert.equal(m.needsRefresh(m.researchRow(fx.researchStale), '2026-09-07'), true, '🔄 Needs Refresh, and overdue by date')
  const i = m.integrationRow(fx.integration)
  assert.equal(i.drift, '🔴 Drift detected'); assert.equal(m.isDriftOpen(i), true); assert.equal(m.isUnchecked(m.integrationRow(fx.integrationUnchecked)), true); assert.equal(m.isDriftOpen(m.integrationRow(fx.integrationUnchecked)), false)
  assert.equal(i.mappings, 47, 'the Mappings rollup count'); assert.equal(i.lastDriftCheck, '2026-09-06'); assert.equal(i.project, 'dddd00010000400080000000000000d1')
  assert.deepEqual(i.links.map((l) => l.label), ['Live Link', 'Diagram'], 'only the url properties that carry a link')
  const f = m.fieldMappingRow(fx.fieldMapping)
  assert.equal(f.title, 'order.currency (id) → Deal.deal_currency_code (ISO)'); assert.equal(f.integration, 'eeee0001000040008000000000000001', 'the Integration relation is the hop to project and client'); assert.equal(f.verifiedOn, '2026-09-03'); assert.equal(f.engagement, 'ZZTEST Client'); assert.equal(f.at, Date.parse('2026-09-03'))
  const d = m.deliverableRow(fx.deliverable)
  assert.equal(d.status, 'Sent to Client'); assert.equal(d.type, 'SOW'); assert.equal(d.version, 4); assert.equal(d.pdf, 'https://drive.google.com/file/d/zztest-sow/view'); assert.equal(d.docx, ''); assert.equal(d.clientPage, 'cccc0001-0000-4000-8000-0000000000c1'); assert.equal(d.project, ''); assert.equal(d.at, Date.parse('2026-09-01T07:46:00.000Z'), 'newest by Created')
  const t = m.taskRow(fx.task)
  assert.equal(t.title, 'ZZTEST send the SOW'); assert.equal(t.status, '🎯 Today'); assert.equal(t.priority, '🔴 Big 3 Daily'); assert.equal(t.doDate, '2026-09-07')
})

test('U28 (ENV re-run): the System Health read asks Notion for Status = Open, newest Detected At first, and the fold gets Finding · Severity · Source', async () => {
  const { createSurfaces } = await import(path.join(root, 'server/harnesses/compass/surfaces.mjs'))
  const { buildStill } = await import(path.join(root, 'server/harnesses/compass/still.mjs'))
  const { loadPack } = await import(path.join(root, 'server/harnesses/compass/pack.mjs'))
  const ds = '846271fd-0000-4000-8000-000000000000'
  const bodies = []
  const fetch = async (url, init = {}) => {
    if (/data_sources\/846271fd/.test(url) && init.method === 'POST') { bodies.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ results: [fx.health, fx.healthFixed], has_more: false }) } }
    return { ok: false, status: 404, json: async () => ({ code: 'object_not_found', message: `unexpected ${url}` }) }
  }
  process.env.NOTION_DS_SYSTEM_HEALTH = ds
  try {
    const s = createSurfaces({ notionToken: 'x', airtableToken: 'x', airtableBaseId: 'appX' }, { fetchImpl: fetch })
    const first = await s.systemHealthOpen()
    const rows = first.length ? first : await new Promise((r) => setTimeout(() => r(s.systemHealthOpen()), 30))
    assert.equal(bodies.length >= 1, true); assert.deepEqual(bodies[0].filter, { property: 'Status', select: { equals: 'Open' } }); assert.equal(bodies[0].sorts[0].property, 'Detected At')
    assert.equal(rows.length, 1, 'a Fixed row that slipped through the filter is still dropped'); assert.equal(rows[0].severity, '🟡 Warning')
    const world = { place: () => ({ room: 'records-office', zone: 'Tellefsen HQ', planet: 'tellefsen', pack: 'tellefsen-campus' }) }
    const still = buildStill({ now: Date.parse('2026-09-07T12:00:00Z'), runs: new Map(), threadOf: () => null, projects: [], paRows: [], decisions: [], contentRows: null, healthRows: rows, pack: loadPack('tellefsen-campus'), place: world.place, skillTypes: new Map(), viewer: null })
    const bang = still.threads.find((t) => t.id.startsWith('health:'))
    assert.ok(bang, 'an open finding is a ! request'); assert.equal(bang.badge, '!'); assert.equal(bang.kind, 'request'); assert.match(bang.preview, /🟡 Warning · Outcome Validation · Airtable Finance/)
  } finally { delete process.env.NOTION_DS_SYSTEM_HEALTH }
})

test('U32 (ENV re-run): a Drive PDF URL opens as Open PDF; a field mapping reaches its shelf through its integration\'s project', async () => {
  const { openTargets, assembleShelf } = await import(path.join(root, 'server/harnesses/compass/archive.mjs'))
  const { shelfSections, shelfHasWrite } = await import(path.join(root, 'overlay/archive.mjs'))
  assert.deepEqual(openTargets({ pdf: 'https://drive.google.com/file/d/zztest-sow/view', url: 'https://www.notion.so/99990001', links: [''] }).map((o) => o.label), ['Open PDF', 'Open in Notion'])
  const fm = { kind: 'field-mapping', id: 'f', title: 'ZZTEST mapping', status: '⚪ Unchecked', drift: '⚪ Unchecked', integrationTitle: 'INT-ZZTEST-01', client: 'ZZTEST Client', project: 'dddd', at: Date.parse('2026-09-03'), open: [{ label: 'Open in Notion', url: 'https://www.notion.so/ffff0001' }] }
  const shelves = assembleShelf({ deliverables: { byClient: new Map(), byProject: new Map() }, decisions: [], research: [], integrations: [], fieldMappings: [fm], sentDocuments: [], homeName: 'home' })
  assert.equal(shelves[0].name, 'ZZTEST Client', 'the shelf is the integration\'s project\'s client'); assert.equal(shelves[0].fieldMappings.length, 1)
  const sections = shelfSections(shelves[0])
  const sec = sections.find((s) => s.key === 'fieldMappings')
  assert.equal(sec.rows[0].small, '⚪ Unchecked · INT-ZZTEST-01'); assert.equal(shelfHasWrite(sections), false)
})
