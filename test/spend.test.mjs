// Agent World — U35: spend per town and room (ES-4.13). The fold reconciles, the numbers read right, an unmetered place
// never reads $0, the line is Owner-only and pack-gated, no "actor" anywhere on the path, the hook sums a transcript,
// the sidecar serves /spend, the reader caches and keeps its last good answer.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'))
const live = read('test/fixtures/m2b-spend.live.json')
const b = (over) => ({ runs_total: 0, runs_metered: 0, runs_unmetered: 0, runs_unpriced: 0, tokens_in: 0, tokens_out: 0, tokens_unpriced: 0, cost_usd: 0, ...over })

test('U35: the fold reconciles — campusRooms + elsewhere = campus, towns + campus = planet — on the captured response and on a synthetic one with towns, an unknown client and an override; a room\'s line is its skills\' spend across every client', async () => {
  const { foldSpend, reconcile, sum, add, bucket } = await import(path.join(root, 'overlay/spend.mjs'))
  const { loadPack } = await import(path.join(root, 'server/harnesses/compass/pack.mjs'))
  const pack = loadPack('tellefsen-campus')
  // the captured live response: one client ("internal"), fifty unmetered runs
  const f = foldSpend(live, { pack, towns: [], planet: 'tellefsen', home: 'tellefsen' })
  assert.deepEqual(reconcile(f), { roomsPlusElsewhereIsCampus: true, townsPlusCampusIsPlanet: true })
  const internal = live.by_client.find((r) => r.client === 'internal')
  assert.equal(f.campus.runs_total, internal.runs_total, 'the campus is the internal client, folded into rooms')
  assert.equal(f.campus.cost_usd, internal.cost_usd)
  assert.equal(f.planet.runs_total, live.totals.runs_total, 'no town: the planet is the campus, which is the totals')
  assert.equal(f.rooms.get('records-office').runs_total, live.by_skill.filter((r) => r.type === 'Operations').reduce((n, r) => n + r.runs_total, 0), 'Operations → records office by type')
  assert.equal(f.campusRooms.get('records-office').runs_total, live.by_client_skill.filter((r) => r.client === 'internal' && r.type === 'Operations').reduce((n, r) => n + r.runs_total, 0))
  // synthetic: two towns on two planets, an unknown client, internal rows across the rule's three branches
  const body = {
    at: 'x', window_days: 30, display: { omr_per_usd: 0.3845 },
    by_client: [
      b({ client: 'internal', runs_total: 4, runs_metered: 3, runs_unmetered: 1, tokens_in: 400, tokens_out: 40, cost_usd: 1.5 }),
      b({ client: 'Town A', runs_total: 2, runs_metered: 2, tokens_in: 100, tokens_out: 10, cost_usd: 0.25 }),
      b({ client: 'Town B', runs_total: 1, runs_metered: 1, tokens_in: 50, tokens_out: 5, cost_usd: 0.1 }),
      b({ client: 'Nobody Ltd', runs_total: 3, runs_metered: 0, runs_unmetered: 3 }),
    ],
    by_client_skill: [
      b({ client: 'internal', skill: 'zztest-stale-expert', type: 'Delivery', runs_total: 1, runs_metered: 1, tokens_in: 100, tokens_out: 10, cost_usd: 0.5 }), // override wins over type
      b({ client: 'internal', skill: 'zztest-spend', type: 'Research', runs_total: 1, runs_metered: 1, tokens_in: 100, tokens_out: 10, cost_usd: 0.5 }),
      b({ client: 'internal', skill: 'zztest-unknown-type', type: 'Mystery', runs_total: 1, runs_metered: 1, tokens_in: 100, tokens_out: 10, cost_usd: 0.5 }), // default room
      b({ client: 'internal', skill: 'zztest-nothing', type: null, runs_total: 1, runs_metered: 0, runs_unmetered: 1, tokens_in: 100, tokens_out: 10 }),
      b({ client: 'Town A', skill: 'zztest-spend', type: 'Research', runs_total: 2, runs_metered: 2, tokens_in: 100, tokens_out: 10, cost_usd: 0.25 }),
    ],
    by_skill: [
      b({ skill: 'zztest-stale-expert', type: 'Delivery', runs_total: 1, runs_metered: 1, tokens_in: 100, tokens_out: 10, cost_usd: 0.5 }),
      b({ skill: 'zztest-spend', type: 'Research', runs_total: 3, runs_metered: 3, tokens_in: 200, tokens_out: 20, cost_usd: 0.75 }), // internal + Town A
      b({ skill: 'zztest-unknown-type', type: 'Mystery', runs_total: 1, runs_metered: 1, tokens_in: 100, tokens_out: 10, cost_usd: 0.5 }),
      b({ skill: 'zztest-nothing', type: null, runs_total: 1, runs_metered: 0, runs_unmetered: 1, tokens_in: 100, tokens_out: 10 }),
    ],
    by_model: [],
    totals: b({ runs_total: 10, runs_metered: 6, runs_unmetered: 4, tokens_in: 550, tokens_out: 55, cost_usd: 1.85 }),
  }
  const towns = [{ name: 'Town A', planet: 'home' }, { name: 'Town B', planet: 'other' }]
  const home = foldSpend(body, { pack, towns, planet: 'home', home: 'home' })
  assert.deepEqual(reconcile(home), { roomsPlusElsewhereIsCampus: true, townsPlusCampusIsPlanet: true })
  assert.deepEqual([...home.towns.keys()], ['Town A'], 'only this planet\'s towns')
  assert.equal(home.rooms.get('records-office').cost_usd, 0.5, 'zztest-stale-expert: the pack override → records office, not the Delivery type')
  assert.equal(home.rooms.get('research-lab').cost_usd, 0.75, 'type Research → research lab: the skill\'s spend across every client (Iota reads here)')
  assert.equal(home.rooms.get('research-lab').runs_total, 3)
  assert.equal(home.campusRooms.get('research-lab').cost_usd, 0.5, 'the campus fold: the internal client\'s share only')
  assert.equal(home.rooms.get('workshop').runs_total, 2, 'an unknown type and a null type → the default room')
  assert.equal(home.elsewhere.runs_total, 3, 'a client with no town anywhere is rendered under elsewhere, never dropped')
  assert.equal(home.campus.runs_total, 7); assert.equal(home.campus.cost_usd, 1.5)
  assert.equal(home.planet.runs_total, 9); assert.equal(home.planet.cost_usd, 1.75)
  const other = foldSpend(body, { pack, towns, planet: 'other', home: 'home' })
  assert.deepEqual(reconcile(other), { roomsPlusElsewhereIsCampus: true, townsPlusCampusIsPlanet: true })
  assert.equal(other.campus.runs_total, 0, 'another planet has no campus')
  assert.equal([...other.rooms.values()].reduce((n, r) => n + r.runs_total, 0), 0, 'and no room lines')
  assert.deepEqual([...other.towns.keys()], ['Town B'])
  assert.equal(other.planet.cost_usd, 0.1)
  const all = add(add(bucket(), home.planet), other.planet)
  assert.equal(all.runs_total, body.totals.runs_total, 'the planets together are the totals')
  assert.equal(all.cost_usd, body.totals.cost_usd)
  assert.equal(sum([]).runs_total, 0)
})

test('U35: numbers — 84k, 1.2M, $18.40; OMR multiplies by display.omr_per_usd from the response, never a peg of its own', async () => {
  const { compact, money, windowLabel } = await import(path.join(root, 'overlay/spend.mjs'))
  assert.deepEqual([84000, 1_200_000, 327000, 950, 9500, 10000, 12_345_678, 0].map(compact), ['84k', '1.2M', '327k', '950', '9.5k', '10k', '12M', '0'])
  assert.equal(money(18.4), '$18.40')
  assert.equal(money(0.6125), '$0.61')
  assert.equal(money(0.001), '$0.0010', 'a cost that would print as zero gets two more places')
  assert.equal(money(0), '$0.00')
  assert.equal(money(10, { currency: 'OMR', omrPerUsd: 0.3845 }), '3.845 OMR')
  assert.equal(money(10, { currency: 'OMR', omrPerUsd: null }), '$10.00', 'no peg in the response → dollars (the world holds none)')
  assert.equal(windowLabel(30), '30d'); assert.equal(windowLabel('all'), 'all'); assert.equal(windowLabel(null), '?d')
})

test('U35: the line — runs_metered 0 reads "unmetered", never $0; the unmetered and unpriced counts ride on the same line; Iota reads 327k / $0.61', async () => {
  const { spendLine } = await import(path.join(root, 'overlay/spend.mjs'))
  const opts = { window: 30, currency: 'USD' }
  const unmetered = spendLine(b({ runs_total: 5, runs_unmetered: 5 }), opts)
  assert.equal(unmetered, 'Tokens 0 · unmetered · 30d · 5 of 5 runs unmetered')
  assert.ok(!/\$0/.test(unmetered))
  assert.equal(spendLine(b({ runs_total: 5, runs_metered: 3, runs_unmetered: 2, runs_unpriced: 1, tokens_in: 80_000, tokens_out: 4_000, cost_usd: 18.4 }), opts), 'Tokens 84k · $18.40 · 30d · 2 of 5 runs unmetered · 1 unpriced')
  assert.equal(spendLine(b({ runs_total: 2, runs_metered: 2, tokens_in: 315_000, tokens_out: 12_000, cost_usd: 0.6125 }), opts), 'Tokens 327k · $0.61 · 30d', 'fixture Iota: flat 110k + breakdown 217k, $0.30 + $0.3125')
  assert.equal(spendLine(b({ runs_total: 1, runs_metered: 1, tokens_in: 1_000_000, tokens_out: 200_000, cost_usd: 10 }), { window: 30, currency: 'OMR', omrPerUsd: 0.3845 }), 'Tokens 1.2M · 3.845 OMR · 30d')
  assert.equal(spendLine(null, opts), '')
})

test('U35: Owner-only — any other preset gets nothing, not a blank line; the neutral pack shows nothing even to the Owner', async () => {
  const { spendLineFor, showSpend, foldSpend } = await import(path.join(root, 'overlay/spend.mjs'))
  const { loadPack } = await import(path.join(root, 'server/harnesses/compass/pack.mjs'))
  const campus = loadPack('tellefsen-campus'); const neutral = loadPack('neutral')
  assert.deepEqual(campus.spend, { show: true, window_days: 30, currency: 'USD' }); assert.deepEqual(neutral.spend, { show: false })
  const fold = foldSpend(live, { pack: campus, towns: [], planet: 'tellefsen', home: 'tellefsen' })
  const bucket = b({ runs_total: 1, runs_metered: 1, tokens_in: 1000, tokens_out: 100, cost_usd: 0.05 })
  assert.equal(spendLineFor(bucket, { viewer: { preset: 'owner' }, pack: campus, fold }), 'Tokens 1.1k · $0.05 · 30d')
  for (const preset of ['operator', 'viewer', 'client', 'prime', '', undefined]) {
    assert.equal(spendLineFor(bucket, { viewer: preset === undefined ? null : { preset }, pack: campus, fold }), '', `${preset}: nothing`)
    assert.equal(showSpend({ preset }, campus), false)
  }
  assert.equal(spendLineFor(bucket, { viewer: { preset: 'owner' }, pack: neutral, fold }), '', 'neutral: nothing')
  assert.equal(spendLineFor(bucket, { viewer: { preset: 'owner' }, pack: { ...campus, spend: undefined }, fold }), '', 'no spend key: nothing')
  assert.equal(spendLineFor(bucket, { viewer: { preset: 'owner' }, pack: { ...campus, spend: { show: true, currency: 'OMR' } }, fold }), 'Tokens 1.1k · 0.019 OMR · 30d', 'OMR through the response peg')
})

test('U35: no "actor" on the spend path — overlay/spend.mjs, compass/spend.mjs, the sidecar (its /spend route included), the schema and the captured response', () => {
  for (const f of ['overlay/spend.mjs', 'server/harnesses/compass/spend.mjs', 'server/harnesses/compass/overlay-api.mjs', 'server/harnesses/compass/pack-rules.mjs', 'spec/world-spend.v1.json', 'test/fixtures/m2b-spend.live.json']) {
    assert.ok(!/actor/i.test(fs.readFileSync(path.join(root, f), 'utf8')), `${f} names a person-shaped field`)
  }
  const api = fs.readFileSync(path.join(root, 'server/harnesses/compass/overlay-api.mjs'), 'utf8')
  assert.match(api, /url\.pathname === '\/spend'/, 'the sidecar serves /spend')
})

test('U35: the hook sums a transcript — deduplicated on message.id (last entry wins), the last model seen, source transcript; a missing transcript yields nothing', () => {
  const hook = path.join(root, '.claude/hooks/ledger.sh')
  const out = execFileSync('bash', [hook, 'usage', path.join(root, 'test/fixtures/m2b-transcript.jsonl')], { encoding: 'utf8' }).trim()
  assert.deepEqual(JSON.parse(out), { input_tokens: 102, output_tokens: 277, cache_creation_input_tokens: 42289, cache_read_input_tokens: 41090, model: 'claude-sonnet-5', source: 'transcript' })
  assert.equal(execFileSync('bash', [hook, 'usage', path.join(root, 'test/fixtures/no-such-transcript.jsonl')], { encoding: 'utf8' }).trim(), '')
  assert.equal(execFileSync('bash', [hook, 'usage'], { encoding: 'utf8' }).trim(), '')
  assert.ok(Buffer.byteLength(out) < 8 * 1024)
  for (const k of ['content', 'text', 'transcript', 'body', 'stdout', 'stderr', 'diff', 'patch', 'email']) assert.ok(!(k in JSON.parse(out)), `no refused key ${k}`)
})

test('U35: SessionEnd posts run_completed with usage (dry run), without usage when there is no transcript, and the reconcile at the next SessionStart reads the closed session\'s transcript from the projects dir', () => {
  const hook = path.join(root, '.claude/hooks/ledger.sh')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aw-hook-'))
  const env = { ...process.env, HOOK_DRY_RUN: '1', LEDGER_STATE_DIR: path.join(tmp, 'state'), LEDGER_RUN_ID_FILE: path.join(tmp, 'run_id'), LEDGER_PROJECTS_DIR: path.join(tmp, 'projects'), LEDGER_STALE_MINUTES: '30' }
  const run = (event, input) => execFileSync('bash', [hook, event], { encoding: 'utf8', env, input: JSON.stringify(input) }).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  const transcript = path.join(root, 'test/fixtures/m2b-transcript.jsonl')
  // a session with a transcript
  const s1 = 'zztest-hook-s1'
  assert.equal(run('run_started', { session_id: s1, hook_event_name: 'UserPromptSubmit', cwd: '/tmp/zz' })[0].event_type, 'run_started')
  const ended = run('run_completed', { session_id: s1, hook_event_name: 'SessionEnd', transcript_path: transcript })
  const done = ended.find((e) => e.event_type === 'run_completed')
  assert.equal(done.payload.outcome, 'success')
  assert.deepEqual(done.payload.usage, { input_tokens: 102, output_tokens: 277, cache_creation_input_tokens: 42289, cache_read_input_tokens: 41090, model: 'claude-sonnet-5', source: 'transcript' })
  assert.ok(!fs.existsSync(path.join(tmp, 'state', `${s1}.session`)), 'the state file is gone')
  // a session without one: run_completed, no usage key, exit 0
  const s2 = 'zztest-hook-s2'
  run('run_started', { session_id: s2, hook_event_name: 'UserPromptSubmit', cwd: '/tmp/zz' })
  const done2 = run('run_completed', { session_id: s2, hook_event_name: 'SessionEnd', transcript_path: path.join(tmp, 'missing.jsonl') }).find((e) => e.event_type === 'run_completed')
  assert.deepEqual(done2.payload, { outcome: 'success' })
  // the reconcile path: a stale session whose transcript sits at <projects>/<slug of cwd>/<id>.jsonl
  const s3 = 'zztest-hook-s3'
  run('run_started', { session_id: s3, hook_event_name: 'UserPromptSubmit', cwd: '/tmp/zz.cwd' })
  const slugDir = path.join(tmp, 'projects', '-tmp-zz-cwd')
  fs.mkdirSync(slugDir, { recursive: true })
  fs.copyFileSync(transcript, path.join(slugDir, `${s3}.jsonl`))
  const old = new Date(Date.now() - 45 * 60_000)
  for (const f of [`${s3}.session`, `${s3}.gates`]) fs.utimesSync(path.join(tmp, 'state', f), old, old)
  const rec = run('session_start', { session_id: 'zztest-hook-s4', hook_event_name: 'SessionStart', cwd: '/tmp/zz' }).find((e) => e.event_type === 'run_completed' && e.run_id === s3)
  assert.ok(rec, 'the stale session was reconciled')
  assert.equal(rec.payload.note, 'reconciled_at_next_session_start')
  assert.equal(rec.payload.usage?.model, 'claude-sonnet-5')
  assert.equal(rec.payload.usage?.cache_read_input_tokens, 41090)
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('U35: the sidecar serves GET /spend and /spend?window=n&include_test=1 from the reader, 404 without it', async () => {
  const http = await import('node:http')
  const { createOverlayApi, startOverlayApi } = await import(path.join(root, 'server/harnesses/compass/overlay-api.mjs'))
  const world = { planets: [{ key: 'zz', home: true }], towns: [], campus: { name: 'ZZ' } }
  const spend = { read: async ({ window, includeTest } = {}) => ({ at: 'x', window_days: window === undefined ? 30 : Number(window), includeTest: Boolean(includeTest), by_client: [] }) }
  const api = await startOverlayApi(createOverlayApi({ getWorld: async () => world, descriptor: async () => world, spend }), { port: 0 })
  const get = (p) => new Promise((resolve, reject) => http.get({ host: '127.0.0.1', port: api.port, path: p }, (res) => { let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(s || '{}') })) }).on('error', reject))
  assert.deepEqual((await get('/spend')).body, { at: 'x', window_days: 30, includeTest: false, by_client: [] })
  assert.deepEqual((await get('/spend?window=7&include_test=1')).body, { at: 'x', window_days: 7, includeTest: true, by_client: [] })
  await api.close()
  const bare = await startOverlayApi(createOverlayApi({ getWorld: async () => world, descriptor: async () => world }), { port: 0 })
  const status = await new Promise((resolve, reject) => http.get({ host: '127.0.0.1', port: bare.port, path: '/spend' }, (res) => resolve(res.statusCode)).on('error', reject))
  assert.equal(status, 404)
  await bare.close()
})

test('U35: the reader — one Worker read per window per minute, the contract keys only, last good on failure, the error named when nothing was ever read', async () => {
  const { createSpend, normalise, windowParam } = await import(path.join(root, 'server/harnesses/compass/spend.mjs'))
  const { loadConfig } = await import(path.join(root, 'server/harnesses/compass/config.mjs'))
  const cfg = loadConfig({ EVENTS_URL: 'https://w.example/events', EVENTS_BEARER_TOKEN: 't' })
  assert.equal(cfg.spendUrl, 'https://w.example/world/spend')
  let clock = 1_000_000
  const calls = []
  let fail = false
  const fetchImpl = async (url, init) => {
    calls.push(url)
    assert.equal(init.headers.Authorization, 'Bearer t')
    if (fail) return { ok: false, status: 502, json: async () => ({ error: 'ops_skill_runs' }) }
    return { ok: true, status: 200, json: async () => ({ ...live, stray: 'not in the contract' }) }
  }
  const spend = createSpend(cfg, { fetchImpl, now: () => clock })
  const first = await spend.read()
  assert.equal(first.window_days, 30); assert.ok(!('stray' in first)); assert.equal(first.error, '')
  await spend.read(); await spend.read({ window: 30 })
  assert.equal(calls.length, 1, 'cached for a minute')
  await spend.read({ window: 7, includeTest: true })
  assert.equal(calls.at(-1), 'https://w.example/world/spend?window=7&include_test=1')
  clock += 61_000
  fail = true
  const kept = await spend.read()
  assert.equal(kept.by_client.length, live.by_client.length, 'the last good answer survives a failed read')
  const fresh = createSpend(cfg, { fetchImpl, now: () => clock })
  const none = await fresh.read()
  assert.deepEqual(none.by_client, []); assert.match(none.error, /spend read 502: ops_skill_runs/)
  assert.deepEqual([windowParam(7), windowParam('all'), windowParam('x'), windowParam(0), windowParam(400)], [7, 'all', 30, 30, 30])
  assert.equal(normalise(null).by_skill.length, 0)
})
