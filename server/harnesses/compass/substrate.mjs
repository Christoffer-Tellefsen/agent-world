/**
 * Compass adapter — the substrate read (U12): WORLD_COMPANIES, AUTO_RUN_POLICY, DEAL_PIPELINE_STAGES,
 * ops_clients (Active) and ops_skills, through the Worker's GET /world/substrate (U12W) over the
 * events bearer. No Supabase URL or key on this machine — the Worker owns that access.
 *
 * Read only, cached 60 s, and the last good answer survives a failed read (warned once a minute).
 * With nothing ever read, `read()` returns EMPTY and the world is a single home planet with no
 * towns — honest, and it costs nothing.
 */
export const EMPTY = Object.freeze({ at: '', world_companies: null, auto_run_policy: null, deal_pipeline_stages: [], clients: [], skills: [] })

const arr = (v) => (Array.isArray(v) ? v : [])
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null)

export function normalise(body) {
  const b = obj(body) || {}
  return {
    at: typeof b.at === 'string' ? b.at : '',
    world_companies: obj(b.world_companies),
    auto_run_policy: obj(b.auto_run_policy),
    deal_pipeline_stages: arr(b.deal_pipeline_stages).filter((s) => typeof s === 'string'),
    clients: arr(b.clients).filter(obj),
    skills: arr(b.skills).filter(obj),
  }
}

export function createSubstrate(cfg, { fetchImpl = globalThis.fetch, log = () => {}, now = Date.now } = {}) {
  let cache = { at: 0, value: null }
  let warnedAt = 0

  async function read() {
    if (cache.value && now() - cache.at < cfg.substrateCacheMs) return cache.value
    try {
      const res = await fetchImpl(cfg.substrateUrl, {
        headers: { Authorization: `Bearer ${cfg.eventsBearerToken}`, Accept: 'application/json' },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(`substrate read ${res.status}${body?.error ? `: ${body.error}` : ''}`)
      }
      const value = normalise(await res.json())
      cache = { at: now(), value }
      log(`substrate: ${value.clients.length} clients, ${value.skills.length} skills, ${(value.world_companies?.companies || []).length} companies`)
    } catch (err) {
      if (now() - warnedAt > 60_000) {
        warnedAt = now()
        console.warn('bot-crossing: compass — substrate unavailable —', err?.message || err)
      }
      if (!cache.value) return EMPTY
      cache.at = now() // keep the last good answer; try again after the cache period
    }
    return cache.value
  }

  return { read, _cache: () => cache }
}
