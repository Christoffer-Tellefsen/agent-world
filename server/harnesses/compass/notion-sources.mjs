/**
 * Notion data sources the adapter may query (M2b B5). The one non-GET request the world makes is
 * POST /v1/data_sources/<id>/query — a read with a body (filter, sort, page size) — and only for an id
 * listed here. The write guard in test/invariants.test.mjs allows exactly that path for exactly these ids
 * and refuses every other POST, PUT, PATCH and DELETE (proven by a refused id in the test).
 *
 *   PROJECTS, DECISIONS  constants (allowed since U19)
 *   CONTENT, RESEARCH, DELIVERABLES, INTEGRATIONS, FIELD_MAPPINGS, SYSTEM_HEALTH, TASKS
 *                        the NOTION_DS_* names in .env — absent → undefined, and the panel or
 *                        section that needs one is skipped (SKIPPED:ENV, names only), never guessed.
 *                        TASKS is the ✅ Tasks data source (2026-09-07: the Action Items block on the
 *                        project page is a linked view and exposes no data source to the integration).
 *                        Sent Documents is not a source of its own: the archive reads DELIVERABLES at
 *                        Status "Sent to Client" (2026-09-07 — there is no Sent Documents database).
 *   A name that is set but unreadable (Notion 404: the database is not shared with the integration)
 *   is reported by name on the panel or shelf that needs it; nothing is retried faster than the cache.
 */
export const PROJECTS = '33dc0af9-c974-80e9-9d5d-000ba4bd72ea'
export const DECISIONS = 'f73d4f92-426c-4c11-990e-ae14403b4e28'

export const ENV_NAMES = Object.freeze({
  CONTENT: 'NOTION_DS_CONTENT',
  RESEARCH: 'NOTION_DS_RESEARCH',
  DELIVERABLES: 'NOTION_DS_DELIVERABLES',
  INTEGRATIONS: 'NOTION_DS_INTEGRATIONS',
  FIELD_MAPPINGS: 'NOTION_DS_FIELD_MAPPINGS',
  SYSTEM_HEALTH: 'NOTION_DS_SYSTEM_HEALTH',
  TASKS: 'NOTION_DS_TASKS',
})

const ID = /^[0-9a-f]{32}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const clean = (v) => (typeof v === 'string' && ID.test(v.trim()) ? v.trim() : undefined)

/** The seven env-named sources, read once from the environment. Absent or malformed → undefined. */
export function envSources(env = process.env) {
  const out = {}
  for (const [key, name] of Object.entries(ENV_NAMES)) out[key] = clean(env[name])
  return out
}
/** Which NOTION_DS_* names are missing — names only, never a value. */
export const missingEnvNames = (env = process.env) => Object.entries(ENV_NAMES).filter(([k]) => !envSources(env)[k]).map(([, name]) => name)

/** The note a panel or shelf carries for a name that is set but the integration cannot read (names only). */
export const unreadableNote = (key, err) => `SKIPPED:ENV — ${ENV_NAMES[key] || key} is set but unreadable: ${err?.message || err || 'unknown error'}`

/** Every id the adapter may query right now. */
export function allowedSources(env = process.env) {
  return { PROJECTS, DECISIONS, ...envSources(env) }
}
/** Is this data source id one the adapter may query? */
export const isAllowed = (id, env = process.env) => Object.values(allowedSources(env)).some((v) => v && v.replace(/-/g, '') === String(id || '').replace(/-/g, ''))
