/**
 * Fold the events stream into runs. Pure: events in, Map<run_id, run> out. No I/O, no clock.
 *
 * Rules (SPEC.md §4.3):
 * - Group by run_id, oldest event first. Malformed rows are skipped, never thrown (a run being
 *   written right now is a normal thing to trip over).
 * - skill / trigger / client / project / actor come from run_started, else from the first event
 *   that carries them.
 * - Each gate_waiting opens a gate. A gate_passed closes the OLDEST open gate with the same
 *   surface and the same gate name or ref_url. An unmatched gate_passed is ignored.
 * - terminal = run_completed | run_failed | null.
 * - A run is kept only if it has a run_started, a gate, a terminal event, an artifact or a
 *   sub-agent — a lone unmatched gate_passed does not become a ghost astronaut.
 */
const TYPES = new Set(['run_started', 'gate_waiting', 'gate_passed', 'subagent_spawned', 'artifact_registered', 'run_completed', 'run_failed'])

/**
 * Tiebreak for events that share one timestamp. A gate pair written in a single batch lands
 * with the same `at`, and the stream's id order is random — seen live 2026-09-06: the smoke
 * run's gate_passed sorted ahead of its gate_waiting and left a phantom `?`. A gate must open
 * before it can close and a run must start before anything else, so rank by type within a
 * timestamp; everything else keeps its stable order.
 */
const RANK = { run_started: 0, gate_waiting: 1, subagent_spawned: 2, artifact_registered: 2, gate_passed: 3, run_completed: 4, run_failed: 4 }

const ms = (iso) => {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : 0
}
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
const str = (v) => (typeof v === 'string' ? v : '')

function blank(id) {
  return {
    id,
    skill: '',
    trigger: '',
    client: null,
    project: null,
    actor: '',
    runClass: '',
    started: false,
    startedAt: 0,
    lastAt: 0,
    gates: [],
    terminal: null,
    outcome: '',
    failReason: '',
    artifacts: [],
    subagents: [],
    events: 0,
  }
}

export function fold(events) {
  const runs = new Map()
  const sorted = [...(Array.isArray(events) ? events : [])]
    .filter((e) => e && typeof e === 'object' && str(e.run_id) && TYPES.has(e.event_type))
    .sort((a, b) => ms(a.at) - ms(b.at) || RANK[a.event_type] - RANK[b.event_type])

  for (const e of sorted) {
    const run = runs.get(e.run_id) || blank(e.run_id)
    runs.set(e.run_id, run)
    const at = ms(e.at)
    const payload = obj(e.payload)
    run.events += 1
    if (!run.startedAt || at < run.startedAt) run.startedAt = at
    if (at > run.lastAt) run.lastAt = at
    if (!run.skill && str(e.skill)) run.skill = e.skill
    if (!run.trigger && str(e.trigger)) run.trigger = e.trigger
    if (run.client == null && str(e.client)) run.client = e.client
    if (run.project == null && str(e.project)) run.project = e.project
    if (!run.actor && str(e.actor)) run.actor = e.actor

    switch (e.event_type) {
      case 'run_started':
        run.started = true
        run.startedAt = at || run.startedAt
        if (str(payload.run_class)) run.runClass = payload.run_class
        break
      case 'gate_waiting':
        run.gates.push({
          run_id: e.run_id,
          gate: str(payload.gate) || 'gate',
          surface: str(payload.surface) || 'class_b_gate',
          ref_url: str(payload.ref_url),
          at,
          passed: false,
          result: '',
          passedAt: 0,
        })
        break
      case 'gate_passed': {
        const g = run.gates.find(
          (x) =>
            !x.passed &&
            x.surface === (str(payload.surface) || x.surface) &&
            ((str(payload.gate) && x.gate === payload.gate) || (str(payload.ref_url) && x.ref_url === payload.ref_url))
        )
        if (g) {
          g.passed = true
          g.result = str(payload.result)
          g.passedAt = at
        }
        break
      }
      case 'subagent_spawned':
        run.subagents.push({ role: str(payload.role), model: str(payload.model), at })
        break
      case 'artifact_registered':
        if (str(payload.title) || str(payload.notion_url) || str(payload.drive_url)) {
          run.artifacts.push({ type: str(payload.type), title: str(payload.title), notion_url: str(payload.notion_url), drive_url: str(payload.drive_url), at })
        }
        break
      case 'run_completed':
        run.terminal = 'run_completed'
        run.outcome = str(payload.outcome)
        break
      case 'run_failed':
        run.terminal = 'run_failed'
        run.failReason = str(payload.reason)
        break
    }
  }

  for (const [id, run] of runs) {
    const real = run.started || run.gates.length || run.terminal || run.artifacts.length || run.subagents.length
    if (!real) runs.delete(id)
  }
  return runs
}

/** Gates still waiting on a human. */
export const openGates = (run) => run.gates.filter((g) => !g.passed)
