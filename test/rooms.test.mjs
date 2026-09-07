// Agent World — U31: room panels. Each panel's model from captured fixtures; no edit affordance; the skill → room
// map covers every ops_skills.type in the live substrate. U33: the hand predicate (wanted + silent → dusty).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'))
const NOW = Date.parse('2026-09-07T12:00:00.000Z')

test('U31: skill rows land in a room for every ops_skills.type the live substrate carries; the pack override wins, then the type, then the workshop', async () => {
  const { skillRows, skillState } = await import(path.join(root, 'server/harnesses/compass/rooms.mjs'))
  const { loadPack, roomsOf } = await import(path.join(root, 'server/harnesses/compass/pack.mjs'))
  const pack = loadPack('tellefsen-campus')
  const live = read('test/fixtures/m2b-substrate.live.json')
  const rooms = new Set(roomsOf(pack).map((r) => r.id))
  const rows = skillRows(live.skills, pack, {})
  const placed = [...rows.values()].flat()
  const active = live.skills.filter((s) => /^active$/i.test(s.status))
  assert.equal(placed.length, active.length, 'every Active skill is a row somewhere')
  for (const room of rows.keys()) assert.ok(rooms.has(room), `${room} is a room`)
  const types = new Set(live.skills.map((s) => s.type).filter(Boolean))
  assert.ok(types.size >= 6, `live types: ${[...types].join(', ')}`)
  for (const t of types) assert.ok(placed.some((r) => r.type === t) || !active.some((s) => s.type === t), `type ${t} lands in a room`)
  assert.equal(rows.get('records-office')?.find((r) => r.name === 'zztest-stale-expert')?.placedBy, 'override')
  assert.equal(rows.get('strategy-room')?.find((r) => r.name === 'scoping')?.placedBy, 'type:Commercial')
  assert.equal(skillState('x', { failed: new Set(['x']), live: new Set(['x']) }), 'red', 'red beats lit')
  assert.equal(skillState('x', { live: new Set(['x']) }), 'lit')
  assert.equal(skillState('x', { silent: new Set(['x']), wanted: new Set(['x']) }), 'dusty')
  assert.equal(skillState('x', { silent: new Set(['x']) }), 'dark', 'silent but not wanted is just dark (no hand)')
})

test('U33: the hand predicate — of 40 silent skills only the 2 the pack wants (and an Active project\'s Tech Stack names) are dusty', async () => {
  const { wantedSkills, skillRows } = await import(path.join(root, 'server/harnesses/compass/rooms.mjs'))
  const { loadPack } = await import(path.join(root, 'server/harnesses/compass/pack.mjs'))
  const pack = { ...loadPack('tellefsen-campus') }
  pack.skills = { ...pack.skills, overrides: { ...pack.skills.overrides, 'zztest-wanted-a': { room: 'workshop', wants: 'Airtable' }, 'zztest-wanted-b': { room: 'finance-office', wants: 'e-conomic' }, 'zztest-wanted-nobody': { room: 'workshop', wants: 'Zapier' } } }
  const skills = Array.from({ length: 40 }, (_, i) => ({ name: i === 0 ? 'zztest-wanted-a' : i === 1 ? 'zztest-wanted-b' : i === 2 ? 'zztest-wanted-nobody' : `zztest-silent-${i}`, type: 'Operations', status: 'active' }))
  const projects = [{ techStack: ['Airtable', 'Claude Code'] }, { techStack: ['e-conomic'] }]
  const wanted = wantedSkills(pack, projects)
  assert.deepEqual([...wanted].sort(), ['agentic-coding-solutions', 'airtable-data-import', 'airtable-solutions', 'zztest-stale-expert', 'zztest-wanted-a', 'zztest-wanted-b'].sort(), 'wanted = override.wants ∈ an Active project\'s Tech Stack')
  const rows = [...skillRows(skills, pack, { silent: new Set(skills.map((s) => s.name)), wanted }).values()].flat()
  const dusty = rows.filter((r) => r.state === 'dusty').map((r) => r.name).sort()
  assert.deepEqual(dusty, ['zztest-wanted-a', 'zztest-wanted-b'], 'two hands of forty')
  assert.equal(rows.filter((r) => r.state === 'dark').length, 38)
})

test('U31: the finance buckets — unpaid, overdue, paid, this month — from Airtable rows', async () => {
  const { financeBuckets } = await import(path.join(root, 'server/harnesses/compass/rooms.mjs'))
  const f = (fields) => ({ id: 'rec' + Math.random().toString(36).slice(2, 8), fields })
  const b = financeBuckets([
    f({ 'Entry Name': 'INV-1', Status: 'Invoiced', 'Due Date': '2026-09-20', 'Issue Date': '2026-09-01', 'Amount in OMR': 100, 'Is Income': 1, Amount: 100, Currency: 'OMR' }),
    f({ 'Entry Name': 'INV-2', Status: 'Invoiced', 'Due Date': '2026-08-20', 'Issue Date': '2026-08-01', 'Amount in OMR': 50, 'Is Income': 1, Amount: 50, Currency: 'OMR' }),
    f({ 'Entry Name': 'INV-3', Status: 'Overdue', 'Due Date': '2026-07-20', 'Issue Date': '2026-07-01', 'Amount in OMR': 25, 'Is Income': 1, Amount: 25, Currency: 'OMR' }),
    f({ 'Entry Name': 'INV-4', Status: 'Paid', 'Paid Date': '2026-09-03', 'Issue Date': '2026-09-02', 'Amount in OMR': 200, 'Is Income': 1, Amount: 200, Currency: 'OMR' }),
    f({ 'Entry Name': 'SaaS', Status: 'Paid', 'Issue Date': '2026-09-04', 'Amount in OMR': 10, 'Is Income': 0, Amount: 10, Currency: 'OMR' }),
  ], NOW)
  assert.equal(b.month, '2026-09')
  assert.deepEqual([b.unpaid.n, b.overdue.n, b.paid.n, b.thisMonth.n], [1, 2, 2, 2])
  assert.deepEqual([b.unpaid.omr, b.overdue.omr, b.paid.omr, b.thisMonth.omr], [100, 75, 210, 300])
})

test('U31: every room\'s sections build from a captured panel and none carries an edit affordance', async () => {
  const { roomSections, hasEditAffordance, skillRowsOf } = await import(path.join(root, 'overlay/rooms.mjs'))
  const { warmthOf } = await import(path.join(root, 'server/harnesses/compass/rooms.mjs'))
  const panels = read('test/fixtures/m2b-rooms.json')
  for (const [id, panel] of Object.entries(panels)) {
    const sections = roomSections(id, panel, NOW)
    assert.ok(sections.length >= 1, id)
    assert.equal(hasEditAffordance(sections), false, `${id}: no edit affordance`)
    for (const s of sections) for (const r of s.rows) { assert.equal(typeof r.text, 'string'); assert.ok(!('button' in r) && !('onSubmit' in r)) }
    assert.ok(skillRowsOf(panel).every((r) => ['lit', 'dark', 'dusty', 'red'].includes(r.state)), `${id}: skill rows carry a state`)
  }
  // spot checks per panel
  const board = roomSections('board-room', panels['board-room'], NOW)
  assert.equal(board[0].rows[0].text, 'ZZTEST pending decision'); assert.equal(board[1].rows.length, 1); assert.equal(board[2].rows[0].value, '2026-10-16'); assert.ok(/2 overdue/.test(board[2].title))
  const strat = roomSections('strategy-room', panels['strategy-room'], NOW)
  assert.equal(strat[0].rows[0].value, '12 d · 0.5 cooling', 'the ZZTEST deal at 12 d → warmth 0.5'); assert.equal(warmthOf(12), 0.5); assert.equal(warmthOf(3), 1); assert.equal(warmthOf(31), 0.2); assert.equal(warmthOf(null), 0.2)
  assert.equal(strat[1].note, 'SKIPPED:ENV — set NOTION_DS_RESEARCH in .env')
  const fin = roomSections('finance-office', panels['finance-office'], NOW)
  assert.deepEqual(fin.map((s) => s.title.split(' · ')[0]), ['Unpaid', 'Overdue', 'Paid', 'This month'])
  const ws = roomSections('workshop', panels.workshop, NOW)
  assert.equal(ws[0].rows[0].value, 'in 23 d'); assert.equal(ws[1].rows.length, 2)
  const rec = roomSections('records-office', panels['records-office'], NOW)
  assert.ok(/SKIPPED:WORKER-NEEDED/.test(rec[0].note)); assert.equal(rec[2].rows.length, 2); assert.equal(rec[3].rows.length, 3)
  const co = roomSections('corner-office', panels['corner-office'], NOW)
  assert.equal(co[0].rows.length, 1, 'the in-tray first'); assert.ok(/SKIPPED:ENV/.test(co[1].note)); assert.ok(/SKIPPED:WORKER-NEEDED/.test(co[2].note)); assert.equal(co[3].rows.length, 1)
  const mk = roomSections('marketing-studio', panels['marketing-studio'], NOW)
  assert.ok(/SKIPPED:ENV/.test(mk[0].note)); assert.equal(mk[1].rows.length, 1)
})

test('U33: a wanted silent skill is a tray line of the lowest precedence, never a row N lands on', async () => {
  const { handLines, withHands, nextRow, intrayRows } = await import(path.join(root, 'overlay/intray.mjs'))
  const lines = handLines([{ name: 'zztest-stale-expert', room: 'records office', wants: 'Airtable' }, { name: 'zztest-a', room: 'workshop' }])
  assert.deepEqual(lines.map((l) => l.skill), ['zztest-a', 'zztest-stale-expert'])
  assert.ok(lines.every((l) => l.hand && l.badge === '✋' && !l.url))
  const requests = intrayRows([{ id: 'r1', kind: 'request', unread: true, skill: 'zztest-approver', title: '? Approve · Airtable', gates: [{ gate: 'g', at: 1, canTap: true, what: 'approve' }], project: 'ZZTEST Client' }])
  const tray = withHands(requests, [{ name: 'zztest-stale-expert', room: 'records office' }])
  assert.equal(tray.length, 2)
  assert.equal(tray[1].hand, true, 'the hand line comes after every request')
  assert.equal(nextRow(requests, 'r1').id, 'r1', 'N walks the request rows only — the hand line is not among them')
})

test('U31/U32: the sidecar serves GET /rooms, GET /rooms/<id> and GET /archive from the readers, loopback only, and 404s without them', async () => {
  const http = await import('node:http')
  const { createOverlayApi, startOverlayApi } = await import(path.join(root, 'server/harnesses/compass/overlay-api.mjs'))
  const rooms = { all: async () => ({ at: 'x', rooms: { 'board-room': { id: 'board-room', pending: [] } }, missingEnv: [] }), one: async (id) => (id === 'board-room' ? { id, pending: [] } : null) }
  const archive = { shelf: async () => ({ at: 'x', shelves: [], byProject: {}, missing: {} }) }
  const world = { planets: [{ key: 'zz', home: true }], towns: [], campus: { name: 'ZZ' } }
  const handle = createOverlayApi({ getWorld: async () => world, descriptor: async () => world, rooms, archive, dataDir: fs.mkdtempSync(path.join((await import('node:os')).tmpdir(), 'aw-rooms-')) })
  const api = await startOverlayApi(handle, { port: 0 })
  const get = (p) => new Promise((resolve, reject) => http.get({ host: '127.0.0.1', port: api.port, path: p }, (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b || '{}') })) }).on('error', reject))
  assert.equal((await get('/rooms')).status, 200)
  assert.equal((await get('/rooms/board-room')).body.id, 'board-room')
  assert.equal((await get('/rooms/no-such-room')).status, 404)
  assert.equal((await get('/archive')).status, 200)
  await api.close()
  const bare = await startOverlayApi(createOverlayApi({ getWorld: async () => world, descriptor: async () => world }), { port: 0 })
  const get2 = (p) => new Promise((resolve, reject) => http.get({ host: '127.0.0.1', port: bare.port, path: p }, (res) => resolve(res.statusCode)).on('error', reject))
  assert.equal(await get2('/rooms'), 404)
  assert.equal(await get2('/archive'), 404)
  await bare.close()
})

test('U31: a failed panel read names its error on the panel and is retried after 30 s, not held for five minutes', async () => {
  const { createSurfaces } = await import(path.join(root, 'server/harnesses/compass/surfaces.mjs'))
  let t = 0
  const s = createSurfaces({ notionToken: 'x', airtableToken: 'x', airtableBaseId: 'appX' }, { fetchImpl: async () => { throw new Error('offline') }, now: () => t })
  let calls = 0
  const fn = async () => { calls++; if (calls < 3) throw new Error('notion 401'); return { rows: [1], error: '' } }
  const first = await s.stale('k', 5 * 60_000, fn, { rows: [], error: 'reading…' })
  assert.equal(first.error, 'notion 401', 'the error is on the panel, not "reading…"')
  t = 10_000
  assert.equal((await s.stale('k', 5 * 60_000, fn, { rows: [] })).error, 'notion 401'); assert.equal(calls, 1, 'no retry inside 30 s')
  t = 31_000
  await s.stale('k', 5 * 60_000, fn, { rows: [] }); await new Promise((r) => setTimeout(r, 20)) // the retry runs behind the stale answer
  assert.equal(calls, 2, 'retried after 30 s')
  t = 62_000
  await s.stale('k', 5 * 60_000, fn, { rows: [] }); await new Promise((r) => setTimeout(r, 20))
  assert.equal(calls, 3)
  t = 63_000
  assert.deepEqual((await s.stale('k', 5 * 60_000, fn, { rows: [] })).rows, [1], 'a good answer replaces the error')
})

test('U31 (2026-09-07, NOTION_DS_TASKS): the Big 3 come from the Tasks source by the option names its schema gives — never assumed', async () => {
  const { optionNamed, big3Of } = await import(path.join(root, 'server/harnesses/compass/rooms.mjs'))
  const status = { type: 'select', select: { options: [{ name: '📥 Inbox' }, { name: '🎯 Today' }, { name: '✅ Done' }] } }
  const priority = { type: 'select', select: { options: [{ name: '🔴 Big 3 Daily' }, { name: '🟡 Big 3 Weekly' }, { name: '⚪ Normal' }] } }
  assert.deepEqual(optionNamed(status, /today/i), { type: 'select', name: '🎯 Today' })
  assert.deepEqual(optionNamed(priority, /big 3/i), { type: 'select', name: '🔴 Big 3 Daily' }, 'the first Big 3 option in schema order is the daily one')
  assert.deepEqual(optionNamed({ type: 'status', status: { options: [{ name: 'Today' }] } }, /today/i), { type: 'status', name: 'Today' }, 'a status-typed property works the same')
  assert.equal(optionNamed({ type: 'rich_text' }, /today/i), null)
  const items = [
    { title: 'ZZTEST a', status: '🎯 Today', priority: '🔴 Big 3 Daily' }, { title: 'ZZTEST b', status: '🎯 Today', priority: '⚪ Normal' },
    { title: 'ZZTEST c', status: '🎯 Today', priority: '🔴 Big 3 Daily' }, { title: 'ZZTEST d', status: '📥 Inbox', priority: '🔴 Big 3 Daily' },
    { title: 'ZZTEST e', status: '🎯 Today', priority: '🔴 Big 3 Daily' }, { title: 'ZZTEST f', status: '🎯 Today', priority: '🔴 Big 3 Daily' },
  ]
  const b = big3Of(items, { today: '🎯 Today', big3: '🔴 Big 3 Daily' })
  assert.deepEqual(b.rows.map((r) => r.title), ['ZZTEST a', 'ZZTEST c', 'ZZTEST e'], 'three at most, in the source order; Inbox and Normal never')
  assert.equal(b.today, 5)
  // the corner office fixture names the env name when it is absent
  const { roomSections } = await import(path.join(root, 'overlay/rooms.mjs'))
  const co = roomSections('corner-office', read('test/fixtures/m2b-rooms.json')['corner-office'], NOW)
  assert.equal(co[1].note, 'SKIPPED:ENV — set NOTION_DS_TASKS in .env')
})

test('U31 (2026-09-07): the week wall is Sun–Thu of the local week by local calendar day, never the UTC day', async () => {
  const { weekWall, localDay } = await import(path.join(root, 'server/harnesses/compass/rooms.mjs'))
  const monday = new Date(2026, 8, 7, 9, 0, 0) // local Monday 2026-09-07 09:00 — the day this was seen a day early
  const items = [{ title: 'ZZTEST sun', date: '2026-09-06' }, { title: 'ZZTEST tue', date: '2026-09-08' }, { title: 'ZZTEST fri', date: '2026-09-11' }]
  const wall = weekWall(items, monday.getTime())
  assert.deepEqual(wall.map((d) => `${d.name} ${d.date}`), ['Sun 2026-09-06', 'Mon 2026-09-07', 'Tue 2026-09-08', 'Wed 2026-09-09', 'Thu 2026-09-10'])
  assert.deepEqual(wall.map((d) => d.cards.map((c) => c.title)), [['ZZTEST sun'], [], ['ZZTEST tue'], [], []], 'Friday is off the wall')
  assert.equal(localDay(new Date(2026, 0, 1, 0, 30)), '2026-01-01', 'half past midnight local is still that day')
  const saturday = new Date(2026, 8, 5, 23, 0, 0)
  assert.equal(weekWall([], saturday.getTime())[0].date, '2026-08-30', 'a Saturday belongs to the week that began on the Sunday before it')
  // pinned east of Greenwich (the second opinion: under TZ=UTC the old toISOString code gives the same dates, so the
  // assertions above alone would not catch the regression on a UTC machine) — a child process in Asia/Muscat
  const { execFileSync } = await import('node:child_process')
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', `import { weekWall } from ${JSON.stringify(path.join(root, 'server/harnesses/compass/rooms.mjs'))}; const d = new Date(2026, 8, 7, 9); const w = weekWall([], d.getTime()); process.stdout.write(w[0].date + ' ' + d.toISOString().slice(0, 10))`], { env: { ...process.env, TZ: 'Asia/Muscat' }, encoding: 'utf8' })
  assert.equal(out, '2026-09-06 2026-09-07', 'in Muscat the wall starts on Sun 06 (the old code read the UTC day and started a day early)')
  // the records office names an unreadable System Health source instead of an empty list
  const { roomSections } = await import(path.join(root, 'overlay/rooms.mjs'))
  const rec = roomSections('records-office', { ...read('test/fixtures/m2b-rooms.json')['records-office'], health: { rows: [], error: 'SKIPPED:ENV — NOTION_DS_SYSTEM_HEALTH is set but unreadable: notion 404' } }, NOW)
  assert.match(rec[4].note, /NOTION_DS_SYSTEM_HEALTH is set but unreadable/)
  assert.equal(roomSections('records-office', read('test/fixtures/m2b-rooms.json')['records-office'], NOW)[4].note, 'no open finding')
})

test('U31 (2026-09-07, substrate v2 — retry): the records office automations and connectors and the corner office numbers from the captured live substrate', async () => {
  const { normalise } = await import(path.join(root, 'server/harnesses/compass/substrate.mjs'))
  const { automationRows, connectorRows, fourNumbers, NOT_YET, triggerClause } = await import(path.join(root, 'server/harnesses/compass/rooms.mjs'))
  const { roomSections, hasEditAffordance } = await import(path.join(root, 'overlay/rooms.mjs'))
  const live = normalise(read('test/fixtures/m2b-substrate.live.json'))
  assert.equal(live.version, 2, 'the captured response is v2')
  // the branch is the version field, never key presence
  const v1WithKeys = normalise({ ...read('test/fixtures/m2b-substrate.live.json'), version: undefined })
  assert.equal(v1WithKeys.version, 1); assert.deepEqual(v1WithKeys.automations, []); assert.deepEqual(v1WithKeys.connectors, []); assert.equal(v1WithKeys.rollups, null)
  assert.match(automationRows(v1WithKeys).skipped, /SKIPPED:WORKER-NEEDED/); assert.match(connectorRows(v1WithKeys).skipped, /SKIPPED:WORKER-NEEDED/); assert.match(fourNumbers(v1WithKeys).skipped, /SKIPPED:WORKER-NEEDED/)
  // automations: every live row, no status read or shown, last fire only where a rollup names it, next fire / missed skipped by field
  const auto = automationRows(live)
  assert.equal(auto.rows.length, live.automations.length); assert.equal(auto.skipped, '')
  assert.ok(auto.rows.every((r) => !('status' in r) && r.name && typeof r.trigger === 'string'), 'no status on an automation row')
  const recon = auto.rows.find((r) => /gate reconciliation/i.test(r.name)); assert.ok(recon, 'the Gate Reconciliation Sweep is a row')
  assert.equal(recon.lastFire, live.rollups.LAST_GATE_RECONCILIATION.finished_at, 'its last fire is the rollup\'s finished_at')
  const gov = auto.rows.find((r) => /run governance/i.test(r.name)); assert.equal(gov.lastFire, '', 'no LAST_RUN_GOVERNANCE yet → no last fire')
  assert.match(auto.missing, /next fire and missed/); assert.match(auto.missing, /next_run_at/)
  assert.equal(triggerClause('New record in Pending Approval'), 'New record in Pending Approval')
  assert.ok(triggerClause('ONE task. Then a paragraph. And more.').length <= 96)
  // connectors keyed by service, never by name (there is none); no status
  const conn = connectorRows(live)
  assert.equal(conn.rows.length, new Set(live.connectors.map((c) => c.service)).size, 'one row per service')
  assert.deepEqual(conn.rows.map((r) => r.key), conn.rows.map((r) => r.service))
  assert.ok(conn.rows.every((r) => !('status' in r) && !('name' in r)))
  const dup = connectorRows({ version: 2, connectors: [{ id: 'a', service: 'S', via: 'x', updated_at: '2026-01-01' }, { id: 'b', service: 'S', via: 'y', updated_at: '2026-02-01' }], rollups: null })
  assert.equal(dup.rows.length, 1); assert.deepEqual(dup.rows[0].ids, ['a', 'b']); assert.equal(dup.rows[0].via, 'y', 'the newest row names the via')
  // the four numbers: null LAST_RUN_GOVERNANCE → "not yet", never zeros; LAST_GATE_RECONCILIATION reads now
  const n = fourNumbers(live)
  assert.equal(n.ready, false); assert.equal(n.notYet, NOT_YET); assert.equal(n.unattendedShare, null); assert.equal(n.openGates, null)
  assert.equal(n.reconciliation.at, live.rollups.LAST_GATE_RECONCILIATION.finished_at); assert.equal(n.reconciliation.gatesChecked, live.rollups.LAST_GATE_RECONCILIATION.gates_checked)
  const filled = fourNumbers({ version: 2, rollups: { LAST_RUN_GOVERNANCE: { unattended_share: 0.4, failure_rate: 0.05, median_time_to_tap: 12, open_gates: 3, finished_at: '2026-09-12T01:30:00Z' }, LAST_GATE_RECONCILIATION: null } })
  assert.equal(filled.ready, true); assert.deepEqual([filled.unattendedShare, filled.failureRate, filled.medianTimeToTap, filled.openGates], [0.4, 0.05, 12, 3]); assert.deepEqual(filled.unnamed, []); assert.equal(filled.reconciliation, null)
  const odd = fourNumbers({ version: 2, rollups: { LAST_RUN_GOVERNANCE: { something_else: 1 }, LAST_GATE_RECONCILIATION: null } })
  assert.equal(odd.ready, true); assert.deepEqual(odd.unnamed, ['unattended_share', 'failure_rate', 'median_time_to_tap', 'open_gates'], 'keys the rollup did not carry are named, not zeroed')
  // the sections: the records office lists them, the corner office says "not yet" on each of the four and shows the reconciliation; no edit affordance
  const recPanel = { ...read('test/fixtures/m2b-rooms.json')['records-office'], automations: auto, connectors: conn }
  const rec = roomSections('records-office', recPanel, NOW)
  assert.equal(rec[0].rows.length, live.automations.length); assert.match(rec[0].note, /SKIPPED:WORKER-NEEDED — next fire and missed/); assert.ok(rec[0].rows.every((r, i) => r.small === [auto.rows[i].platform, auto.rows[i].trigger].filter(Boolean).join(' · ')), 'small = platform · trigger clause, from no status column (one trigger text mentions a calendar "status" — that is prose)')
  assert.equal(rec[1].rows.length, conn.rows.length); assert.equal(rec[1].note, ''); assert.equal(rec[1].rows[0].text, conn.rows[0].service)
  assert.ok(rec[0].rows.find((r) => /gate reconciliation/i.test(r.text)).value.startsWith('last 2026-09-07'))
  const coPanel = { ...read('test/fixtures/m2b-rooms.json')['corner-office'], numbers: n }
  const co = roomSections('corner-office', coPanel, NOW)
  assert.equal(co[2].rows.length, 5); assert.deepEqual(co[2].rows.slice(0, 4).map((r) => r.value), ['not yet', 'not yet', 'not yet', 'not yet'], 'never zeros'); assert.equal(co[2].note, NOT_YET)
  assert.equal(co[2].rows[4].value, '2026-09-07 09:31 Z'); assert.match(co[2].rows[4].small, /1 gate checked · 0 resolved · 0 still open/)
  const coFilled = roomSections('corner-office', { ...coPanel, numbers: filled }, NOW)
  assert.deepEqual(coFilled[2].rows.slice(0, 4).map((r) => r.value), ['0.4', '0.05', '12', '3']); assert.match(coFilled[2].note, /sweep finished 2026-09-12 01:30 Z/)
  assert.equal(hasEditAffordance(rec), false); assert.equal(hasEditAffordance(co), false)
})
