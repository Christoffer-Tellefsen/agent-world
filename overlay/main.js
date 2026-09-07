// overlay/main.js — Agent World overlay: the selection panel (U11) and the ontology skin (U12).
//
// Per the seam Decision (2026-09-06): mounted from index.html, reads the handle main.js exposes
// (window.botCrossing → threads, colony, settings, hud), touches nothing under src/, writes nothing
// but a planet's own layout file through overlay/zones.mjs. Mounted BEFORE src/main.js so the fetch
// seam in zones.mjs is in place when the game's first poll goes out.
//
// U11 — the panel: the run, its zone, its state, and for a pending gate the gate's name and exactly
// what the human must do, in full; A is refused on a figure that is waiting on you.
// U13 — artifacts: the card lists what a run made (Open on a real link; a Compass reference is a
// label) and a speech bubble floats over the agent for a minute after a new one.
// U14 — the in-tray: every open ? as one list in N's order (oldest gate first); I toggles it, a row
// click flies to the figure, and N is taken over here so the key and the list can never disagree.
// U15 — Approve as a verb: on a tray row and on the card. Shows the instruction and the surface's name
// first, then opens the gate's surface (the same link Open uses). The row wears ⏳ until U6's cross-check
// clears the ? on a later poll; three polls without that and it is a ? again, "not seen yet". Nothing is
// written from here — the tap lands on the surface (Decision 2026-09-06; the write path is M3's /actions).
// U12 — the skin: the planet switcher (one planet per company from Compass), the pack the planet
// wears (skin, nouns, rooms), quiet towns (an Active client with no runs still gets its deck and
// name plate), and the empty planet ("no substrate yet"). Every name on screen arrives from the
// substrate through the adapter; none lives here or in a pack (npm test greps for them).
import { ready, getWorld, currentKey, currentPlanet, townsHere, isHome, switchTo } from './zones.mjs'
import { wear, pack, packOf, noun, roomFor } from './pack.mjs'
import { allocateCells, createLabel, Plot, PLOT_PALETTE, hashString } from '../src/world/plots.js'
import { artifactRows, BubbleTracker, newestArtifactAt } from './artifacts.mjs'
import { intrayRows, nextRow } from './intray.mjs'
import { ApproveTracker, approveIntent } from './approve.mjs'

const LABEL = {
  working: 'Working',
  waiting: 'Waiting on you',
  blocked: 'Blocked',
  celebrating: 'Shipped',
  idle: 'Idle',
  sleeping: 'Dormant',
  spawning: 'Arriving',
  leaving: 'Heading home',
}
const CHIP = { working: 'work', waiting: 'wait', blocked: 'block' }

const css = `
:root{--aw-accent:#e05a2b;--aw-ink:#e6e9ef;--aw-panel:rgba(12,14,18,.94);--aw-line:rgba(255,255,255,.1);--aw-wait:#8fb4ee;--aw-work:#7fd39a;--aw-block:#f28b8b;--aw-done:#e6c67f;--aw-quiet:#a9a8c0}
#aw-panel{position:fixed;left:84px;bottom:18px;width:min(580px,calc(100vw - 460px));z-index:40;
  font:13px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--aw-ink);background:var(--aw-panel);
  border:1px solid var(--aw-line);border-radius:14px;padding:14px 16px 12px;backdrop-filter:blur(10px);
  box-shadow:0 12px 40px rgba(0,0,0,.5);display:none}
#aw-panel.on{display:block}
#aw-panel .h{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:6px}
#aw-panel .skill{font-size:16px;font-weight:600}
#aw-panel .zone{opacity:.7;font-weight:400;margin-left:8px}
#aw-panel .id{opacity:.45;font-family:ui-monospace,Menlo,monospace;font-size:11px;white-space:nowrap}
#aw-panel .chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
#aw-panel .chip{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;background:rgba(255,255,255,.08)}
#aw-panel .chip.wait{background:color-mix(in srgb,var(--aw-wait) 22%,#000);color:var(--aw-wait)}
#aw-panel .chip.work{background:color-mix(in srgb,var(--aw-work) 22%,#000);color:var(--aw-work)}
#aw-panel .chip.block{background:color-mix(in srgb,var(--aw-block) 22%,#000);color:var(--aw-block)}
#aw-panel .chip.room{background:rgba(255,255,255,.05);color:var(--aw-quiet)}
#aw-panel .do{margin:8px 0 10px;padding:10px 12px;border-left:3px solid var(--aw-wait);background:color-mix(in srgb,var(--aw-wait) 8%,transparent);border-radius:6px}
#aw-panel .do.err{border-left-color:var(--aw-block);background:color-mix(in srgb,var(--aw-block) 8%,transparent)}
#aw-panel .do b{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.7;margin-bottom:4px}
#aw-panel a.ctx{color:var(--aw-wait);font-size:12px;margin-right:12px;text-decoration:none;opacity:.85}
#aw-panel a.ctx:hover{text-decoration:underline}
#aw-panel .do .gate{font-weight:600;margin-bottom:2px}
#aw-panel .note{opacity:.75;margin:6px 0 8px}
#aw-panel .row{display:flex;justify-content:space-between;align-items:center;gap:10px}
#aw-panel .arts{margin:6px 0 10px;border-top:1px solid var(--aw-line);padding-top:8px}
#aw-panel .arts b{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.7;margin-bottom:4px}
#aw-panel .art{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:3px 0}
#aw-panel .art .n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#aw-panel .art .sys{opacity:.55;font-size:11px;margin-left:8px}
#aw-panel .art .lbl{opacity:.5;font-size:11px;white-space:nowrap}
#aw-panel .art button{padding:3px 10px;font-size:12px;background:rgba(255,255,255,.1)}
#aw-panel .hint{opacity:.5;font-size:11px}
#aw-panel button{font:inherit;border:0;border-radius:8px;padding:7px 13px;cursor:pointer;background:var(--aw-accent);color:#fff}
#aw-panel button:disabled{opacity:.35;cursor:default}
#aw-toast{position:fixed;left:50%;bottom:140px;transform:translateX(-50%);background:color-mix(in srgb,var(--aw-wait) 22%,#000);color:var(--aw-ink);
  padding:9px 15px;border-radius:10px;font:13px system-ui,sans-serif;z-index:41;opacity:0;transition:opacity .2s;pointer-events:none}
#aw-toast.on{opacity:1}
#aw-tray{position:fixed;left:84px;top:14px;width:min(440px,calc(100vw - 460px));max-height:min(60vh,520px);overflow:auto;z-index:40;
  font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--aw-ink);background:var(--aw-panel);
  border:1px solid var(--aw-line);border-radius:14px;padding:10px 12px 8px;backdrop-filter:blur(10px);box-shadow:0 12px 40px rgba(0,0,0,.5);display:none}
#aw-tray.on{display:block}
#aw-tray .h{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px}
#aw-tray .h b{font-size:14px}
#aw-tray .h .hint{opacity:.5;font-size:11px}
#aw-tray .r{display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:9px;cursor:pointer;border:1px solid transparent}
#aw-tray .r:hover{background:rgba(255,255,255,.05)}
#aw-tray .r.sel{background:color-mix(in srgb,var(--aw-wait) 16%,transparent);border-color:color-mix(in srgb,var(--aw-wait) 40%,transparent)}
#aw-tray .r .q{width:22px;height:22px;border-radius:6px;background:#1a2b46;color:var(--aw-wait);font-weight:700;display:grid;place-items:center;flex:none}
#aw-tray .r .m{flex:1;min-width:0}
#aw-tray .r .s{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#aw-tray .r .g{opacity:.7;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#aw-tray .r .z{opacity:.5;font-size:11px}
#aw-tray .r .age{opacity:.55;font-size:11px;white-space:nowrap}
#aw-tray .empty{opacity:.6;padding:6px 8px}
#aw-tray .r button,#aw-panel button.ok{font:inherit;font-size:12px;border:0;border-radius:8px;padding:4px 10px;cursor:pointer;background:rgba(255,255,255,.1);color:var(--aw-ink);flex:none}
#aw-tray .r .q.wait{background:color-mix(in srgb,var(--aw-done) 22%,#000);color:var(--aw-done)}
#aw-tray .r .ns{opacity:.6;font-size:11px;font-style:italic}
#aw-intent{position:fixed;left:50%;top:38%;transform:translate(-50%,-50%);z-index:42;width:min(520px,calc(100vw - 40px));display:none;
  font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--aw-ink);background:var(--aw-panel);border:1px solid var(--aw-line);
  border-radius:16px;padding:18px 22px 16px;backdrop-filter:blur(10px);box-shadow:0 12px 40px rgba(0,0,0,.5)}
#aw-intent.on{display:block}
#aw-intent b{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.7;margin-bottom:4px}
#aw-intent .sf{font-weight:600;margin-bottom:8px}
#aw-intent .row{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
#aw-intent button{font:inherit;border:0;border-radius:8px;padding:7px 13px;cursor:pointer;background:var(--aw-accent);color:#fff}
#aw-intent button.ghost{background:rgba(255,255,255,.1);color:var(--aw-ink)}
#aw-planets{position:fixed;top:14px;right:14px;z-index:40;display:none;align-items:center;gap:6px;padding:6px 8px;
  font:12px system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--aw-ink);background:var(--aw-panel);border:1px solid var(--aw-line);
  border-radius:999px;backdrop-filter:blur(10px);box-shadow:0 8px 30px rgba(0,0,0,.45)}
#aw-planets.on{display:flex}
#aw-planets .k{opacity:.55;margin:0 4px 0 6px;text-transform:uppercase;letter-spacing:.08em;font-size:10px}
#aw-planets button{font:inherit;border:0;border-radius:999px;padding:4px 11px;cursor:pointer;background:rgba(255,255,255,.07);color:var(--aw-ink)}
#aw-planets button[aria-pressed="true"]{background:var(--aw-accent);color:#fff}
#aw-planets button.empty{opacity:.7}
#aw-planets .pack{opacity:.5;margin-left:4px;padding-right:4px;font-size:11px}
#aw-empty{position:fixed;left:50%;top:42%;transform:translate(-50%,-50%);z-index:39;text-align:center;display:none;
  font:14px system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--aw-ink);background:var(--aw-panel);border:1px solid var(--aw-line);
  border-radius:16px;padding:22px 30px;backdrop-filter:blur(10px);box-shadow:0 12px 40px rgba(0,0,0,.5)}
#aw-empty.on{display:block}
#aw-empty .name{font-size:22px;font-weight:600;margin-bottom:4px}
#aw-empty .sub{opacity:.65}
`

const style = document.createElement('style')
style.textContent = css
document.head.appendChild(style)

const el = (id) => {
  const d = document.createElement('div')
  d.id = id
  document.body.appendChild(d)
  return d
}
const panel = el('aw-panel')
const tray = el('aw-tray')
const intent = el('aw-intent')
const toastEl = el('aw-toast')
const switcher = el('aw-planets')
const empty = el('aw-empty')

let toastTimer = 0
function toast(text) {
  toastEl.textContent = text
  toastEl.classList.add('on')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastEl.classList.remove('on'), 3200)
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const ago = (ms) => {
  const s = Math.max(0, (Date.now() - (ms || 0)) / 1000)
  if (s < 90) return `${Math.round(s)}s ago`
  const m = s / 60
  if (m < 90) return `${Math.round(m)}m ago`
  const h = m / 60
  if (h < 36) return `${Math.round(h)}h ago`
  return `${Math.round(h / 24)}d ago`
}
const shortModel = (m) => String(m || '').replace(/^claude-/, '')
/** The adapter encodes milestone progress as sizeBytes = 10^(3 + 3.5·p); this is the exact inverse. */
const progressOf = (bytes) => Math.max(0, Math.min(1, (Math.log10(Math.max(1, Number(bytes) || 1)) - 3) / 3.5))
const openLabel = (url) => (!url ? 'Nothing to open' : /airtable\.com/.test(url) ? 'Open in Airtable' : /notion\.(com|so)/.test(url) ? 'Open in Notion' : /claude\.ai/.test(url) ? 'Open the Claude Project' : 'Open')

/** The thread for the selected figure — the live one from the roster, else the agent's own copy. */
function selection() {
  const bc = window.botCrossing
  const agent = bc?.colony?.astronauts?.selected
  if (!agent) return null
  const thread = (bc.threads || []).find((t) => t.id === agent.id) || agent.thread
  return thread ? { agent, thread } : null
}

/** What the zone is called in the thread's pack: the campus centre, a town, or a plot with no town yet. */
function zoneLabel(thread, p) {
  const world = getWorld()
  if (!world) return thread.project || ''
  if (thread.project === world.campus.name) return `${noun('centre', p)} · ${thread.project}`
  const town = world.towns.find((t) => t.name === thread.project)
  return `${town ? noun('town', p) : 'plot'} · ${thread.project || ''}`
}

function render(sel) {
  if (!sel) {
    panel.classList.remove('on')
    return
  }
  const { agent, thread } = sel
  const [skill, ...gateParts] = String(thread.title || '').split(' · ')
  const gate = gateParts.join(' · ')
  const status = agent.status || 'idle'
  const url = thread.ref?.url
  // The adapter puts "<gate> — <full instruction>" in preview while a gate is pending; the run's notes otherwise.
  const preview = String(thread.preview || '')
  const instruction = gate && preview.startsWith(gate + ' — ') ? preview.slice(gate.length + 3) : ''
  // A town that wears its own pack (world_branding.pack, carried on the thread) speaks it here: its nouns, its rooms.
  const p = packOf(thread.pack)
  const room = roomFor(skill, p)

  const chips = [
    `<span class="chip ${CHIP[status] || ''}">${esc(LABEL[status] || status)}</span>`,
    room ? `<span class="chip room" title="${esc(room.mirrors || '')}">${esc(noun('studio', p))} · ${esc(room.name)}</span>` : '',
    p.id !== pack().id ? `<span class="chip room" title="this ${esc(noun('town', p))} wears its own World Pack">${esc(p.id)}</span>` : '',
    thread.source ? `<span class="chip">${esc(thread.source)}</span>` : '',
    thread.model ? `<span class="chip">${esc(shortModel(thread.model))}</span>` : '',
    `<span class="chip">${esc(ago(thread.lastActivityAt))}</span>`,
    progressOf(thread.sizeBytes) > 0.051 ? `<span class="chip">${Math.round(progressOf(thread.sizeBytes) * 100)} % of milestones</span>` : '',
  ].join('')

  const cardRow = intrayRows([thread])[0] || null
  const aState = cardRow ? approvals.state(cardRow.id, cardRow.gate, cardRow.url) : ''
  const doBlock = gate
    ? `<div class="do"><b>${thread.unread ? (aState === '⏳' ? '⏳ Approved here — waiting for the surface to show it' : aState === 'not seen yet' ? 'What it wants from you · not seen yet on the surface' : 'What it wants from you') : 'Waiting — not yours to tap'}</b>
         <div class="gate">${esc(gate)}</div>
         <div>${esc(instruction || thread.gitBranch || '')}</div></div>`
    : thread.hasError
      ? `<div class="do err"><b>What happened</b><div>${esc(preview || 'This run failed. Nothing in a surface is waiting on you.')}</div></div>`
      : preview && preview !== `${thread.source} run`
        ? `<div class="note">${esc(preview)}</div>`
        : ''

  const arts = artifactRows(thread)
  const artBlock = arts.length
    ? `<div class="arts"><b>Artifacts · ${arts.length}</b>${arts
        .map(
          (r, i) =>
            `<div class="art"><span class="n" title="${esc(r.open || r.name)}">${esc(r.name)}<span class="sys">${esc(r.system)}</span></span>${
              r.open ? `<button data-art="${i}">Open</button>` : '<span class="lbl">reference · nothing to open</span>'
            }</div>`
        )
        .join('')}</div>`
    : ''
  panel.innerHTML = `
    <div class="h"><div><span class="skill">${esc(skill || 'Untitled run')}</span><span class="zone">${esc(zoneLabel(thread, p))}</span></div>
      <span class="id">${esc(noun('agent', p))} · run ${esc(String(thread.id).slice(0, 8))}</span></div>
    <div class="chips">${chips}</div>
    ${doBlock}
    ${artBlock}
    <div class="row"><span class="hint">Enter opens · N flies to the next ? · ${thread.unread ? 'A is blocked on a waiting run' : 'A hides from this view only'}</span>
      <span>${thread.ref?.context ? `<a class="ctx" href="${esc(thread.ref.context)}" target="_blank" rel="noopener">Context ↗</a>` : ''}${cardRow?.url ? '<button class="ok" id="aw-approve">Approve</button> ' : ''}<button id="aw-open" ${url ? '' : 'disabled'}>${esc(openLabel(url))}</button></span></div>`
  panel.classList.add('on')
  panel.querySelector('#aw-open')?.addEventListener('click', () => {
    if (url) window.open(url, '_blank', 'noopener')
  })
  panel.querySelector('#aw-approve')?.addEventListener('click', () => approve(cardRow))
  panel.querySelectorAll('button[data-art]').forEach((b) =>
    b.addEventListener('click', () => {
      const r = arts[Number(b.dataset.art)]
      if (r?.open) window.open(r.open, '_blank', 'noopener')
    })
  )
}

// Poll the handle rather than hook main.js: no src/ edits, and 4×/s is nothing.
let lastKey = ''
setInterval(() => {
  const sel = selection()
  const cr = sel ? intrayRows([sel.thread])[0] : null
  const key = sel ? [sel.agent.id, sel.agent.status, sel.thread.title, sel.thread.gitBranch, sel.thread.unread, sel.thread.lastActivityAt, (sel.thread.artifacts || []).length, newestArtifactAt(sel.thread), cr ? approvals.state(cr.id, cr.gate, cr.url) : ''].join('|') : ''
  syncQuietLabels()
  if (key === lastKey) return
  lastKey = key
  render(sel)
}, 250)

// Guard: A on a figure that is waiting on you. Capture phase runs before main.js's own handler;
// stopping propagation there means Bot Crossing never sees the key. Everything else passes through.
window.addEventListener(
  'keydown',
  (e) => {
    if (e.key !== 'a' && e.key !== 'A') return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const t = e.target
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return
    const sel = selection()
    if (!sel?.thread?.unread) return
    e.stopPropagation()
    e.preventDefault()
    toast('This run is waiting on you — clear its gate on its surface instead of hiding it')
  },
  true
)

// ── U14: the in-tray ─────────────────────────────────────────────────────────────────────────

let trayOpen = false
let lastTray = ''
const selectedId = () => window.botCrossing?.colony?.astronauts?.selected?.id || null
/** The rows N can land on: those with a figure on this planet's map (the roster caps at maxAgents). */
const trayRows = () => {
  const bc = window.botCrossing
  const byId = bc?.colony?.astronauts?.byId
  return intrayRows(bc?.threads || []).filter((r) => !byId || byId.has(r.id))
}

function renderTray(force = false) {
  if (!trayOpen) {
    tray.classList.remove('on')
    lastTray = ''
    return
  }
  const rows = trayRows()
  const sel = selectedId()
  const key = rows.map((r) => `${r.id}:${r.at}:${r.what}:${approvals.state(r.id, r.gate, r.url)}`).join('|') + '~' + sel
  if (!force && key === lastTray) return
  lastTray = key
  tray.innerHTML =
    `<div class="h"><b>In-tray · ${rows.length} waiting on you</b><span class="hint">N walks this list · I closes</span></div>` +
    (rows.length
      ? rows
          .map(
            (r) => `<div class="r${r.id === sel ? ' sel' : ''}" data-id="${esc(r.id)}"><span class="q${approvals.state(r.id, r.gate, r.url) === '⏳' ? ' wait' : ''}" title="${approvals.state(r.id, r.gate, r.url) === '⏳' ? 'waiting for the surface to show the tap' : 'waiting on you'}">${approvals.glyph(r.id, r.gate, r.url)}</span>
            <span class="m"><div class="s">${esc(r.skill)} <span class="z">· ${esc(r.zone)}</span></div>
            <div class="g">${esc(r.gate)}${r.left > 1 ? ` (${r.left} left)` : ''} — ${esc(r.what)}${approvals.state(r.id, r.gate, r.url) === 'not seen yet' ? ' <span class="ns">· not seen yet</span>' : ''}</div></span>
            <span class="age" title="oldest open gate">${esc(ago(r.at))}</span>${r.url ? `<button data-approve="${esc(r.id)}">Approve</button>` : ''}</div>`
          )
          .join('')
      : '<div class="empty">Nothing is waiting on you.</div>')
  tray.classList.add('on')
  tray.querySelectorAll('.r').forEach((row) =>
    row.addEventListener('click', () => {
      window.botCrossing?.hud?.actions?.focusThread?.(row.dataset.id)
      renderTray(true)
    })
  )
  tray.querySelectorAll('button[data-approve]').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      approve(rows.find((r) => r.id === b.dataset.approve))
    })
  )
}

// ── U15: Approve ─────────────────────────────────────────────────────────────────────────────
const approvals = new ApproveTracker()

/** Show the instruction and the surface's name; "Open the surface" takes the human there. No write, ever. */
function approve(row) {
  const it = approveIntent(row)
  if (!it) {
    toast('This gate has no surface to open')
    return
  }
  window.botCrossing?.hud?.actions?.focusThread?.(it.id)
  intent.innerHTML = `<b>Approve · ${esc(it.gate)}</b><div class="sf">${esc(it.surface)}</div><div>${esc(it.what)}</div>
    <div class="row"><button class="ghost" id="aw-intent-no">Not now</button><button id="aw-intent-go">Open the surface ↗</button></div>`
  intent.classList.add('on')
  intent.querySelector('#aw-intent-no').addEventListener('click', () => intent.classList.remove('on'))
  intent.querySelector('#aw-intent-go').addEventListener('click', () => {
    intent.classList.remove('on')
    approvals.mark(it.id, it.gate, it.url)
    window.open(it.url, '_blank', 'noopener')
    renderTray(true)
    lastKey = '' // the card re-renders with the ⏳
  })
}
// One tick per poll: the roster's own timestamp changes when a poll lands (threads are a new array each time).
let lastRosterRef = null
setInterval(() => {
  const bc = window.botCrossing
  if (!bc) return
  const ref = bc.threads
  if (ref === lastRosterRef) return
  lastRosterRef = ref
  approvals.update(intrayRows(ref || []), Date.now(), Date.now())
}, 250)
setInterval(() => renderTray(), 500)

// I toggles the tray; N is taken over: the row after the selected one, in the tray's order, wrapping.
window.addEventListener(
  'keydown',
  (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const t = e.target
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return
    if (e.key === 'i' || e.key === 'I') {
      trayOpen = !trayOpen
      renderTray(true)
      return
    }
    if (e.key !== 'n' && e.key !== 'N') return
    e.stopPropagation()
    e.preventDefault()
    const rows = trayRows()
    const row = nextRow(rows, selectedId())
    if (!row) {
      toast('Nobody is waiting on you right now')
      return
    }
    window.botCrossing?.hud?.actions?.focusThread?.(row.id)
    renderTray(true)
  },
  true
)

// ── U13: artifact bubbles ────────────────────────────────────────────────────────────────────
//
// A speech bubble over the agent whose run just left an artifact: a name plate (the same kind the
// zones wear) drawn above the badge, following the figure, for BUBBLE_MS after the artifact is new.
// Which agents bubble is decided in overlay/artifacts.mjs from the roster alone — no second data path.
const bubbles = new Map() // thread id → { mesh, title }
const tracker = new BubbleTracker()
let bubbleGroup = null
const BUBBLE_Y = 2.35 // the badge floats at 1.52 (src/agents/astronauts.js); the bubble sits above it

function syncBubbles() {
  const bc = window.botCrossing
  const colony = bc?.colony
  if (!colony?.scene || !colony.astronauts) return
  const THREE_GROUP = colony.plotGroup?.constructor
  if (!THREE_GROUP) return
  if (!bubbleGroup) {
    bubbleGroup = new THREE_GROUP()
    bubbleGroup.name = 'aw:bubbles'
    colony.scene.add(bubbleGroup)
  }
  const active = tracker.update(bc.threads || [])
  for (const [id, b] of bubbles) {
    if (active.has(id) && colony.astronauts.byId?.has(id)) continue
    bubbleGroup.remove(b.mesh)
    b.mesh.userData?.dispose?.()
    bubbles.delete(id)
  }
  for (const [id, info] of active) {
    if (bubbles.has(id) || !colony.astronauts.byId?.has(id)) continue
    const text = `💬 ${info.title.length > 34 ? info.title.slice(0, 33) + '…' : info.title}`
    try {
      const mesh = createLabel(text, getComputedStyle(document.documentElement).getPropertyValue('--aw-done').trim() || '#e6c67f')
      mesh.renderOrder = 9
      mesh.visible = true
      mesh.material.opacity = 0.95
      bubbleGroup.add(mesh)
      bubbles.set(id, { mesh, title: info.title })
    } catch (err) {
      console.warn('[world] bubble not drawn:', id, err?.message || err)
    }
  }
}
function followBubbles() {
  const colony = window.botCrossing?.colony
  if (colony?.astronauts && bubbles.size) {
    const show = Boolean(colony.uiVisible ?? true)
    for (const [id, b] of bubbles) {
      const agent = colony.astronauts.byId?.get(id)
      if (!agent) continue
      b.mesh.position.set(agent.pos.x, agent.pos.y + BUBBLE_Y, agent.pos.z)
      b.mesh.visible = show
    }
  }
  requestAnimationFrame(followBubbles)
}
requestAnimationFrame(followBubbles)
setInterval(syncBubbles, 1000)

// ── U12: planets, pack, quiet towns ───────────────────────────────────────────────────────────

/** The switcher: one button per company from Compass; the pressed one is the planet on screen. */
function renderSwitcher() {
  const world = getWorld()
  if (!world || world.planets.length < 1) return
  const here = currentPlanet()
  switcher.innerHTML =
    `<span class="k">${esc(noun('planet'))}</span>` +
    world.planets
      .map((p) => `<button data-key="${esc(p.key)}" aria-pressed="${p.key === currentKey()}" class="${p.hasSubstrate ? '' : 'empty'}" title="${esc(p.hasSubstrate ? `${p.role} · ${p.pack}` : 'no substrate yet')}">${esc(p.name)}</button>`)
      .join('') +
    `<span class="pack" title="World Pack this planet wears (from Compass)">${esc(here?.pack || '')}</span>`
  switcher.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => switchTo(b.dataset.key)))
  switcher.classList.add('on')
}

/** An empty planet: its name and "no substrate yet". No runs, no towns, no reads happened for it. */
function renderEmpty() {
  const here = currentPlanet()
  if (!here || here.hasSubstrate) {
    empty.classList.remove('on')
    return
  }
  empty.innerHTML = `<div class="name">${esc(here.name)}</div><div class="sub">no substrate yet</div>`
  empty.classList.add('on')
}

/**
 * Quiet towns — an Active client with no run in the window still is a town (ES-4.1). Bot Crossing
 * makes a plot only where a thread stands, so the overlay lays the deck and the name plate itself,
 * on cells its own allocator hands out around the plots that exist, and remembers the cells in the
 * colony's layout memory: the layout file carries them, and the day a run arrives for that client
 * the game's plot lands on the same ground and this one steps aside.
 */
const quiet = new Map() // town name → { plot, label, signature }
let quietGroup = null

/**
 * createLabel hands back a plate that is hidden until the colony fades it in, and the colony only
 * fades in plots of its own. A quiet town has nothing going on, so its name is the whole point:
 * the plate stays on, dimmer than a live zone's, and follows H (hide UI) and the labels setting.
 */
function syncQuietLabels() {
  if (!quiet.size) return
  const colony = window.botCrossing?.colony
  const show = Boolean(colony?.uiVisible ?? true) && (colony?.settings?.get?.('showLabels') ?? true)
  for (const { label } of quiet.values()) {
    label.material.opacity = show ? 0.85 : 0
    label.visible = show
  }
}
function syncQuietTowns() {
  const bc = window.botCrossing
  const colony = bc?.colony
  if (!colony?.plots || !colony.plotCells || !colony.scene) return
  const THREE_GROUP = colony.plotGroup?.constructor
  if (!THREE_GROUP) return
  if (!quietGroup) {
    quietGroup = new THREE_GROUP()
    quietGroup.name = 'aw:quiet-towns'
    colony.scene.add(quietGroup)
  }
  const towns = townsHere().map((t) => t.name).filter((name) => !colony.plots.has(name))
  const wanted = new Set(towns)

  // Towns that gained a real plot, or vanished from the substrate, give their ground back.
  for (const [name, entry] of quiet) {
    if (wanted.has(name)) continue
    quietGroup.remove(entry.plot.group, entry.label)
    entry.label.userData?.dispose?.()
    entry.plot.dispose?.()
    quiet.delete(name)
  }
  if (!towns.length) return

  // The same input Bot Crossing gives its allocator — each plot's live thread count, which the
  // allocator turns into cells — so every real plot keeps exactly its cells and the quiet towns
  // take the innermost ground that is genuinely free. (Passing cell counts here made the campus
  // look smaller than it is and put a quiet deck on a cell it already held.)
  const perProject = new Map()
  for (const t of colony.threads?.values?.() || []) perProject.set(t.project, (perProject.get(t.project) || 0) + 1)
  const projects = [...colony.plots.values()].map((p) => ({ id: p.name, size: Math.max(1, perProject.get(p.name) || 1) }))
  for (const name of towns) projects.push({ id: name, size: 1 })
  const layout = allocateCells(projects, colony.plotCells)
  for (const name of towns) {
    const cells = layout.get(name)
    if (!cells?.length) continue
    const signature = cells.map((c) => `${c.q},${c.r}`).join('/')
    const have = quiet.get(name)
    if (have?.signature === signature) continue
    if (have) {
      quietGroup.remove(have.plot.group, have.label)
      have.plot.dispose?.()
    }
    // Remembered in the colony's own layout memory, so the file learns it on the next save.
    colony.plotCells.set(name, cells.map((c) => ({ q: c.q, r: c.r })))
    for (const c of cells) colony.deckedCells?.add(`${c.q},${c.r}`)
    const accent = PLOT_PALETTE[hashString(name) % PLOT_PALETTE.length]
    try {
      const plot = new Plot({ id: `quiet:${name}`, name, index: colony.plots.size + quiet.size, cells, accent })
      const label = createLabel(name, accent)
      label.position.set(plot.labelAnchor.x, 3.2, plot.labelAnchor.z)
      quietGroup.add(plot.group, label)
      quiet.set(name, { plot, label, signature })
    } catch (err) {
      console.warn('[world] quiet town not drawn:', name, err?.message || err)
    }
  }
}

ready.then(() => {
  const here = currentPlanet()
  wear(here?.pack || getWorld()?.viewer?.pack || '')
  document.title = here ? `${here.name} · ${pack().title}` : document.title
  renderSwitcher()
  renderEmpty()
  if (!isHome() && here?.hasSubstrate) console.info(`[world] on ${here.name} — layout ${here.colonyFile}`)
  // Quiet towns follow the roster: after every poll the plots may have changed.
  let lastRoster = ''
  setInterval(() => {
    const bc = window.botCrossing
    if (!bc?.colony) return
    const key = `${(bc.threads || []).length}|${bc.colony.plots?.size || 0}|${townsHere().length}`
    if (key === lastRoster && quiet.size === townsHere().filter((t) => !bc.colony.plots.has(t.name)).length) return
    lastRoster = key
    syncQuietTowns()
  }, 1000)
})
