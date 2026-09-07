// Agent World — U14: the in-tray. For the standing set, the list equals the ? on the map and N walks it in the same order.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/events.zztest.json'), 'utf8'))
const NOW = Date.parse(fixture.now)

async function standingSet() {
  const { fold } = await import(path.join(root, 'server/harnesses/compass/fold.mjs'))
  const { toThread, linkSubagents } = await import(path.join(root, 'server/harnesses/compass/threads.mjs'))
  const { ownerViewer } = await import(path.join(root, 'server/harnesses/compass/viewer.mjs'))
  const runs = fold(fixture.events)
  const rows = new Map(fixture.ledger.map((r) => [r.id, r]))
  const surfaces = { progress: async () => 0.05, gateResolved: async (g) => /zztest-blog-signed/.test(g.ref_url || '') }
  const out = []
  for (const run of runs.values()) out.push(await toThread(run, rows.get(run.id) || null, ownerViewer(), surfaces, NOW, { claudeProjectUrl: 'https://claude.ai/project/zztest' }))
  return linkSubagents(out, runs)
}

test('U14: in-tray rows = the ? on the map (same count, no row without an open gate), ordered oldest gate first', async () => {
  const { intrayRows, wearsQuestion } = await import(path.join(root, 'overlay/intray.mjs'))
  const threads = await standingSet()
  // The map's ?: Bot Crossing's statusFor says waiting. Use the real one when node can load it, else its documented order.
  let statusFor = (t) => (t.hasError ? 'blocked' : t.running ? 'working' : t.unread ? 'waiting' : 'idle')
  try {
    ;({ statusFor } = await import(path.join(root, 'src/game/colony.js')))
  } catch {
    /* three.js needs a DOM here; the replica above is the same first-match order */
  }
  // the map's ? minus the one a parent only inherits from its child (U18): the child is the row, the parent's ? points at it
  const onMap = threads.filter((t) => statusFor(t, NOW) === 'waiting' && !t.inheritedGate).map((t) => t.id).sort()
  const rows = intrayRows(threads)
  assert.deepEqual(rows.map((r) => r.id).sort(), onMap, 'every ? of its own on the map, and nothing else')
  const lead = threads.find((t) => t.title.startsWith('zztest-lead'))
  assert.ok(lead.unread && lead.inheritedGate, 'the lead wears a ? by inheritance')
  assert.ok(!rows.some((r) => r.id === lead.id), 'N never stops on the parent')
  assert.ok(rows.some((r) => r.skill === 'zztest-child'), 'N lands on the waiting child')
  assert.ok(rows.length >= 4, `the standing set has several ?; got ${rows.length}`)
  for (const r of rows) {
    const t = threads.find((x) => x.id === r.id)
    assert.ok(wearsQuestion(t))
    assert.ok(t.gates.length > 0, `${r.id} has an open gate`)
    assert.equal(r.at, Math.min(...t.gates.filter((g) => g.canTap).map((g) => g.at)), 'ordered by the oldest open gate the viewer can tap')
    assert.ok(r.what, 'each row says what to do')
  }
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].at <= rows[i].at, 'oldest first')
  // Gamma (failed) and Beta (running) never appear, whatever else is set on them.
  assert.ok(!rows.some((r) => r.skill === 'zztest-faulty' || r.skill === 'zztest-builder'))
})

test('U14: N walks the list top to bottom and wraps — the row after the selected one, the first when nothing is selected', async () => {
  const { intrayRows, nextRow } = await import(path.join(root, 'overlay/intray.mjs'))
  const rows = intrayRows(await standingSet())
  const walk = []
  let sel = null
  for (let i = 0; i < rows.length + 1; i++) {
    sel = nextRow(rows, sel).id
    walk.push(sel)
  }
  assert.deepEqual(walk.slice(0, rows.length), rows.map((r) => r.id), 'N order = list order')
  assert.equal(walk[rows.length], rows[0].id, 'wraps to the top')
  assert.equal(nextRow(rows, 'not-in-list').id, rows[0].id, 'a selected figure that is not waiting → the first row')
  assert.equal(nextRow([], null), null)
})

test('U14: a thread from an adapter without gates still lists (by last activity) and a ? never hides behind ! or ⚒', async () => {
  const { intrayRows } = await import(path.join(root, 'overlay/intray.mjs'))
  const rows = intrayRows([
    { id: 'old', title: 'skill · gate', unread: true, running: false, hasError: false, lastActivityAt: 5, gitBranch: 'approve' },
    { id: 'err', title: 'x', unread: true, running: false, hasError: true, gateAt: 1 },
    { id: 'work', title: 'x', unread: true, running: true, hasError: false, gateAt: 1 },
    { id: 'new', title: 'skill', unread: true, running: false, hasError: false, gateAt: 9, gates: [{ gate: 'g', at: 9, what: 'sign' }] },
  ])
  assert.deepEqual(rows.map((r) => r.id), ['old', 'new'])
  assert.equal(rows[0].gate, 'gate')
  assert.equal(rows[0].what, 'approve')
})

test('U18: a failed child hands the parent nothing; a grandchild stands on the root\'s plot whatever the roster order', async () => {
  const { linkSubagents } = await import(path.join(root, 'server/harnesses/compass/threads.mjs'))
  const mk = (id, extra = {}) => ({ id, title: id, project: id + ' Co', planet: 'p', pack: 'k', unread: false, running: false, hasError: false, gitBranch: '', ...extra })
  const runs = new Map([['A', { parentId: '' }], ['B', { parentId: 'A' }], ['C', { parentId: 'B' }], ['F', { parentId: 'A' }]])
  const threads = [mk('C'), mk('B'), mk('A'), mk('F', { unread: true, hasError: true })]
  linkSubagents(threads, runs)
  const by = Object.fromEntries(threads.map((t) => [t.id, t]))
  assert.equal(by.C.project, 'A Co', 'the grandchild stands with the root')
  assert.equal(by.B.project, 'A Co')
  assert.equal(by.A.unread, false, 'a failed child (! on the map) gives the parent no ?')
  assert.equal(by.A.subruns.length, 2)
})
