// overlay/rooms.mjs — the room panels' presentation (U31, ES-6.6). Pure: no DOM, no fetch — node runs it under
// npm test; overlay/main.js turns these row models into HTML. Nothing here edits anything: every row is a
// read with, at most, an Open link. A panel that could not be read names its fix; a part the substrate does
// not give yet says SKIPPED and why.

const DAY_MS = 24 * 3600 * 1000
const str = (v) => (typeof v === 'string' ? v : '')
export const daysLabel = (days) => (days == null ? '—' : days === 0 ? 'today' : `${days} d`)
export const warmthLabel = (w) => (w >= 1 ? 'warm' : w >= 0.5 ? 'cooling' : 'cold')
/** An ISO timestamp as "YYYY-MM-DD HH:MM Z"; the input when it is not a date. */
export const stampOf = (iso) => { const t = Date.parse(str(iso)); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' Z' : str(iso) }
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
    case 'research-lab': {
      const d = new Date(now); const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` // local day, as the server's localDay
      const rows = (panel.rows || []).map((b) => ({ text: str(b.title) || '(untitled)', small: [b.type, b.status, b.handoff ? 'handoff ready' : ''].filter(Boolean).join(' · '), value: b.refreshDue ? `refresh ${b.refreshDue}` : '—', cls: b.due || (b.refreshDue && b.refreshDue < today) ? 'late' : '', url: link(b.url) }))
      return [{ title: `Briefs · ${rows.length}${panel.due ? ` · ${panel.due} due a refresh` : ''}`, sub: 'by "Refresh due", the due ones first', rows, note: sectionNote(panel, 'no brief') }]
    }
    case 'finance-office': {
      const bucket = (title, b) => ({ title: `${title} · ${b?.n || 0} · ${(b?.omr || 0).toLocaleString('en', { maximumFractionDigits: 0 })} OMR`, rows: (b?.rows || []).map((r) => ({ text: r.name, small: `${r.status}${r.due ? ' · due ' + r.due : ''}`, value: `${r.amount.toLocaleString('en')} ${r.currency}`, cls: /overdue/i.test(title) ? 'late' : '', url: link(r.url) })), note: sectionNote({ rows: b?.rows, error: panel.error }, 'none') })
      return [bucket('Unpaid', panel.unpaid), bucket('Overdue', panel.overdue), bucket('Paid', panel.paid), bucket(`This month · ${panel.month || ''}`, panel.thisMonth)]
    }
    case 'integration-yard': {
      const row = (i) => ({ text: i.title, small: [i.status, i.platform, i.direction && i.source && i.target ? `${i.source} ${i.direction.replace(/^[^→⇄]*/, '').trim() || '→'} ${i.target}` : ''].filter(Boolean).join(' · '), value: [i.drift, i.mappings != null ? `${i.mappings} mapping${i.mappings === 1 ? '' : 's'}` : '', i.lastDriftCheck ? `checked ${i.lastDriftCheck}` : ''].filter(Boolean).join(' · '), cls: /drift detected/i.test(str(i.drift)) ? 'late' : '', url: link(i.url) })
      return [
        { title: `Open drift findings · ${(panel.open || []).length}`, sub: '"Drift Status" = 🔴 Drift detected', rows: (panel.open || []).map(row), note: sectionNote({ rows: panel.open, skipped: panel.skipped, error: panel.error }, 'no open drift finding') },
        { title: `Integration pages · ${(panel.rows || []).length}${panel.unchecked ? ` · ${panel.unchecked} unchecked` : ''}`, rows: (panel.rows || []).map(row), note: panel.skipped || panel.error ? '' : sectionNote({ rows: panel.rows }, 'no integration page') },
      ]
    }
    case 'workshop': {
      const proj = (panel.projects || []).map((p) => { const due = p.next?.committed ? Math.round((p.next.committed - now) / DAY_MS) : null; return { text: p.name, small: `${p.internal ? 'internal' : p.clientName} · next: ${p.next ? p.next.name : p.total ? 'all milestones done' : 'no milestones yet'} · ${p.done}/${p.total} done`, value: due == null ? '' : due < 0 ? `${-due} d late` : due === 0 ? 'due today' : `in ${due} d`, cls: due != null && due < 0 ? 'late' : '', url: link(p.url) } })
      return [{ title: 'Active Build projects · next milestone', rows: proj, note: sectionNote({ rows: proj, error: panel.error }, 'no Active Build project') }, { title: 'Benches · Delivery skills', rows: skillRowsOf({ skills: panel.benches }).map((s) => ({ text: `${s.glyph} ${s.name}`, small: s.hint, value: s.type, cls: s.state, url: '' })), note: '' }]
    }
    case 'records-office':
      return [
        // substrate v2: no status on either table (none exists); connectors keyed by service; last fire only where a rollup names it
        { title: `Automations${(panel.automations?.rows || []).length ? ` · ${panel.automations.rows.length}` : ''} · last fire`, sub: panel.automations?.rows?.length ? 'ops_automations · next fire and missed: see the note' : '', rows: (panel.automations?.rows || []).map((a) => ({ text: a.name, small: [a.platform, a.trigger].filter(Boolean).join(' · '), value: a.lastFire ? `last ${stampOf(a.lastFire)}` : a.updated ? `row ${a.updated}` : '', url: '' })), note: sectionNote(panel.automations, 'no automation') || str(panel.automations?.missing) },
        { title: `Connectors${(panel.connectors?.rows || []).length ? ` · ${panel.connectors.rows.length}` : ''} · by service`, rows: (panel.connectors?.rows || []).map((c) => ({ text: c.service, small: c.via || '', value: c.updated ? `row ${c.updated}` : '', url: '' })), note: sectionNote(panel.connectors, 'no connector') },
        { title: `Silent skills · ${(panel.silent?.rows || []).length} of ${panel.silent?.of ?? '?'} silent 30 d`, rows: (panel.silent?.rows || []).map((s) => ({ text: `${s.dusty ? '◌ ' : ''}${s.name}`, small: s.dusty ? 'wanted — dusty' : 'silent', value: '', cls: s.dusty ? 'dusty' : '', url: '' })), note: sectionNote({ rows: panel.silent?.rows }, 'every Active skill ran in the last 30 days') },
        { title: 'Last twenty ledger runs', rows: (panel.runs || []).map((r) => ({ text: r.skill, small: `${r.client || 'no client'} · ${r.state}${r.gates ? ` · ${r.gates} gate${r.gates === 1 ? '' : 's'}` : ''}${r.artifacts ? ` · ${r.artifacts} artifact${r.artifacts === 1 ? '' : 's'}` : ''}`, value: r.at ? new Date(r.at).toLocaleString() : '', cls: r.state === 'failed' ? 'late' : '', url: '' })), note: sectionNote({ rows: panel.runs }, 'no run in the window') },
        { title: '🩺 System Health · the ! requests standing here', rows: (panel.health?.rows || []).map((h) => ({ text: h.title, small: 'open finding', value: h.at ? `${Math.max(0, Math.round((now - h.at) / DAY_MS))} d` : '', cls: 'late', url: link(h.url) })), note: sectionNote(panel.health, 'no open finding') },
      ]
    case 'corner-office': {
      const n = panel.numbers || {}
      // the four numbers: "not yet" until the first sweep writes LAST_RUN_GOVERNANCE (never zeros); the last gate reconciliation reads now
      const four = n.skipped ? [] : [['unattended share', n.unattendedShare], ['failure rate', n.failureRate], ['median time-to-tap', n.medianTimeToTap], ['open gates', n.openGates]].map(([k, v]) => ({ text: k, small: n.ready ? '' : 'not yet', value: n.ready ? (v == null ? '—' : String(v)) : 'not yet', cls: n.ready ? '' : 'stale', url: '' }))
      const rec = n.reconciliation
      const numbers = n.skipped ? [] : [...four, { text: 'last gate reconciliation', small: rec ? `${rec.gatesChecked} gate${rec.gatesChecked === 1 ? '' : 's'} checked · ${rec.resolved} resolved · ${rec.stillOpen} still open${rec.couldNotRead ? ` · ${rec.couldNotRead} unreadable` : ''}` : 'no reconciliation sweep has finished yet', value: rec?.at ? stampOf(rec.at) : '—', url: '' }]
      const numbersNote = n.skipped ? n.skipped : !n.ready ? n.notYet || 'not yet' : [n.governanceAt ? `sweep finished ${stampOf(n.governanceAt)}` : '', (n.unnamed || []).length ? `not carried by the rollup under an expected name: ${n.unnamed.join(', ')}` : ''].filter(Boolean).join(' · ')
      const heat = (panel.heat?.rows || []).map((r) => { const due = r.next?.committed ? Math.round((r.next.committed - now) / DAY_MS) : null; return { text: r.project, small: `${r.next ? r.next.name : r.total ? 'all done' : 'no milestones'} · ${r.done}/${r.total}`, value: due == null ? '' : due < 0 ? `${-due} d late` : `in ${due} d`, cls: due != null && due < 0 ? 'late' : '', url: link(r.url) } })
      return [
        { title: `In-tray · ${(panel.tray || []).length} request${(panel.tray || []).length === 1 ? '' : 's'}`, sub: 'the same list as I opens · N walks it', rows: (panel.tray || []).map((t) => ({ text: t.title, small: [t.skill, t.zone].filter(Boolean).join(' · '), value: t.at ? `${Math.max(0, Math.round((now - t.at) / DAY_MS))} d` : '', cls: t.badge === '!' ? 'late' : '', url: link(t.url) })), note: sectionNote({ rows: panel.tray }, 'nothing is waiting on you') },
        { title: "Today's Big 3", rows: (panel.big3?.rows || []).map((t) => ({ text: t.title, small: t.status, value: t.priority, url: link(t.url) })), note: sectionNote(panel.big3, 'no Big 3 set today') },
        { title: 'The four numbers · last Run Governance sweep', rows: numbers, note: numbersNote },
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
