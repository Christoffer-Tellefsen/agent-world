// Agent World — U20: prospect plots as decay. Opacity against three fixture dates; Won/Lost gone; the edge ring is free ground; no write.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const NOW = Date.parse('2026-09-18T14:00:00Z')
const STAGES = ['Lead', 'Qualified Lead', 'Solution Brief Sent', 'Scoping', 'Proposal Sent', 'Negotiation', 'Won', 'Parked', 'Lost']

test('U20: opacity from days since last touch — 1.0 ≤ 7 d, 0.5 ≤ 30 d, 0.2 > 30 d — against three fixture dates', async () => {
  const { prospectOpacity, decayLabel } = await import(path.join(root, 'overlay/prospects.mjs'))
  const { pipelineRow } = await import(path.join(root, 'server/harnesses/compass/steering.mjs'))
  const row = (viewed) => pipelineRow({ id: 'r', fields: { 'Opportunity Name': 'ZZTEST Prospect — Zeta', Stage: 'Lead', 'Last Viewed': viewed } }, STAGES, NOW)
  assert.equal(prospectOpacity(row('2026-09-13').days), 1.0, '5 d → full')
  assert.equal(prospectOpacity(row('2026-09-06').days), 0.5, '12 d → half (the seeded ZZTEST row)')
  assert.equal(prospectOpacity(row('2026-08-01').days), 0.2, '48 d → ghost')
  assert.equal(prospectOpacity(7), 1.0)
  assert.equal(prospectOpacity(8), 0.5)
  assert.equal(prospectOpacity(30), 0.5)
  assert.equal(prospectOpacity(31), 0.2)
  assert.equal(prospectOpacity(null), 0.2, 'never touched → ghost')
  assert.deepEqual([decayLabel(1), decayLabel(0.5), decayLabel(0.2)], ['warm', 'cooling', 'cold'])
})

test('U20: a prospect is a row neither Won nor Lost (Parked stays, faded); Won and Lost leave the edge', async () => {
  const { prospects } = await import(path.join(root, 'overlay/prospects.mjs'))
  const { pipelineRow } = await import(path.join(root, 'server/harnesses/compass/steering.mjs'))
  const rows = [
    ['Zeta', 'Lead', '2026-09-06'],
    ['Won one', 'Won', '2026-09-17'],
    ['Lost one', 'Lost', '2026-09-17'],
    ['Parked one', 'Parked', '2026-07-01'],
    ['Hot one', 'Proposal Sent', '2026-09-17'],
  ].map(([name, stage, viewed], i) => pipelineRow({ id: `r${i}`, fields: { 'Opportunity Name': name, Stage: stage, 'Last Viewed': viewed } }, STAGES, NOW))
  const out = prospects(rows)
  assert.deepEqual(out.map((p) => p.name), ['Zeta', 'Hot one', 'Parked one'])
  assert.deepEqual(out.map((p) => p.opacity), [0.5, 1.0, 0.2])
  // the same rows after Zeta goes Won, then Lost: gone either way
  const won = prospects(rows.map((r) => (r.name === 'Zeta' ? { ...r, won: true } : r)))
  assert.ok(!won.some((p) => p.name === 'Zeta'))
  const lost = prospects(rows.map((r) => (r.name === 'Zeta' ? { ...r, lost: true, stage: 'Lost' } : r)))
  assert.ok(!lost.some((p) => p.name === 'Zeta'))
})

test('U20: the edge ring is outside every cell the map holds, evenly spread, and the same for the same map', async () => {
  const { edgeRing, hexDistance, hexRing } = await import(path.join(root, 'overlay/prospects.mjs'))
  assert.equal(hexRing(1).length, 6)
  assert.equal(hexRing(3).length, 18)
  const used = [{ q: 0, r: 0 }, { q: 1, r: -1 }, { q: -2, r: 1 }, { q: 2, r: 0 }]
  const ring = edgeRing(used, 5)
  assert.equal(ring.length, 5)
  const maxUsed = Math.max(...used.map(hexDistance))
  for (const c of ring) assert.ok(hexDistance(c) > maxUsed + 1, 'two rings out')
  assert.deepEqual(edgeRing(used, 5), ring, 'deterministic')
  assert.deepEqual(edgeRing([], 0), [])
  const many = edgeRing(used, 40)
  assert.equal(many.length, 40)
})
