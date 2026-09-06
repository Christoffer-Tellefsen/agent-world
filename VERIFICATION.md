# VERIFICATION — Agent World M1

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

Cleanup at milestone close: `scripts/zztest-cleanup.sql` was written assuming Supabase SQL editor access, which isn't available on this project (Lovable-managed, same as U10's reason for existing) — **not solved yet, not blocking anything now** (`RUN_GOVERNANCE_RULES.test_run_exclusion` already keeps `zztest-%` rows out of every rule, sweep and rollup, so they're harmless sitting there). Before milestone close, either add a narrow `DELETE ... WHERE skill LIKE 'zztest-%'` route to the Worker (same shape as U10, scoped tight) or find another path — flag it as an open item, don't block on it today. The Airtable ZZTEST rows and the `data/colony.json` plot entry are unaffected and can be cleaned up normally.

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

## Cadence and evidence
Per unit: the check above, minutes each. Per milestone: when U8 verifies, re-run V-U1 … V-U7 and V-U9 in one sitting (the regression pass) before `milestone-close` flips M1 to Done. Evidence per unit in the Notion unit table: the date, plus a link — the Compass `run_id` for V-U2, a screenshot for V-U3/V-U6, the recording for V-U8.
