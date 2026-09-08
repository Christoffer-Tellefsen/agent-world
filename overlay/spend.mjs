// overlay/spend.mjs — spend per town and room (U35, ES-4.13). Pure: no DOM, no fetch — node runs it under npm test;
// overlay/main.js turns a place's bucket into the one line a town card or a room panel carries.
//
// The Worker's GET /world/spend (through the sidecar's /spend) prices ops_skill_runs against MODEL_PRICING and hands
// back rows by client, by skill and by client×skill. Nothing is counted here — the rows are folded into places:
//   town      the by_client row whose client is a town on the planet on screen
//   room      the by_skill rows — every client's — each through the pack's own roomForSkill (the rows carry
//             ops_skills.type): the same function that places a skill's agent in its home studio. A room's line is
//             what its skills spent wherever they ran (fixture Iota's skill, type Research, reads in the research lab).
//   campus    the "internal" client folded the same way — its by_client_skill rows into campusRooms — plus elsewhere:
//             what is on the home planet but in no town and no room (a client with no town anywhere — place() puts an
//             unknown client on the home planet; an internal row whose room the pack does not declare) — rendered,
//             never dropped. The home planet only; another planet has towns and nothing else.
//   planet    towns + campus
// The two identities the test proves, on cost_usd and runs_total: campusRooms + elsewhere = campus; towns + campus =
// planet. (rooms — every client's skills — is a second cut of the same runs, not a term of either identity.)
// Owner-only (Component 9): spendLineFor yields nothing — not a blank line — for any other viewer preset, and nothing
// under a pack whose spend.show is false (neutral). Never per person (Annex III): a bucket is a place, not anyone.
import { roomForSkill, roomsOf } from '../server/harnesses/compass/pack-rules.mjs'

export const COUNTERS = Object.freeze(['runs_total', 'runs_metered', 'runs_unmetered', 'runs_unpriced', 'tokens_in', 'tokens_out', 'tokens_unpriced', 'cost_usd'])
export const INTERNAL = 'internal'
const str = (v) => (typeof v === 'string' ? v.trim() : '')
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** An empty bucket — every counter the Worker's buckets carry, at zero. */
export const bucket = () => Object.fromEntries(COUNTERS.map((k) => [k, 0]))
/** into += row, counter by counter (cost_usd kept to 4 dp, as the Worker keeps it). */
export function add(into, row) {
  for (const k of COUNTERS) into[k] = k === 'cost_usd' ? round4(into[k] + num(row?.[k])) : into[k] + num(row?.[k])
  return into
}
export const round4 = (n) => Math.round(n * 1e4) / 1e4
export const sum = (list) => [...list].reduce((acc, b) => add(acc, b), bucket())

/**
 * Fold the Worker's object into the places of one planet.
 * @param body    the sidecar's /spend (GET /world/spend)
 * @param pack    the World Pack the planet wears (its rooms and skills rule)
 * @param towns   world.towns — [{ name, planet }]
 * @param planet  the planet key on screen; home — the home planet's key (the campus lives there)
 */
export function foldSpend(body, { pack, towns = [], planet = '', home = '' } = {}) {
  const rooms = new Map(roomsOf(pack).map((r) => [r.id, bucket()]))
  const campusRooms = new Map(roomsOf(pack).map((r) => [r.id, bucket()]))
  const elsewhere = bucket()
  const townBuckets = new Map()
  const townPlanet = new Map((Array.isArray(towns) ? towns : []).filter((t) => str(t?.name)).map((t) => [str(t.name), str(t.planet)]))
  const onHome = !home || planet === home
  for (const row of Array.isArray(body?.by_client) ? body.by_client : []) {
    const client = str(row?.client)
    if (townPlanet.has(client)) {
      if (townPlanet.get(client) === planet) townBuckets.set(client, add(bucket(), row))
    } else if (client !== INTERNAL && onHome) add(elsewhere, row) // no town anywhere: the home planet, outside every room
  }
  if (onHome) {
    for (const row of Array.isArray(body?.by_skill) ? body.by_skill : []) {
      const { room } = roomForSkill(pack, row?.skill, row?.type)
      add(rooms.get(room) || rooms.get(roomsOf(pack)[0]?.id) || elsewhere, row)
    }
    for (const row of Array.isArray(body?.by_client_skill) ? body.by_client_skill : []) {
      if (str(row?.client) !== INTERNAL) continue
      const { room } = roomForSkill(pack, row.skill, row.type)
      add(campusRooms.get(room) || elsewhere, row)
    }
  }
  const campus = add(sum(campusRooms.values()), elsewhere)
  const planetBucket = add(sum(townBuckets.values()), campus)
  return {
    window: body?.window_days ?? null,
    display: body?.display && typeof body.display === 'object' ? body.display : null,
    totals: body?.totals && typeof body.totals === 'object' ? body.totals : null,
    at: str(body?.at),
    error: str(body?.error),
    onHome,
    towns: townBuckets,
    rooms,
    campusRooms,
    elsewhere,
    campus,
    planet: planetBucket,
  }
}

/** The two identities the test proves, on cost_usd and runs_total: campusRooms + elsewhere = campus; towns + campus = planet. */
export function reconcile(fold) {
  const eq = (a, b) => Math.abs(a - b) < 1e-6
  const rooms = add(sum(fold.campusRooms.values()), fold.elsewhere)
  const towns = add(sum(fold.towns.values()), fold.campus)
  return {
    roomsPlusElsewhereIsCampus: eq(rooms.cost_usd, fold.campus.cost_usd) && rooms.runs_total === fold.campus.runs_total,
    townsPlusCampusIsPlanet: eq(towns.cost_usd, fold.planet.cost_usd) && towns.runs_total === fold.planet.runs_total,
  }
}

// ── numbers ───────────────────────────────────────────────────────────────────────────────────

/** 84k, 1.2M, 327k, 9.5k — integers below a thousand. */
export function compact(n) {
  const v = num(n)
  const a = Math.abs(v)
  const trim = (s) => s.replace(/\.0$/, '')
  if (a < 1000) return String(Math.round(v))
  if (a < 10_000) return `${trim((v / 1e3).toFixed(1))}k`
  if (a < 1e6) return `${Math.round(v / 1e3)}k`
  if (a < 10e6) return `${trim((v / 1e6).toFixed(1))}M`
  return `${Math.round(v / 1e6)}M`
}
/** A cost that would print as zero while it is not gets two more places. */
const fixed = (v, d) => {
  const s = v.toFixed(d)
  return v > 0 && Number(s) === 0 ? v.toFixed(d + 2) : s
}
/**
 * $18.40 for USD. OMR multiplies by display.omr_per_usd from the response at display time — the world holds no
 * peg; without one in the response the line stays in dollars.
 */
export function money(usd, { currency = 'USD', omrPerUsd = null } = {}) {
  const v = num(usd)
  const peg = Number(omrPerUsd)
  if (currency === 'OMR' && Number.isFinite(peg) && peg > 0) return `${fixed(v * peg, 3)} OMR`
  return `$${fixed(v, 2)}`
}
export const windowLabel = (w) => (w === 'all' ? 'all' : `${Number.isFinite(Number(w)) && w !== null ? w : '?'}d`)

/**
 * The line: `Tokens {in+out} · {cost} · {window}d`, then `· {unmetered} of {total} runs unmetered` when unmetered > 0
 * and `· {unpriced} unpriced` when unpriced > 0. With runs_metered = 0 the cost reads "unmetered", never $0.
 */
export function spendLine(b, { window = null, currency = 'USD', omrPerUsd = null } = {}) {
  if (!b || typeof b !== 'object') return ''
  const tokens = num(b.tokens_in) + num(b.tokens_out)
  const cost = num(b.runs_metered) > 0 ? money(b.cost_usd, { currency, omrPerUsd }) : 'unmetered'
  let line = `Tokens ${compact(tokens)} · ${cost} · ${windowLabel(window)}`
  if (num(b.runs_unmetered) > 0) line += ` · ${num(b.runs_unmetered)} of ${num(b.runs_total)} runs unmetered`
  if (num(b.runs_unpriced) > 0) line += ` · ${num(b.runs_unpriced)} unpriced`
  return line
}

/** Owner-only, and only under a pack that shows spend (tellefsen-campus yes, neutral no). */
export const showSpend = (viewer, pack) => viewer?.preset === 'owner' && pack?.spend?.show === true

/** The line for a place under this viewer and pack — '' (nothing, not a blank line) when it is not shown. */
export function spendLineFor(b, { viewer, pack, fold } = {}) {
  if (!showSpend(viewer, pack) || !b) return ''
  return spendLine(b, { window: fold?.window ?? pack?.spend?.window_days ?? null, currency: str(pack?.spend?.currency) || 'USD', omrPerUsd: fold?.display?.omr_per_usd ?? null })
}

/** A plain object for the console handle and the checks (no Maps). */
export function summary(fold) {
  if (!fold) return null
  const plain = (m) => Object.fromEntries([...m.entries()])
  return { at: fold.at, window: fold.window, onHome: fold.onHome, towns: plain(fold.towns), rooms: plain(fold.rooms), campusRooms: plain(fold.campusRooms), elsewhere: fold.elsewhere, campus: fold.campus, planet: fold.planet, totals: fold.totals, reconciled: reconcile(fold), error: fold.error }
}
