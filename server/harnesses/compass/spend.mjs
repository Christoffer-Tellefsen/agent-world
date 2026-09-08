/**
 * Compass adapter — the spend read (U35, ES-4.13): GET /world/spend on the Worker (U35W), which prices every
 * ops_skill_runs row in a window against ops_config MODEL_PRICING and aggregates by client, skill, client×skill
 * and model. The world holds no token count, no price and no peg: this module fetches, whitelists the keys the
 * contract names (spec/world-spend.v1.json) and hands the object to the sidecar's GET /spend for the overlay to
 * fold through the pack's own room rule (overlay/spend.mjs). U36: estimates_version and the est objects on by_client
 * rows and totals ride through untouched — an estimate is read and shown on its own line, never summed here.
 *
 * Read only, cached 60 s per (window, include_test), and the last good answer survives a failed read (warned once
 * a minute) — the same discipline as the substrate read. With nothing ever read, `read()` returns EMPTY with the
 * error named, so a panel can say why its line is missing instead of printing zeros.
 *
 * Annex III: costs aggregate by client, skill and model only; the response carries no per-person field and this
 * module names none (npm test greps it).
 */
export const KEYS = Object.freeze(['at', 'window_days', 'pricing_version', 'pricing_verified', 'estimates_version', 'excluded_test_runs', 'display', 'totals', 'by_client', 'by_skill', 'by_client_skill', 'by_model'])
export const EMPTY = Object.freeze({ at: '', window_days: null, pricing_version: '', pricing_verified: '', estimates_version: '', excluded_test_runs: 0, display: null, totals: null, by_client: [], by_skill: [], by_client_skill: [], by_model: [], error: '' })

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null)
const arr = (v) => (Array.isArray(v) ? v.filter(obj) : [])

/** Only the keys the contract names ride through; anything else the Worker might add stays on the Worker. */
export function normalise(body) {
  const b = obj(body) || {}
  return {
    at: typeof b.at === 'string' ? b.at : '',
    window_days: Number.isInteger(b.window_days) || b.window_days === 'all' ? b.window_days : null,
    pricing_version: typeof b.pricing_version === 'string' ? b.pricing_version : '',
    pricing_verified: typeof b.pricing_verified === 'string' ? b.pricing_verified : '',
    estimates_version: typeof b.estimates_version === 'string' ? b.estimates_version : '', // U36: absent → no estimates
    excluded_test_runs: Number.isInteger(b.excluded_test_runs) ? b.excluded_test_runs : 0,
    display: obj(b.display),
    totals: obj(b.totals),
    by_client: arr(b.by_client),
    by_skill: arr(b.by_skill),
    by_client_skill: arr(b.by_client_skill),
    by_model: arr(b.by_model),
    error: '',
  }
}

/** A window the Worker accepts: an integer 1–365 or 'all'; anything else falls back to the default. */
export function windowParam(v, fallback = 30) {
  if (v === 'all') return 'all'
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 365 ? n : fallback
}

export function createSpend(cfg, { fetchImpl = globalThis.fetch, log = () => {}, now = Date.now } = {}) {
  const cache = new Map() // `${window}:${includeTest}` → { at, value }
  let warnedAt = 0

  async function read({ window, includeTest = false } = {}) {
    const w = windowParam(window, cfg.spendWindowDays || 30)
    const key = `${w}:${includeTest ? 1 : 0}`
    const have = cache.get(key)
    if (have?.value && now() - have.at < cfg.spendCacheMs) return have.value
    const query = `${encodeURIComponent(String(w))}${includeTest ? '&include_test=1' : ''}`
    try {
      const res = await fetchImpl(`${cfg.spendUrl}?window=${query}`, {
        headers: { Authorization: `Bearer ${cfg.eventsBearerToken}`, Accept: 'application/json' },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(`spend read ${res.status}${body?.error ? `: ${body.error}` : ''}`)
      }
      const value = normalise(await res.json())
      cache.set(key, { at: now(), value })
      log(`spend ${w}d${includeTest ? ' +test' : ''}: ${value.totals?.runs_total ?? '?'} runs, ${value.totals?.runs_metered ?? '?'} metered, ${value.by_client.length} clients, ${value.by_skill.length} skills`)
      return value
    } catch (err) {
      if (now() - warnedAt > 60_000) {
        warnedAt = now()
        console.warn('bot-crossing: compass — spend unavailable —', err?.message || err)
      }
      if (!have?.value) return { ...EMPTY, error: err?.message || String(err) }
      have.at = now() // keep the last good answer; try again after the cache period
      return have.value
    }
  }

  return { read, _cache: () => cache }
}
