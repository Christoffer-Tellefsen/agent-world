/**
 * Places with space (U29, ES-6.4) — the layout generator. Pure: a pack, the towns and the file's
 * current plots in; the plots out. No I/O here; compass.mjs reads and writes the colony file once
 * per planet at start-up (data/colony*.json is the world's only write) and the browser may import
 * this module too (no node imports), so a quiet town laid at runtime takes the same next free slot.
 *
 * Geometry, on Bot Crossing's axial hex lattice (src/world/plots.js, whose allocator honours a saved
 * cell as long as the root cell is free — that is what keeps this sticky):
 *   ring 0        the corner office (the pack's ring-0 room)
 *   ring 1        six rooms, one per spoke
 *   ring 2        three rooms on alternating spoke cells (0, 2, 4)
 *   ring 3        empty — nothing is ever placed there
 *   ring 4, 6, 8… towns, one per spoke cell, so two towns are never adjacent: along a spoke the
 *                 between cell (5, 7, …) stays empty; around a ring the corners are `ring` apart
 * A room's cell is the pack's; a town keeps whatever cells the file already gives it (sticky, even
 * if it has grown) and a new town takes the next free slot in ring-then-spoke order. Nothing at
 * ring ≤ 3 survives unless it is a room of the pack on screen (the campus is regenerated; the
 * backups from B1 hold the old map). Lost removes nothing: a town that leaves the client list keeps
 * its ground in the file, as Bot Crossing's own layout memory does.
 */
export const HEX_DIRS = Object.freeze([[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]])
/** The lattice cell Bot Crossing's ship owns (src/world/plots.js SHIP_CELL) — never handed out. */
export const SHIP_CELL = Object.freeze({ q: -2, r: 1 })
export const EMPTY_RING = 3

export const hexDistance = (c) => Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.q + c.r))
export const key = (c) => `${c.q},${c.r}`
export const adjacent = (a, b) => hexDistance({ q: a.q - b.q, r: a.r - b.r }) === 1
export const spokeCell = (ring, spoke) => ({ q: ring * HEX_DIRS[((spoke % 6) + 6) % 6][0], r: ring * HEX_DIRS[((spoke % 6) + 6) % 6][1] })

/** The town slots the pack's layout rule yields, in order: ring first_ring, +ring_step … last_ring; spokes 0–5. */
export function townSlots(pack) {
  const rule = pack?.layout?.towns || {}
  const first = Number.isInteger(rule.first_ring) ? rule.first_ring : 4
  const step = Number.isInteger(rule.ring_step) && rule.ring_step > 0 ? rule.ring_step : 2
  const last = Number.isInteger(rule.last_ring) ? rule.last_ring : 10
  const out = []
  for (let ring = Math.max(first, EMPTY_RING + 1); ring <= last; ring += step) for (let spoke = 0; spoke < 6; spoke++) out.push({ ring, spoke, cell: spokeCell(ring, spoke) })
  return out
}

/** The rooms' cells: { name → [cell] } for every room with a ring and a spoke. */
export function roomCells(pack) {
  const out = new Map()
  for (const r of Array.isArray(pack?.rooms) ? pack.rooms : []) {
    if (!r || typeof r.name !== 'string' || !Number.isInteger(r.ring) || !Number.isInteger(r.spoke)) continue
    const cell = r.ring === 0 ? { q: 0, r: 0 } : spokeCell(r.ring, r.spoke)
    if (key(cell) === key(SHIP_CELL)) continue
    out.set(r.name, [cell])
  }
  return out
}

const cellsOf = (list) => (Array.isArray(list) ? list : []).map((c) => (Array.isArray(c) ? { q: Number(c[0]), r: Number(c[1]) } : { q: Number(c?.q), r: Number(c?.r) })).filter((c) => Number.isFinite(c.q) && Number.isFinite(c.r))

/**
 * @param pack     the pack the planet wears (rooms with ring/spoke, layout.towns)
 * @param towns    the names of the towns on this planet (Active clients), any order
 * @param existing the file's plots: { name: [[q, r], …] }
 * @returns { plots, kept, placed, dropped, changed }
 */
export function generateLayout({ pack, towns = [], existing = {} }) {
  const rooms = roomCells(pack)
  const plots = new Map()
  const taken = new Set([key(SHIP_CELL)])
  for (const [name, cells] of rooms) {
    // A room keeps the cells Bot Crossing grew it into (its thread count decides), as long as it is still rooted on
    // its own cell and stays inside the campus (ring ≤ 2) — otherwise the file and the browser would ping-pong the
    // growth on every restart. Growth past ring 2 is cut back; the browser regrows what it needs.
    const had = cellsOf(existing?.[name])
    const rooted = had.length && key(had[0]) === key(cells[0])
    const kept = rooted ? had.filter((c, i) => i === 0 || (hexDistance(c) <= EMPTY_RING - 1 && key(c) !== key(SHIP_CELL))) : cells
    plots.set(name, kept)
    for (const c of kept) taken.add(key(c))
  }
  for (const [name, cells] of rooms) {
    // a room's own cell is never another room's growth: the growth yields, the room stands
    for (const [other, list] of plots) {
      if (other === name) continue
      const i = list.findIndex((c, j) => j > 0 && key(c) === key(cells[0]))
      if (i > 0) list.splice(i, 1)
    }
    if (!plots.get(name).some((c) => key(c) === key(cells[0]))) plots.get(name).unshift(cells[0])
  }
  const kept = []
  const dropped = []
  // Existing entries: a room name of this pack is regenerated above; anything rooted inside ring 3 goes;
  // everything else keeps exactly its cells (sticky) — towns and the memory of towns that left alike.
  for (const [name, raw] of Object.entries(existing || {})) {
    if (rooms.has(name)) continue
    const all = cellsOf(raw)
    // a town keeps its root and its growth outward; growth inward past ring 4 (src grows toward the origin) is cut back
    const cells = all.filter((c, i) => i === 0 || hexDistance(c) > EMPTY_RING)
    if (!cells.length || hexDistance(cells[0]) <= EMPTY_RING || cells.some((c) => taken.has(key(c)))) {
      dropped.push(name)
      continue
    }
    plots.set(name, cells)
    for (const c of cells) taken.add(key(c))
    kept.push(name)
  }
  // New towns: the next free slot — free means its cell is untaken and no taken cell touches it.
  const placed = []
  const slots = townSlots(pack)
  const freeSlot = () => slots.find((s) => !taken.has(key(s.cell)) && ![...taken].some((k) => { const [q, r] = k.split(',').map(Number); return adjacent({ q, r }, s.cell) }))
  for (const name of [...new Set(towns.map((t) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean))].sort((a, b) => a.localeCompare(b))) {
    if (plots.has(name)) continue
    const slot = freeSlot()
    if (!slot) break // the map is full: the browser's own allocator will seat it (reported, not fought)
    plots.set(name, [slot.cell])
    taken.add(key(slot.cell))
    placed.push(name)
  }
  const out = {}
  for (const [name, cells] of plots) out[name] = cells.map((c) => [c.q, c.r])
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  const changed = !same(Object.fromEntries(Object.entries(existing || {}).map(([k, v]) => [k, cellsOf(v).map((c) => [c.q, c.r])])), out)
  return { plots: out, kept, placed, dropped, changed }
}

/** The next free town slot for a name not yet in `plots` (the overlay's quiet towns use this at runtime). */
export function nextTownSlot(pack, plots) {
  const taken = new Set([key(SHIP_CELL)])
  for (const raw of Object.values(plots || {})) for (const c of cellsOf(raw)) taken.add(key(c))
  const touch = (cell) => [...taken].some((k) => { const [q, r] = k.split(',').map(Number); return adjacent({ q, r }, cell) })
  return townSlots(pack).find((s) => !taken.has(key(s.cell)) && !touch(s.cell))?.cell || null
}

/** Two plots are adjacent if any cell of one touches any cell of the other. */
export function adjacentPlots(plots) {
  const names = Object.keys(plots || {})
  const pairs = []
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const a = cellsOf(plots[names[i]]), b = cellsOf(plots[names[j]])
    if (a.some((x) => b.some((y) => adjacent(x, y)))) pairs.push([names[i], names[j]])
  }
  return pairs
}
