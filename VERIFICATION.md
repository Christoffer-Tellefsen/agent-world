# VERIFICATION — Agent World (M1 closed 2026-09-07 · M2 checks V-U12W–V-U21 · M2b checks V-U28–V-U34, the still map, Decision 2026-09-07)

The verifier is Christoffer. He runs these checks cold, from this file, through the real surfaces (the browser at 127.0.0.1:5274, Airtable, Notion, the Compass MCP). A check that cannot be followed as written is a defect in the check — fix the check first. Pass → the unit is **Verified** in the Notion unit table with the date and evidence. Fail → one-line defect note on the unit, status stays **Built**, back to the builder. Never build the next dependent unit past a failing check.

Two layers for every unit: the automated layer (`npm test` + the unit's steps in `feature_list.json`, run by the builder before marking Built) and the human check below. Automated green is necessary, never sufficient.

## Standing test set (`scripts/zztest-seed.sh`)
All test runs use skill names prefixed `zztest-` and client `ZZTEST Client`, so the Run Governance sweep never confuses them with a real skill and one search finds them all.

| Run | Skill | Client | Events | Expected state |
|---|---|---|---|---|
| Alpha | `zztest-approver` | ZZTEST Client | `run_started` (trigger cowork_scheduled) + `gate_waiting {gate:'ZZTEST gate', surface:'pending_approval', ref_url: <ZZTEST Alpha Pending Approval row>}` + `run_completed` — the Class A shape: the run ended and left a proposal (the live-but-blocked Class B shape is fixture run Eta) | waiting — `?`, card tag "approve in Airtable"; after approval in Airtable → idle, no badge |
| Beta | `zztest-builder` | ZZTEST Client | `run_started` (trigger claude_code) | working — `⚒` |
| Gamma | `zztest-faulty` | *(null → Tellefsen HQ)* | `run_started` + `run_failed {reason:'ZZTEST fault'}` | blocked — `!` |
| Delta | `zztest-sleeper` | ZZTEST Client | `run_started` + `run_completed {outcome:'success'}`, both `at` = 4 days ago | asleep — no badge |

The one Airtable artifact: a Pending Approval row titled **ZZTEST Alpha** (Status *Pending Approval*) whose URL is Alpha's `ref_url`. Create it by hand before V-U3; delete it after V-U6.

Cleanup at milestone close and before every film: `scripts/zztest-seed.sh --clean` — it calls the Worker's `DELETE /ledger/zztest` first (the route deletes `skill LIKE 'zztest-%'` rows and nothing else; the pattern is a constant in the Worker, Decision 2026-09-06) and prints `events_deleted` / `runs_deleted`, resets the ZZTEST Alpha Pending Approval row to *Pending Approval* (guarded: the row's title must start with ZZTEST), then seeds the four fixtures above. Without `--clean` the seed deletes nothing. `scripts/zztest-cleanup.sql` is gone — it assumed a Supabase SQL editor this Lovable-managed project does not have. The Airtable ZZTEST rows and the `data/colony.json` plot entry are unaffected by the route and can be cleaned up normally.

**M2 additions (re-issued 2026-09-07).** Standing test set gains: **Epsilon** `zztest-artist` (completed, two artifacts), **Eta** `zztest-stale-expert` (last run 40 d ago, skill row active), **Zeta** `zztest-lead` + two `zztest-child` carrying `parent_run_id` (one child waiting), the **ZZTEST Client** (Active in `ops_clients` since 2026-09-06, `ae251fe2-4270-47c2-b2e6-6a0f3cff4d97`), the **ZZTEST Pipeline row** (`reclEgXG2t4ZnomCq`, Stage Lead; the seed sets its last touch 12 d back). `scripts/zztest-seed.sh --clean` creates all of them after `DELETE /ledger/zztest`; `test_run_exclusion` keeps them out of every rule. A seed run is the setup for every check below unless it says otherwise.

The five Greek letters used by the offline fold fixtures in `test/fixtures/events.zztest.json` (Epsilon batch gate, Zeta content_status, Eta Class B blocked, Theta two drafts, Iota session gate) are test-file names only; on the live seed the names Epsilon, Eta and Zeta mean the M2 rows above.

## V-U10 — Worker ledger-read proxy (in `tellefsen-compass-mcp`, not this fork)
Setup: `worker/ledger-read.mjs` dropped in and wired per `worker/WIRING.md`; `wrangler deploy` done.
Do: run the four curl commands in `worker/WIRING.md` in order.
See: `401`, `401`, `400`, then a `200` whose body starts `{"events":[` and, if you've had any governed runs today, actually lists them.
Fail looks like: a `500` (unhandled error — check `wrangler tail` for the real Supabase error, likely a stale key); a `200` with an empty `events` array when you know runs exist (check the `since` value is actually in the past); the response containing anything that looks like a key.
Cleanup: none.

## V-U1 — Fork and harness
Setup: `.env` filled per `.env.example`; V-U10 passing (U3 needs it for real data, though `smoke ok` itself doesn't).
Do: `./init.sh`; then unset `EVENTS_BEARER_TOKEN` in the shell (note: the world itself runs via `./dev.sh`, which loads `.env` — plain `npm run dev` does not) and `curl -s 127.0.0.1:5274/api/harnesses`.
See: `smoke ok`; the harness list contains exactly `compass`, `detected:true` with the token set and `detected:false` without; `git diff upstream/main --stat -- src/` prints nothing; `npm test` green.
Fail looks like: `claude-code` still in the list; `detected:true` without the token (detect not reading env); a diff under `src/`.
Cleanup: none.

## V-U2 — A build session is a governed run
Setup: `jq` installed; `EVENTS_BEARER_TOKEN` in `.env`.
Do: start `claude` in the repo, ask it to run a command that prompts for permission, approve, `/exit`. Then in Claude (this chat): `list_records ops_run_events` filtered `skill = agent-world-build`.
See: four events sharing one `run_id` — `run_started`, `gate_waiting {surface: class_b_gate}`, `gate_passed {result: approved}`, `run_completed` — and an `ops_skill_runs` row with `id` = that `run_id`. Open the world: an agent on the Tellefsen HQ plot titled `agent-world-build`; while the prompt was open it held a `?`.
Fail looks like: different `run_id` per event; a 400 in the Worker (payload carried command text); no `run_completed` after exit; no ledger row (the session skipped rule 6).
Cleanup: none — this is a real governed run.

## V-U3 — Ledger → agents and badges
Setup: V-U10 passing (this unit shows nothing real without it); the ZZTEST Alpha Pending Approval row exists; run `scripts/zztest-seed.sh`.
Do: open the world, wait one poll (≤ 15 s).
See: a **ZZTEST Client** plot with three agents — Alpha holding `?`, Beta hammering `⚒`, Delta asleep with no badge; on **Tellefsen HQ** Gamma slumped with `!`; HUD "need you" = 1; the sidebar's ZZTEST Client zone reads 3 threads, 1 need you.
*Re-based 2026-09-07 (ES-6.1 / ES-6.2 — the still map): a run is a thread only while it is a request. Beta (running) and Delta (asleep) have no figure; Beta counts as "⚒ · 1 running" on its project fixture; Gamma's `!` stands at the records office (no client). Alpha's `?` on the ZZTEST town is unchanged. Check this sentence through V-U28 instead.*
Fail looks like: all four on one plot with an empty name (client mapping); Beta showing `?` (a gate leaked across runs); Gamma still hammering (terminal event ignored); Delta awake (window or sleep threshold wrong).
Cleanup: at milestone close (see above).

## V-U5 — Open goes to the surface, nothing writes back
Setup: V-U3 state.
Do: select Alpha, press Enter. Select Beta, press A. Reload the page.
See: Enter opens the ZZTEST Alpha Pending Approval row in the browser. A shows the toast "Archived here (no Compass record for it)" and Beta walks back to the ship — this is Bot Crossing's own local hide (its `A` shortcut ignores `canArchive`, though the Archive button honours it); Beta's id lands in `data/colony.json` → `archived` as viewer state, and **nothing is written to the ledger** (list_records for Beta's run_id shows no new event). After reload every plot is exactly where it was.
Fail looks like: Enter opens nothing or the wrong page; a new event appears on Beta's run in the ledger (the world wrote — forbidden); plots reshuffle on reload.
U11's overlay now refuses A on a waiting run. To bring hidden runs back: `scripts/reset-view.sh`, then reload. The shortcut-ignores-canArchive inconsistency still goes upstream as a one-line PR.
Cleanup: none.

## V-U11 — Selection panel overlay
Setup: `./dev.sh` running with the overlay-mounted `index.html`; the ZZTEST set seeded (Alpha waiting).
Do: click Alpha. Read the panel bottom-left. Click Beta, press A. Click Alpha, press A. Click empty ground.
See: for Alpha — skill `zztest-approver`, zone ZZTEST Client, chip "Waiting on you", the gate name `ZZTEST gate`, the full sentence "A Pending Approval row is waiting. Open it in Airtable and set its Status to Approved or Rejected.", an "Open in Airtable" button; Bot Crossing's own card shows the short tag `approve in Airtable` in full. Beta + A → hides as before. Alpha + A → toast "This run is waiting on you…", Alpha stays. Empty ground → panel gone. **Also (added after the first pass):** Gamma shows a red "What happened" block — `Failed: ZZTEST fault. Nothing in a surface is waiting on you…` — and its card tag reads `failed: ZZTEST fault`; a build session's own gate (an `agent-world-build` run with a `?`) shows tag `answer in the Claude Project`, Open goes to the Claude Project, and a small `Context ↗` link goes to the page the gate references; any run on the Agent World project shows a `N % of milestones` chip once U4 is live.
Fail looks like: panel missing (index.html mount line absent, or the overlay threw — check the browser console); instruction truncated or missing (preview not carrying `<gate> — …`); A still hides a waiting run.
Cleanup: none.

## V-U4 — Card bar = milestones done ÷ total
Setup: `NOTION_TOKEN` set **and the Projects database shared with the "Tellefsen - Agent world" integration** (as well as 🎯 Engagement Milestones). The `agent-world-build` runs carry `project = 3d1c0af9-c974-81ce-8a25-f4bdeadd54ab` (1 of 4 milestones 🟢 Delivered at the time of writing; recompute if that has changed).
Do: select an `agent-world-build` run on Tellefsen HQ; read the card's progress bar (Bot Crossing's card and the overlay panel both draw it). Select Gamma; read its bar.
See: 25 % on the Agent World run; the 5 % floor on Gamma.
Fail looks like: every bar at 5 % with a terminal warning naming a 404 on `pages/3d1c…` (Projects not shared — share it, restart); 100 % or 0 % (sizeBytes not inverted); the bar creeping upward on its own (LIVE_GROWTH applies only to running threads); a Notion error leaving the card blank instead of the floor.
Cleanup: none.

## V-U6 — The `?` clears within one poll of the tap
Setup: `AIRTABLE_TOKEN` and `NOTION_TOKEN` set; V-U3 state — Alpha holds `?` and its gate's `ref_url` is the ZZTEST Alpha row (Status *Pending Approval*); a real content draft signed today (Status 📅 Scheduled) whose run still showed `?` before this restart.
Do: (1) restart the world (`./dev.sh`); look at the signed content run. (2) In Airtable, set ZZTEST Alpha's Status to **Approved**. Watch the world for 15 s. (3) Check the ledger.
See: (1) the content run's `?` is gone at the first poll and its title has dropped ` · signature`. (2) Alpha drops the `?` (idle, no badge); "need you" falls by one. (3) `list_records ops_run_events` for Alpha's `run_id` shows **no** `gate_passed` — the world wrote nothing (the sweep writes it later, actor `cowork`; the 20:00 poller for the content run).
Fail looks like: a `?` persisting past a poll (check the terminal for a warning naming the read that failed); a `gate_passed` with actor other than `cowork`/a human appears (the adapter wrote — forbidden); Alpha turns `!` or vanishes.
Cleanup: set the ZZTEST Alpha row back to Pending Approval for the next run of this check (the world re-reads it after a restart).

## V-U7 — Realtime nudge — deferred, no check yet
U7 needs a Supabase key on this machine to open a Realtime subscription — the same constraint U10 exists to route around. There is nothing to verify until that's resolved some other way. The 5 s scan cache + 15 s browser poll is the working transport in the meantime (proven by every other check in this file); a new agent or a cleared `?` shows up within one poll regardless. Revisit this check if U7 is ever un-deferred.

## V-U9 — Worker write-gate (tellefsen-compass-mcp)
Setup: a fresh ZZTEST Alpha run (seed script) with its gate's `ref_url` pointing at a ZZTEST Pending Approval row (Status *Pending Approval*); the Worker deployed with U9.
Do: in this chat, `airtable_update_record(table_key='pending_approval', record_id=<ZZTEST row>, fields={Status:'Approved'})`. Then `list_records ops_run_events` for Alpha's `run_id`. Run the same update once more.
See: within 5 s exactly one `gate_passed` with `result: approved` and `payload.at_source: 'worker'`; Alpha's `ops_skill_runs` row shows `gates_hit 1`; the second update adds nothing; the world drops the `?` at the next poll.
Fail looks like: two `gate_passed` events after the sweep runs (not idempotent); a `gate_passed` on another run (ref_url match too loose); a write on a non-pending_approval table.
Cleanup: delete the ZZTEST row; ZZTEST SQL at milestone close.

## V-U8 — The film
Setup: U3–U7 and U9 Verified.
Do: open the recording from the Project page's Sent Documents link.
See: 30–60 s; the six beats — rest, arrival, `?`, N, Open on the surface, `?` clearing; real runs; nothing on screen that is not already public.
Fail looks like: a seeded-only film with no real run; a beat missing; a client name that should not be on film.
Cleanup: none.

## V-U12W — Worker substrate read route (Compass Worker repo)
- **Setup:** Worker deployed; bearer in hand; `W` and `H` as in the pre-flight page.
- **Do:** `curl -s -o /dev/null -w '%{http_code}\n' $W/world/substrate` · the same with `-X POST -H "$H"` · `curl -s -H "$H" $W/world/substrate | jq 'keys'` · `| jq '.clients[].name'`.
- **See:** 401 · 405 · the keys `at, auto_run_policy, clients, deal_pipeline_stages, skills, world_companies` · every client Active and "ZZTEST Client" among them; `Cache-Control: max-age=60`.
- **Fail looks like:** a 200 without the bearer; a client row that is not Active; a Supabase value anywhere in the response.
- **Cleanup:** none.

## V-U12 — World Packs and the ontology skin
- **Setup:** `./dev.sh`; seed run; `WORLD_COMPANIES` v0.3 in Compass (Tellefsen + two placeholder planets, `world_pack` on each). The adapter's sidecar answers on `http://localhost:5275/world` (names and packs only — no token in it). Plots are not draggable in Bot Crossing; the map is sticky by allocation, so the layout check is a reload.
- **Do:** open the world. Read the planet pills top right (the switcher). Read the name plates (a quiet town's plate is always on; it has no sidebar, nothing runs there); click an agent and read the panel. Reload the page. Click AI Drilling; then click Tellefsen SPC. Add a second ZZTEST client to `ops_clients` through the Compass MCP (chat does it), restart `dev.sh`. Then, in chat, set the home company's `world_pack` to `neutral`, restart `dev.sh`; set it back, restart.
- **See:** every Active client in `ops_clients` is a named town — a deck with its name plate — even one with no run in the window (a quiet town: deck and plate, no crew); Tellefsen HQ is the centre; the switcher lists the three companies from Compass and, beside them, the pack id the planet on screen wears; AI Drilling and AI Football open as empty planets carrying their name and "no substrate yet" (no crew, no towns; `data/colony.<key>.json` appears on first visit); back on Tellefsen SPC every plot — real and quiet — is on the cells it had before the reload and the switch; the panel says `campus · Tellefsen HQ` or `town · <client>` and shows a `studio · <room>` chip (solution studio, research lab, content studio, finance office, integration yard, board room, corner office); a run in a town that wears its own pack (`ops_clients.world_branding.pack`, none today) speaks that pack's nouns and rooms on the panel and shows the pack id. The new ZZTEST client is a town after restart; removing the row removes it.
*Re-based 2026-09-07 (ES-6.1 / ES-6.4): "click an agent" means a request or a fixture — there is no figure per run. Tellefsen HQ is no longer one plot: the campus is the corner office at the centre and the rooms around it (V-U29); the `studio · <room>` chip still reads the room the skill belongs to. A town is on a spoke cell from ring 4 outward; the new ZZTEST client takes the next free spoke cell and nothing else moves.* On `neutral`: the canvas goes grayscale on the moon, the nouns read world / site / unit, the rooms read unit A–G, and no client or company name is in any pack file; on the way back the campus returns.
- **Also (re-cut 2026-09-07):** set the home company's world_pack to neutral in Compass (chat does it), restart ./dev.sh → skin, rooms and nouns swap with no code change and no client name appears anywhere; set it back → the campus returns.
- **Fail looks like:** a client with no town; a town whose name is in code or in a pack; a planet that shows another planet's runs; a plot on different cells after a reload; a swap that needs a commit; the switcher missing (the sidecar is down — `curl -s localhost:5275/world`; a second copy of the world on the same port).
- **Cleanup:** remove the second ZZTEST client row; `world_pack` back to `tellefsen-campus`; `data/colony.ai-drilling.json` / `data/colony.ai-football.json` may stay (empty layouts) or be deleted.

## V-U13 — Artifact bubbles and cards
- **Setup:** seed run (Epsilon completed with one Notion-URL artifact and one Compass-reference artifact).
- **Do:** watch Epsilon's plot for one poll; open its card; press Open on the first artifact; try the second.
- **See:** bubble on Epsilon within 15 s; card lists two artifacts; the first opens the Notion page in the browser; the second is a label with no Open.
- *Re-based 2026-09-07 (ES-6.7): a completed run is not a figure, so the bubble stands on Epsilon's request — the seed now leaves Epsilon one open gate — and fires only because that gate is open; an artifact on a run without a gate appears on the archive shelf only (V-U32). The card is the request's panel.*
- **Fail looks like:** no bubble; Open on the Compass reference; the bubble on the wrong agent.
- **Cleanup:** none.

## V-U14 — In-tray
- **Setup:** seed run (Alpha and the Zeta child give two `?`; sign nothing).
- **Do:** press I. Press N three times with the in-tray open, watching which row highlights. Click a row.
- **See:** rows = the `?` on the map, same count; N walks the list top to bottom in the same order; click flies to that agent and selects it.
- **Fail looks like:** N and the list disagree; a `?` on the map missing from the list; a row for a run with no open gate.
- **Cleanup:** none.

## V-U15 — Approve (deep-link)
- **Setup:** seed run; Alpha waiting on the real ZZTEST Pending Approval row.
- **Do:** in the in-tray select Alpha, press Approve. Read what the panel shows before the surface opens. Approve the Airtable row (through the Compass MCP in chat, or in the Airtable UI). Come back and wait one poll.
- **See:** instruction text and surface name shown first; the Airtable row opens; Alpha's row shows ⏳; after the poll the `?` and the row clear; the ledger has no `gate_passed` from the world (`GET /ledger/scan` — `at_source` is `worker` for an MCP tap, the sweep's for a UI tap, never `world`).
- **Fail looks like:** the row clears before the surface saw the tap; any `gate_passed` written by the world; Approve on a run with no gate.
- **Cleanup:** `scripts/zztest-seed.sh --clean` re-arms Alpha.

## V-U16W — Worker /ask
- **Setup:** Worker deployed with `ANTHROPIC_API_KEY`; bearer in hand; seed run.
- **Do:** `curl -X POST $W/ask` without the bearer; with the bearer and `{}`; with the bearer and `{"question":"what is Alpha waiting on","context":{"run_id":"<Alpha's run_id>"}}`; then `GET /ledger/scan?since=<now − 5 min>`.
- **See:** 401; 400; an answer naming the ZZTEST Pending Approval row and its instruction, with `run_id`, `model`, `tokens_in`, `tokens_out`; one new run in the scan — `run_started` and `run_completed` for skill `agent-world-pa` — and its `ops_skill_runs` row; nothing else changed.
- **Fail looks like:** an answer that invents a row; the question or the answer text in an event payload; any write besides the PA's own events and row.
- **Cleanup:** none.

## V-U16 — PA panel
- **Setup:** U16W verified; bearer in `.env`.
- **Do:** select Alpha, press P, ask "what does this need from me?". Then ask "which client has the most open gates?".
- **See:** first answer matches the card; second answer matches the in-tray; `npm test` output in the terminal still shows the no-model-endpoint invariant green.
- **Fail looks like:** the panel works with the Worker bearer removed (means a model call in the fork); an answer that contradicts the map.
- **Cleanup:** none.

## V-U17 — Signals
- **Setup:** seed run (Eta stale; Gamma failed).
- **Do:** look at Eta, Gamma, the campus flag, and Beta's suit. Flip a ZZTEST Engagement Milestone to Done in Notion, wait 5 min. Trigger a new `?` (seed Alpha again), then press M and trigger another.
- **See:** Eta's hand is up; the campus flag shows `!` (Gamma); Beta's suit colour matches its trust status under `AUTO_RUN_POLICY` (a `zztest-` skill is in neither list, so the run's own `run_class` decides); `✓` over the ZZTEST town after the cache; a sound on the first new `?`, silence after M.
- *Re-based 2026-09-07 (ES-6.8): Eta raises no figure — it is a dusty row in the records office panel and a lowest-precedence tray line, and only because the pack override says it wants "Airtable" and an Active project's Tech Stack contains it; Gamma's `!` is a request at the records office, not a flag; Beta has no figure, so read the suit colour on a request (Alpha); `✓` is a static mark on the project fixture, not a flash over the town. Check these through V-U33.*
- **Fail looks like:** a hand up on a skill that ran last week; `!` on the flag with no failed run in 24 h; a colour not in the run_mode table; sound on every poll.
- **Cleanup:** flip the ZZTEST milestone back.

## V-U18 — Sub-agent avatars
- **Setup:** seed run (Zeta lead + two children with `parent_run_id`, one waiting).
- **Do:** find Zeta. Open its card. Press N until it lands on the waiting child.
- **See:** two crew beside Zeta's plot; card says "2 sub-runs" and lists them; Zeta shows `?` by inheritance; N lands on the child, not the parent.
- *Re-based 2026-09-07 (ES-6.8): the running lead and its working child have no figure; "2 sub-runs" is a count on the project fixture's running list (or on the parent's request when the parent is one); only the waiting child stands, as a request, and N lands on it. Check through V-U33.*
- **Fail looks like:** children on their own plots; the parent with no badge while a child waits; N stopping on the parent.
- **Cleanup:** none.

## V-U19 — Steering Room
Absorbed 2026-09-07 by U31 (ES-6.6): its three panels live in the room panels — Pipeline in the strategy room, the milestone board in the workshop and the corner office, the last Decisions in the board room. Check through **V-U31**.

## V-U20 — Prospect decay
Absorbed 2026-09-07 by U29 (ES-6.4): prospects are not plots; the warmth (1.0 / 0.5 / 0.2 by days since last touch) is a column in the strategy room panel. Check through **V-U29** (zero prospect plots) and **V-U31** (the ZZTEST deal at warmth 0.5 at 12 d).

## V-U21 — The second film
- **Setup:** V-U12 to V-U20 verified in one sitting the same day; `scripts/zztest-seed.sh --clean`.
- **Do:** film 30–60 s: town → bubble → in-tray → Approve → `✓`.
- **See:** the file in Drive under the project folder, linked from Sent Documents on the Project page.
- **Fail looks like:** a beat that needed a fixture staged by hand outside `zztest-seed.sh`.
- **Cleanup:** `scripts/zztest-seed.sh --clean` before the next film; nothing else.

## V-U28 — The still map
- **Setup:** `scripts/zztest-seed.sh --clean`; Ctrl-C and `./dev.sh`.
- **Do:** read the 5274 thread list; watch the map for 30 s; press N repeatedly; press I.
- **See:** every thread is a fixture (a project name, a room board) or a request (a badge title); Beta has no figure and its project fixture reads ⚒ · 1 running; Delta is nowhere; Alpha ? in the ZZTEST town, Gamma ! at its zone; nothing without a badge moves; N visits only badged threads; the tray rows equal the request threads; the strip reads need you · blocked · running · shipped today.
- **Fail looks like:** a figure named after a skill with no badge; a hammering figure; "crew 89".
- **Cleanup:** none.
- *Note 2026-09-07 (the builder, after the second opinion): two "See" sentences read differently on the live substrate. (1) Beta's project fixture is the one `ZZTEST_PROJECT_ID` names — today the Agent World project, a workshop fixture — and its count is every live run on that project: Beta, Zeta's lead and any `agent-world-build` session that is open, so "⚒ · 1 running" reads "⚒ · n running" with n ≥ 1 while a build session is live; the ZZTEST town itself carries no project fixture until a ZZTEST project is Active in Notion. (2) N cycles every request thread: Alpha, Gamma, the real content ? — and every Pending Approval row at "Pending Approval" and every 🧠 Decision at Pending, which the surfaces hold in quantity today (28 rows, most from April's data-hygiene batch; 17 decisions). The tray-equals-requests rule is what to check; the three names are the ZZTEST subset of it. Renderer limit, reported not fought: a fixture still walks in from the ship on load and breathes in the idle clip; it takes no step once it stands (its wander is pinned to its site from the first frame).*

## V-U29 — Places with space
- **Setup:** fresh `./dev.sh` after U29.
- **Do:** look from above; reload; cue `add client` → restart; cue `remove client` → restart; cue `flip to neutral` → restart; cue `flip back` → restart.
- **See:** corner office centre, six rooms on ring 1, three on ring 2, an empty ring, towns on spokes with a gap between each, Agent World as a fixture in the workshop, zero prospect plots; the same cells after reload; the new town on the next free spoke cell with nothing else moved; gone after removal; neutral = same geometry, generic names, grayscale; the campus back.
- **Fail looks like:** two plots touching outside the campus; a prospect plot; a town that moved.
- **Cleanup:** none (the backups stay in data/ unread).

## V-U30 — Altitudes
- **Do:** zoom out to orbit (or press O); zoom in; hover a project; press H; reload.
- **See:** at orbit plates only — name · need you · running — no thread labels, no cards; at district request labels always and fixture labels on hover; H lands on the corner office; a fresh load opens there.
- **Fail looks like:** overlapping labels at orbit; H doing nothing; a bubble at orbit.
- *Note 2026-09-07 (the builder, after the second opinion): the camera height is read from Bot Crossing's own rig, so the spec's fallback is not needed — but two of its keys are shadowed by the overlay and its help sheet still lists the old meanings (src is untouched): **O** now goes to the orbit altitude and back (Bot Crossing's O, the slow sweep, stays on the rail button); **H** flies to the corner office (Bot Crossing's H, hide the UI, is ⌘\ / ⌃\); 0 still resets the view. A status line bottom-left reads the altitude, the camera distance and the thresholds. At orbit a selection is dropped (the card and the panel are district and desk things), so a click on a figure at orbit selects nothing. A click at district flies the camera in, as N and the tray do, so the panel is always a desk thing. The plates carry a ! count beside ? and ⚒ when a room holds a failed run.*

## V-U31 — Room panels
- **Do:** click each room plot in turn (R for the board room); cue `decision pending` (chat sets Kappa to Pending); cue `decision settled` (chat sets Kappa Active); cue `draft review` (chat moves Mu to 👀 In Review); cue `draft signed` (Mu → 📅 Scheduled).
- **See:** each panel as ES-6.6 — three spot checks per panel against its Notion or Airtable view; the ZZTEST deal in the strategy room with warmth 0.5 at 12 d; skills as rows with a state; the four numbers on the corner office (or the SKIPPED note); within a poll of `decision pending` a request stands at the board room and the tray gains a row; gone after `decision settled`; the same for Mu at the marketing studio.
- **Fail looks like:** an edit affordance; a panel that disagrees with its view; a skill in no room.

## V-U32 — Archive
- **Do:** click the archive plot; open a project fixture's Archive tab; cue `register` (chat writes Nu, a ZZTEST Deliverable with a Notion link); re-run the seed.
- **See:** a shelf per client with the six sections newest first; Open opens the link; the project tab lists its milestones and deliverables; within 5 min Nu is on the ZZTEST shelf and no bubble appears; Epsilon's bubble fires (its run has an open gate).
- **Fail looks like:** a bubble on an ungated artifact; a shelf with a write affordance.

## V-U33 — Signals
- **Setup:** the seed.
- **Do:** read the records office silent list and the tray; cue `milestone done` (chat flips the ZZTEST milestone) → wait ≤ 5 min; cue `milestone back`; find Zeta; re-run the seed with sound on; press M; re-run.
- **See:** hands only on wanted skills (far fewer than 16; Eta wanted via the pack override → dusty + a tray line, no figure); the ZZTEST project fixture shows the ✓ mark and nothing moves; Zeta's parent reads "2 sub-runs", its waiting child stands as a request and N lands on it, its working child has no figure; a sound on the new ?, silence after M.
- **Fail looks like:** a figure for a hand; a flash for ✓; a working child with a body.
- *Note 2026-09-07 (the builder, after the second opinion): "the ZZTEST project fixture" is the **Agent World fixture in the workshop** — the ZZTEST milestone belongs to that project (`ZZTEST_PROJECT_ID` names it) and there is no ZZTEST project in Notion. Its ✓ may already be up when the sitting starts: the mark lasts 24 h from the newest edit of any Done milestone of the project (Notion offers no "flipped at"), so run the `milestone done` cue when no Done milestone was edited in the last day, or read the standing ✓ as the state and `milestone back` as no change until it ages out. "2 sub-runs" reads on that same fixture's panel (Running now · zztest-lead · 2 sub-runs); Zeta's lead has no figure. The seed's second child is a completed child — a working child is proven by the fixture test (test/still.test.mjs, r-child-work). The world may be muted from an earlier M (awMuted in the colony file): press M until the toast says "Sound on" before re-running the seed.*

## V-U34 — Contract v1
- **Do:** `npm test`; open docs/CONTRACT.md.
- **See:** the three schemas, the captured responses validating, the route-guard test present and green; pack.v1 with figure.
- **Fail looks like:** an adapter read of a third Worker route passing the tests.

## Cadence and evidence
Per unit: the check above, minutes each. Per milestone: when U8 verifies, re-run V-U1 … V-U7 and V-U9 in one sitting (the regression pass) before `milestone-close` flips M1 to Done. **Regression before milestone-close M2:** re-run V-U1–V-U6, V-U9–V-U11, V-U12W and V-U12–V-U20 in one sitting. **M2b batch sitting (2026-09-07):** first the re-based V-U12, V-U13, V-U14, V-U15, V-U18, then V-U28 … V-U34. Evidence per unit in the Notion unit table: the date, plus a link — the Compass `run_id` for V-U2, a screenshot for V-U3/V-U6, the recording for V-U8.
