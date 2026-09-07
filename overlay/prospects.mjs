// overlay/prospects.mjs — prospect plots as decay (U20). Pure; node runs it under npm test.
//
// A prospect is a Pipeline row whose Stage is neither Won nor Lost (the enum comes from
// DEAL_PIPELINE_STAGES on /world/substrate — Parked is a prospect, a faded one). It stands on the
// campus edge and fades by days since last touch — a render rule, nothing stored:
//   full  ≤ 7 d · half ≤ 30 d · ghost > 30 d (a row never touched is a ghost)
// Won: the plot goes — the client is a town the moment ops_clients says so (U12). Lost: the plot goes.

export const OPACITY = Object.freeze({ full: 1.0, half: 0.5, ghost: 0.2 })

/** The decay rule. */
export function prospectOpacity(days) {
  if (days == null || !Number.isFinite(days)) return OPACITY.ghost
  if (days <= 7) return OPACITY.full
  if (days <= 30) return OPACITY.half
  return OPACITY.ghost
}
export const decayLabel = (o) => (o >= OPACITY.full ? 'warm' : o >= OPACITY.half ? 'cooling' : 'cold')

/** The rows that stand: neither Won nor Lost, by the enum then the longest-untouched first. */
export function prospects(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r && !r.won && !r.lost && r.stage)
    .map((r) => ({ id: r.id, name: r.name, stage: r.stage, stageIndex: r.stageIndex ?? 0, days: r.days ?? null, opacity: prospectOpacity(r.days), url: r.url || '', clientIds: r.clientIds || [] }))
    .sort((a, b) => a.stageIndex - b.stageIndex || (b.days ?? Infinity) - (a.days ?? Infinity) || a.name.localeCompare(b.name))
}

/**
 * Where prospects stand: a ring of hex cells two rings outside everything the map holds, evenly spread
 * by angle, so they never take a cell a town could want. `used` are the axial cells the colony holds
 * ({q, r}); the ring radius grows with the map. Pure: same inputs, same ring.
 */
export function edgeRing(used, count, { pad = 2 } = {}) {
  const cells = Array.isArray(used) ? used : []
  const radius = cells.reduce((m, c) => Math.max(m, hexDistance(c)), 0) + pad + 1
  const ring = hexRing(radius)
  if (!count) return []
  const out = []
  for (let i = 0; i < count; i++) out.push(ring[Math.floor((i * ring.length) / count) % ring.length])
  return out
}

/** Axial distance from the origin. */
export const hexDistance = ({ q, r }) => Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r))
/** The cells at exactly `radius` from the origin, walking the ring. */
export function hexRing(radius) {
  if (radius <= 0) return [{ q: 0, r: 0 }]
  const dirs = [
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
  ]
  const out = []
  let q = -radius
  let r = radius
  for (const [dq, dr] of dirs) {
    for (let i = 0; i < radius; i++) {
      out.push({ q, r })
      q += dq
      r += dr
    }
  }
  return out
}
