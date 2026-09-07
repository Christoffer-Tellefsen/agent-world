// overlay/pack.mjs — wearing a World Pack (U12). Skin, nouns and rooms; never a fact.
import { packFor } from './packs/index.mjs'

const APPLIED = 'aw.pack.applied'
let active = packFor('')

export const pack = () => active
/** A pack by id without wearing it — a town that wears its own pack (ops_clients.world_branding.pack) speaks it on the panel. */
export const packOf = (id) => (id && id !== active.id ? packFor(id) : active)
export const noun = (key, p = active) => p?.names?.[key] || key
/** The room a run stands in, by its skill's name — the pack's own rule; the surface it mirrors never changes. */
export function roomFor(skill, p = active) {
  const s = String(skill || '').toLowerCase()
  const rooms = p?.rooms || []
  return rooms.find((r) => (r.skills || []).some((frag) => s.includes(String(frag).toLowerCase()))) || rooms.find((r) => r.id === p?.default_room) || rooms[0] || null
}

const style = document.createElement('style')
style.id = 'aw-pack-style'
document.head.appendChild(style)

/** Apply a pack: CSS tokens for the overlay, a filter over the canvas, and the world style once per change. */
export function wear(id) {
  active = packFor(id)
  const pal = active.skin?.palette || {}
  document.documentElement.dataset.awPack = active.id
  const vars = Object.entries(pal).map(([k, v]) => `--aw-${k}:${v}`).join(';')
  const filter = active.skin?.filter && active.skin.filter !== 'none' ? `#app canvas{filter:${active.skin.filter}}` : ''
  style.textContent = `:root{${vars}}${filter}`
  applyWorldStyle()
  return active
}

/** The world style (terrain, sky, lighting) and time of day from the skin — once per pack change, so Tab/L still work. */
function applyWorldStyle() {
  let last = ''
  try {
    last = localStorage.getItem(APPLIED) || ''
  } catch {
    /* no storage: apply every load */
  }
  if (last === active.id) return
  const tick = setInterval(() => {
    const settings = window.botCrossing?.settings
    if (!settings) return
    clearInterval(tick)
    const skin = active.skin || {}
    try {
      if (skin.world) settings.set('planet', skin.world)
      if (skin.lighting) {
        if (typeof skin.lighting.autoTime === 'boolean') settings.set('autoTime', skin.lighting.autoTime)
        if (typeof skin.lighting.timeOfDay === 'number') settings.set('timeOfDay', skin.lighting.timeOfDay)
      }
      localStorage.setItem(APPLIED, active.id)
    } catch (err) {
      console.warn('[world] pack skin not applied:', err?.message || err)
    }
  }, 100)
}
