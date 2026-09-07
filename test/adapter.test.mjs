// Agent World — adapter fixture tests (U3/U4). Skipped until the pure modules exist; green is part of Built for U3 and U4.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/events.zztest.json'), 'utf8'))
const NOW = Date.parse(fixture.now)
const has = (p) => fs.existsSync(path.join(root, p))

// Mirrors src/game/colony.js transcriptProgress exactly — the inverse must round-trip.
const transcriptProgress = (sizeBytes) => Math.min(1, Math.max(0.05, (Math.log10(Math.max(1, sizeBytes || 0)) - 3) / 3.5))

test('fold + threads: the standing ZZTEST set renders truthfully', { skip: !has('server/harnesses/compass/fold.mjs') || !has('server/harnesses/compass/threads.mjs') }, async () => {
  const { fold } = await import(path.join(root, 'server/harnesses/compass/fold.mjs'))
  const { toThread, linkSubagents } = await import(path.join(root, 'server/harnesses/compass/threads.mjs'))
  const { ownerViewer } = await import(path.join(root, 'server/harnesses/compass/viewer.mjs'))
  // fixture.events/.ledger stand in for what the Worker's /ledger/scan would return — the fold/thread
  // pipeline is identical either way; only supabase.mjs's transport changed (see compass/supabase.mjs).
  const runs = fold(fixture.events)                        // Map<run_id, run>
  const rows = new Map(fixture.ledger.map((r) => [r.id, r]))
  const viewer = ownerViewer()
  // A fake surface: the signed ZZTEST blog reads as resolved on its surface; everything else stays open. No network.
  const surfaces = { progress: async () => 0.05, gateResolved: async (g) => /zztest-blog-signed/.test(g.ref_url || '') }
  // every thread first, then the sub-agent link (U18) — as compass.mjs does after a scan
  const threads = new Map()
  for (const run of runs.values()) threads.set(run.id, await toThread(run, rows.get(run.id), viewer, surfaces, NOW, { claudeProjectUrl: 'https://claude.ai/project/zztest' }))
  linkSubagents([...threads.values()], runs)
  for (const [runId, exp] of Object.entries(fixture.expect)) {
    if (exp.absent) { assert.ok(!runs.has(runId), `${runId} must not become a run`); continue }
    assert.ok(runs.has(runId), `${runId} missing`)
    const t = threads.get(runId)
    if (exp.subruns !== undefined) assert.equal((t.subruns || []).length, exp.subruns, `${runId}.subruns (the card says "n sub-runs")`)
    if (exp.inherited !== undefined) assert.equal(Boolean(t.inheritedGate), exp.inherited, `${runId}.inheritedGate (the ? came from a child)`)
    if (exp.parent !== undefined) assert.equal(t.parentId, exp.parent, `${runId}.parentId`)
    for (const k of ['project', 'unread', 'running', 'hasError']) assert.equal(t[k], exp[k], `${runId}.${k}`)
    if (exp.title) assert.equal(t.title, exp.title)
    if (exp.openUrl) assert.equal(t.ref.url, exp.openUrl)
    if (exp.model) assert.equal(t.model, exp.model)
    if (exp.gitBranch !== undefined) assert.equal(t.gitBranch, exp.gitBranch, `${runId}.gitBranch (the what-to-do tag)`)
    if (exp.previewStartsWith) assert.ok(t.preview.startsWith(exp.previewStartsWith), `${runId}.preview should start with the gate + full instruction, got: ${t.preview}`)
    if (exp.context !== undefined) assert.equal(t.ref.context, exp.context, `${runId}.ref.context (the gate's page as context)`)
    if (exp.asleep) assert.ok(NOW - t.lastActivityAt > 3 * 24 * 3600 * 1000, 'must be older than 3 days')
    assert.equal(t.canArchive, false)
    assert.equal(t.id, runId)
    for (const [k, v] of Object.entries(t)) assert.notEqual(v, undefined, `${runId}.${k} is undefined`)
  }
})

test('progress → sizeBytes is the exact inverse of the renderer formula', { skip: !has('server/harnesses/compass/threads.mjs') }, async () => {
  const { sizeBytesFor } = await import(path.join(root, 'server/harnesses/compass/threads.mjs'))
  for (const { done, total, expectProgress } of fixture.progress) {
    const p = total ? Math.min(1, Math.max(0.05, done / total)) : 0.05
    assert.equal(p, expectProgress)
    assert.ok(Math.abs(transcriptProgress(sizeBytesFor(done, total)) - expectProgress) < 0.01, `round-trip failed for ${done}/${total}`)
  }
})

test('cross-check covers pending_approval, decision and content_status — never class_b_gate or client_gate, never a Compass reference', { skip: !has('server/harnesses/compass/surfaces.mjs') }, async () => {
  const { crossCheckable } = await import(path.join(root, 'server/harnesses/compass/surfaces.mjs'))
  assert.equal(crossCheckable({ surface: 'pending_approval', ref_url: 'https://airtable.com/appX/tblY/recZ' }), true)
  assert.equal(crossCheckable({ surface: 'decision', ref_url: 'https://app.notion.com/p/x' }), true)
  assert.equal(crossCheckable({ surface: 'content_status', ref_url: 'https://app.notion.com/p/x' }), true)
  assert.equal(crossCheckable({ surface: 'class_b_gate', ref_url: 'https://github.com/x' }), false)
  assert.equal(crossCheckable({ surface: 'client_gate', ref_url: 'https://app.notion.com/p/x' }), false)
  assert.equal(crossCheckable({ surface: 'pending_approval', ref_url: 'ops_config:KEY' }), false)
})
