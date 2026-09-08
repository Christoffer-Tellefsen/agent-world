/**
 * The World Pack, read server-side (M2b). The adapter needs what the pack declares about places:
 * the rooms (id, name, ring, spoke, surface), the skill → room rule and the lod thresholds. The
 * files are the same overlay/packs/<id>/pack.json the browser wears; nothing here is a fact about
 * a client — a pack names rooms, never clients (npm test greps for that).
 *
 * The rules themselves (roomsOf, roomForSkill, lodOf …) live in pack-rules.mjs — pure, importable by the
 * browser too (U35 folds spend rows through the same roomForSkill) — and are re-exported from here.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const PACKS_DIR = path.join(here, '..', '..', '..', 'overlay', 'packs')
export const DEFAULT_PACK_ID = 'tellefsen-campus'
export { ROOM_IDS, ROOM_BY_TYPE, DEFAULT_ROOM, roomsOf, roomById, roomName, roomForSkill, lodOf } from './pack-rules.mjs'

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
