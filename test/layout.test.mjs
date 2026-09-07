// Agent World — U29: places with space. The generator is deterministic, spaced and sticky.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const load = async () => ({ ...(await import(path.join(root, 'server/harnesses/compass/layout.mjs'))), ...(await import(path.join(root, 'server/harnesses/compass/pack.mjs'))) })
const isCampus = (pack) => new Set((pack.rooms || []).map((r) => r.name))

test('U29: the generator is deterministic for a given pack + client list, lays the campus by ring and spoke, keeps ring 3 empty', async () => {
  const { generateLayout, loadPack, hexDistance, roomCells } = await load()
  const pack = loadPack('tellefsen-campus')
  const towns = ['ZZTEST Client', 'ZZTEST Client 2', 'ZZTEST Third']
  const a = generateLayout({ pack, towns, existing: {} })
  const b = generateLayout({ pack, towns: [...towns].reverse(), existing: {} })
  assert.deepEqual(a.plots, b.plots, 'the same pack + client list → the same plots, whatever the order the list came in')
  assert.deepEqual(a.plots['corner office'], [[0, 0]])
  assert.deepEqual(a.plots['board room'], [[1, 0]])
  assert.deepEqual(a.plots['integration yard'], [[2, 0]])
  assert.deepEqual(a.plots['archive'], [[0, -2]])
  assert.deepEqual(a.plots['records office'], [[-2, 2]])
  assert.equal(roomCells(pack).size, 10)
  for (const [name, cells] of Object.entries(a.plots)) {
    if (isCampus(pack).has(name)) assert.ok(cells.every(([q, r]) => hexDistance({ q, r }) <= 2), `${name} is on the campus`)
    else assert.ok(cells.every(([q, r]) => hexDistance({ q, r }) >= 4), `${name} is a town from ring 4 out`)
    assert.ok(!cells.some(([q, r]) => hexDistance({ q, r }) === 3), 'ring 3 is empty')
    assert.ok(!cells.some(([q, r]) => q === -2 && r === 1), 'the ship cell is never handed out')
  }
  assert.deepEqual(a.placed, ['ZZTEST Client', 'ZZTEST Client 2', 'ZZTEST Third'])
  assert.deepEqual(a.plots['ZZTEST Client'], [[4, 0]])
  assert.deepEqual(a.plots['ZZTEST Client 2'], [[4, -4]])
})

test('U29: no two non-campus plots are adjacent, on the first layout and after growth', async () => {
  const { generateLayout, loadPack, adjacentPlots } = await load()
  const pack = loadPack('tellefsen-campus')
  const towns = Array.from({ length: 14 }, (_, i) => `ZZTEST T${String(i).padStart(2, '0')}`)
  const { plots } = generateLayout({ pack, towns, existing: {} })
  const campus = isCampus(pack)
  const pairs = adjacentPlots(plots).filter(([a, b]) => !(campus.has(a) && campus.has(b)))
  assert.deepEqual(pairs, [], `touching plots outside the campus: ${JSON.stringify(pairs)}`)
  // a town that grew into its between-cell (Bot Crossing's own growth) blocks the slot behind it, and the next town skips it
  const grown = { ...plots, 'ZZTEST T00': [[4, 0], [5, 0]] }
  const next = generateLayout({ pack, towns: [...towns, 'ZZTEST New'], existing: grown })
  assert.deepEqual(next.plots['ZZTEST T00'], [[4, 0], [5, 0]], 'a grown town keeps its cells')
  assert.ok(!adjacentPlots(next.plots).some(([a, b]) => a === 'ZZTEST New' || b === 'ZZTEST New'), 'the new town touches nothing')
})

test('U29: a client added to the list takes the next free spoke cell and no existing plot moves; a client removed keeps its ground; the old campus is dropped', async () => {
  const { generateLayout, loadPack } = await load()
  const pack = loadPack('tellefsen-campus')
  const first = generateLayout({ pack, towns: ['ZZTEST B', 'ZZTEST A'], existing: { 'ZZTEST HQ': [[0, 0], [1, 0]], 'ZZTEST Old': [[-1, 2]] } })
  assert.deepEqual(first.dropped.sort(), ['ZZTEST HQ', 'ZZTEST Old'], 'entries rooted inside ring 3 go (the campus is regenerated)')
  assert.deepEqual(first.plots['ZZTEST A'], [[4, 0]])
  assert.deepEqual(first.plots['ZZTEST B'], [[4, -4]])
  const second = generateLayout({ pack, towns: ['ZZTEST B', 'ZZTEST A', 'ZZTEST C'], existing: first.plots })
  assert.deepEqual(second.placed, ['ZZTEST C'])
  assert.deepEqual(second.plots['ZZTEST C'], [[0, -4]], 'the next free spoke cell')
  for (const name of Object.keys(first.plots)) assert.deepEqual(second.plots[name], first.plots[name], `${name} did not move`)
  assert.equal(second.changed, true)
  const third = generateLayout({ pack, towns: ['ZZTEST B', 'ZZTEST C'], existing: second.plots })
  assert.deepEqual(third.plots['ZZTEST A'], [[4, 0]], 'a client that left keeps its ground (Lost removes nothing)')
  assert.equal(third.changed, false, 'nothing to write when nothing changed')
  // the neutral pack: the same geometry under other names; the campus names of the other pack are dropped and re-laid
  const neutral = loadPack('neutral')
  const flipped = generateLayout({ pack: neutral, towns: ['ZZTEST B', 'ZZTEST C'], existing: third.plots })
  assert.deepEqual(flipped.plots['unit B — decisions'], [[1, 0]])
  assert.ok(!('board room' in flipped.plots), 'the campus wears one pack at a time')
  assert.deepEqual(flipped.plots['ZZTEST A'], [[4, 0]], 'towns do not move on a pack flip')
  const back = generateLayout({ pack, towns: ['ZZTEST B', 'ZZTEST C'], existing: flipped.plots })
  assert.deepEqual(back.plots['board room'], [[1, 0]])
  assert.deepEqual(back.plots['ZZTEST C'], [[0, -4]])
})

test('U29: the runtime slot for a quiet town equals what the generator would give it', async () => {
  const { generateLayout, nextTownSlot, loadPack } = await load()
  const pack = loadPack('tellefsen-campus')
  const { plots } = generateLayout({ pack, towns: ['ZZTEST A', 'ZZTEST B'], existing: {} })
  const slot = nextTownSlot(pack, plots)
  const withC = generateLayout({ pack, towns: ['ZZTEST A', 'ZZTEST B', 'ZZTEST C'], existing: plots })
  assert.deepEqual([slot.q, slot.r], withC.plots['ZZTEST C'][0])
})

test('U29: a room keeps the cells the browser grew it into inside the campus; growth past ring 2 is cut back; nothing changes on a quiet restart', async () => {
  const { generateLayout, loadPack, hexDistance } = await load()
  const pack = loadPack('tellefsen-campus')
  const first = generateLayout({ pack, towns: ['ZZTEST A'], existing: {} }).plots
  const grown = { ...first, 'board room': [[1, 0], [2, -1], [1, 1], [3, -2]] }
  const again = generateLayout({ pack, towns: ['ZZTEST A'], existing: grown })
  assert.deepEqual(again.plots['board room'], [[1, 0], [2, -1], [1, 1]], 'in-campus growth kept, the ring-3 cell cut')
  assert.ok(Object.values(again.plots).every((cells) => cells.every(([q, r]) => hexDistance({ q, r }) !== 3)), 'ring 3 stays empty')
  const quiet = generateLayout({ pack, towns: ['ZZTEST A'], existing: again.plots })
  assert.equal(quiet.changed, false, 'a restart with nothing new writes nothing')
  // a room re-rooted elsewhere by a hand edit is put back on its cell
  const moved = { ...first, 'archive': [[0, -3]] }
  assert.deepEqual(generateLayout({ pack, towns: ['ZZTEST A'], existing: moved }).plots.archive, [[0, -2]])
})

test('U29: a town that grew toward the centre (src grows by thread count) is cut back at ring 3 on the next restart; outward growth stays', async () => {
  const { generateLayout, loadPack } = await load()
  const pack = loadPack('tellefsen-campus')
  const first = generateLayout({ pack, towns: ['ZZTEST A'], existing: {} }).plots
  const grown = { ...first, 'ZZTEST A': [[4, 0], [3, 0], [5, -1], [3, 1]] }
  const next = generateLayout({ pack, towns: ['ZZTEST A'], existing: grown })
  assert.deepEqual(next.plots['ZZTEST A'], [[4, 0], [5, -1], [3, 1]], '(3,0) is ring 3 and goes; (3,1) is ring 4 and stays')
})
