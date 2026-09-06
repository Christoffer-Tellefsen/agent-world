# Dropping the Build Pack into the fork (U1, first ten minutes)

Written 2026-09-06 by build-kickoff v1.3. The Notion page **🔧 Build Pack — Agent World** carries the five parts and the unit status table; these files are the repo half of it and are canonical for code content.

1. **Fork.** On GitHub, fork `jarrenrocks/bot-crossing` into `Christoffer-Tellefsen/agent-world` (private). Clone it. Add the upstream remote and pin it:
   ```bash
   git clone git@github.com:Christoffer-Tellefsen/agent-world.git && cd agent-world
   git remote add upstream https://github.com/jarrenrocks/bot-crossing && git fetch upstream
   git log -1 --format=%h upstream/main   # expect 87ec837 or newer — note it in claude-progress.txt if newer
   ```
2. **Drop in** everything from this pack at the repo root (`.claude/`, `test/`, `scripts/`, the markdown files, `init.sh`, `feature_list.json`, `claude-progress.txt`, `.env.example`, `.mcp.json`). Append `.gitignore.additions` to `.gitignore`, then delete that file.
3. **package.json** — add the test script (this file is ours, not `src/`). No new dependency until U7 (`@supabase/supabase-js` for Realtime):
   ```json
   "scripts": { "test": "node --test test/*.test.mjs" }        // alongside the existing scripts
   ```
4. **`.env`** from `.env.example` — Notion token, Airtable token, the Worker's events bearer token, the Claude Project URL. No Supabase values: the Compass Supabase project is provisioned through Lovable, which doesn't expose a URL or service-role key outside itself, so reads go through the Worker instead (see step 4.5 below). `brew install jq` if missing.
4.5. **Deploy the Worker's read route first** — drop `worker/ledger-read.mjs` into `tellefsen-compass-mcp`, wire it in and smoke-test it per `worker/WIRING.md`. U3 and U5 show nothing real until this is live; everything else in this pack works without it.
5. **`.mcp.json`** — verify the Compass MCP's auth shape for Claude Code before the first session (the claude.ai connector may use OAuth; Claude Code may need a header). This is a currency item, not a design one.
6. **The adapter is already in this pack** (U1 skeleton, U3, U5 — written and proven in the kickoff session; see `claude-progress.txt`). So the first thing to do is not a coding session but a run:
   ```bash
   ./init.sh                 # expect: harness: compass detected · threads: N · smoke ok
   ./dev.sh                  # open http://127.0.0.1:5274 — your real runs appear on the Tellefsen HQ plot (NOT plain npm run dev: it won't read .env)
   scripts/zztest-seed.sh    # then wait one poll: ZZTEST Client plot with ? ⚒ and a sleeper; ! on Tellefsen HQ
   ```
   Then run **V-U1, V-U3, V-U5** from `VERIFICATION.md` and report pass/fail per check. Commit the pack as `U1/U3/U5: compass adapter (kickoff)` once `npm test` is green on your machine.
7. **Later sessions** (Claude Code, from U2 on) open the same way every time: progress file → `git log` → feature list → `./init.sh` → the first `passes: false`. U2's hooks verify the first time you open Claude Code in the repo; nothing blocks on it.

The hooks in `.claude/` make the session itself a governed run from U2 onward; until then the run is ungoverned and that is fine for one session.
