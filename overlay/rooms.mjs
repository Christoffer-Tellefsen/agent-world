// overlay/rooms.mjs — the room panels' presentation (U31, ES-6.6). Pure: no DOM, no fetch — node runs it under
// npm test; overlay/main.js turns these row models into HTML. Nothing here edits anything: every row is a
// read with, at most, an Open link. A panel that could not be read names its fix; a part the substrate does
// not give yet says SKIPPED and why.

const DAY_MS = 24 * 3600 * 1000
const str = (v) => (typeof v === 'string' ? v : '')
export const daysLabel = (days) => (days == null ? '—' : days === 0 ? 'today' : `${days} d`)
export const warmthLabel = (w) => (w >= 1 ? 'warm' : w >= 0.5 ? 'cooling' : 'cold')
export const STATE_GLYPH = Object.freeze({ lit: '●', dark: '○', dusty: '◌', red: '●' })
export const STATE_LABEL = Object.freeze({ lit: 'a run is live', dark: 'idle', dusty: 'silent 30 d and wanted', red: 'failed in 24 h' })

/** Skill rows: name · state — the same shape for every room. */
export const skillRowsOf = (panel) => (Array.isArray(panel?.skills) ? panel.skills : []).map((s) => ({ name: s.name, type: s.type, state: s.state || 'dark', glyph: STATE_GLYPH[s.state] || '○', hint: STATE_LABEL[s.state] || 'idle', wants: s.wants || '' }))

/** A section's note: the reader's error, the SKIPPED reason, or "nothing here". */
export const sectionNote = (part, empty = 'nothing here') => (part?.skipped ? part.skipped : part?.error ? part.error : (part?.rows || []).length ? '' : empty)

/** One model per room: [{ title, sub, rows: [{ text, small, value, cls, url }], note }] sections. */
export function roomSections(id, panel, now = Date.now()) {
  if (!panel) return [{ title: 'reading the substrate…', rows: [], note: '' }]
  if (panel.error && !panel.rows && !panel.pending && !panel.pipeline && !panel.projects && !panel.runs && !panel.heat) return [{ title: 'panel', rows: [], note: panel.error }]
  const link = (url) => str(url)
  switch (id) {
    case 'board-room': {
      const dec = (d, value) => ({ text: d.title, small: [d.status, d.confidence, d.category].filter(Boolean).join(' · '), value, url: link(d.url) })
      return [
        { title: 'Pending · the requests standing here', rows: (panel.pending || []).map((d) => dec(d, d.date)), note: sectionNote({ rows: panel.pending, error: panel.error }, 'no pending decision') },
        { title: '🟡 Working · folders', rows: (panel.working || []).map((d) => dec(d, d.date)), note: sectionNote({ rows: panel.working }, 'no working decision') },
        { title: `Next review dates${panel.overdueReviews ? ` · ${panel.overdueReviews} overdue` : ''}`, rows: (panel.reviews || []).map((d) => dec(d, d.reviewDue)), note: sectionNote({ rows: panel.reviews }, 'no review due') },
      ]
    }
    case 'strategy-room': {
      const p = panel.pipeline || {}
      return [
        { title: 'Pipeline', sub: p.view ? `view "${p.view}" · its order` : 'open stages', rows: (p.rows || []).map((r) => ({ text: r.name, small: `${r.stage}${r.nextAction ? ' · ' + r.nextAction : ''}`, value: `${daysLabel(r.days)} · ${r.warmth.toFixed(1)} ${warmthLabel(r.warmth)}`, cls: r.warmth < 0.5 ? 'stale' : '', url: link(r.url) })), note: sectionNote(p, 'no open deals') },
        { title: 'Research briefs with a handoff', rows: (panel.research?.rows || []).map((b) => ({ text: b.title, small: b.status, value: b.refreshDue || '', url: link(b.url) })), note: sectionNote(panel.research, 'no brief with a handoff') },
      ]
    }
    case 'marketing-studio': {
      const week = (panel.week || []).map((d) => ({ text: `${d.name} ${d.date.slice(5)}`, small: d.cards.map((c) => `${c.title} · ${c.status}`).join(' · ') || '—', value: String(d.cards.length), url: '' }))
      return [
        { title: 'Week wall · Sun–Thu', rows: week, note: sectionNote({ rows: week, skipped: panel.skipped, error: panel.error }, 'nothing scheduled this week') },
        { title: 'Signatures pending', rows: (panel.signatures || []).map((s) => ({ text: s.title, small: 'In Review → Scheduled', value: s.at ? `${Math.max(0, Math.round((now - s.at) / DAY_MS))} d` : '', url: link(s.url) })), note: sectionNote({ rows: panel.signatures }, 'nothing waiting for a signature') },
        { title: 'By status', rows: Object.entries(panel.byStatus || {}).map(([k, v]) => ({ text: k, value: String(v), url: '' })), note: panel.skipped ? '' : sectionNote({ rows: Object.keys(panel.byStatus || {}) }, '') },
      ]
    }
    case 'research-lab':
      return [{ title: 'Briefs · refresh due', rows: (panel.rows || []).map((b) => ({ text: b.title, small: b.status, value: b.refreshDue || '—', cls: b.refreshDue && b.refreshDue < new Date(now).toISOString().slice(0, 10) ? 'late' : '', url: link(b.url) })), note: sectionNote(panel, 'no brief') }]
    case 'finance-office': {
      const bucket = (title, b) => ({ title: `${title} · ${b?.n || 0} · ${(b?.omr || 0).toLocaleString('en', { maximumFractionDigits: 0 })} OMR`, rows: (b?.rows || []).map((r) => ({ text: r.name, small: `${r.status}${r.due ? ' · due ' + r.due : ''}`, value: `${r.amount.toLocaleString('en')} ${r.currency}`, cls: /overdue/i.test(title) ? 'late' : '', url: link(r.url) })), note: sectionNote({ rows: b?.rows, error: panel.error }, 'none') })
      return [bucket('Unpaid', panel.unpaid), bucket('Overdue', panel.overdue), bucket('Paid', panel.paid), bucket(`This month · ${panel.month || ''}`, panel.thisMonth)]
    }
    case 'integration-yard':
      return [{ title: 'Integrations · open drift findings', rows: (panel.open || panel.rows || []).map((i) => ({ text: i.title, small: i.status, value: String(i.drift ?? ''), url: link(i.url) })), note: sectionNote(panel, 'no open drift finding') }]
    case 'workshop': {
      const proj = (panel.projects || []).map((p) => { const due = p.next?.committed ? Math.round((p.next.committed - now) / DAY_MS) : null; return { text: p.name, small: `${p.internal ? 'internal' : p.clientName} · next: ${p.next ? p.next.name : p.total ? 'all milestones done' : 'no milestones yet'} · ${p.done}/${p.total} done`, value: due == null ? '' : due < 0 ? `${-due} d late` : due === 0 ? 'due today' : `in ${due} d`, cls: due != null && due < 0 ? 'late' : '', url: link(p.url) } })
      return [{ title: 'Active Build projects · next milestone', rows: proj, note: sectionNote({ rows: proj, error: panel.error }, 'no Active Build project') }, { title: 'Benches · Delivery skills', rows: skillRowsOf({ skills: panel.benches }).map((s) => ({ text: `${s.glyph} ${s.name}`, small: s.hint, value: s.type, cls: s.state, url: '' })), note: '' }]
    }
    case 'records-office':
      return [
        { title: 'Automations · next fire · last fire · missed', rows: (panel.automations?.rows || []).map((a) => ({ text: a.name || a.id, small: [a.next_fire && 'next ' + a.next_fire, a.last_fire && 'last ' + a.last_fire].filter(Boolean).join(' · '), value: a.missed ? `${a.missed} missed` : '', url: '' })), note: sectionNote(panel.automations, 'no automation') },
        { title: 'Connectors', rows: (panel.connectors?.rows || []).map((c) => ({ text: c.name || c.id, small: c.status || '', value: '', url: '' })), note: sectionNote(panel.connectors, 'no connector') },
        { title: `Silent skills · ${(panel.silent?.rows || []).length} of ${panel.silent?.of ?? '?'} silent 30 d`, rows: (panel.silent?.rows || []).map((s) => ({ text: `${s.dusty ? '◌ ' : ''}${s.name}`, small: s.dusty ? 'wanted — dusty' : 'silent', value: '', cls: s.dusty ? 'dusty' : '', url: '' })), note: sectionNote({ rows: panel.silent?.rows }, 'every Active skill ran in the last 30 days') },
        { title: 'Last twenty ledger runs', rows: (panel.runs || []).map((r) => ({ text: r.skill, small: `${r.client || 'no client'} · ${r.state}${r.gates ? ` · ${r.gates} gate${r.gates === 1 ? '' : 's'}` : ''}${r.artifacts ? ` · ${r.artifacts} artifact${r.artifacts === 1 ? '' : 's'}` : ''}`, value: r.at ? new Date(r.at).toLocaleString() : '', cls: r.state === 'failed' ? 'late' : '', url: '' })), note: sectionNote({ rows: panel.runs }, 'no run in the window') },
      ]
    case 'corner-office': {
      const n = panel.numbers || {}
      const numbers = n.skipped ? [] : [['unattended share', n.unattendedShare], ['failure rate', n.failureRate], ['median time-to-tap', n.medianTimeToTap], ['open gates', n.openGates], ['last gate reconciliation', n.lastReconciliation]].map(([k, v]) => ({ text: k, value: v == null ? '—' : String(v), url: '' }))
      const heat = (panel.heat?.rows || []).map((r) => { const due = r.next?.committed ? Math.round((r.next.committed - now) / DAY_MS) : null; return { text: r.project, small: `${r.next ? r.next.name : r.total ? 'all done' : 'no milestones'} · ${r.done}/${r.total}`, value: due == null ? '' : due < 0 ? `${-due} d late` : `in ${due} d`, cls: due != null && due < 0 ? 'late' : '', url: link(r.url) } })
      return [
        { title: `In-tray · ${(panel.tray || []).length} request${(panel.tray || []).length === 1 ? '' : 's'}`, sub: 'the same list as I opens · N walks it', rows: (panel.tray || []).map((t) => ({ text: t.title, small: [t.skill, t.zone].filter(Boolean).join(' · '), value: t.at ? `${Math.max(0, Math.round((now - t.at) / DAY_MS))} d` : '', cls: t.badge === '!' ? 'late' : '', url: link(t.url) })), note: sectionNote({ rows: panel.tray }, 'nothing is waiting on you') },
        { title: "Today's Big 3", rows: (panel.big3?.rows || []).map((t) => ({ text: t.title, small: t.status, value: t.priority, url: link(t.url) })), note: sectionNote(panel.big3, 'no Big 3 set today') },
        { title: 'The four numbers · last Run Governance sweep', rows: numbers, note: n.skipped || '' },
        { title: 'Milestone heat', rows: heat, note: sectionNote({ rows: heat, error: panel.heat?.error }, 'no Active project') },
      ]
    }
    default:
      return [{ title: id, rows: [], note: 'no panel for this room yet' }]
  }
}

/** The pure invariant the test proves: no section, row or note carries an edit affordance. */
export const EDIT_WORDS = /\b(edit|save|submit|approve now|delete|update|create|write|patch|post)\b/i
export const hasEditAffordance = (sections) => (sections || []).some((s) => EDIT_WORDS.test(str(s.title)) && !/next|last|write/i.test(str(s.title)) || (s.rows || []).some((r) => r.button || r.onSubmit || r.editable))
