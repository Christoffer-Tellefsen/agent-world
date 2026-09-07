// overlay/archive.mjs — the archive shelf's presentation (U32, ES-6.7). Pure; node runs it under npm test.
// A shelf per client and per venture (the home shelf last), six sections newest first, each row with the Open
// buttons its links earn (Open PDF / Open in Notion / Open in Drive) — never a write affordance. A project's
// Archive tab is the same shelf scoped to the project, plus its milestones.

export const SECTIONS = Object.freeze([
  ['deliverables', 'Deliverables', 'every registered artifact in the ledger window'],
  ['sentDocuments', 'Sent Documents', 'the Deliverables rows at Status "Sent to Client"'],
  ['decisions', 'Settled Decisions', 'Status Active'],
  ['research', 'Research briefs', ''],
  ['integrations', 'Integration pages', ''],
  ['fieldMappings', 'Field Mappings', ''],
])

const str = (v) => (typeof v === 'string' ? v : '')
export const when = (at) => (at ? new Date(at).toISOString().slice(0, 10) : '')

/** One shelf → its sections: [{ key, title, sub, rows: [{ text, small, value, open: [{label, url}] }], note }]. */
export function shelfSections(shelf) {
  if (!shelf) return []
  return SECTIONS.map(([key, title, sub]) => {
    const rows = (shelf[key] || []).map((r) => ({
      text: str(r.title) || str(r.ref) || '(untitled)',
      small: [r.kind === 'deliverable' ? (r.type ? [r.type, r.status].filter(Boolean).join(' · ') : [r.skill, r.system].filter(Boolean).join(' · ')) : [r.type, r.status, r.integrationTitle].filter(Boolean).join(' · '), r.confidence].filter(Boolean).join(' · '),
      value: when(r.at),
      open: Array.isArray(r.open) ? r.open : [],
      reference: Boolean(r.ref) && !(r.open || []).length,
    }))
    const skipped = shelf.skipped?.[key] || ''
    return { key, title, sub, rows, note: skipped || (rows.length ? '' : 'nothing on this shelf') }
  })
}

/** The project tab: the shelf sections scoped to the project, then its milestones. */
export function projectTab(entry) {
  if (!entry) return { sections: [], milestones: [] }
  const sections = shelfSections(entry).filter((s) => s.rows.length || s.note.startsWith('SKIPPED'))
  const milestones = (entry.milestones || []).map((m) => ({ text: m.name, small: m.status, value: m.committed ? when(m.committed) : '', done: Boolean(m.done), url: m.url || '' }))
  return { sections, milestones }
}

/** The pure invariant: no shelf row carries anything but reads and Open links. */
export const shelfHasWrite = (sections) => (sections || []).some((s) => (s.rows || []).some((r) => r.button || r.editable || r.onSubmit || (r.open || []).some((o) => !/^Open/.test(o.label))))
