# Contract v1 — the product boundary (U34, ES-6.9)

Agent World is a renderer over three documents. Everything it shows is read from them; nothing it does writes to them. The three JSON Schemas under `spec/` are the boundary between the Compass Worker, the packs and this fork — change them with a version, never quietly.

| Document | Schema | Producer | Consumer | Guard |
|---|---|---|---|---|
| `GET /ledger/scan?since=` — the Run Ledger window: `ops_run_events` rows and the `ops_skill_runs` rows for those runs | `spec/ledger-scan.v1.json` | `tellefsen-compass-mcp` (U10) | `server/harnesses/compass/supabase.mjs` → `fold.mjs` | `test/contract.test.mjs` validates `test/fixtures/m2b-ledger-scan.live.json` (a captured response) |
| `GET /world/substrate` — `WORLD_COMPANIES`, `AUTO_RUN_POLICY`, `DEAL_PIPELINE_STAGES`, Active `ops_clients`, `ops_skills` (v2 adds `automations`, `connectors`, `rollups`, `version: 2`) | `spec/world-substrate.v1.json` | `tellefsen-compass-mcp` (U12W) | `server/harnesses/compass/substrate.mjs` → `zones.mjs`, `signals.mjs`, `still.mjs` | validates `test/fixtures/m2b-substrate.live.json` |
| World Pack — `overlay/packs/<id>/pack.json`: skin, rooms (name, mirror, ring, spoke), nouns, lod, layout, figure ∈ {character, marker} | `spec/pack.v1.json` | this repo (a pack is presentation config; a client pack is M3) | `overlay/pack.mjs`, `server/harnesses/compass/pack.mjs`, `layout.mjs` | validates both shipped packs |

The adapter reads exactly two Worker routes — `/ledger/scan` and `/world/substrate` — and `npm test` fails if `server/harnesses/compass.mjs` or `server/harnesses/compass/**` names any other (`/ask`, `/actions`, `/events`, `/ledger/<anything else>`). The seed script may `POST /events` and `DELETE /ledger/zztest`; it is a test fixture, not the adapter. Notion and Airtable are read with GETs and the one guarded data-source query (`compass/notion.mjs`, ids in `compass/notion-sources.mjs`).

Re-capture the two live responses after a Worker deploy with `scripts/capture-contract.sh` (bearer from `.env`; actors scrubbed, notes trimmed) and re-run `npm test`. A captured response that no longer validates is a contract change: bump the schema's version and say so in `claude-progress.txt`.

Vocabulary: ES-6.9 says *nouns* and *mirror*; the pack files and `spec/pack.v1.json` carry them as `names` and `mirrors` (the keys the packs have used since U12). Same things, older names.

Rendering a `marker` figure is M3 work; the schema carries the value so a pack can declare it now.
