// overlay/intray.mjs — the in-tray (U14): one list of every open ?, in the order N walks them.
// Pure: no DOM, no fetch — node runs it under npm test. The panel and the keys are in overlay/main.js.
//
// One data path. Rows come from the same threads the badges are drawn from (window.botCrossing.threads,
// the adapter's scan) — nothing is read twice, nothing is stored. A row is a thread whose figure wears
// a ? on the map, which is Bot Crossing's own precedence (src/game/colony.js statusFor): a failed run
// is ! not ?, a running one ⚒, then `unread` is the ?. Order (ES-4.4): badge precedence — every row is
// a ? — then the oldest open gate first (`gateAt` from the adapter), ties by run id. N takes the row
// after the selected one and wraps, so N and the list never disagree.

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** Bot Crossing's precedence for a `?`: the same first-match order as statusFor, minus the states a Compass run never has. */
export const wearsQuestion = (t) => Boolean(t && !t.hasError && !t.running && t.prState !== 'MERGED' && t.unread)

/** The rows, in N's order. */
export function intrayRows(threads) {
  const list = (Array.isArray(threads) ? threads : []).filter(wearsQuestion)
  return list
    .map((t) => {
      const [skill] = String(t.title || '').split(' · ')
      // The oldest gate the viewer can tap (the ? is theirs); a gate someone else must tap never sets the row's age.
      const all = Array.isArray(t.gates) ? t.gates : []
      const mine = all.filter((g) => g.canTap !== false)
      const gate = (mine.length ? mine : all).length ? [...(mine.length ? mine : all)].sort((a, b) => num(a.at) - num(b.at))[0] : null
      return {
        id: t.id,
        skill: skill || 'Untitled run',
        zone: t.project || '',
        gate: gate?.gate || String(t.title || '').split(' · ').slice(1).join(' · '),
        surface: gate?.surface || '',
        what: gate?.what || t.gitBranch || '',
        // the row's own gate's surface — a run can leave several gates and Open (U5) goes to the newest; a
        // session gate has no surface of its own, so it takes the run's link (the Claude Project or the terminal)
        url: (gate && gate.surface !== 'class_b_gate' && gate.ref_url) || t.ref?.url || '',
        // the oldest open gate; a thread whose adapter predates U14 falls back to its last activity
        at: num(gate?.at) || num(t.gateAt) || num(t.lastActivityAt),
        left: Array.isArray(t.gates) ? t.gates.length : 1,
      }
    })
    .sort((a, b) => a.at - b.at || String(a.id).localeCompare(String(b.id)))
}

/** The row N lands on: the one after `selectedId` in the list, wrapping; the first when nothing (or something else) is selected. */
export function nextRow(rows, selectedId) {
  if (!rows.length) return null
  const i = rows.findIndex((r) => r.id === selectedId)
  return rows[(i + 1) % rows.length]
}
