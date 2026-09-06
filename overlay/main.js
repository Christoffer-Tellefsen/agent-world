// overlay/main.js — Agent World selection panel (U11).
//
// The first overlay module, per the seam Decision (2026-09-06): mounted from index.html, reads
// the handle main.js already exposes (window.botCrossing → threads, colony.astronauts.selected),
// touches nothing under src/, writes nothing anywhere. Bot Crossing's own card stays as the
// pointer beside the figure; this panel is the explanation — the run, its zone, its state, and
// for a pending gate the gate's name and exactly what the human must do, in full. It also blocks
// the A (hide) key on a figure that is waiting on you: a ? is cleared on its surface, not hidden.
//
// Everything it shows comes off the thread the adapter emitted — the panel has no opinions.

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
#aw-panel{position:fixed;left:84px;bottom:18px;width:min(580px,calc(100vw - 460px));z-index:40;
  font:13px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#e6e9ef;background:rgba(12,14,18,.94);
  border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:14px 16px 12px;backdrop-filter:blur(10px);
  box-shadow:0 12px 40px rgba(0,0,0,.5);display:none}
#aw-panel.on{display:block}
#aw-panel .h{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:6px}
#aw-panel .skill{font-size:16px;font-weight:600}
#aw-panel .zone{opacity:.7;font-weight:400;margin-left:8px}
#aw-panel .id{opacity:.45;font-family:ui-monospace,Menlo,monospace;font-size:11px;white-space:nowrap}
#aw-panel .chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
#aw-panel .chip{display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;background:rgba(255,255,255,.08)}
#aw-panel .chip.wait{background:#1a2b46;color:#8fb4ee}
#aw-panel .chip.work{background:#16301f;color:#7fd39a}
#aw-panel .chip.block{background:#3a1a1a;color:#f28b8b}
#aw-panel .do{margin:8px 0 10px;padding:10px 12px;border-left:3px solid #8fb4ee;background:rgba(143,180,238,.08);border-radius:6px}
#aw-panel .do.err{border-left-color:#f28b8b;background:rgba(242,139,139,.08)}
#aw-panel .do b{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.7;margin-bottom:4px}
#aw-panel a.ctx{color:#8fb4ee;font-size:12px;margin-right:12px;text-decoration:none;opacity:.85}
#aw-panel a.ctx:hover{text-decoration:underline}
#aw-panel .do .gate{font-weight:600;margin-bottom:2px}
#aw-panel .note{opacity:.75;margin:6px 0 8px}
#aw-panel .row{display:flex;justify-content:space-between;align-items:center;gap:10px}
#aw-panel .hint{opacity:.5;font-size:11px}
#aw-panel button{font:inherit;border:0;border-radius:8px;padding:7px 13px;cursor:pointer;background:#e05a2b;color:#fff}
#aw-panel button:disabled{opacity:.35;cursor:default}
#aw-toast{position:fixed;left:50%;bottom:140px;transform:translateX(-50%);background:#1a2b46;color:#cfe0ff;
  padding:9px 15px;border-radius:10px;font:13px system-ui,sans-serif;z-index:41;opacity:0;transition:opacity .2s;pointer-events:none}
#aw-toast.on{opacity:1}
`

const style = document.createElement('style')
style.textContent = css
document.head.appendChild(style)

const panel = document.createElement('div')
panel.id = 'aw-panel'
document.body.appendChild(panel)

const toastEl = document.createElement('div')
toastEl.id = 'aw-toast'
document.body.appendChild(toastEl)
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

  const chips = [
    `<span class="chip ${CHIP[status] || ''}">${esc(LABEL[status] || status)}</span>`,
    thread.source ? `<span class="chip">${esc(thread.source)}</span>` : '',
    thread.model ? `<span class="chip">${esc(shortModel(thread.model))}</span>` : '',
    `<span class="chip">${esc(ago(thread.lastActivityAt))}</span>`,
    progressOf(thread.sizeBytes) > 0.051 ? `<span class="chip">${Math.round(progressOf(thread.sizeBytes) * 100)} % of milestones</span>` : '',
  ].join('')

  const doBlock = gate
    ? `<div class="do"><b>${thread.unread ? 'What it wants from you' : 'Waiting — not yours to tap'}</b>
         <div class="gate">${esc(gate)}</div>
         <div>${esc(instruction || thread.gitBranch || '')}</div></div>`
    : thread.hasError
      ? `<div class="do err"><b>What happened</b><div>${esc(preview || 'This run failed. Nothing in a surface is waiting on you.')}</div></div>`
      : preview && preview !== `${thread.source} run`
        ? `<div class="note">${esc(preview)}</div>`
        : ''

  panel.innerHTML = `
    <div class="h"><div><span class="skill">${esc(skill || 'Untitled run')}</span><span class="zone">${esc(thread.project || '')}</span></div>
      <span class="id">run ${esc(String(thread.id).slice(0, 8))}</span></div>
    <div class="chips">${chips}</div>
    ${doBlock}
    <div class="row"><span class="hint">Enter opens · N flies to the next ? · ${thread.unread ? 'A is blocked on a waiting run' : 'A hides from this view only'}</span>
      <span>${thread.ref?.context ? `<a class="ctx" href="${esc(thread.ref.context)}" target="_blank" rel="noopener">Context ↗</a>` : ''}<button id="aw-open" ${url ? '' : 'disabled'}>${esc(openLabel(url))}</button></span></div>`
  panel.classList.add('on')
  panel.querySelector('#aw-open')?.addEventListener('click', () => {
    if (url) window.open(url, '_blank', 'noopener')
  })
}

// Poll the handle rather than hook main.js: no src/ edits, and 4×/s is nothing.
let lastKey = ''
setInterval(() => {
  const sel = selection()
  const key = sel ? [sel.agent.id, sel.agent.status, sel.thread.title, sel.thread.gitBranch, sel.thread.unread, sel.thread.lastActivityAt].join('|') : ''
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
