// Agent World — U18 guard: a stream without parent_run_id renders exactly as before.
// The snapshot was taken before U18 touched fold/threads (2026-09-07); regenerate ONLY with
// `SNAPSHOT_WRITE=1 node --test test/snapshot.test.mjs` and say why in the commit.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/events.zztest.json'), 'utf8'))
const SNAP = path.join(root, 'test/fixtures/threads.snapshot.json')
const NOW = Date.parse(fixture.now)

test('U18: the standing set (no parent_run_id anywhere) folds to exactly the threads it did before sub-agents existed', async () => {
  const { fold } = await import(path.join(root, 'server/harnesses/compass/fold.mjs'))
  const { toThread } = await import(path.join(root, 'server/harnesses/compass/threads.mjs'))
  const { ownerViewer } = await import(path.join(root, 'server/harnesses/compass/viewer.mjs'))
  const { deriveWorld } = await import(path.join(root, 'server/harnesses/compass/zones.mjs'))
  const sub = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/substrate.zztest.json'), 'utf8'))
  const world = deriveWorld(sub, { campus: 'ZZTEST HQ', tenant: 'zz-home' })
  // only events with no parent_run_id (the pre-U18 stream); U18's own fixture runs are excluded by their skill
  const events = fixture.events.filter((e) => !e.parent_run_id && !/^zztest-(lead|child)/.test(e.skill || ''))
  const runs = fold(events)
  const rows = new Map(fixture.ledger.map((r) => [r.id, r]))
  const surfaces = { progress: async () => 0.05, gateResolved: async (g) => /zztest-blog-signed/.test(g.ref_url || '') }
  const out = {}
  for (const id of [...runs.keys()].sort()) {
    out[id] = await toThread(runs.get(id), rows.get(id) || null, ownerViewer(), surfaces, NOW, { claudeProjectUrl: 'https://claude.ai/project/zztest', place: world.place, trustOf: () => ({ mode: 'unknown', source: 'none' }) })
  }
  if (process.env.SNAPSHOT_WRITE) {
    fs.writeFileSync(SNAP, JSON.stringify(out, null, 2) + '\n')
    return
  }
  const snap = JSON.parse(fs.readFileSync(SNAP, 'utf8'))
  assert.deepEqual(out, snap, 'a thread without a parent must render exactly as before U18')
})
