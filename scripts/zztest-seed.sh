#!/usr/bin/env bash
# Agent World — seed the standing ZZTEST test set into ops_run_events via the Compass Worker.
#   scripts/zztest-seed.sh          → Alpha (waiting), Beta (running), Gamma (failed), Delta (asleep),
#                                     Epsilon (U13: completed, one Notion-page artifact + one Compass reference),
#                                     Eta (U17: zztest-stale-expert, last run 40 d ago — its ops_skills row, status active, is
#                                     created by chat through the Compass MCP; the world never writes to Compass)
# ZZTEST_PROJECT_ID (optional, .env): a ZZTEST project page id in Notion — every ZZTEST run then carries it as `project`,
# so V-U17's ✓ (a ZZTEST milestone flipped Done) has a town to land on.
#   scripts/zztest-seed.sh --clean  → DELETE $W/ledger/zztest first (skill LIKE 'zztest-%' rows only — the ledger's
#                                     one named exception to append-only, Decision 2026-09-06), then the same seed.
#                                     Without the flag nothing is deleted, ever.
#   scripts/zztest-seed.sh --one    → one fresh Beta-style run only (for a quick "new arrival" check)
# Needs EVENTS_BEARER_TOKEN and ZZTEST_PA_URL in .env. Batches are built in node, not jq, and every
# event carries an explicit `at`: PostgREST rejects a bulk insert whose rows have different key sets
# (PGRST102 "All object keys must match" — seen live 2026-09-06 when only run_started had `at`).
# The one Airtable touch: the ZZTEST Alpha Pending Approval row (the record in ZZTEST_PA_URL) is reset to
# Status "Pending Approval" so Alpha's ? is real again. Guarded: the row's title must start with ZZTEST,
# or nothing is written. No other Airtable row is ever touched from here.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then set -a; . ./.env; set +a; fi
: "${EVENTS_URL:=https://tellefsen-compass-mcp.christoffer-7e3.workers.dev/events}"
: "${EVENTS_BEARER_TOKEN:?set EVENTS_BEARER_TOKEN in .env}"
WORKER="${EVENTS_URL%/events}"

# run NAME SKILL CLIENT|null TRIGGER START_HOURS_AGO EXTRA_EVENTS_JSON
# Builds one batch: run_started at START, then each extra event one second later (or its own `at`).
run() {
  local body
  body=$(node -e '
    const [name, skill, client, trigger, hoursAgo, extra] = process.argv.slice(1)
    const id = require("crypto").randomUUID()
    const base = Date.now() - Number(hoursAgo) * 3600e3
    const common = { run_id: id, skill, trigger, client: client === "null" ? null : client, project: process.env.ZZTEST_PROJECT_ID || null, actor: "zztest" }
    const events = [{ ...common, id, event_type: "run_started", at: new Date(base).toISOString(),
                      payload: { run_class: "A_gather_sync_check_propose", skill_version: "zztest" } }]
    JSON.parse(extra).forEach((e, i) => events.push({ ...common, ...e, at: e.at || new Date(base + (i + 1) * 1000).toISOString() }))
    process.stderr.write(`== ${name} → run_id ${id}\n`)
    process.stdout.write(JSON.stringify({ events }))
  ' "$1" "$2" "$3" "$4" "$5" "$6")
  curl -s -w '\n   HTTP %{http_code}\n' -X POST "$EVENTS_URL" \
    -H "Authorization: Bearer $EVENTS_BEARER_TOKEN" -H "Content-Type: application/json" --data "$body"
}

# clean — DELETE /ledger/zztest. The Worker's predicate is a constant (skill LIKE 'zztest-%'); nothing here can widen it.
clean() {
  local out code body
  out=$(curl -s -w '\n%{http_code}' -X DELETE "$WORKER/ledger/zztest" -H "Authorization: Bearer $EVENTS_BEARER_TOKEN")
  code="${out##*$'\n'}"; body="${out%$'\n'*}"
  if [ "$code" != "200" ]; then echo "clean: HTTP $code — $body" >&2; echo "clean failed; nothing seeded" >&2; exit 1; fi
  node -e 'const j=JSON.parse(process.argv[1]); console.log(`clean: events_deleted ${j.events_deleted} · runs_deleted ${j.runs_deleted} · at ${j.at}`)' "$body"
}

# reset_alpha — the ZZTEST Alpha Pending Approval row back to "Pending Approval". GET first; title must start with ZZTEST.
reset_alpha() {
  [ -n "${AIRTABLE_TOKEN:-}" ] || { echo "reset_alpha: AIRTABLE_TOKEN not set — row left as is" >&2; return 0; }
  local rec tbl base title code
  rec=$(printf '%s' "$ZZTEST_PA_URL" | grep -oE 'rec[A-Za-z0-9]{14}' | tail -1)
  tbl=$(printf '%s' "$ZZTEST_PA_URL" | grep -oE 'tbl[A-Za-z0-9]{14}' | head -1)
  base="${AIRTABLE_BASE_ID:-appixWl8C3bogLsvp}"
  [ -n "$rec" ] && [ -n "$tbl" ] || { echo "reset_alpha: ZZTEST_PA_URL carries no rec/tbl id — row left as is" >&2; return 0; }
  title=$(curl -s -H "Authorization: Bearer $AIRTABLE_TOKEN" "https://api.airtable.com/v0/$base/$tbl/$rec" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const f=(JSON.parse(s).fields||{});process.stdout.write(String(f["Action Title"]||f["Name"]||""))})')
  case "$title" in ZZTEST*) ;; *) echo "reset_alpha: row $rec is not a ZZTEST row (title '$title') — refusing to write" >&2; return 0 ;; esac
  code=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "https://api.airtable.com/v0/$base/$tbl/$rec" \
    -H "Authorization: Bearer $AIRTABLE_TOKEN" -H "Content-Type: application/json" \
    --data '{"fields":{"Status":"Pending Approval"}}')
  echo "reset_alpha: $rec Status → Pending Approval · HTTP $code"
}

if [ "${1:-}" = "--one" ]; then
  run "One-off (running)" zztest-builder "ZZTEST Client" claude_code 0 '[]'
  exit 0
fi
[ "${1:-}" != "--clean" ] || clean

: "${ZZTEST_PA_URL:?set ZZTEST_PA_URL in .env (the ZZTEST Alpha Pending Approval row)}"
reset_alpha
run "Alpha (waiting)"  zztest-approver "ZZTEST Client" cowork_scheduled 0.1 \
  "[{\"event_type\":\"gate_waiting\",\"payload\":{\"gate\":\"ZZTEST gate\",\"surface\":\"pending_approval\",\"ref_url\":\"$ZZTEST_PA_URL\"}},{\"event_type\":\"run_completed\",\"payload\":{\"outcome\":\"success\"}}]"
run "Beta (running)"   zztest-builder  "ZZTEST Client" claude_code      0.05 '[]'
run "Gamma (failed)"   zztest-faulty   null            cowork_manual    0.2 \
  '[{"event_type":"run_failed","payload":{"reason":"ZZTEST fault"}}]'
run "Delta (asleep)"   zztest-sleeper  "ZZTEST Client" chat             96 \
  '[{"event_type":"run_completed","payload":{"outcome":"success"}}]'
# Epsilon (U13): the page it "wrote" is ZZTEST_ARTIFACT_URL (default: the Agent World project page in Notion — read only, nothing is written there);
# the second artifact is a Compass reference, which the card shows as a label with no Open.
: "${ZZTEST_ARTIFACT_URL:=https://app.notion.com/p/3d1c0af9c97481ce8a25f4bdeadd54ab}"
run "Epsilon (artist)"  zztest-artist   "ZZTEST Client" cowork_manual    0 \
  "[{\"event_type\":\"artifact_registered\",\"payload\":{\"type\":\"notion_page\",\"title\":\"ZZTEST artifact page\",\"notion_url\":\"$ZZTEST_ARTIFACT_URL\"}},{\"event_type\":\"run_completed\",\"payload\":{\"outcome\":\"success\",\"artifacts\":[{\"title\":\"ZZTEST config reference\",\"url\":\"ops_config:ZZTEST_REF\",\"system\":\"compass\"}]}}]"
run "Eta (stale)"       zztest-stale-expert "ZZTEST Client" cowork_scheduled 960 \
  '[{"event_type":"run_completed","payload":{"outcome":"success"}}]'
echo "seeded — look at the world after the next poll (≤ 15 s)"
