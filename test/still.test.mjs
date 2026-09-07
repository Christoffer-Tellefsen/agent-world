// Agent World — U28: the still map. A thread is a fixture or a request; nothing else is a thread.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const fx = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/m2b-still.json'), 'utf8'))
const NOW = Date.parse(fx.now)

async function build() {
  const { fold } = await import(path.join(root, 'server/harnesses/compass/fold.mjs'))
  const { toThread } = await import(path.join(root, 'server/harnesses/compass/threads.mjs'))
  const { ownerViewer } = await import(path.join(root, 'server/harnesses/compass/viewer.mjs'))
  const { deriveWorld } = await import(path.join(root, 'server/harnesses/compass/zones.mjs'))
  const { loadPack } = await import(path.join(root, 'server/harnesses/compass/pack.mjs'))
  const { buildStill } = await import(path.join(root, 'server/harnesses/compass/still.mjs'))
  const runs = fold(fx.events)
  const viewer = ownerViewer()
  const surfaces = { progress: async () => 0.05, gateResolved: async () => false }
  const world = deriveWorld({ clients: fx.clients, world_companies: null }, { campus: 'ZZTEST HQ', tenant: 'zz' })
  const threadOf = new Map()
  for (const run of runs.values()) threadOf.set(run.id, await toThread(run, null, viewer, surfaces, NOW, { place: world.place }))
  const pack = loadPack('tellefsen-campus')
  const skillTypes = new Map(fx.skills.map((s) => [s.name, s.type]))
  const still = buildStill({ now: NOW, ttlMs: fx.ttlHours * 3600e3, runs, threadOf, projects: fx.projects, paRows: fx.pa, decisions: fx.decisions, contentRows: fx.content, healthRows: fx.health, pack, place: world.place, skillTypes, viewer })
  return { still, pack, runs, build: (v) => buildStill({ now: NOW, ttlMs: fx.ttlHours * 3600e3, runs, threadOf: threadOf, projects: fx.projects, paRows: fx.pa, decisions: fx.decisions, contentRows: fx.content, healthRows: fx.health, pack, place: world.place, skillTypes, viewer: v }) }
}

test('U28: every thread is a fixture or a request — the fold names any thread that is neither and the test fails on one', async () => {
  const { kindOf } = await import(path.join(root, 'server/harnesses/compass/still.mjs'))
  const { still } = await build()
  const neither = still.threads.filter((t) => !kindOf(t)).map((t) => `${t.id} "${t.title}"`)
  assert.deepEqual(neither, [], `threads that are neither a fixture nor a request:\n${neither.join('\n')}`)
  const ids = new Set(still.threads.map((t) => t.id))
  for (const id of fx.expect.absent) assert.ok(!ids.has(id), `${id} must not be a thread (running, completed, sleeping, old failure, or a row a gate already covers)`)
  for (const t of still.threads) for (const [k, v] of Object.entries(t)) assert.notEqual(v, undefined, `${t.id}.${k} is undefined`)
  assert.equal(new Set(still.threads.map((t) => t.id)).size, still.threads.length, 'ids are unique')
})

test('U28: fixtures — an Active project with one live run is one idle fixture reading n running; boards are one per room; nothing about a fixture is ?, ! or working', async () => {
  const { still } = await build()
  const fixtures = still.threads.filter((t) => t.kind === 'fixture')
  assert.equal(fixtures.filter((t) => t.fixture === 'board').length, fx.expect.boards)
  for (const [id, exp] of Object.entries(fx.expect.fixtures)) {
    const t = fixtures.find((f) => f.id === id)
    assert.ok(t, `${id} missing`)
    assert.equal(t.project, exp.zone, `${id} zone`)
    assert.equal(t.runningCount, exp.running, `${id} running count`)
    if (exp.runningSkills) assert.deepEqual(t.runningRuns.map((r) => r.skill), exp.runningSkills)
    if (exp.leadSubruns) assert.equal(t.runningRuns.find((r) => r.skill === 'zztest-lead').subruns, exp.leadSubruns, 'the running lead counts its two children')
    assert.equal(t.gitBranch, exp.running ? `⚒ ${exp.running} running` : '', 'the static mark on the plate')
  }
  for (const t of fixtures) {
    assert.equal(t.unread, false); assert.equal(t.running, false); assert.equal(t.hasError, false)
    assert.ok(NOW - t.lastActivityAt < 3 * 24 * 3600e3, 'a fixture is never asleep')
    assert.ok(!/zztest-/.test(t.title), 'a fixture is named after the entity, never a skill')
  }
  const build1 = fixtures.find((t) => t.id === 'project:aaaaaaaa000040008000000000000001')
  assert.equal(Math.round((Math.log10(build1.sizeBytes) - 3) / 3.5 * 100), 50, 'the bar reads milestones done ÷ total')
})

test('U28: requests — the open ? and ! stand where they belong with badge · verb · surface titles; a row a gate already points at is not doubled', async () => {
  const { still } = await build()
  const requests = still.threads.filter((t) => t.kind === 'request')
  for (const [id, exp] of Object.entries(fx.expect.requests)) {
    const t = requests.find((r) => r.id === id)
    assert.ok(t, `${id} missing`)
    assert.equal(t.title, exp.title, `${id} title`)
    assert.equal(t.project, exp.zone, `${id} zone`)
    if (exp.unread) assert.equal(t.unread, true, `${id} unread`)
    if (exp.hasError) assert.equal(t.hasError, true, `${id} hasError`)
    assert.equal(t.running, false, 'a request never hammers')
    assert.ok(t.badge === '?' || t.badge === '!')
  }
  assert.equal(requests.length, Object.keys(fx.expect.requests).length, `exactly the expected requests: ${requests.map((r) => r.id).join(', ')}`)
  assert.deepEqual(still.counts, fx.expect.counts)
})

test('U28: the in-tray lists exactly the request threads, ! before ?, oldest first, and N walks them', async () => {
  const { intrayRows, nextRow } = await import(path.join(root, 'overlay/intray.mjs'))
  const { still } = await build()
  const rows = intrayRows(still.threads)
  const requests = still.threads.filter((t) => t.kind === 'request')
  assert.equal(rows.length, requests.length)
  assert.deepEqual(new Set(rows.map((r) => r.id)), new Set(requests.map((r) => r.id)))
  const bangs = rows.filter((r) => r.badge === '!')
  assert.deepEqual(rows.slice(0, bangs.length).map((r) => r.badge), bangs.map(() => '!'), 'the !s lead (blocked before waiting, as the renderer\'s STATUS_ORDER)')
  assert.ok(bangs.some((r) => r.id === 'r-gamma') && bangs.some((r) => r.id.startsWith('health:')))
  for (let i = bangs.length + 1; i < rows.length; i++) assert.ok(rows[i - 1].at <= rows[i].at, 'oldest first within the ?s')
  assert.ok(rows.every((r) => !still.threads.find((t) => t.id === r.id)?.kind?.startsWith('fixture')), 'no fixture in the tray')
  assert.equal(rows.find((r) => r.id === 'r-alpha').skill, 'zztest-approver', 'the row names the skill, not the badge')
  const walk = []
  let sel = null
  for (let i = 0; i < rows.length; i++) { sel = nextRow(rows, sel).id; walk.push(sel) }
  assert.deepEqual(walk, rows.map((r) => r.id))
})

test('U28: skill → room follows the pack override, then ops_skills.type, then the default; every live type maps to a room', async () => {
  const { loadPack, roomForSkill, ROOM_BY_TYPE, roomsOf } = await import(path.join(root, 'server/harnesses/compass/pack.mjs'))
  const pack = loadPack('tellefsen-campus')
  const ids = new Set(roomsOf(pack).map((r) => r.id))
  assert.deepEqual(roomForSkill(pack, 'zztest-stale-expert', 'Operations'), { room: 'records-office', source: 'override', wants: 'Airtable' })
  assert.equal(roomForSkill(pack, 'zztest-x', 'Commercial').room, 'strategy-room')
  assert.equal(roomForSkill(pack, 'zztest-x', 'Brand').room, 'workshop', 'any other type → workshop')
  assert.equal(roomForSkill(pack, '', '').room, 'workshop')
  for (const room of Object.values(ROOM_BY_TYPE)) assert.ok(ids.has(room), `${room} is a room`)
  for (const type of ['Commercial', 'Delivery', 'Operations', 'Engineering', 'Design', 'Content', 'Finance', 'Research', 'Orchestration', 'Brand']) assert.ok(ids.has(roomForSkill(pack, 'zztest-any', type).room), `${type} lands in a room`)
})

test('U28: a gate this viewer cannot tap makes no thread — the tray, the map and the strip agree under every preset', async () => {
  const { fold } = await import(path.join(root, 'server/harnesses/compass/fold.mjs'))
  const { toThread } = await import(path.join(root, 'server/harnesses/compass/threads.mjs'))
  const { makeViewer } = await import(path.join(root, 'server/harnesses/compass/viewer.mjs'))
  const { deriveWorld } = await import(path.join(root, 'server/harnesses/compass/zones.mjs'))
  const { loadPack } = await import(path.join(root, 'server/harnesses/compass/pack.mjs'))
  const { buildStill, kindOf } = await import(path.join(root, 'server/harnesses/compass/still.mjs'))
  const { intrayRows } = await import(path.join(root, 'overlay/intray.mjs'))
  const runs = fold(fx.events)
  const operator = makeViewer({ preset: 'operator' }) // taps pending_approval and class_b_gate only
  const world = deriveWorld({ clients: fx.clients, world_companies: null }, { campus: 'ZZTEST HQ', tenant: 'zz' })
  const threadOf = new Map()
  for (const run of runs.values()) threadOf.set(run.id, await toThread(run, null, operator, { progress: async () => 0.05, gateResolved: async () => false }, NOW, { place: world.place }))
  const still = buildStill({ now: NOW, ttlMs: fx.ttlHours * 3600e3, runs, threadOf, projects: fx.projects, paRows: fx.pa, decisions: fx.decisions, contentRows: fx.content, healthRows: fx.health, pack: loadPack('tellefsen-campus'), place: world.place, skillTypes: new Map(fx.skills.map((s) => [s.name, s.type])), viewer: operator })
  const ids = new Set(still.threads.map((t) => t.id))
  for (const id of fx.viewerWithoutClientGate.absent) assert.ok(!ids.has(id), `${id} is not the operator's to tap → no thread`)
  assert.ok(!ids.has('decision:bbbbbbbb000040008000000000000001'), 'a Decision is not the operator\'s surface → no thread')
  assert.ok(ids.has('pa:recZZTESTORPHANROW'), 'a Pending Approval row is')
  const requests = still.threads.filter((t) => t.kind === 'request')
  assert.ok(requests.every((t) => t.unread || t.hasError), 'every request wears its badge for this viewer')
  assert.equal(intrayRows(still.threads).length, requests.length, 'tray = requests')
  assert.equal(still.counts.needYou, requests.filter((t) => t.unread).length)
  assert.deepEqual(still.threads.filter((t) => !kindOf(t)), [])
})

test('U33: a milestone flipped Done in 24 h is a static ✓ mark on the project fixture and no thread; a working child is no thread, a waiting child one', async () => {
  const { fold } = await import(path.join(root, 'server/harnesses/compass/fold.mjs'))
  const { toThread } = await import(path.join(root, 'server/harnesses/compass/threads.mjs'))
  const { ownerViewer } = await import(path.join(root, 'server/harnesses/compass/viewer.mjs'))
  const { deriveWorld } = await import(path.join(root, 'server/harnesses/compass/zones.mjs'))
  const { loadPack } = await import(path.join(root, 'server/harnesses/compass/pack.mjs'))
  const { buildStill } = await import(path.join(root, 'server/harnesses/compass/still.mjs'))
  const runs = fold(fx.events)
  const viewer = ownerViewer()
  const world = deriveWorld({ clients: fx.clients, world_companies: null }, { campus: 'ZZTEST HQ', tenant: 'zz' })
  const threadOf = new Map()
  for (const run of runs.values()) threadOf.set(run.id, await toThread(run, null, viewer, { progress: async () => 0.05, gateResolved: async () => false }, NOW, { place: world.place }))
  const projects = fx.projects.map((p, i) => (i === 0 ? { ...p, milestones: { ...p.milestones, doneAt: NOW - 3600e3 } } : p))
  const still = buildStill({ now: NOW, ttlMs: fx.ttlHours * 3600e3, runs, threadOf, projects, paRows: [], decisions: [], contentRows: null, healthRows: null, pack: loadPack('tellefsen-campus'), place: world.place, skillTypes: new Map(), viewer })
  const fixture = still.threads.find((t) => t.id === 'project:aaaaaaaa000040008000000000000001')
  assert.equal(fixture.check, true, 'the ✓ is a state on the fixture')
  assert.equal(fixture.unread, false); assert.equal(fixture.running, false); assert.equal(fixture.hasError, false)
  assert.ok(!still.threads.some((t) => /milestone/i.test(t.title) && t.kind === 'request'), 'a Done milestone makes no thread')
  const old = buildStill({ now: NOW + 2 * 24 * 3600e3, ttlMs: fx.ttlHours * 3600e3, runs, threadOf, projects, paRows: [], decisions: [], contentRows: null, healthRows: null, pack: loadPack('tellefsen-campus'), place: world.place, skillTypes: new Map(), viewer })
  assert.equal(old.threads.find((t) => t.id === fixture.id).check, false, 'the mark lasts 24 h')
  const ids = new Set(still.threads.map((t) => t.id))
  assert.ok(!ids.has('r-child-work'), 'the working child has no body'); assert.ok(ids.has('r-child-wait'), 'the waiting child stands as a request')
  assert.equal(fixture.runningRuns.find((r) => r.skill === 'zztest-lead').subruns, 2, '"2 sub-runs" on the parent\'s count')
})
