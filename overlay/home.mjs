// overlay/home.mjs — H flies to the corner office; a fresh load opens there (U30, ES-6.5). Pure; node runs it.
//
// The corner office is the pack's ring-0 room; its plot is the one named by that room in the world the sidecar
// hands out (rooms[]). Bot Crossing's own H (hide the UI) is shadowed here — ⌘\ (⌃\) still toggles the UI, and
// 0 still resets the view to the origin, which is the same cell.

/** The room at the centre: the pack's ring-0 room, else the first room named. */
export function homeRoom(rooms) {
  const list = Array.isArray(rooms) ? rooms : []
  return list.find((r) => r && r.ring === 0) || list.find((r) => r && r.id === 'corner-office') || list[0] || null
}

/**
 * Where H lands: the corner office plot's middle when the colony has laid it, else the lattice origin
 * (the generator puts the ring-0 room at (0, 0), so the origin is the same ground before the plot exists).
 * @param rooms   world.rooms from the sidecar
 * @param plots   Map<name, plot> — Bot Crossing's colony.plots (plot.middle or plot.center)
 * @returns { name, point: {x, z}, laid }
 */
export function homeTarget(rooms, plots) {
  const room = homeRoom(rooms)
  const plot = room && plots?.get ? plots.get(room.name) : null
  const p = plot?.middle || plot?.center
  return { name: room?.name || '', point: p ? { x: p.x, z: p.z } : { x: 0, z: 0 }, laid: Boolean(p) }
}

/** The distance H flies to: inside district, just above the desk, so the corner office reads as a place, not a panel. */
export const homeDistance = (lod = {}) => Math.min(Math.max(Number(lod.desk) || 30, 0) + 8, (Number(lod.orbit) || 95) - 1)
