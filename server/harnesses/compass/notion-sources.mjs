/**
 * Notion data sources the adapter may query (M2b B5). The one non-GET request the world makes is
 * POST /v1/data_sources/<id>/query — a read with a body (filter, sort, page size) — and only for an id
 * listed here. The write guard in test/invariants.test.mjs allows exactly that path for exactly these ids
 * and refuses every other POST, PUT, PATCH and DELETE (proven by a refused id in the test).
 *
 *   PROJECTS, DECISIONS  constants (allowed since U19)
 *   TASKS                resolved once from the Action Items database on the project page (GET
 *                        /v1/databases/<id> → data_sources[0].id); undefined until resolved, or when
 *                        the integration cannot see it
 *   CONTENT, RESEARCH, DELIVERABLES, INTEGRATIONS, FIELD_MAPPINGS, SYSTEM_HEALTH
 *                        the six NOTION_DS_* names in .env — absent → undefined, and the panel or
 *                        section that needs one is skipped (SKIPPED:ENV, names only), never guessed
 */
export const PROJECTS = '33dc0af9-c974-80e9-9d5d-000ba4bd72ea'
export const DECISIONS = 'f73d4f92-426c-4c11-990e-ae14403b4e28'
/** The Action Items database on the project page; its data source is resolved at runtime. */
export const TASKS_DATABASE = '373c0af9c97482b3a2cc01de75c1ba21'

export const ENV_NAMES = Object.freeze({
  CONTENT: 'NOTION_DS_CONTENT',
  RESEARCH: 'NOTION_DS_RESEARCH',
  DELIVERABLES: 'NOTION_DS_DELIVERABLES',
  INTEGRATIONS: 'NOTION_DS_INTEGRATIONS',
  FIELD_MAPPINGS: 'NOTION_DS_FIELD_MAPPINGS',
  SYSTEM_HEALTH: 'NOTION_DS_SYSTEM_HEALTH',
})

const ID = /^[0-9a-f]{32}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const clean = (v) => (typeof v === 'string' && ID.test(v.trim()) ? v.trim() : undefined)

/** The six env-named sources, read once from the environment. Absent or malformed → undefined. */
export function envSources(env = process.env) {
  const out = {}
  for (const [key, name] of Object.entries(ENV_NAMES)) out[key] = clean(env[name])
  return out
}
/** Which NOTION_DS_* names are missing — names only, never a value. */
export const missingEnvNames = (env = process.env) => Object.entries(ENV_NAMES).filter(([k]) => !envSources(env)[k]).map(([, name]) => name)

let tasks
/** Resolve the Tasks data source once from the Action Items database (GET). Undefined when unreadable. */
export async function resolveTasks(notionGet) {
  if (tasks !== undefined) return tasks
  try {
    const db = await notionGet(`databases/${TASKS_DATABASE}`)
    tasks = clean(db?.data_sources?.[0]?.id) || null
  } catch {
    tasks = null
  }
  return tasks
}
export const _resetTasks = () => (tasks = undefined)

/** Every id the adapter may query right now. */
export function allowedSources(env = process.env) {
  return { PROJECTS, DECISIONS, TASKS: tasks || undefined, ...envSources(env) }
}
/** Is this data source id one the adapter may query? */
export const isAllowed = (id, env = process.env) => Object.values(allowedSources(env)).some((v) => v && v.replace(/-/g, '') === String(id || '').replace(/-/g, ''))
