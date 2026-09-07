// Agent World — U30: altitudes. The label rule is a pure function of camera height and thread kind; H and the first load resolve to the corner office.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)

test('U30: the label rule — orbit: plates only; district: request labels always, fixture labels on hover or selection; desk: the panel', async () => {
  const { altitudeOf, labelRule, plateText, placeCounts } = await import(path.join(root, 'overlay/lod.mjs'))
  const lod = { orbit: 95, desk: 30 }
  assert.equal(altitudeOf(150, lod), 'orbit'); assert.equal(altitudeOf(96, lod), 'orbit'); assert.equal(altitudeOf(95, lod), 'district'); assert.equal(altitudeOf(62, lod), 'district'); assert.equal(altitudeOf(26, lod), 'desk'); assert.equal(altitudeOf(4, lod), 'desk')
  const fixture = { kind: 'fixture' }, request = { kind: 'request', unread: true }
  for (const t of [fixture, request]) {
    const o = labelRule(120, lod, t, { hovered: true, selected: true })
    assert.deepEqual(o, { altitude: 'orbit', plates: true, label: false, card: false, bubble: false, panel: false }, 'at orbit nothing but plates, whatever is hovered')
  }
  assert.equal(labelRule(60, lod, request).label, true, 'a request label always at district')
  assert.equal(labelRule(60, lod, fixture).label, false, 'a fixture label only on hover or selection')
  assert.equal(labelRule(60, lod, fixture, { hovered: true }).label, true)
  assert.equal(labelRule(60, lod, fixture, { selected: true }).label, true)
  assert.equal(labelRule(60, lod, request).panel, false, 'no panel above the desk')
  assert.equal(labelRule(20, lod, request, { selected: true }).panel, true, 'the panel at desk for the selected thread')
  assert.equal(labelRule(20, lod, request).panel, false)
  assert.equal(labelRule(60, lod, request).bubble, true)
  assert.equal(plateText('ZZTEST Client', { needYou: 2, running: 1 }), 'ZZTEST Client · ? 2 · ⚒ 1')
  assert.equal(plateText('board room', {}), 'board room')
  const counts = placeCounts([{ kind: 'request', unread: true, project: 'A' }, { kind: 'request', hasError: true, project: 'A' }, { kind: 'fixture', runningCount: 3, project: 'A' }, { kind: 'fixture', project: 'B' }])
  assert.deepEqual(counts.get('A'), { needYou: 1, running: 3, blocked: 1 })
  assert.deepEqual(counts.get('B'), { needYou: 0, running: 0, blocked: 0 })
})

test('U30: H and the initial target resolve to the corner office plot', async () => {
  const { homeRoom, homeTarget, homeDistance } = await import(path.join(root, 'overlay/home.mjs'))
  const { loadPack, roomsOf } = await import(path.join(root, 'server/harnesses/compass/pack.mjs'))
  for (const id of ['tellefsen-campus', 'neutral']) {
    const rooms = roomsOf(loadPack(id))
    assert.equal(homeRoom(rooms).id, 'corner-office', id)
    const plots = new Map([[homeRoom(rooms).name, { middle: { x: 1.5, z: -2 } }]])
    assert.deepEqual(homeTarget(rooms, plots), { name: homeRoom(rooms).name, point: { x: 1.5, z: -2 }, laid: true })
    assert.deepEqual(homeTarget(rooms, new Map()), { name: homeRoom(rooms).name, point: { x: 0, z: 0 }, laid: false }, 'before the plot exists: the origin, which is the same cell')
  }
  assert.equal(homeDistance({ desk: 30 }), 38)
  assert.equal(homeDistance({ orbit: 40, desk: 35 }), 39, 'never at orbit, whatever the pack says')
  assert.ok(homeDistance({ orbit: 95, desk: 30 }) < 95, 'H lands inside district, never at orbit')
})
