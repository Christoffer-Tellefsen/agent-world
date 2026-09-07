// Agent World — U17: each signal maps to exactly one defined fact; nothing reads a person (Annex III).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const sub = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/substrate.zztest.json'), 'utf8'))
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/events.zztest.json'), 'utf8'))
const NOW = Date.parse(fixture.now)

test('U17: suit colour = trust status — skill_overrides, then the run_classes lists, then the run\'s own run_class, else unknown; one colour per run_mode', async () => {
  const { trustOf, RUN_MODES } = await import(path.join(root, 'server/harnesses/compass/signals.mjs'))
  const { suitFor, SUIT } = await import(path.join(root, 'overlay/signals.mjs'))
  const P = sub.auto_run_policy
  assert.deepEqual(trustOf('zztest-demoted', 'A_gather_sync_check_propose', P), { mode: 'human_gated', source: 'skill_overrides' })
  assert.deepEqual(trustOf('zztest-promoted', 'B_judge', P), { mode: 'unattended_allowed', source: 'skill_overrides' }, 'a skill:step override applies to the skill')
  assert.deepEqual(trustOf('zztest-judge', 'A_gather_sync_check_propose', P), { mode: 'human_gated', source: 'run_classes.B_judge' })
  assert.deepEqual(trustOf('zztest-listed', '', P), { mode: 'human_gated', source: 'run_classes.B_judge' })
  assert.deepEqual(trustOf('zztest-gatherer', 'B_judge', P), { mode: 'unattended_allowed', source: 'run_classes.A_gather_sync_check_propose' })
  assert.deepEqual(trustOf('zztest-builder', 'B_judge', P), { mode: 'human_gated', source: 'run_class' }, 'in neither list: the run\'s own class decides')
  assert.deepEqual(trustOf('zztest-builder', 'A_gather_sync_check_propose', P), { mode: 'unattended_allowed', source: 'run_class' })
  assert.deepEqual(trustOf('zztest-builder', '', P), { mode: 'unknown', source: 'none' })
  assert.deepEqual(trustOf('x', 'B_judge', null), { mode: 'human_gated', source: 'run_class' }, 'no policy read yet: the class still decides')
  // one colour per run_mode, grey for unknown, and the table has nothing else
  assert.deepEqual(Object.keys(SUIT).sort(), [...RUN_MODES].sort())
  const hexes = new Set(Object.values(SUIT).map((s) => s.hex))
  assert.equal(hexes.size, 3)
  assert.equal(suitFor({ mode: 'nonsense' }).hex, SUIT.unknown.hex)
  assert.equal(suitFor(undefined).hex, SUIT.unknown.hex)
})

test('U17: hand raised = Active in ops_skills and no run in 30 days; campus ! = run_failed in 24 h with no later run_completed for that skill', async () => {
  const { staleSkills, ranSkillsOf, campusAlert } = await import(path.join(root, 'server/harnesses/compass/signals.mjs'))
  const { fold } = await import(path.join(root, 'server/harnesses/compass/fold.mjs'))
  const ran = ranSkillsOf(fixture.events)
  assert.ok(ran.has('zztest-approver'))
  const stale = staleSkills(sub.skills, ran)
  assert.deepEqual(stale.map((s) => s.name), ['zztest-stale-expert'], 'Eta: active and silent; the approver ran; the retired one is not active')
  assert.deepEqual(staleSkills(sub.skills, new Set(['zztest-stale-expert', 'zztest-approver'])), [])

  const runs = fold(fixture.events)
  const alert = campusAlert(runs, NOW)
  assert.deepEqual(alert.map((a) => a.skill), ['zztest-faulty'], 'Gamma failed inside 24 h with no later success')
  assert.equal(alert[0].reason, 'ZZTEST fault')
  assert.equal(campusAlert(runs, NOW + 25 * 3600 * 1000).length, 0, 'older than 24 h: off the flag')
  // a later run_completed for the same skill clears the flag
  const healed = new Map(runs)
  healed.set('fix', { id: 'fix', skill: 'zztest-faulty', terminal: 'run_completed', lastAt: NOW - 60_000 })
  assert.equal(campusAlert(healed, NOW).length, 0)
})

test('U17: ✓ over a town = a milestone of that client\'s project Done and edited inside 24 h (one Notion read per project per 5 min)', async () => {
  const { createSurfaces } = await import(path.join(root, 'server/harnesses/compass/surfaces.mjs'))
  const { projectsByClient } = await import(path.join(root, 'server/harnesses/compass/signals.mjs'))
  const { fold } = await import(path.join(root, 'server/harnesses/compass/fold.mjs'))
  let calls = 0
  const pages = {
    'p1': { properties: { Milestones: { relation: [{ id: 'm1' }, { id: 'm2' }] } } },
    'm1': { last_edited_time: new Date(NOW - 3600_000).toISOString(), properties: { Status: { type: 'select', select: { name: '🟢 Delivered' } } } },
    'm2': { last_edited_time: new Date(NOW - 3 * 24 * 3600_000).toISOString(), properties: { Status: { type: 'select', select: { name: 'Planned' } } } },
    'p2': { properties: { Milestones: { relation: [{ id: 'm3' }] } } },
    'm3': { last_edited_time: new Date(NOW - 3 * 24 * 3600_000).toISOString(), properties: { Status: { type: 'select', select: { name: '🟢 Delivered' } } } },
  }
  const P1 = '11111111111111111111111111111111'
  const P2 = '22222222222222222222222222222222'
  const key = (url) => (url.includes(P1.replace(/^(.{8})(.{4})(.{4})(.{4})/, '$1-$2-$3-$4-')) ? 'p1' : url.includes(P2.replace(/^(.{8})(.{4})(.{4})(.{4})/, '$1-$2-$3-$4-')) ? 'p2' : url.split('/').pop())
  const fetchImpl = async (url, init) => {
    calls += 1
    assert.ok(!init?.method, 'GET only')
    const body = pages[key(url)]
    return { ok: Boolean(body), status: body ? 200 : 404, json: async () => body || { code: 'object_not_found' } }
  }
  const surfaces = createSurfaces({ notionToken: 't' }, { fetchImpl, now: () => NOW })
  assert.equal(await surfaces.recentDone(P1), true)
  assert.equal(await surfaces.progress(P1), 0.5, 'the same read serves U4')
  assert.equal(await surfaces.recentDone(P2), false, 'Done, but not in the last 24 h')
  const before = calls
  await surfaces.recentDone(P1)
  await surfaces.progress(P1)
  assert.equal(calls, before, 'cached 5 min')
  assert.equal(await surfaces.recentDone('not-a-project'), false)
  // the bridge from a town to its projects: the runs that name both
  const runs = fold([
    { id: '1', run_id: 'r1', at: '2026-09-06T00:00:00Z', event_type: 'run_started', skill: 's', client: 'ZZTEST Client', project: P1, payload: {} },
    { id: '2', run_id: 'r2', at: '2026-09-06T00:00:00Z', event_type: 'run_started', skill: 's', client: null, project: P2, payload: {} },
  ])
  assert.deepEqual([...projectsByClient(runs).get('ZZTEST Client')], [P1])
})

test('U17: sound plays on a NEW ? or ! only — the diff between rosters, silent on the first and on an unchanged poll', async () => {
  const { SignalDiff } = await import(path.join(root, 'overlay/signals.mjs'))
  const d = new SignalDiff()
  const A = { id: 'a', unread: true, running: false, hasError: false }
  const G = { id: 'g', unread: false, running: false, hasError: true }
  assert.deepEqual(d.update([A, G]), { question: [], alert: [] }, 'the world opening is not an event')
  assert.deepEqual(d.update([A, G]), { question: [], alert: [] }, 'nothing new')
  assert.deepEqual(d.update([A, G, { id: 'b', unread: true, running: false, hasError: false }]), { question: ['b'], alert: [] })
  assert.deepEqual(d.update([A, { id: 'b', unread: true, running: false, hasError: false }, { ...G, id: 'h' }]), { question: [], alert: ['h'] })
  assert.deepEqual(d.update([{ ...A, running: true }]), { question: [], alert: [] }, 'a ? that turned into ⚒ is not news')
})

test('U17: residents never take a figure from a run — they fill what is left of maxAgents, by name, and go last', async () => {
  const { benchResidents } = await import(path.join(root, 'overlay/signals.mjs'))
  const runs = Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, title: `run ${i}` }))
  const residents = ['zeta', 'alpha', 'mid'].map((n) => ({ id: `skill:${n}`, title: n, resident: true }))
  const out = benchResidents([...residents, ...runs], 7)
  assert.deepEqual(out.threads.map((t) => t.id), ['r0', 'r1', 'r2', 'r3', 'r4', 'skill:alpha', 'skill:mid'])
  assert.deepEqual({ shown: out.shown, total: out.total }, { shown: 2, total: 3 })
  assert.equal(benchResidents([...residents, ...runs], 5).shown, 0, 'no room: every run still stands, no resident')
  assert.equal(benchResidents([...residents, ...runs], 3).threads.length, 5, 'the seam never cuts a run; Bot Crossing keeps its own cap')
  assert.equal(benchResidents([...residents, ...runs], 90).shown, 3)
})

test('U17: Annex III — the signal rules read no per-person field', () => {
  const files = ['server/harnesses/compass/signals.mjs', 'overlay/signals.mjs']
  const needles = [/\bactor\b/, /human_edit_level/, /tokens?_(in|out)\b/, /\bmodel\b/, /\bpeople\b/, /\bOwner\b/, /\bperson\b/i]
  const hits = []
  for (const f of files) {
    const code = fs.readFileSync(path.join(root, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    for (const n of needles) if (n.test(code)) hits.push(`${f} reads ${n}`)
  }
  assert.deepEqual(hits, [])
})
