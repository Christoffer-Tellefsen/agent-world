# FEATURES — Agent World M1 (mirror of `feature_list.json`)

The machine walks `feature_list.json`; this page is the same list for a human. Every unit maps to exactly one milestone (all M1) and to the end-states in `SPEC.md`. Status (Planned → Built → Verified) lives in the Notion unit table on 🔧 Build Pack — Agent World; `passes: true` in the JSON means Built, never Verified.

| # | Unit | Delivers | Depends on | Check |
|---|---|---|---|---|
| U1 | Fork + harness — repo, `upstream` remote, `HARNESSES=[compass]`, adapter skeleton (`detect` from env, empty scan), CLAUDE.md, `init.sh`, `feature_list.json`, progress file, `npm test` invariants | ES-1.1, 1.2, 1.9 | — | V-U1 |
| U2 | Governed build — hooks post `run_started` / `gate_waiting` / `gate_passed` / `run_completed` to `POST /events` with `run_id` = session id; the session writes its ledger row | ES-3.1 | U1 | V-U2 |
| U10 | **Worker ledger-read proxy** (in `tellefsen-compass-mcp`, not this fork) — `GET /ledger/scan?since=` returns `{events, rows}` using the Worker's own Supabase access, same bearer token as `/events`. Needed because the Compass Supabase project is Lovable-managed and exposes no key to this machine | ES-1.12 | — | V-U10 |
| U3 | **Ledger → agents and badges** — fold events in the window into runs; zone = client / Tellefsen HQ; `! ⚒ ?` sleep per precedence; running needs activity within the TTL; Owner viewer context; 5 s scan cache | ES-1.3, 1.4 | U1, U10 | V-U3 |
| U5 | Open goes to the surface; nothing writes back — `ref_url` → row / Decision / Notion page, chat runs → Claude Project; A, C, archive inert; layout persists | ES-1.5, 1.7 | U3 | V-U5 |
| U11 | **Selection panel overlay** — first overlay module (`overlay/main.js`, mounted from `index.html`, reads `window.botCrossing`): skill, zone, state, and for a pending gate the gate + the full instruction; blocks A on a waiting run. Pulled forward from M2 at Christoffer's request after V-U5 | ES-1.13 | U3, U5 | V-U11 |
| U4 | Milestone progress seam — card bar = 🎯 Engagement Milestones done ÷ total (Notion, 5-min cache, inverted into `sizeBytes`) | ES-1.6 | U3 | V-U4 |
| U6 | Surface cross-check seam — a resolved Pending Approval row, a Decision moved on from Pending, or a Content row moved on from In Review clears the `?` within one poll, before the sweep or poller writes `gate_passed`; the world writes nothing, every read a GET | ES-1.8 | U3 | V-U6 |
| U7 | Realtime nudge — `postgres_changes` on `ops_run_events` invalidates the scan cache; proves Realtime delivery (M0's open check) | ES-1.10 | U3 | V-U7 |
| U9 | Worker write-gate — in `tellefsen-compass-mcp`: a Pending Approval status change made through `airtable_update_record` writes `gate_passed` and patches the ledger row within seconds (MCP taps); Airtable-UI taps stay with the sweep. Named as an M1 unit in two Compass keys; added to the Pack after the gate | ES-1.11 | U6 | V-U9 |
| U8 | The film — 30–60 s, real runs, six beats, filed to Drive and linked from Sent Documents | ES-2.1 | U3–U7, U9 | V-U8 |

Build order: U1 → U2 → U10 → U3 → U5 → U11 → U4 → U6 → U7 (deferred) → U9 → U8. U10 moved ahead of U3 because U3 cannot show real data without it — see the Lovable/Supabase note on U10 and U7. U3 is the load-bearing unit — it de-risks the one thing that must be true (a truthful adapter) before anything is built on it. U5 comes before U4 because Open on a `?` is the business case and U4/U6 are seams that deepen it.

## Placeholders — not cut, no checks yet
Listed so the spine stays visible; cut into real units at the refresh that opens each milestone.

- **U7 — deferred, not cut into M2/M3:** Realtime nudge needs a Supabase key on this machine, same constraint U10 exists to route around. Revisit once the Worker can push, or Supabase access changes. The 15 s poll remains the working transport with no loss of function.
- **M2 — Ontology skin:** campus studios, towns, planets/Tab (via the `agent-session-world` skill); artifact bubbles and cards; the in-tray as a plain list; Approve from the world — needs the write path settled (the access Decision permits JWT taps only; M2 refresh decides deep-link vs early `/actions`); PA panel through Worker `/ask` in `overlay/`; sound; voice (speech provider question); suit colours; hand-raise; System Health `!`; `✓` on milestone close / invoice paid; sub-agent avatars; Steering Room panels as substrate reads; prospect plots rendering decay.
- **M3 — Hosted, multiplayer, first client town:** Sovereign-pattern hosting; Supabase Auth; RLS policies on both ledger tables; `ops_world_grants`; Worker `/actions`; client projection topic; grant proposals in `pipeline-conversion` / `engagement-close`; venture separation.
