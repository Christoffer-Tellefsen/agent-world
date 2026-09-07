// overlay/packs — the World Packs that ship (U12, RA Component 10). Static, versioned like the layout.
// Selection is never here: a planet wears WORLD_COMPANIES.companies[].world_pack, a town wears
// ops_clients.world_branding.pack — both read live through the adapter (overlay/zones.mjs).
import campus from './tellefsen-campus/pack.json'
import neutral from './neutral/pack.json'

export const PACKS = Object.freeze({ [campus.id]: campus, [neutral.id]: neutral })
/** What a planet wears when WORLD_COMPANIES names nothing — the id the substrate rules name. */
export const DEFAULT_PACK_ID = 'tellefsen-campus'

/** The pack for an id, or the default with a console warning — an unknown id never blanks the world. */
export function packFor(id) {
  if (id && PACKS[id]) return PACKS[id]
  if (id) console.warn(`[world] unknown World Pack "${id}" — wearing ${DEFAULT_PACK_ID} (add overlay/packs/${id}/pack.json)`)
  return PACKS[DEFAULT_PACK_ID]
}
