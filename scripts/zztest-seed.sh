#!/usr/bin/env bash
# Agent World — seed the standing ZZTEST test set into ops_run_events via the Compass Worker.
#   scripts/zztest-seed.sh          → Alpha (waiting), Beta (running), Gamma (failed), Delta (asleep)
#   scripts/zztest-seed.sh --one    → one fresh Beta-style run only (for a quick "new arrival" check)
# Needs EVENTS_BEARER_TOKEN and ZZTEST_PA_URL in .env. Batches are built in node, not jq, and every
# event carries an explicit `at`: PostgREST rejects a bulk insert whose rows have different key sets
# (PGRST102 "All object keys must match" — seen live 2026-09-06 when only run_started had `at`).
# Cleanup: scripts/zztest-cleanup.sql (see VERIFICATION.md for the current caveat on running it).
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then set -a; . ./.env; set +a; fi
: "${EVENTS_URL:=https://tellefsen-compass-mcp.christoffer-7e3.workers.dev/events}"
: "${EVENTS_BEARER_TOKEN:?set EVENTS_BEARER_TOKEN in .env}"

# run NAME SKILL CLIENT|null TRIGGER START_HOURS_AGO EXTRA_EVENTS_JSON
# Builds one batch: run_started at START, then each extra event one second later (or its own `at`).
run() {
  local body
  body=$(node -e '
    const [name, skill, client, trigger, hoursAgo, extra] = process.argv.slice(1)
    const id = require("crypto").randomUUID()
    const base = Date.now() - Number(hoursAgo) * 3600e3
    const common = { run_id: id, skill, trigger, client: client === "null" ? null : client, project: null, actor: "zztest" }
    const events = [{ ...common, id, event_type: "run_started", at: new Date(base).toISOString(),
                      payload: { run_class: "A_gather_sync_check_propose", skill_version: "zztest" } }]
    JSON.parse(extra).forEach((e, i) => events.push({ ...common, ...e, at: e.at || new Date(base + (i + 1) * 1000).toISOString() }))
    process.stderr.write(`== ${name} → run_id ${id}\n`)
    process.stdout.write(JSON.stringify({ events }))
  ' "$1" "$2" "$3" "$4" "$5" "$6")
  curl -s -w '\n   HTTP %{http_code}\n' -X POST "$EVENTS_URL" \
    -H "Authorization: Bearer $EVENTS_BEARER_TOKEN" -H "Content-Type: application/json" --data "$body"
}

if [ "${1:-}" = "--one" ]; then
  run "One-off (running)" zztest-builder "ZZTEST Client" claude_code 0 '[]'
  exit 0
fi

: "${ZZTEST_PA_URL:?set ZZTEST_PA_URL in .env (the ZZTEST Alpha Pending Approval row)}"
run "Alpha (waiting)"  zztest-approver "ZZTEST Client" cowork_scheduled 0.1 \
  "[{\"event_type\":\"gate_waiting\",\"payload\":{\"gate\":\"ZZTEST gate\",\"surface\":\"pending_approval\",\"ref_url\":\"$ZZTEST_PA_URL\"}},{\"event_type\":\"run_completed\",\"payload\":{\"outcome\":\"success\"}}]"
run "Beta (running)"   zztest-builder  "ZZTEST Client" claude_code      0.05 '[]'
run "Gamma (failed)"   zztest-faulty   null            cowork_manual    0.2 \
  '[{"event_type":"run_failed","payload":{"reason":"ZZTEST fault"}}]'
run "Delta (asleep)"   zztest-sleeper  "ZZTEST Client" chat             96 \
  '[{"event_type":"run_completed","payload":{"outcome":"success"}}]'
echo "seeded — look at the world after the next poll (≤ 15 s)"
