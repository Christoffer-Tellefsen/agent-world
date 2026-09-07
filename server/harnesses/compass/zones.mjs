/**
 * Zone map — derived at scan time, never hardcoded (U12, SPEC.md §4.11).
 *
 * Pure: a substrate snapshot in, the world's shape out.
 *   planet  = one per WORLD_COMPANIES.companies[] entry (the home planet = colony.json, every other
 *             planet its own data/colony.<key>.json); wears companies[].world_pack (absent → the default)
 *   town    = one per Active ops_clients row, on the company whose clients list names it, else the home;
 *             wears ops_clients.world_branding.pack when that column exists and is set, else its planet's
 *   campus  = the home planet's centre — the zone for runs with no client
 *   place() = where a run goes, by its client and nothing else (Annex III: never by actor)
 *
 * A company with substrate null is an empty planet: its name, "no substrate yet", no reads.
 * No company or client name lives here — they all arrive in the snapshot.
 */
export const DEFAULT_PACK = 'tellefsen-campus'
const KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/i
const str = (v) => (typeof v === 'string' ? v.trim() : '')
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null)

export function deriveWorld(substrate, { campus = 'HQ', tenant = 'home', defaultPack = DEFAULT_PACK } = {}) {
  const wc = obj(substrate?.world_companies)
  let companies = (Array.isArray(wc?.companies) ? wc.companies : []).filter((c) => obj(c) && KEY.test(str(c.key)))
  if (!companies.length) companies = [{ key: tenant, name: '', role: 'home', status: 'active', clients: [], substrate: {}, world_pack: '' }]

  const homeKey = str(wc?.home) && companies.some((c) => c.key === wc.home) ? wc.home : (companies.find((c) => str(c.role) === 'home') || companies[0]).key

  const planets = companies.map((c) => ({
    key: c.key,
    name: str(c.name) || c.key,
    role: str(c.role),
    status: str(c.status),
    home: c.key === homeKey,
    pack: str(c.world_pack) || defaultPack,
    hasSubstrate: obj(c.substrate) != null,
    colonyFile: c.key === homeKey ? 'data/colony.json' : `data/colony.${c.key}.json`,
    claims: Array.isArray(c.clients) ? c.clients.map(str).filter(Boolean) : [],
  }))
  const home = planets.find((p) => p.home)

  const planetFor = (client) => planets.find((p) => p.claims.includes(client.name) || (client.id && p.claims.includes(client.id))) || home

  const towns = new Map()
  for (const c of substrate?.clients || []) {
    if (!obj(c) || !str(c.name) || !/^active$/i.test(str(c.status))) continue
    const name = str(c.name)
    if (towns.has(name)) continue
    const planet = planetFor({ name, id: str(c.id) })
    const own = str(obj(c.world_branding)?.pack)
    towns.set(name, { name, id: str(c.id), planet: planet.key, pack: own || planet.pack, ownPack: Boolean(own) })
  }

  const campusZone = { name: campus, planet: homeKey, pack: home.pack }

  /** Where a run lives: its client's town, else the campus; an unknown client gets a plot on the home planet. */
  function place(clientName) {
    const name = str(clientName)
    if (!name) return { zone: campusZone.name, planet: homeKey, pack: home.pack, town: false }
    const t = towns.get(name)
    if (t) return { zone: t.name, planet: t.planet, pack: t.pack, town: true }
    return { zone: name, planet: homeKey, pack: home.pack, town: false }
  }

  return {
    home: homeKey,
    planets: planets.map(({ claims, ...p }) => p),
    towns: [...towns.values()],
    campus: campusZone,
    place,
  }
}

/** The JSON shape the sidecar hands the overlay — no functions, no tokens. */
export function worldDescriptor(world, viewer, at = new Date().toISOString()) {
  return {
    at,
    viewer: { tenant: viewer.tenant, preset: viewer.preset, scope: viewer.scope, capabilities: [...viewer.capabilities], pack: viewer.pack },
    home: world.home,
    planets: world.planets,
    towns: world.towns,
    campus: world.campus,
  }
}
