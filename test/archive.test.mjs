// Agent World — U32: the archive. The shelf model from fixtures, newest first, Open targets only where a link exists; the bubble predicate.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const fx = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/m2b-still.json'), 'utf8'))

test('U32: Open targets — PDF, Notion, Drive, plain — only where a real link exists; a Compass reference is a label', async () => {
  const { openTargets } = await import(path.join(root, 'server/harnesses/compass/archive.mjs'))
  assert.deepEqual(openTargets({ url: 'https://drive.google.com/file/d/x/view' }), [{ label: 'Open in Drive', url: 'https://drive.google.com/file/d/x/view' }])
  assert.deepEqual(openTargets({ url: 'https://app.notion.com/p/abc', links: ['https://x.example/report.pdf?dl=1'] }).map((o) => o.label), ['Open in Notion', 'Open PDF'])
  assert.deepEqual(openTargets({ url: 'ops_config:KEY' }), [])
  assert.deepEqual(openTargets({ url: 'https://github.com/x/y' }).map((o) => o.label), ['Open'])
})

test('U32: the shelf from the ledger — every registered artifact, per client and per project, newest first', async () => {
  const { fold } = await import(path.join(root, 'server/harnesses/compass/fold.mjs'))
  const { deliverablesFromRuns, assembleShelf } = await import(path.join(root, 'server/harnesses/compass/archive.mjs'))
  const events = [
    ...fx.events,
    { run_id: 'r-done', event_type: 'artifact_registered', at: '2026-09-07T09:20:00.000Z', skill: 'zztest-builder', client: 'ZZTEST Client', project: 'aaaaaaaa000040008000000000000001', payload: { type: 'notion_page', title: 'ZZTEST older page', notion_url: 'https://app.notion.com/p/dddddddd000040008000000000000000' } },
    { run_id: 'r-nc', event_type: 'run_started', at: '2026-09-06T09:00:00.000Z', skill: 'zztest-ops', client: null, payload: {} },
    { run_id: 'r-nc', event_type: 'run_completed', at: '2026-09-06T09:30:00.000Z', skill: 'zztest-ops', client: null, payload: { outcome: 'success', artifacts: [{ title: 'ZZTEST config reference', url: 'ops_config:ZZTEST_REF', system: 'compass' }] } },
  ]
  const runs = fold(events)
  const rows = new Map([['r-done', { id: 'r-done', artifacts: [{ url: 'https://github.com/x/pr/1', system: 'github' }] }]])
  const d = deliverablesFromRuns(runs, rows, { homeName: 'ZZTEST Home' })
  const zz = d.byClient.get('ZZTEST Client')
  assert.deepEqual(zz.map((r) => r.title), ['ZZTEST page', 'https://github.com/x/pr/1', 'ZZTEST older page'], 'newest first: the run_completed artifact and the row artifact carry the run\'s last time, the registered page its own')
  assert.ok(zz.every((r) => r.at >= (zz[zz.indexOf(r) + 1]?.at ?? 0)), 'sorted newest first')
  assert.deepEqual(zz[0].open, [{ label: 'Open in Notion', url: 'https://app.notion.com/p/dddddddd000040008000000000000001' }])
  assert.equal(d.byProject.get('aaaaaaaa000040008000000000000001').length, 3, 'the project shelf holds the same three')
  const home = d.byClient.get('ZZTEST Home')
  assert.equal(home.length, 1); assert.equal(home[0].ref, 'ops_config:ZZTEST_REF'); assert.deepEqual(home[0].open, [], 'a Compass reference is a label')
  const shelves = assembleShelf({ deliverables: d, decisions: [{ kind: 'decision', title: 'ZZTEST settled', at: 1, client: 'ZZTEST Client', open: [] }], homeName: 'ZZTEST Home', missing: { research: 'SKIPPED:ENV — set NOTION_DS_RESEARCH in .env' } })
  assert.deepEqual(shelves.map((s) => s.name), ['ZZTEST Client', 'ZZTEST Home'], 'clients first, the home shelf last')
  assert.equal(shelves[0].decisions.length, 1)
  assert.equal(shelves[0].skipped.research, 'SKIPPED:ENV — set NOTION_DS_RESEARCH in .env')
  for (const s of shelves) for (const k of ['deliverables', 'sentDocuments', 'decisions', 'research', 'integrations', 'fieldMappings']) assert.ok(Array.isArray(s[k]), k)
})

test('U32: the bubble predicate — an artifact bubbles only on a request whose run has an open gate; an artifact without a gate is shelf-only', async () => {
  const { bubbleEligible } = await import(path.join(root, 'overlay/artifacts.mjs'))
  const art = [{ title: 'x', url: 'https://app.notion.com/p/x', at: 1 }]
  assert.equal(bubbleEligible({ kind: 'request', request: 'gate', gates: [{ gate: 'g' }], artifacts: art }), true)
  assert.equal(bubbleEligible({ kind: 'request', request: 'failed', gates: [], artifacts: art }), false, 'a failed run has no open gate')
  assert.equal(bubbleEligible({ kind: 'fixture', artifacts: art }), false)
  assert.equal(bubbleEligible({ kind: 'request', request: 'gate', gates: [{ gate: 'g' }], artifacts: [] }), false)
  assert.equal(bubbleEligible({ id: 'old-shape', unread: true, artifacts: art }), false, 'a thread of the old shape (no kind) never bubbles under the still map')
})

test('U32: the shelf presentation — six sections newest first, Open buttons only where a link exists, a skipped section names its env name, no write affordance', async () => {
  const { shelfSections, projectTab, shelfHasWrite, SECTIONS } = await import(path.join(root, 'overlay/archive.mjs'))
  const shelf = {
    name: 'ZZTEST Client',
    deliverables: [{ kind: 'deliverable', title: 'ZZTEST page', at: 2, skill: 'zztest-artist', system: 'notion', open: [{ label: 'Open in Notion', url: 'https://app.notion.com/p/x' }] }, { kind: 'deliverable', title: 'ZZTEST config reference', ref: 'ops_config:ZZTEST_REF', at: 1, skill: 'zztest-artist', system: 'compass', open: [] }],
    sentDocuments: [], decisions: [{ kind: 'decision', title: 'ZZTEST settled', status: 'Active', confidence: '🟢 Settled', at: 3, open: [{ label: 'Open in Notion', url: 'https://app.notion.com/p/d' }] }], research: [], integrations: [], fieldMappings: [],
    skipped: { research: 'SKIPPED:ENV — set NOTION_DS_RESEARCH in .env', sentDocuments: 'SKIPPED:ENV — no data source id is named for Sent Documents (set NOTION_DS_SENT_DOCUMENTS in .env)' },
  }
  const sections = shelfSections(shelf)
  assert.deepEqual(sections.map((s) => s.key), SECTIONS.map(([k]) => k))
  assert.equal(sections[0].rows[0].text, 'ZZTEST page'); assert.deepEqual(sections[0].rows[0].open.map((o) => o.label), ['Open in Notion'])
  assert.equal(sections[0].rows[1].reference, true); assert.deepEqual(sections[0].rows[1].open, [])
  assert.equal(sections[3].note, 'SKIPPED:ENV — set NOTION_DS_RESEARCH in .env')
  assert.equal(sections[4].note, 'nothing on this shelf')
  assert.equal(shelfHasWrite(sections), false)
  const tab = projectTab({ ...shelf, milestones: [{ id: 'm1', name: 'M1', status: '🟢 Delivered', done: true, committed: 1788739200000 }, { id: 'm2', name: 'M2', status: '⚪ Not Started', done: false }] })
  assert.equal(tab.milestones.length, 2); assert.equal(tab.milestones[0].done, true); assert.equal(tab.milestones[0].value, '2026-09-07')
  assert.ok(tab.sections.every((s) => s.rows.length || s.note.startsWith('SKIPPED')), 'the tab shows what it has and what is skipped, not empty shelves')
})
