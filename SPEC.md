# SPEC — Agent World: M1 the mirror, running locally against Supabase, filmed (closed 2026-09-07) · M2 the world speaks Tellefsen's ontology (§3 O4)

Written 2026-09-06 by build-kickoff v1.3 from the Notion Project *Agent World — internal build over the Run Ledger*, the Reference Architecture *Agent World over the Run Ledger*, Compass `SKILL_RUN_LEDGER` (read live) and the Bot Crossing source at commit 87ec837. Commercial source: Notion Decision *Build a visual agent world over the Run Ledger* (Active, 2026-09-04) — this is an internal build, there is no SOW.

## 1. Frame

**Outcome (committed).** Phase 1 of the agent world running locally against Supabase and filmed: every governed run rendered from the Run Ledger and events stream (zone = client, thread = run, progress = milestones), every run waiting on a human shown as a `?`, N flies to the next one — and the renderer holds no state except the map layout.

**Hard constraints.**
- The world is a mirror. It holds no state except map layout; every rendered fact is read from Compass (Supabase), Notion or Airtable. It writes nothing to the substrate, ever.
- Zero tokens. No model call exists anywhere in the fork. Nothing in the world thinks.
- `src/` stays byte-identical to upstream. One adapter file (plus its helper folder) under `server/harnesses/` is the whole seam.
- Only states that want something from a human get a badge; silence is the feature.
- Annex III: `actor` draws an avatar, nothing else. No per-person rendering or aggregation.
- Local only at M1: `127.0.0.1:5274`, one user (Owner), service-role key in `.env`. Hosting, auth and RLS are M3.

**The one thing that must be true.** The adapter turns the events stream and the ledger into Bot Crossing's thread shape *truthfully*: the right run on the right plot with the right badge, within one poll of the substrate changing. If that holds, everything else in the phase is craft. It is built and verified first (U3).

## 2. Architecture

Three layers, truth flowing one way — no change from the Reference Architecture:

1. **Substrate (truth):** `ops_run_events` (live lifecycle, append-only) and `ops_skill_runs` (one row per run) in the Compass Supabase project; 🎯 Engagement Milestones and Decisions in Notion; Pending Approval in Airtable HQ.
2. **Ledger read proxy (U10):** `worker/ledger-read.mjs` in `tellefsen-compass-mcp` — `GET /ledger/scan?since=` returns `{events, rows}` using the Worker's own already-configured `SUPABASE_SERVICE_ROLE_KEY`, behind the same bearer token `/events` uses. Added because the Compass Supabase project is provisioned through Lovable, which does not expose a Supabase URL or service-role key outside Lovable itself — the local machine never holds one; it only needs the events bearer token it already needs for U2.
3. **Adapter:** `server/harnesses/compass.mjs` — the one file that knows Tellefsen's ontology. Reads the substrate (via U10, not Postgres directly), emits Bot Crossing threads. Read only.
4. **Renderer:** Bot Crossing unchanged (Three.js + Vite, KayKit CC0 assets). The browser polls `/api/threads` every 15 s, derives state with its own strict precedence (`hasError → running → prState → unread → sleeping → idle`) and draws.

Deviation from the Sovereign Stack, stated: a local viewer over an existing MIT codebase; the M3 hosting lands on the Sovereign pattern (Supabase Auth, RLS, Docker).

System of record: see `CLAUDE.md`. The world's only write is `data/colony.json` (plots + render settings).

## 3. End-states

### O1 — The mirror runs locally against Supabase
Anchor: Committed Outcomes row *CO-1 Mirror running locally against Supabase* (M1 acceptance criteria passing, 0/8 → 8/8).

- **ES-1.1** When done, the fork exists at `Christoffer-Tellefsen/agent-world` with remote `upstream` = jarrenrocks/bot-crossing, and `git diff upstream/main -- src/` is empty.
- **ES-1.2** When done, `server/harnesses/compass.mjs` is the only registered harness; `GET /api/harnesses` returns `compass` with `detected: true` when `EVENTS_URL` and `EVENTS_BEARER_TOKEN` are set, and `false` otherwise; the Claude Code adapter is unregistered.
- **ES-1.3** When done, every run with an event inside the window (`WORLD_WINDOW_DAYS`, default 14) renders as exactly one agent, on the plot named by its `client`, or on `Tellefsen HQ` when `client` is null.
- **ES-1.4** When done, badges follow the precedence table: `run_failed` → `!`; `run_started` with no terminal event, activity within `WORLD_RUNNING_TTL_HOURS` (default 2) **and no gate pending** → `⚒`; an open `gate_waiting` the viewer can tap → `?`; no event for 3+ days → asleep, no badge; anything else → idle, no badge. Any run with a pending gate is `?` — terminal (a Class A run that ended leaving a proposal, the core case) or live (a Class B run blocked on an in-session tap).
- **ES-1.5** When done, N flies to the next `?` and cycles; Enter/Open on a run opens, in the browser, the surface to tap (`payload.ref_url` of the newest open gate), else the newest registered artifact's Notion page, else — for chat and Claude Project runs — the Claude Project; a run with nothing to open greys the button with a message. A, C and new-session do nothing to the substrate (`canArchive: false`; `setArchived`/`newSession` return `ok: false` with a reason).
- **ES-1.6** When done, the run card's progress bar equals 🎯 Engagement Milestones *Done ÷ total* for the run's project (read from Notion by the `project` page id), floored at the renderer's 5 % minimum; runs without a project show the floor. (Physical building height is an M2 skin question.)
- **ES-1.7** When done, the map layout persists across reloads and `data/colony.json` contains only `plots`, `settings`, and the viewer's own hide list (`archived`/`archivedAt` — Bot Crossing's local archive, which its `A` shortcut can populate; viewer state, never substrate data). No run state beyond that, and the adapter never writes archive state back to the ledger.
- **ES-1.8** When done, a `?` disappears within one poll (≤ 15 s) of the tap landing on its surface — either `gate_passed` in the stream, or the surface itself showing it (Pending Approval `Status` Approved / Sent / Rejected; Decision `Status` moved on from Pending; Content `Status` moved on from In Review) — without the world writing anything.
- **ES-1.9** When done, the repository contains no call to a model API, and `npm test` proves it.
- **ES-1.10** When done, an insert into `ops_run_events` reaches the adapter's Realtime subscription within seconds and invalidates its cache, so the next browser poll reflects it (this also closes M0's undemonstrated check: Realtime delivery to a subscriber).
- **ES-1.13** When done, selecting a figure shows a panel (outside `src/`) with the run's skill, zone, state, source, model and time, and — for a pending gate — the gate's name and the full instruction of what the human must do; A on a waiting figure is refused with a message rather than hiding it. Pulled forward from M2 at Christoffer's request (2026-09-06).
- **ES-1.11** When done, a Pending Approval status change made through the Compass Worker (`airtable_update_record`, `table_key = pending_approval`, Status → Approved / Rejected / Sent) writes `gate_passed` for every open gate whose `ref_url` resolves to that record within seconds — so the ledger, not only the world, learns of the tap without waiting for the daily sweep. (Named as an M1 unit in `SKILL_RUN_LEDGER.write_protocol.late_taps` and `RUN_GOVERNANCE_RULES.late_tap_mapping.retires_when`. Lives in the `tellefsen-compass-mcp` repo, not this fork.)

### O2 — A first film exists
Anchor: *CO-2 First film exists* (none → one 30–60 s recording, filed).

- **ES-2.1** When done, a 30–60 s screen recording of the local world with real runs exists, showing: the campus and towns at rest; a run arriving; a `?`; N flying to it; Open landing on the surface; the `?` clearing after the tap. Filed to Drive and linked from the Project page's Sent Documents table as the first frozen artifact.

### O3 — The build is itself a governed run
Anchor: Project Success Criteria — *every skill run writes an `ops_skill_runs` row and `run_started` / `gate_waiting` / terminal events* — applied to `claude_code` runs, and *CO-3 Time-to-tap has a first measured baseline*.

- **ES-3.1** When done, every Claude Code session in this repo posts `run_started` (session start), `gate_waiting` (a permission prompt, surface `class_b_gate`), `gate_passed` (the prompt answered) and `run_completed` (session end) to `POST /events`, all sharing `run_id` = the session id, and the session writes its `ops_skill_runs` row at the end — so the developer appears on the Agent World plot while building, and a permission prompt shows as a `?` on that agent.


### O4 — The world speaks Tellefsen's ontology (M2)
Cut 2026-09-06 from Build Pack Part 2b; re-issued 2026-09-07 with what was decided after the cut folded in: World Packs (RA Component 10, Decision 2026-09-06), suit colour from `AUTO_RUN_POLICY` (there is no `ops_skills.class` column), `/ask` as a governed run, `parent_run_id` live on both write paths, the Worker read route `GET /world/substrate` (U12W). Present tense, observable, same rules as O1–O3. The three defaults taken at the cut were confirmed as Decisions on 2026-09-06 (Approve = deep-link, no write · sound in, voice out · sub-agents wait for `parent_run_id`).
A viewer recognises the firm, not Bot Crossing: clients are towns, companies are planets, artifacts appear where they land, and everything waiting on a human is reachable from one list. Still local. Still read-only against the substrate. The world stores nothing but layout.

- **ES-4.1** every Active client in Compass `ops_clients` renders as a named town on its company's planet; `Tellefsen HQ` is the campus centre; a client added to Compass appears as a town on the next restart with no code change; a town's rooms and nouns come from its World Pack — its company's `world_pack`, or `ops_clients.world_branding.pack` when that column exists and is set
- **ES-4.2** each company in Compass `WORLD_COMPANIES` is a planet — its own layout file `data/colony.<company>.json`, created on first render — reachable from a switcher and wearing the World Pack named by its `world_pack` (absent → `tellefsen-campus`); a company with `substrate: null` is an empty planet carrying its name and "no substrate yet", with no reads; a pack is presentation config — `overlay/packs/<id>/pack.json` declares skin (palette, KayKit asset set, lighting, sky, sound set, badge glyph art), rooms (each building and the substrate surface it mirrors, per the RA's Spatial grammar table), names (the nouns for world, town, building, studio, agent) and its layout file; two packs ship, `tellefsen-campus` and `neutral`; a pack names rooms, never clients; switching the home company's `world_pack` to `neutral` and restarting swaps skin, rooms and nouns with no code change; badge precedence, the surface each room mirrors, Annex III and the viewer presets are identical under every pack
- **ES-4.3** a `run_completed` carrying an artifact shows a bubble on its agent within one poll; the run card lists the artifacts; Open on an artifact lands on its Notion page or PDF; an artifact that is only a Compass reference shows as a label and is not openable
- **ES-4.4** the in-tray lists every open `?` in badge-precedence order, oldest first within a level; N and the in-tray never disagree; selecting a row flies to that agent
- **ES-4.5** Approve is a verb on the in-tray row and the card: it opens the gate's surface with the instruction text shown first; the row shows ⏳ until the next poll's surface cross-check (U6) sees the tap; the world writes nothing — the write path is M3's `/actions` (Decision 2026-09-06)
- **ES-4.6** the PA panel answers a question about any run, client or milestone from the substrate through Worker `POST /ask` (events bearer); every ask is a governed run of its own on the Worker — `run_started` and `run_completed` (or `run_failed`) with skill `agent-world-pa`, and its `ops_skill_runs` row (a run without a row is not a governed run); `npm test` still proves no model endpoint exists in the fork; nothing the PA does writes to a surface; the question and the answer never enter the ledger
- **ES-4.7** suit colour follows the skill's trust status under `AUTO_RUN_POLICY` — `skill_overrides` first, else membership of `run_classes.B_judge.skills` (human_gated) or `run_classes.A_gather_sync_check_propose.skills` (unattended_allowed), else the run's own `run_class` — read through `GET /world/substrate`; an agent whose skill is Active in `ops_skills` but has no ledger run in 30 days raises a hand; a `run_failed` in the last 24 h with no later `run_completed` for the same skill shows a `!` on the campus flag; a 🎯 Engagement Milestone flipped to Done in the last 24 h shows `✓` over its client's town
- **ES-4.8** a short local sound plays on a new `?` and on a new `!`, mutable with M; voice cues are out of M2 (Decision 2026-09-06; speech provider is an open question)
- **ES-4.9** a run whose `parent_run_id` is set renders as crew standing with its parent; a parent with children shows their count on its card; with no `parent_run_id` in the stream nothing changes (Decision 2026-09-06; the column and the Worker passthrough are live)
- **ES-4.10** the Steering Room on the campus shows three panels read from the substrate — Pipeline hot deals (Airtable), the milestone board (Notion), the last three Decisions (Notion) — each with a 5-minute cache and no write
- **ES-4.11** Pipeline rows that are neither Won nor Lost render as prospect plots on the campus edge, fading by days since last touch (full ≤ 7 d, half ≤ 30 d, ghost > 30 d); a row that goes Won becomes a town on the next poll; a row that goes Lost disappears
- **ES-4.12** a second 30–60 s film exists — town, bubble, in-tray, Approve, `✓` — filed to Drive and linked from Sent Documents

Invariants carried from O1: `src/` byte-identical to upstream; `data/colony*.json` the only writes; no model API in the fork; the adapter never writes to the substrate; Annex III — activity and blockers, never a person's performance.

Substrate reads at M2, all GET: ledger and events through `GET $EVENTS_URL/ledger/scan`; `WORLD_COMPANIES`, `AUTO_RUN_POLICY` (run_classes + skill_overrides), `DEAL_PIPELINE_STAGES`, Active `ops_clients` rows and `ops_skills` rows through `GET $EVENTS_URL/world/substrate` (U12W, live 2026-09-07, 60 s cache); Notion and Airtable with the tokens in `.env`. Never a Supabase URL or key on this machine.

## 4. The adapter — `server/harnesses/compass.mjs`

### 4.1 Files
```
server/harnesses/compass.mjs          the harness object (default export) — detect, scanThreads, openThread, newSession, setArchived
server/harnesses/compass/config.mjs   env → config with defaults; ledgerUrl derived from EVENTS_URL (no Supabase env needed)
server/harnesses/compass/supabase.mjs one call to the Worker's /ledger/scan (U10) → {events, rows}, over the events bearer token
server/harnesses/compass/fold.mjs     events[] → runs (one object per run_id): pure, testable
server/harnesses/compass/threads.mjs  run → Thread (the field map below, badge inputs, sizeBytes from progress, open URL): pure, testable
server/harnesses/compass/viewer.mjs   viewer context {tenant, preset, scope, capabilities, surfaces}; canTap(gate); canWriteLayout()
server/harnesses/compass/surfaces.mjs U4 milestones (Notion) and U6 gate cross-check (Airtable Pending Approval, Notion Decision); read only, cached
server/harnesses/index.mjs            `export const HARNESSES = [compass]` — the one registry line
test/invariants.test.mjs              src/ unchanged; no model endpoints; adapter never writes; registry = [compass]
test/adapter.test.mjs                 fold + threads against test/fixtures/events.zztest.json
```
`index.mjs` is the only upstream file touched, by one import and one line. No new dependency: plain `fetch` to the Worker, no `@supabase/supabase-js` needed on this machine.

### 4.2 The harness object
```js
export default {
  id: 'compass', name: 'Compass',
  detect,        // () => Promise<boolean>: EVENTS_URL && EVENTS_BEARER_TOKEN present (cheap; no network)
  scanThreads,   // () => Promise<Thread[]>: the cached scan below; throws are survivable (scan.mjs skips this harness for one poll)
  openThread,    // (ref) => ({ ok: true, url: ref.url }) | ({ ok: false, error: 'This run has no surface to open' })
  newSession,    // () => ({ ok: false, error: 'Runs start in Claude, Cowork or Claude Code — not from the world' })
  setArchived,   // () => Promise<{ ok: false, error: 'The world is a mirror; runs cannot be archived here' }>
  // appStartedAt omitted — no long-lived app
}
```

### 4.3 Data flow per scan (browser polls every 15 s; scan result cached 5 s)
1. `{events, rows} = GET /ledger/scan?since=<now - WINDOW>` on the Worker (U10), bearer-authenticated. The Worker does the Supabase paging server-side and already scopes `rows` to the run ids present in `events` — the local client makes one call, not two.
2. `runs = fold(events)` — group by `run_id`, sorted by `at`:
   - `skill`, `trigger`, `client`, `project`, `actor` from `run_started`, else from the first event carrying them.
   - `startedAt` = `run_started.at` (else first event); `lastAt` = max `at`.
   - `gates[]`: each `gate_waiting` → `{gate, surface, ref_url, at, passed: false}`; a `gate_passed` marks the oldest unpassed gate with the same `surface` and (`gate` or `ref_url`) as passed with `result`; an unmatched `gate_passed` is ignored.
   - `terminal` = `'run_completed'` | `'run_failed'` | `null`; `outcome` / `failReason` from its payload.
   - `artifacts[]` from `artifact_registered` payloads (`type`, `title`, `notion_url`, `drive_url`); `subagents[]` from `subagent_spawned` (M2 renders them; M1 keeps them).
3. `threads = runs.map(r => toThread(r, rowById[r.id], viewer, surfaces))` — the map in 4.4. (No local row cache: the Worker call above already returns exactly the rows this scan needs, every time.)
4. U4: `surfaces.progress(projectId)` → Notion milestones done ÷ total, cached 5 min per project. **Normalise the id first:** `project` arrives both dashed (`3d1c0af9-c974-81ce-…`) and undashed (`3d1c0af9c97481ce…`) in real rows (2026-09-06); strip dashes for the cache key and re-dash for the Notion API. U6: `surfaces.gateResolved(gate)` → cached 30 s per `ref_url`.

Errors: a substrate read that fails leaves the previous scan result in place and logs once per minute; a surface read that fails counts as *unresolved* (never hide a `?` on an error) and progress as the floor.

### 4.4 Thread field map (Bot Crossing `server/harnesses/README.md` is the contract)
| Thread field | Source |
|---|---|
| `id` | `run_id` (uuid — unique across harnesses by construction) |
| `title` | `skill`, plus ` · <gate>` while a gate is open |
| `preview` | open gate → `Waiting: <gate> (<surface>)`; else `notes` from the ledger row; else the newest artifact title; else `<trigger> run` |
| `project` | `client` ?? `'Tellefsen HQ'` |
| `projectPath`, `worktree`, `cwd`, `effort` | `''` (all runs share one empty path per zone, so `disambiguateProjects` never renames a zone) |
| `gitBranch` | **the human's next action while a gate is pending**, by surface — `approve or reject the row in Airtable` / `ratify or supersede the Decision in Notion` / `read and sign: In Review → Scheduled` / `answer in the session that opened it`; `''` otherwise. The renderer shows `gitBranch` as a plain tag on the card and never renders `preview`, so this is the card's only way to answer "what do you want me to do?" at M1. M2's in-tray replaces it. |
| `model` | ledger row `model`, else `''` |
| `createdAt` / `lastActivityAt` / `lastFocusedAt` | `startedAt` ms / `lastAt` ms / `0` |
| `running` | `terminal == null && now - lastAt < RUNNING_TTL && no gate pending` — **an open gate suspends ⚒**: a run blocked on a human is waiting, not working, and the renderer's precedence (⚒ before ?) would otherwise hide the one badge that wants you (seen live 2026-09-06). A run that started and went silent stops hammering after the TTL and shows idle; the Run Governance sweep owns orphan runs |
| `unread` | `gates.some(g => !g.passed && !resolvedOnSurface(g) && viewer.canTap(g))` |
| `hasError` | `terminal === 'run_failed'` |
| `prState` | `undefined` at M1 (`✓` for milestone closed / invoice paid is M2) |
| `archived` / `starred` / `routine` / `hasTranscript` | `false` |
| `sizeBytes` | `Math.round(10 ** (3 + 3.5 * p))` where `p = clamp(done / total, 0.05, 1)` — the exact inverse of the renderer's `transcriptProgress` so the card bar reads *done ÷ total*; no project → `p = 0.05` |
| `source` | `trigger` |
| `canOpen` | `openUrl != null` |
| `canArchive` | `false` |
| `ref` | `{ run_id, url: openUrl }` — small, serialisable, no secrets |

`openUrl`, first match, **links only** (`https?://`): newest open gate `ref_url` → newest artifact `notion_url` → first ledger artifact with a real link → `CLAUDE_PROJECT_URL` when `trigger ∈ {chat, claude_project}` → `null`. Ledger artifacts are often Compass references (`ops_config:KEY`, `ops_automations:<uuid>`) — seen in real data 2026-09-06 — and are never an Open target.

### 4.5 Milestone progress (U4)
`progress(projectId)`: normalise the id (the ledger carries both dashed and undashed) → `GET` the Notion project page → its `Milestones` relation (follow `has_more` via the property endpoint) → `GET` each milestone → count `Status` matching *Delivered / Done / Accepted / Complete* over the total; floor 0.05; 5-minute cache per project. **Needs the Projects database shared with the integration** as well as 🎯 Engagement Milestones — a 404 degrades to the floor with a warning that says so. All GETs; no query endpoint, so the adapter stays mechanically read-only.

### 4.5b Viewer context (Permission model, M1 slot)
`viewer.mjs` builds `{ tenant: WORLD_TENANT, preset: WORLD_VIEWER_PRESET, scope: 'campus', capabilities, surfaces }` from the preset table in the design (`owner` → all capabilities, all surfaces). `canTap(gate)` = `capabilities` includes `tap` and `surfaces` includes `gate.surface`. `canWriteLayout()` = capabilities includes `layout`. Both are consulted from day one so M3 swaps in an identity, not a design. No auth, no policy read at M1.

### 4.6 Surface cross-check (U6)
For each open gate: `surface = pending_approval` → parse base/table/record from `ref_url` (with or without a view segment), `GET` the Airtable row, resolved when `Status ∈ {Approved, Sent, Rejected}`; `surface = decision` → parse the Notion page id (any URL shape), `GET` the page, resolved when `Status` has moved on from Pending; `surface = content_status` → `GET` the Notion Content row, resolved when `Status` has moved on from In Review (**added 2026-09-06**: Christoffer signed a draft and the `?` stayed until the 20:00 poller — the poller owns the *write* of `gate_passed`; nothing stops the world *reading* the row); `class_b_gate` and `client_gate` → never cross-checked (no surface to read). A resolved gate is cached as resolved; an open one is re-read each scan (≈ once per 15 s poll). A failed read never hides a `?` — it warns once a minute and leaves the badge. The adapter never writes `gate_passed` — the sweep and the pollers do, later — and every request in `surfaces.mjs` is a GET (`npm test` proves it).

### 4.7 Realtime nudge (U7) — deferred
Originally a direct `supabase.channel(...).on('postgres_changes', ...)` subscription from this machine. **Blocked by the same constraint as U10's whole reason for existing**: a client-side Realtime subscription needs a Supabase key on this machine, which Lovable-Cloud-managed projects don't expose. The 5 s scan cache + 15 s browser poll is the transport and was always documented as sufficient on its own (SPEC.md §6, §8) — U7 is deferred, not required for M1 acceptance. Revisit if the Worker ever gains a way to push (e.g. a webhook it calls on insert), or once Supabase access is sorted out some other way.

### 4.8 Worker ledger-read proxy (U10 — in `tellefsen-compass-mcp`, not this fork)
`worker/ledger-read.mjs`, delivered alongside this pack, drops into `tellefsen-compass-mcp` — see `worker/WIRING.md` for the one-line router integration and curl smoke tests. `GET /ledger/scan?since=<ISO8601>` → `{events, rows}`, same bearer auth as `/events`, SELECT only, never returns the Supabase key. This is what makes U3 possible without Supabase access on this machine — **deploy this before seeding ZZTEST or expecting real data in the world.**

### 4.9 Selection panel overlay (U11 — `overlay/main.js`)
The first overlay module, exactly per the seam Decision: mounted from `index.html` after `src/main.js`, polls `window.botCrossing` (4×/s) for `colony.astronauts.selected` and the matching thread, and renders a fixed panel bottom-left. It shows only what the thread carries: `title` split on ` · ` into skill and gate, `project` as zone, `agent.status`, `source`, `model`, `lastActivityAt`, `ref.url` (Open, labelled by destination), and `preview` — which the adapter fills with `<gate> — <full instruction>` while a gate is pending, or the run's notes otherwise. Bot Crossing's own card keeps the short `gitBranch` tag. A capture-phase keydown listener refuses A on a run with `unread` (toast), so a `?` cannot be hidden from view; A on any other run is left to Bot Crossing's local hide. Nothing under `src/` changes; `npm test` proves it; `vite build` bundles the overlay.

### 4.10 Worker write-gate (U9 — in `tellefsen-compass-mcp`, not this fork)
In `airtable_update_record`, after a successful PATCH on `table_key = pending_approval` where the merged `Status` is Approved, Rejected or Sent: find open `gate_waiting` events (no matching `gate_passed`, same `run_id` + `payload.gate`) with `surface = pending_approval` whose `ref_url` contains the record id; for each, insert `gate_passed {gate, surface, ref_url, result: approved|rejected (Sent → approved), at_source: 'worker'}` with `actor` = the caller handle if known else `worker`, and patch the ledger row per `RUN_GOVERNANCE_RULES.late_tap_mapping.ledger_patch`. Idempotent: never a second `gate_passed` for a closed gate; the sweep already skips closed gates. `at_source` gains the value `worker` — Compass key first (`RUN_GOVERNANCE_RULES.late_tap_mapping.gate_passed_at`), then code. Airtable-UI taps stay with the sweep (U6 keeps the world truthful for those).

### 4.11 World Packs and the ontology skin (U12 — re-cut 2026-09-07, pack-driven)
U12 — World Packs and the ontology skin. A pack is presentation config: overlay/packs/<id>/pack.json declares the skin (palette, KayKit asset set, lighting, sky, sound set, badge glyph art), the rooms (each building and the substrate surface it mirrors, per the RA's Spatial grammar table), the names (the nouns for world, town, building, studio, agent) and the layout file it uses. Two packs ship: tellefsen-campus (the Spatial grammar table — campus with solution studio, research lab, content studio, finance office, integration yard, board room, corner office; nouns campus / town / building / studio / agent) and neutral (grayscale, generic nouns, no Tellefsen name anywhere). Selection is read live, never stored: a planet wears WORLD_COMPANIES.companies[].world_pack (absent → tellefsen-campus); a town wears ops_clients.world_branding.pack when that column exists and is set, else its company's pack. pack rides in the viewer context beside tenant, preset, scope and capabilities. Zones are derived at scan time: one planet per company (its own colony file, created on first render), one town per Active ops_clients row on the company whose clients list names it, else the home planet; substrate null → an empty planet with its name and 'no substrate yet' and no reads. A pack names rooms, never clients; the client-name grep covers overlay/packs/** too. Badge precedence, the surface each room mirrors, Annex III and the viewer presets are identical under every pack.

**As built (2026-09-07).** The substrate arrives through `server/harnesses/compass/substrate.mjs` (GET `/world/substrate`, events bearer, 60 s cache, last-good on failure); `zones.mjs` derives planets, towns, the campus and `place(client)` from it at scan time — pure, no name in it. Each thread carries `planet` and `pack`; `viewer.pack` is set per scan. Bot Crossing's API knows one layout file and no planets, and `server/api.mjs` is never edited, so the adapter serves a loopback sidecar beside the world (`overlay-api.mjs`, port `WORLD_OVERLAY_PORT`, default 5275; Host and Origin checked like the API): `GET /world` hands the overlay the planets, towns, campus and viewer (names and pack ids, never a token); `GET|PUT /planets/<key>/state` is a non-home planet's own `data/colony.<key>.json`, created on first read. `overlay/zones.mjs` is mounted before `src/main.js` and wraps `window.fetch`: `/api/threads` only ever carries the planet on screen, and a non-home planet's `/api/state` goes to the sidecar — `data/colony.json` stays the home planet's file exactly as upstream wrote it. The planet on screen is this browser's choice (`localStorage`), like the hide list; the server holds nothing. Quiet towns: Bot Crossing lays a plot only where a thread stands, so an Active client with no run in the window gets its deck and name plate from `overlay/main.js`, on cells Bot Crossing's own allocator hands out, remembered in the colony's layout memory so the layout file carries them and a later run lands on the same ground. Packs are static JSON (`overlay/packs/README.md` is the schema); `overlay/pack.mjs` wears one — palette tokens for the overlay's surfaces, a CSS filter over the canvas (how `neutral` goes grayscale), and Bot Crossing's world style and time of day applied once per pack change so Tab and L still work. The last hardcoded name is the campus zone `Tellefsen HQ` in the adapter's `config.mjs` — the plot key every saved layout carries; the overlay and the packs carry none, and `npm test` greps them for the static names and, when the bearer is present, for every live client and company name.

## 5. The build's own hooks (U2)
`.claude/settings.json` + `.claude/hooks/ledger.sh` post to `POST /events` with `EVENTS_BEARER_TOKEN`: `SessionStart → run_started` (id = session id, so a resume is a duplicate the Worker ignores; writes `.claude/run_id`), `PermissionRequest → gate_waiting {gate: permission:<tool>, surface: class_b_gate}` (writes a marker), `PostToolUse → gate_passed {result: approved}` when the marker exists, `SessionEnd → gate_passed {result: rejected}` for a marker still open, then `run_completed`. Payloads carry tool names and the repo URL only. The session writes the `ops_skill_runs` row itself at the end (`CLAUDE.md`, rule 6).

## 6. Out of scope for M1 (do not build)
Ontology skin (campus studios, towns as towns, planets/Tab), artifact speech bubbles and cards, Approve from the world (needs the write path settled at the M2 refresh — the access Decision permits JWT taps only), the in-tray panel, PA panel, sound, voice, suit colours (trust status), stale-expert hand-raise, System Health `!`, `✓` on milestone close or invoice paid, sub-agent avatars, the Steering Room panels, prospect plots, hosting, auth, RLS, multiplayer, client towns. Anything here that turns out to be needed for M1 is a scope question, not a session decision.

## 7. Environment
Node ≥ 20, `npm ci`, `./dev.sh` (loads `.env`, then Vite + API on 5274; the adapter's overlay sidecar on `WORLD_OVERLAY_PORT`, default 5275, `0` disables it — U12) — plain `npm run dev` does not read `.env` and shows an empty world. `.env` per `.env.example` — no Supabase values; only the Notion/Airtable tokens (U4/U6) and the events bearer token (already needed for U2) are real secrets. Standing test data: `scripts/zztest-seed.sh` (Alpha waiting / Beta running / Gamma failed / Delta asleep); cleanup `scripts/zztest-cleanup.sql`. **Prerequisite for U3/U5 to show real data:** `worker/ledger-read.mjs` must be deployed on `tellefsen-compass-mcp` first (U10) — writes (`/events`) are unaffected and already work.

## 8. End-to-end verification (mirrors `feature_list.json`; the human checks are in `VERIFICATION.md`)
Seed the four ZZTEST runs → open the world → Alpha holds `?` and Beta hammers on the *ZZTEST Client* plot, Gamma slumps with `!` on *Tellefsen HQ*, Delta sleeps → N flies to Alpha → Enter opens the ZZTEST Pending Approval row → approve it in Airtable → within 15 s the `?` is gone and no event was written by the world → reload → the plots are where they were → `npm test` is green → a Claude Code session in the repo shows as an agent on the Agent World plot → approving a ZZTEST row through the Compass MCP writes `gate_passed` within seconds → the film shows all of it.
