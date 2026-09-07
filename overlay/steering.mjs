// overlay/steering.mjs — the Steering Room's presentation (U19). Pure; node runs it under npm test.
// The facts arrive from the sidecar's GET /steering (three 5-minute caches, no write); nothing here edits.

const DAY_MS = 24 * 3600 * 1000

/** "12 d", "today", "—" */
export const daysLabel = (days) => (days == null ? '—' : days === 0 ? 'today' : `${days} d`)

/** Panel 1 rows, in the order the reader gave (enum, then longest-untouched). */
export const pipelineRows = (panel) =>
  (panel?.rows || []).map((r) => ({ id: r.id, name: r.name, stage: r.stage, days: r.days, daysLabel: daysLabel(r.days), url: r.url, nextAction: r.nextAction || '' }))

/** Panel 2 rows: project · next milestone · when. */
export function milestoneRows(panel, now = Date.now()) {
  return (panel?.rows || []).map((r) => {
    const due = r.next?.committed ? Math.round((r.next.committed - now) / DAY_MS) : null
    return {
      project: r.project,
      url: r.url,
      done: r.done,
      total: r.total,
      next: r.next ? r.next.name : r.total ? 'all milestones done' : 'no milestones yet',
      nextUrl: r.next?.url || '',
      due: due == null ? '' : due < 0 ? `${-due} d late` : due === 0 ? 'due today' : `in ${due} d`,
      late: due != null && due < 0,
    }
  })
}

/** Panel 3 rows: title · status · confidence · date. */
export const decisionRows = (panel) => (panel?.rows || []).map((r) => ({ title: r.title, status: r.status, confidence: r.confidence, date: r.date, url: r.url }))

/** An empty panel names its fix: the reader's error, else "nothing here". */
export const panelNote = (panel, empty = 'nothing here') => (panel?.error ? panel.error : (panel?.rows || []).length ? '' : empty)
