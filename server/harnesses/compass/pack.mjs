/**
 * The World Pack, read server-side (M2b). The adapter needs what the pack declares about places:
 * the rooms (id, name, ring, spoke, surface), the skill → room rule and the lod thresholds. The
 * files are the same overlay/packs/<id>/pack.json the browser wears; nothing here is a fact about
 * a client — a pack names rooms, never clients (npm test greps for that).
 *
 * Skill → room (ES-6.6): the pack's per-name override first, else ops_skills.type through the
 * pack's by_type map (Operations → records office, Commercial → strategy room, Content → marketing
 * studio, Finance → finance office, Research → research lab, Delivery → workshop), else the pack's
 * default room (workshop). A wants value on an override is the hand-raise condition (ES-6.8).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const PACKS_DIR = path.join(here, '..', '..', '..', 'overlay', 'packs')
export const DEFAULT_PACK_ID = 'tellefsen-campus'
export const ROOM_IDS = Object.freeze(['corner-office', 'board-room', 'strategy-room', 'marketing-studio', 'research-lab', 'finance-office', 'workshop', 'integration-yard', 'archive', 'records-office'])
/** The type map the spec fixes; a pack may restate it under skills.by_type but cannot drop a type. */
export const ROOM_BY_TYPE = Object.freeze({ Operations: 'records-office', Commercial: 'strategy-room', Content: 'marketing-studio', Finance: 'finance-office', Research: 'research-lab', Delivery: 'workshop' })
export const DEFAULT_ROOM = 'workshop'

const str = (v) => (typeof v === 'string' ? v.trim() : '')
const cache = new Map()

/** A pack by id, parsed once; an unknown id wears the default (never throws on a bad name). */
export function loadPack(id = DEFAULT_PACK_ID) {
  const key = /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(str(id)) ? str(id) : DEFAULT_PACK_ID
  if (cache.has(key)) return cache.get(key)
  let pack = null
  try {
    pack = JSON.parse(fs.readFileSync(path.join(PACKS_DIR, key, 'pack.json'), 'utf8'))
  } catch {
    pack = key === DEFAULT_PACK_ID ? { id: DEFAULT_PACK_ID, rooms: [], names: {}, lod: {}, skills: {} } : loadPack(DEFAULT_PACK_ID)
  }
  cache.set(key, pack)
  return pack
}
export const _resetPacks = () => cache.clear()

/** The rooms a pack declares, in the pack's order: { id, name, ring, spoke, surface, mirrors }. */
export function roomsOf(pack) {
  return (Array.isArray(pack?.rooms) ? pack.rooms : [])
    .filter((r) => r && str(r.id) && str(r.name))
    .map((r) => ({ id: str(r.id), name: str(r.name), ring: Number.isInteger(r.ring) ? r.ring : null, spoke: Number.isInteger(r.spoke) ? r.spoke : null, surface: str(r.surface), mirrors: str(r.mirrors) }))
}
export const roomById = (pack, id) => roomsOf(pack).find((r) => r.id === id) || null
/** The zone name a room's plot carries — the pack's name for it; the id when the pack lacks the room. */
export const roomName = (pack, id) => roomById(pack, id)?.name || id

/** Where a skill lives: { room, source, wants } — source says which rule decided. */
export function roomForSkill(pack, skillName, skillType = '') {
  const name = str(skillName)
  const overrides = pack?.skills?.overrides && typeof pack.skills.overrides === 'object' ? pack.skills.overrides : {}
  const hit = name ? overrides[name] || overrides[name.split(':')[0]] : null
  if (hit && str(hit.room) && roomById(pack, str(hit.room))) return { room: str(hit.room), source: 'override', wants: str(hit.wants) }
  const byType = { ...ROOM_BY_TYPE, ...(pack?.skills?.by_type && typeof pack.skills.by_type === 'object' ? pack.skills.by_type : {}) }
  const t = str(skillType)
  if (t && byType[t] && roomById(pack, byType[t])) return { room: byType[t], source: `type:${t}`, wants: str(hit?.wants) }
  const fallback = str(pack?.skills?.default_room) || str(pack?.default_room) || DEFAULT_ROOM
  return { room: roomById(pack, fallback) ? fallback : roomsOf(pack)[0]?.id || DEFAULT_ROOM, source: 'default', wants: str(hit?.wants) }
}

/** The camera-height thresholds (Bot Crossing's rig.distance): above orbit → plates only; below desk → the panel. */
export const lodOf = (pack) => ({ orbit: Number(pack?.lod?.orbit) || 95, desk: Number(pack?.lod?.desk) || 22 })
