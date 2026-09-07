// Agent World — U19: the Steering Room reads (GET-only Airtable, the Notion data-source query, 5-min caches, a 404 names its fix).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const NOW = Date.parse('2026-09-18T14:00:00Z') // 12 d after the ZZTEST row's stage change (2026-09-06 13:18Z)
const STAGES = ['Lead', 'Qualified Lead', 'Solution Brief Sent', 'Scoping', 'Proposal Sent', 'Negotiation', 'Won', 'Parked', 'Lost']

test('U19: a Pipeline row — stage from the enum (never hardcoded), days since the newest touch, open unless Won/Lost/Parked; hot deals by enum then longest-untouched', async () => {
  const { pipelineRow, hotDeals } = await import(path.join(root, 'server/harnesses/compass/steering.mjs'))
  const zeta = pipelineRow({ id: 'reclEgXG2t4ZnomCq', fields: { 'Opportunity Name': 'ZZTEST Prospect — Zeta', Stage: 'Lead', 'Stage Changed Date': '2026-09-06T13:18:09.000Z', 'Last Viewed': '2026-09-06', Client: ['receKsWIaM5WozMKn'] } }, STAGES, NOW)
  assert.equal(zeta.days, 12)
  assert.equal(zeta.open, true)
  assert.equal(zeta.stageIndex, 0)
  const won = pipelineRow({ id: 'r2', fields: { 'Opportunity Name': 'W', Stage: 'Won', 'Stage Changed Date': '2026-09-17T00:00:00Z' } }, STAGES, NOW)
  assert.equal(won.open, false)
  assert.equal(won.won, true)
  const viewed = pipelineRow({ id: 'r3', fields: { 'Opportunity Name': 'V', Stage: 'Scoping', 'Stage Changed Date': '2026-09-17T00:00:00Z', 'Last Viewed': '2026-09-16' } }, STAGES, NOW)
  assert.equal(viewed.days, 2, 'Last Viewed before the stage stamp (the stamp moves on any write to Stage)')
  const touched = pipelineRow({ id: 'r4', fields: { 'Opportunity Name': 'T', Stage: 'Scoping', 'Stage Changed Date': '2026-08-01T00:00:00Z', 'Last Viewed': '2026-08-20', 'Last Touch': '2026-09-17' } }, STAGES, NOW)
  assert.equal(touched.days, 1, 'a Last Touch field, when the base has one, comes first')
  const stamped = pipelineRow({ id: 'r6', fields: { 'Opportunity Name': 'S', Stage: 'Scoping', 'Stage Changed Date': '2026-09-08T00:00:00Z', 'Created Date': '2026-08-01T00:00:00Z' } }, STAGES, NOW)
  assert.equal(stamped.days, 10, 'no human-set date: the stage stamp, then creation')
  const odd = pipelineRow({ id: 'r5', fields: { 'Opportunity Name': 'O', Stage: 'Mystery' } }, STAGES, NOW)
  assert.equal(odd.stageIndex, STAGES.length, 'an unknown stage sorts last')
  assert.equal(odd.days, null)
  const hot = hotDeals([won, viewed, zeta, touched, odd])
  assert.deepEqual(hot.map((r) => r.name), ['ZZTEST Prospect — Zeta', 'V', 'T', 'O'])
})

test('U19: next milestone = the first not-done by committed date, then sequence', async () => {
  const { nextMilestone } = await import(path.join(root, 'server/harnesses/compass/steering.mjs'))
  const list = [
    { name: 'M3', done: false, committed: Date.parse('2026-10-01'), sequence: 3 },
    { name: 'M1', done: true, committed: Date.parse('2026-09-01'), sequence: 1 },
    { name: 'M2', done: false, committed: Date.parse('2026-09-20'), sequence: 2 },
    { name: 'M0', done: false, committed: 0, sequence: 0 },
  ]
  assert.equal(nextMilestone(list).name, 'M2')
  assert.equal(nextMilestone([{ name: 'a', done: true }]), null)
  assert.equal(nextMilestone([{ name: 'b', done: false, sequence: 2 }, { name: 'a', done: false, sequence: 1 }]).name, 'a')
})

test('U19: the three readers — Airtable GET only, Notion POST only on data_sources/<id>/query, each cached 5 min, a 404 names the fix', async () => {
  const { createSteering, PIPELINE_TABLE, PROJECTS_DATA_SOURCE, DECISIONS_DATA_SOURCE } = await import(path.join(root, 'server/harnesses/compass/steering.mjs'))
  const calls = []
  let notionStatus = 200
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET' })
    if (url.includes('api.airtable.com') && /view=/.test(url)) {
      assert.equal(init.method, undefined, 'Airtable is GET only')
      // the hot-deals view: its own rows, its own order
      return { ok: true, status: 200, json: async () => ({ records: [{ id: 'reclEgXG2t4ZnomCq', fields: { 'Opportunity Name': 'ZZTEST Prospect — Zeta', Stage: 'Lead', 'Last Viewed': '2026-09-06', 'Stage Changed Date': '2026-09-06T13:18:09.000Z' } }] }) }
    }
    if (url.includes('api.airtable.com')) {
      assert.equal(init.method, undefined, 'Airtable is GET only')
      assert.ok(url.includes(`/${PIPELINE_TABLE}?`))
      return { ok: true, status: 200, json: async () => ({ records: [{ id: 'reclEgXG2t4ZnomCq', fields: { 'Opportunity Name': 'ZZTEST Prospect — Zeta', Stage: 'Lead', 'Last Viewed': '2026-09-06', 'Stage Changed Date': '2026-09-06T13:18:09.000Z' } }, { id: 'rW', fields: { 'Opportunity Name': 'Done deal', Stage: 'Won', 'Stage Changed Date': '2026-09-17T00:00:00Z' } }] }) }
    }
    if (url.endsWith(`/data_sources/${PROJECTS_DATA_SOURCE}/query`)) {
      assert.equal(init.method, 'POST')
      assert.deepEqual(JSON.parse(init.body).filter, { property: 'Status', select: { equals: 'Active' } })
      if (notionStatus !== 200) return { ok: false, status: notionStatus, json: async () => ({ code: 'object_not_found' }) }
      return { ok: true, status: 200, json: async () => ({ results: [{ id: 'p1', url: 'https://notion/p1', properties: { Name: { title: [{ plain_text: 'ZZTEST Project' }] } } }] }) }
    }
    if (url.endsWith(`/data_sources/${DECISIONS_DATA_SOURCE}/query`)) {
      assert.equal(init.method, 'POST')
      const body = JSON.parse(init.body)
      assert.equal(body.page_size, 3)
      assert.ok(body.filter.or.length === 2)
      return { ok: true, status: 200, json: async () => ({ results: [1, 2, 3].map((i) => ({ id: `d${i}`, url: `https://notion/d${i}`, properties: { Decision: { title: [{ plain_text: `ZZTEST decision ${i}` }] }, Status: { type: 'select', select: { name: i === 2 ? 'Pending' : 'Active' } }, Confidence: { type: 'select', select: { name: '🟢 Settled' } }, Date: { date: { start: `2026-09-0${4 - i}` } } } })) }) }
    }
    throw new Error(`unexpected ${init.method || 'GET'} ${url}`)
  }
  const surfaces = { milestones: async (id) => ({ value: 0.5, doneAt: 0, list: [{ id: 'm1', name: 'ZZTEST M1', done: true, committed: Date.parse('2026-09-01'), sequence: 1, status: '🟢 Delivered' }, { id: 'm2', name: 'ZZTEST M2', done: false, committed: Date.parse('2026-09-30'), sequence: 2, status: 'Planned' }] }) }
  const substrate = { read: async () => ({ deal_pipeline_stages: STAGES }) }
  let t = NOW
  const st = createSteering({ notionToken: 'n', airtableToken: 'a', airtableBaseId: 'appX' }, { surfaces, substrate, fetchImpl, now: () => t })

  const all = await st.all()
  assert.equal(all.pipeline.error, '')
  assert.deepEqual(all.pipeline.stages, STAGES)
  assert.equal(all.pipeline.rows.length, 2, 'every row, for U20')
  assert.equal(all.pipeline.hot.length, 1, 'the hot deals are the view\'s rows in the view\'s order')
  assert.equal(all.pipeline.hot[0].days, 12)
  assert.equal(all.pipeline.view, 'Active pipeline')
  assert.equal(all.milestones.rows[0].project, 'ZZTEST Project')
  assert.equal(all.milestones.rows[0].next.name, 'ZZTEST M2')
  assert.deepEqual([all.milestones.rows[0].done, all.milestones.rows[0].total], [1, 2])
  assert.equal(all.decisions.rows.length, 3)
  assert.equal(all.decisions.rows[1].status, 'Pending')
  // only these verbs, only these endpoints
  const posts = calls.filter((c) => c.method !== 'GET')
  assert.ok(posts.length === 2 && posts.every((c) => c.method === 'POST' && /\/data_sources\/[0-9a-f-]+\/query$/.test(c.url)), JSON.stringify(posts))
  // cached: nothing is read again inside 5 min; read again after
  const n = calls.length
  await st.all()
  assert.equal(calls.length, n)
  t += 5 * 60_000 + 1
  await st.all()
  assert.ok(calls.length > n)
  // a 404 on the Projects data source: an empty panel that names the fix; the other panels unaffected
  notionStatus = 404
  t += 5 * 60_000 + 1
  const broken = await st.all()
  assert.deepEqual(broken.milestones.rows, [])
  assert.match(broken.milestones.error, /share it with the "Tellefsen - Agent world" integration/)
  assert.equal(broken.decisions.rows.length, 3)
  // an error is retried after 30 s, not held for 5 min
  notionStatus = 200
  t += 31_000
  assert.equal((await st.all()).milestones.rows.length, 1)
  // no tokens at all: named, not thrown
  const bare = createSteering({ notionToken: '', airtableToken: '', airtableBaseId: 'appX' }, { surfaces, substrate, fetchImpl, now: () => t })
  const empty = await bare.all()
  assert.match(empty.pipeline.error, /AIRTABLE_TOKEN/)
  assert.match(empty.decisions.error, /NOTION_TOKEN/)
})

test('U19: the panels format without editing anything — days label, due label, and an empty panel names its fix', async () => {
  const { pipelineRows, milestoneRows, decisionRows, panelNote, daysLabel } = await import(path.join(root, 'overlay/steering.mjs'))
  assert.deepEqual([daysLabel(12), daysLabel(0), daysLabel(null)], ['12 d', 'today', '—'])
  assert.equal(pipelineRows({ rows: [{ id: 'r', name: 'Z', stage: 'Lead', days: 12, url: 'u' }] })[0].daysLabel, '12 d')
  const m = milestoneRows({ rows: [{ project: 'P', url: 'u', done: 1, total: 2, next: { name: 'M2', committed: NOW - 2 * 86400_000, url: 'm' } }, { project: 'Q', url: 'u', done: 0, total: 0, next: null }] }, NOW)
  assert.equal(m[0].due, '2 d late')
  assert.equal(m[0].late, true)
  assert.equal(m[1].next, 'no milestones yet')
  assert.equal(decisionRows({ rows: [{ title: 'D', status: 'Active', confidence: '🟢 Settled', date: '2026-09-07', url: 'u' }] })[0].status, 'Active')
  assert.equal(panelNote({ rows: [], error: 'Airtable Pipeline: not shared' }), 'Airtable Pipeline: not shared')
  assert.equal(panelNote({ rows: [] }), 'nothing here')
  assert.equal(panelNote({ rows: [1] }), '')
})

test('U20: the prospect rows — one Airtable GET a poll at most, every stage, no write; a Stage change shows on the next read', async () => {
  const { createSteering, PROSPECTS_MS } = await import(path.join(root, 'server/harnesses/compass/steering.mjs'))
  let stage = 'Lead'
  let gets = 0
  const fetchImpl = async (url, init = {}) => {
    assert.equal(init.method, undefined, 'GET only')
    gets += 1
    return { ok: true, status: 200, json: async () => ({ records: [{ id: 'reclEgXG2t4ZnomCq', fields: { 'Opportunity Name': 'ZZTEST Prospect — Zeta', Stage: stage, 'Last Viewed': '2026-09-06' } }, { id: 'rL', fields: { 'Opportunity Name': 'Gone', Stage: 'Lost' } }] }) }
  }
  let t = NOW
  const st = createSteering({ airtableToken: 'a', airtableBaseId: 'appX', notionToken: '' }, { surfaces: {}, substrate: { read: async () => ({ deal_pipeline_stages: STAGES }) }, fetchImpl, now: () => t })
  const a = await st.prospectRows()
  assert.equal(a.rows.length, 2, 'every stage — the overlay decides who stands')
  assert.deepEqual(a.rows.map((r) => [r.won, r.lost]), [[false, false], [false, true]])
  assert.equal(a.rows[0].days, 12)
  await st.prospectRows()
  assert.equal(gets, 1, 'cached for a poll')
  stage = 'Won'
  t += PROSPECTS_MS + 1
  const stale = await st.prospectRows()
  assert.equal(stale.rows[0].won, false, 'a stale answer comes back at once…')
  await new Promise((r) => setImmediate(r))
  const b = await st.prospectRows()
  assert.equal(gets, 2)
  assert.equal(b.rows[0].won, true, '…and the background read has Won by the next call')
})
