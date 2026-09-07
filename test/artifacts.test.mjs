// Agent World — U13: artifact bubbles and cards. Pure modules only (fold, threads, overlay/artifacts.mjs).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'test/fixtures/events.zztest.json'), 'utf8'))
const NOW = Date.parse(fixture.now)
const EPSILON = '44444444-0000-4000-8000-000000000011'
const surfaces = { progress: async () => 0.05, gateResolved: async () => false }

async function epsilonThread() {
  const { fold } = await import(path.join(root, 'server/harnesses/compass/fold.mjs'))
  const { toThread } = await import(path.join(root, 'server/harnesses/compass/threads.mjs'))
  const { ownerViewer } = await import(path.join(root, 'server/harnesses/compass/viewer.mjs'))
  const runs = fold(fixture.events)
  const row = fixture.ledger.find((r) => r.id === EPSILON)
  return toThread(runs.get(EPSILON), row, ownerViewer(), surfaces, NOW, {})
}

test('U13: the Epsilon fixture folds two artifacts — the Notion page opens, the Compass reference is a label with no Open target', async () => {
  const { artifactRows } = await import(path.join(root, 'overlay/artifacts.mjs'))
  const t = await epsilonThread()
  assert.equal(t.artifacts.length, 2, 'row + events name the same two artifacts once each')
  const rows = artifactRows(t)
  assert.deepEqual(
    rows.map(({ name, open, reference }) => ({ name, open, reference })),
    fixture.expect[EPSILON].artifacts
  )
  assert.equal(rows[0].system, 'Compass reference')
  assert.equal(rows[1].system, 'Notion')
  assert.equal(t.ref.url, 'https://app.notion.com/p/zztest-artifact-page', 'Open on the run itself still lands on the newest real link')
  // A thread without artifacts renders an empty list — the card shows no section, the tracker no bubble.
  const { fold } = await import(path.join(root, 'server/harnesses/compass/fold.mjs'))
  const { toThread } = await import(path.join(root, 'server/harnesses/compass/threads.mjs'))
  const { ownerViewer } = await import(path.join(root, 'server/harnesses/compass/viewer.mjs'))
  const beta = await toThread(fold(fixture.events).get('bbbbbbbb-0000-4000-8000-000000000002'), null, ownerViewer(), surfaces, NOW, {})
  assert.deepEqual(artifactRows(beta), [])
})

test('U13: a bubble appears on the Epsilon fixture within a poll of its artifact and is gone after 60 s; nothing bubbles on the rest of the standing set', async () => {
  const { BubbleTracker, BUBBLE_MS, newestArtifactAt } = await import(path.join(root, 'overlay/artifacts.mjs'))
  const t = await epsilonThread()
  const at = newestArtifactAt(t)
  assert.equal(at, Date.parse('2026-09-06T07:59:40Z'), 'the newest artifact is the one on run_completed')
  const others = [{ id: 'x', artifacts: [] }, { id: 'y' }]

  // Opening the world 15 s (one poll) after the artifact: the bubble is up on Epsilon and nowhere else.
  const tr = new BubbleTracker()
  let active = tr.update([t, ...others], at + 15_000)
  assert.deepEqual([...active.keys()], [EPSILON])
  assert.equal(active.get(EPSILON).title, 'ZZTEST artifact page', 'of the burst, the bubble names the one that opens')
  // Still up at 59 s, gone at 61 s.
  assert.ok(tr.update([t, ...others], at + 59_000).has(EPSILON))
  assert.ok(!tr.update([t, ...others], at + 61_000).has(EPSILON))

  // Opening the world an hour later: history, not news — no bubble on first sight.
  const late = new BubbleTracker()
  assert.equal(late.update([t, ...others], at + 3600_000).size, 0)
  // …until a NEW artifact lands on a later poll: a bubble for BUBBLE_MS from now, even if its ledger time is older than the poll.
  const newer = { ...t, artifacts: [{ title: 'ZZTEST late PDF', url: 'https://example.com/zztest.pdf', at: at + 3_000_000 }, ...t.artifacts] }
  const now = at + 3600_000 + 15_000
  active = late.update([newer, ...others], now)
  assert.ok(active.has(EPSILON))
  assert.equal(active.get(EPSILON).title, 'ZZTEST late PDF')
  assert.equal(active.get(EPSILON).system, 'PDF')
  assert.equal(active.get(EPSILON).until, now + BUBBLE_MS)
  // The same artifact seen again is not news twice.
  assert.ok(!late.update([newer, ...others], now + BUBBLE_MS + 1).has(EPSILON))
  // A thread that walks in mid-session with a recent artifact (ledger clock 3 min behind) bubbles from now; one with a day-old artifact does not.
  const mid = new BubbleTracker()
  mid.update(others, at)
  const walkIn = mid.update([{ ...t, artifacts: [{ title: 'fresh', url: 'https://x.example/1', at: at - 180_000 }] }, ...others], at)
  assert.equal(walkIn.get(EPSILON)?.until, at + BUBBLE_MS)
  const old = new BubbleTracker()
  old.update(others, at)
  assert.ok(!old.update([{ ...t, artifacts: [{ title: 'old', url: 'https://x.example/2', at: at - 86_400_000 }] }, ...others], at).has(EPSILON))
})

test('U13: artifact shapes — notion_url / drive_url / url / bare reference, deduped across events and the row', async () => {
  const { normaliseArtifact, fold } = await import(path.join(root, 'server/harnesses/compass/fold.mjs'))
  const { artifactsOf } = await import(path.join(root, 'server/harnesses/compass/threads.mjs'))
  assert.equal(normaliseArtifact({ notion_url: 'https://www.notion.so/x-abc' }, 1).system, 'notion')
  assert.equal(normaliseArtifact({ url: 'ops_skills:123' }, 1).ref, 'ops_skills:123')
  assert.equal(normaliseArtifact({ url: 'ops_skills:123' }, 1).url, '')
  assert.equal(normaliseArtifact({ drive_url: 'https://drive.google.com/file/d/1' }, 1).system, 'drive')
  assert.equal(normaliseArtifact({}, 1), null)
  assert.equal(normaliseArtifact({ title: 'name only' }, 1).title, 'name only')
  const events = [
    { id: '1', run_id: 'r', at: '2026-09-06T00:00:00Z', event_type: 'run_started', skill: 's', payload: {} },
    { id: '2', run_id: 'r', at: '2026-09-06T00:01:00Z', event_type: 'artifact_registered', payload: { title: 'A', url: 'https://a.example/1' } },
    { id: '3', run_id: 'r', at: '2026-09-06T00:02:00Z', event_type: 'run_completed', payload: { outcome: 'success', artifacts: [{ url: 'https://a.example/1' }, { url: 'ops_config:K' }] } },
  ]
  const run = fold(events).get('r')
  const list = artifactsOf(run, { artifacts: [{ url: 'ops_config:K', system: 'compass' }, { url: 'https://b.example/2', system: 'github' }] })
  // newest first: the row's artifacts take the run's last event time; the events keep their own
  assert.deepEqual(list.map((a) => a.url || a.ref), ['ops_config:K', 'https://b.example/2', 'https://a.example/1'])
  assert.deepEqual(list.map((a) => a.openable), [false, true, true])
  assert.equal(list.find((a) => a.ref === 'ops_config:K').openable, false)
})
