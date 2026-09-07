// overlay/lod.mjs — three altitudes (U30, ES-6.5). Pure; node runs it under npm test.
//
// The camera's distance to its target (Bot Crossing's rig.distance, 4–150) decides what is legible:
//   orbit     above lod.orbit: plates only — place name · need you · running — no thread labels, no cards, no bubbles
//   district  between: request labels always; fixture labels on hover or selection; cards and bubbles as usual
//   desk      below lod.desk: the panel (N, the tray and a click at district all fly the camera to ≤ 26, so a selected thread is at desk)
// The thresholds are the pack's (lod.orbit, lod.desk); the rule is the same under every pack.

export const ALTITUDES = Object.freeze(['orbit', 'district', 'desk'])

/** Which altitude a camera distance is at under a pack's lod. */
export function altitudeOf(distance, lod = {}) {
  const orbit = Number(lod.orbit) || 95
  const desk = Number(lod.desk) || 30
  const d = Number(distance)
  if (!Number.isFinite(d)) return 'district'
  if (d > orbit) return 'orbit'
  if (d > Math.min(desk, orbit)) return 'district'
  return 'desk'
}

/**
 * The label rule as a pure function of camera height and thread kind.
 * @returns { altitude, plates, label, card, bubble, panel }
 *   plates  the place plates (name · need you · running) — orbit only
 *   label   this thread's own title label over its figure
 *   card    Bot Crossing's hover/selection card may show
 *   bubble  an artifact bubble may show
 *   panel   the overlay's panel may show (only for a selected thread)
 */
export function labelRule(distance, lod, thread, { hovered = false, selected = false } = {}) {
  const altitude = altitudeOf(distance, lod)
  const kind = thread?.kind === 'fixture' ? 'fixture' : thread?.kind === 'request' ? 'request' : 'other'
  if (altitude === 'orbit') return { altitude, plates: true, label: false, card: false, bubble: false, panel: false }
  const label = kind === 'request' ? true : kind === 'fixture' ? Boolean(hovered || selected) : Boolean(hovered || selected)
  return { altitude, plates: false, label, card: true, bubble: true, panel: altitude === 'desk' && Boolean(selected) }
}

/** What a place plate says at orbit: the name, then the counts that are not zero. */
export function plateText(name, { needYou = 0, running = 0, blocked = 0 } = {}) {
  const parts = [name]
  if (needYou) parts.push(`? ${needYou}`)
  if (blocked) parts.push(`! ${blocked}`)
  if (running) parts.push(`⚒ ${running}`)
  return parts.join(' · ')
}

/** The counts per place from the roster: requests that need you or are blocked, and the fixtures' running counts. */
export function placeCounts(threads) {
  const out = new Map()
  for (const t of Array.isArray(threads) ? threads : []) {
    const name = t?.project
    if (!name) continue
    const c = out.get(name) || { needYou: 0, running: 0, blocked: 0 }
    if (t.kind === 'request' && t.hasError) c.blocked++
    else if (t.kind === 'request' && t.unread) c.needYou++
    if (t.kind === 'fixture') c.running += Number(t.runningCount) || 0
    out.set(name, c)
  }
  return out
}
