// test/surfaces.test.mjs — U4 progress and U6 cross-check, against a fake fetch.
// Real-surface proof lives in the verifier's checks (V-U4, V-U6); this pins the logic.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createSurfaces, dash, notionId, airtableRef } from '../server/harnesses/compass/surfaces.mjs'

const CONTENT = 'https://app.notion.com/p/What-a-regulated-asset-buys-Anchor-1-blog-3d3c0af9c97481948a02c645948cbc63'
const DECISION = 'https://app.notion.com/p/3d3c0af9c97481c3a74ac69c61fff104'
const PA = 'https://airtable.com/appixWl8C3bogLsvp/tbleRnuppbr0wpsaM/viwgDqclbnquLyF98/recpYloZWYijWCO2T?blocks=hide'
const PROJECT = '3d1c0af9c97481ce8a25f4bdeadd54ab' // undashed, as the ledger delivers it

/** A fake fetch that serves canned Notion/Airtable answers and records every call. */
function fakeFetch(world) {
  const calls = []
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET' })
    const ok = (body) => ({ ok: true, status: 200, json: async () => body })
    const err = (status, body) => ({ ok: false, status, json: async () => body })
    for (const [pattern, answer] of world) if (url.includes(pattern)) return typeof answer === 'function' ? answer() : ok(answer)
    return err(404, { object: 'error', code: 'object_not_found', message: 'nope' })
  }
  return { fetch, calls }
}
const selectPage = (name) => ({ object: 'page', properties: { Status: { type: 'select', select: { name } } } })
const cfg = { notionToken: 'n', airtableToken: 'a' }

test('id parsing: notion urls of every shape, airtable urls with and without a view, undashed project ids', () => {
  assert.equal(notionId(CONTENT), '3d3c0af9-c974-8194-8a02-c645948cbc63')
  assert.equal(notionId('https://www.notion.so/Some-Title-3d3c0af9c97481c3a74ac69c61fff104?pvs=4'), '3d3c0af9-c974-81c3-a74a-c69c61fff104')
  assert.equal(notionId('https://app.notion.com/p/3d3c0af9-c974-81c3-a74a-c69c61fff104'), '3d3c0af9-c974-81c3-a74a-c69c61fff104')
  assert.equal(notionId('https://airtable.com/appX/tblY/recZ'), '')
  assert.deepEqual(airtableRef(PA), { base: 'appixWl8C3bogLsvp', table: 'tbleRnuppbr0wpsaM', record: 'recpYloZWYijWCO2T' })
  assert.deepEqual(airtableRef('https://airtable.com/appixWl8C3bogLsvp/tbleRnuppbr0wpsaM/recpYloZWYijWCO2T'), { base: 'appixWl8C3bogLsvp', table: 'tbleRnuppbr0wpsaM', record: 'recpYloZWYijWCO2T' })
  assert.equal(dash(PROJECT), '3d1c0af9-c974-81ce-8a25-f4bdeadd54ab')
  assert.equal(dash('3d1c0af9-c974-81ce-8a25-f4bdeadd54ab'), '3d1c0af9-c974-81ce-8a25-f4bdeadd54ab')
  assert.equal(dash('not-an-id'), '')
})

test('U6: each surface resolves on exactly its own "moved on" state, and only reads', async () => {
  const { fetch, calls } = fakeFetch([
    ['recpYloZWYijWCO2T', { fields: { Status: 'Pending Approval' } }],
    ['recAPPROVED', { fields: { Status: 'Approved' } }],
    // the adapter requests Notion pages by DASHED id — key the fake world that way
    ['3d3c0af9-c974-8194-8a02-c645948cbc63', selectPage('📅 Scheduled')],
    ['3d3c0af9-c974-81c3-a74a-c69c61fff104', selectPage('Active')],
    ['3d3c0af9-c974-8100-0000-000000000aaa', selectPage('👀 In Review')],
    ['3d3c0af9-c974-8100-0000-000000000bbb', selectPage('Pending')],
  ])
  const s = createSurfaces(cfg, { fetchImpl: fetch })
  assert.equal(await s.gateResolved({ surface: 'pending_approval', ref_url: PA }), false, 'Pending Approval stays open')
  assert.equal(await s.gateResolved({ surface: 'pending_approval', ref_url: 'https://airtable.com/appX/tblY/recAPPROVED' }), true, 'Approved resolves')
  assert.equal(await s.gateResolved({ surface: 'content_status', ref_url: CONTENT }), true, 'Scheduled resolves the signature')
  assert.equal(await s.gateResolved({ surface: 'content_status', ref_url: 'https://app.notion.com/p/3d3c0af9c97481000000000000000aaa' }), false, 'In Review stays open')
  assert.equal(await s.gateResolved({ surface: 'decision', ref_url: DECISION }), true, 'Active resolves')
  assert.equal(await s.gateResolved({ surface: 'decision', ref_url: 'https://app.notion.com/p/3d3c0af9c97481000000000000000bbb' }), false, 'Pending stays open')
  // the negative answers came from a real read of the surface, not from a failed request
  for (const id of ['3d3c0af9-c974-8100-0000-000000000aaa', '3d3c0af9-c974-8100-0000-000000000bbb', 'recpYloZWYijWCO2T']) {
    assert.ok(calls.some((c) => c.url.includes(id)), `read ${id}`)
  }
  assert.ok(calls.every((c) => c.method === 'GET'), 'every request is a GET')
})

test('U6: class_b_gate and client_gate are never checked — no request is made', async () => {
  const { fetch, calls } = fakeFetch([])
  const s = createSurfaces(cfg, { fetchImpl: fetch })
  assert.equal(await s.gateResolved({ surface: 'class_b_gate', ref_url: 'https://github.com/x' }), false)
  assert.equal(await s.gateResolved({ surface: 'client_gate', ref_url: 'https://app.notion.com/p/3d3c0af9c974810000000000000000cc' }), false)
  assert.equal(s.crossCheckable({ surface: 'content_status', ref_url: CONTENT }), true)
  assert.equal(s.crossCheckable({ surface: 'class_b_gate', ref_url: 'https://x' }), false)
  assert.equal(calls.length, 0)
})

test('U6: a failed read never hides a ? — and a resolved gate stays resolved without re-reading', async () => {
  const { fetch, calls } = fakeFetch([['recBOOM', () => { throw new Error('network down') }], ['recDONE', { fields: { Status: 'Sent' } }]])
  const warns = []
  const origWarn = console.warn
  console.warn = (...a) => warns.push(a.join(' '))
  try {
    const s = createSurfaces(cfg, { fetchImpl: fetch })
    assert.equal(await s.gateResolved({ surface: 'pending_approval', ref_url: 'https://airtable.com/appX/tblY/recBOOM' }), false)
    assert.equal(warns.length, 1, 'warned once')
    assert.equal(await s.gateResolved({ surface: 'pending_approval', ref_url: 'https://airtable.com/appX/tblY/recDONE' }), true)
    const before = calls.length
    assert.equal(await s.gateResolved({ surface: 'pending_approval', ref_url: 'https://airtable.com/appX/tblY/recDONE' }), true)
    assert.equal(calls.length, before, 'resolved is cached — no second read')
    const noToken = createSurfaces({}, { fetchImpl: fetch })
    assert.equal(await noToken.gateResolved({ surface: 'pending_approval', ref_url: PA }), false, 'no token → still shown, not thrown')
  } finally {
    console.warn = origWarn
  }
})

test('U6: a re-armed Pending Approval row — run A seen resolved on record R, then run B on the same R — is read again and shows ?', async () => {
  // A stateful fake: the row is Sent while run A looks, then reset to Pending Approval for run B.
  let status = 'Sent'
  const { fetch, calls } = fakeFetch([['recREARM', () => ({ ok: true, status: 200, json: async () => ({ fields: { Status: status } }) })]])
  const s = createSurfaces(cfg, { fetchImpl: fetch })
  const R = 'https://airtable.com/appX/tblY/recREARM'
  assert.equal(await s.gateResolved({ run_id: 'run-A', gate: 'ZZTEST gate', surface: 'pending_approval', ref_url: R }), true, 'run A: resolved')
  const before = calls.length
  assert.equal(await s.gateResolved({ run_id: 'run-A', gate: 'ZZTEST gate', surface: 'pending_approval', ref_url: R }), true)
  assert.equal(calls.length, before, 'run A stays resolved without a second read')
  status = 'Pending Approval' // the seed re-armed the row for a new run
  assert.equal(await s.gateResolved({ run_id: 'run-B', gate: 'ZZTEST gate', surface: 'pending_approval', ref_url: R }), false, 'run B on the same record is read again — still open, so ?')
  assert.equal(calls.length, before + 1, 'exactly one new read for run B')
})

test('U4: milestones done ÷ total from the project page, floored, cached, and safe when the project is not shared', async () => {
  const milestones = ['m1', 'm2', 'm3', 'm4'].map((id) => ({ id: `00000000-0000-4000-8000-0000000000${id.slice(1)}${id.slice(1)}` }))
  const { fetch, calls } = fakeFetch([
    ['pages/3d1c0af9-c974-81ce-8a25-f4bdeadd54ab', { object: 'page', properties: { Milestones: { id: 'rel', type: 'relation', relation: milestones, has_more: false } } }],
    ['00000000-0000-4000-8000-000000000011', selectPage('🟢 Delivered')],
    ['00000000-0000-4000-8000-000000000022', selectPage('🔵 In Progress')],
    ['00000000-0000-4000-8000-000000000033', selectPage('⚪ Not Started')],
    ['00000000-0000-4000-8000-000000000044', selectPage('⚪ Not Started')],
  ])
  const s = createSurfaces(cfg, { fetchImpl: fetch })
  assert.equal(await s.progress(PROJECT), 0.25, '1 of 4 delivered, from an undashed id')
  const before = calls.length
  assert.equal(await s.progress('3d1c0af9-c974-81ce-8a25-f4bdeadd54ab'), 0.25, 'dashed id hits the same cache entry')
  assert.equal(calls.length, before, 'cached for five minutes')
  assert.equal(await s.progress(null), 0.05, 'no project → floor')
  const origWarn = console.warn
  console.warn = () => {}
  try {
    assert.equal(await createSurfaces(cfg, { fetchImpl: fetch }).progress('ffffffff-0000-4000-8000-000000000000'), 0.05, 'unshared project → floor, not a throw')
  } finally {
    console.warn = origWarn
  }
  assert.ok(calls.every((c) => c.method === 'GET'))
})
