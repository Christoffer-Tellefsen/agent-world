/**
 * Signals (U17) — each one maps to exactly one defined fact, and nothing here reads a person.
 *
 *   trust      the skill's trust status under AUTO_RUN_POLICY (ES-4.7): skill_overrides first, else the
 *              run_classes lists (B_judge → human_gated, A → unattended_allowed), else the run's own
 *              run_class, else unknown. There is no ops_skills.class column; the Pack's wording is stale.
 *   stale      a skill Active in ops_skills with no ledger run in 30 days (the 30-day scan) → hand raised
 *   alert      a run_failed in the last 24 h whose skill has no later run_completed → ! on the campus flag
 *   check      a 🎯 Engagement Milestone flipped Done in the last 24 h → ✓ over that client's town
 *
 * Pure: policy, skills, runs in; facts out. Annex III: no actor, no edit level, no tokens, no model —
 * a signal is about a skill, a run or a client, never a person (npm test greps this file for it).
 */
export const DAY_MS = 24 * 3600 * 1000
export const STALE_DAYS = 30
export const RUN_MODES = ['human_gated', 'unattended_allowed', 'unknown']

const str = (v) => (typeof v === 'string' ? v.trim() : '')
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null)
const arr = (v) => (Array.isArray(v) ? v : [])

/** Class → mode when nothing names the skill. */
const CLASS_MODE = { B_judge: 'human_gated', A_gather_sync_check_propose: 'unattended_allowed' }

/** @returns { mode, source } — source says which rule decided, for the card. */
export function trustOf(skill, runClass, policy) {
  const p = obj(policy) || {}
  const name = str(skill)
  const entries = obj(obj(p.skill_overrides)?.entries) || {}
  if (name) {
    const hit = entries[name] || Object.entries(entries).find(([k]) => k.split(':')[0] === name)?.[1]
    const mode = str(obj(hit)?.run_mode)
    if (mode && RUN_MODES.includes(mode)) return { mode, source: 'skill_overrides' }
  }
  const classes = obj(p.run_classes) || {}
  for (const [cls, mode] of Object.entries(CLASS_MODE)) {
    const names = arr(obj(classes[cls])?.skills).map(str)
    if (name && names.some((n) => n === name || n.split(':')[0] === name)) return { mode: str(classes[cls].run_mode) || mode, source: `run_classes.${cls}` }
  }
  const own = str(runClass)
  if (CLASS_MODE[own]) return { mode: str(obj(classes[own])?.run_mode) || CLASS_MODE[own], source: 'run_class' }
  return { mode: 'unknown', source: 'none' }
}

/** Skills Active in ops_skills with no run in the window: the set that ran comes from the 30-day scan's events. */
export function staleSkills(skills, ranSkills) {
  const ran = ranSkills instanceof Set ? ranSkills : new Set(arr(ranSkills))
  return arr(skills)
    .filter((s) => obj(s) && str(s.name) && /^active$/i.test(str(s.status)) && !ran.has(str(s.name)))
    .map((s) => ({ id: str(s.id), name: str(s.name), type: str(s.type) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** The skills that ran: every event's skill in a scan (a run_started alone counts — the skill was invoked). */
export const ranSkillsOf = (events) => new Set(arr(events).map((e) => str(e?.skill)).filter(Boolean))

/**
 * ! on the campus flag: a run_failed inside 24 h with no run_completed for the same skill after it.
 * @param runs Map<run_id, run> from fold(): terminal, lastAt, skill
 */
export function campusAlert(runs, now = Date.now(), windowMs = DAY_MS) {
  const list = [...(runs?.values?.() || [])]
  const completedAfter = (skill, t) => list.some((r) => r.skill === skill && r.terminal === 'run_completed' && r.lastAt > t)
  return list
    .filter((r) => r.terminal === 'run_failed' && now - r.lastAt <= windowMs && !completedAfter(r.skill, r.lastAt))
    .map((r) => ({ run_id: r.id, skill: r.skill, at: r.lastAt, reason: r.failReason || '' }))
    .sort((a, b) => b.at - a.at)
}

/** Which Notion projects each client's runs name — the bridge from a town to its milestones (no per-client table needed). */
export function projectsByClient(runs) {
  const out = new Map()
  for (const r of runs?.values?.() || []) {
    if (!str(r.client) || !str(r.project)) continue
    if (!out.has(r.client)) out.set(r.client, new Set())
    out.get(r.client).add(r.project)
  }
  return out
}
