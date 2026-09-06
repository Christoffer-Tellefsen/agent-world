#!/usr/bin/env bash
# Agent World — Claude Code hooks → Compass Run Ledger (Harness Step 7, Component 7).
# One session = one run: run_id = the Claude Code session_id (SKILL_RUN_LEDGER.endpoint.claude_code).
# Usage (from .claude/settings.json): ledger.sh run_started | gate_waiting | gate_passed | run_completed
# Reads the hook's JSON input on stdin. Never blocks the session: every failure exits 0 quietly.
# Privacy: references only — no tool input, no command text, no file contents (Compass rule 6; the Worker
# refuses content-shaped keys anyway).
set -u
EVENT="${1:-}"
HERE="$(cd "$(dirname "$0")/../.." && pwd)"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
: "${EVENTS_URL:=https://tellefsen-compass-mcp.christoffer-7e3.workers.dev/events}"
[ -n "${EVENTS_BEARER_TOKEN:-}" ] || exit 0          # no token, no ledger — the session still runs
command -v jq >/dev/null 2>&1 || exit 0              # jq is required; install with brew install jq

INPUT="$(cat)"
SESSION="$(printf '%s' "$INPUT" | jq -r '.session_id // empty')"
[ -n "$SESSION" ] || exit 0
TOOL="$(printf '%s' "$INPUT" | jq -r '.tool_name // empty')"
PROJECT="${AGENT_WORLD_PROJECT_ID:-3d1c0af9-c974-81ce-8a25-f4bdeadd54ab}"
REPO_URL="${REPO_URL:-https://github.com/Christoffer-Tellefsen/agent-world}"
MARKER="$HERE/.claude/.gate-open"
RUN_ID_FILE="$HERE/.claude/run_id"

post() {  # $1 = JSON body
  curl -s -m 5 -o /dev/null -X POST "$EVENTS_URL" \
    -H "Authorization: Bearer $EVENTS_BEARER_TOKEN" \
    -H "Content-Type: application/json" \
    --data "$1" || true
}
base() {  # $1 = event_type, $2 = payload json, $3 = optional id
  jq -cn --arg t "$1" --arg run "$SESSION" --arg project "$PROJECT" --arg id "${3:-}" --argjson payload "$2" '
    {event_type:$t, run_id:$run, skill:"agent-world-build", trigger:"claude_code", client:null,
     project:$project, actor:"claude_code", payload:$payload} + (if $id != "" then {id:$id} else {} end)'
}

case "$EVENT" in
  run_started)
    # id = session id → a resumed session (SessionStart fires on resume too) is a duplicate, ignored by the Worker.
    printf '%s' "$SESSION" > "$RUN_ID_FILE"
    rm -f "$MARKER"
    post "$(base run_started '{"run_class":"B_judge","skill_version":"m1"}' "$SESSION")"
    ;;
  gate_waiting)
    # A permission prompt is a Class B gate held by a human (SKILL_RUN_LEDGER.write_protocol.1_gates).
    printf '%s' "${TOOL:-tool}" > "$MARKER"
    post "$(base gate_waiting "$(jq -cn --arg g "permission:${TOOL:-tool}" --arg u "$REPO_URL" '{gate:$g,surface:"class_b_gate",ref_url:$u}')")"
    ;;
  gate_passed)
    # Fires after every tool; only meaningful when a prompt was open — the marker says so.
    [ -f "$MARKER" ] || exit 0
    G="$(cat "$MARKER")"; rm -f "$MARKER"
    post "$(base gate_passed "$(jq -cn --arg g "permission:$G" --arg u "$REPO_URL" '{gate:$g,surface:"class_b_gate",ref_url:$u,result:"approved"}')")"
    ;;
  run_completed)
    # A prompt still open at exit was refused: close it as rejected so no ? outlives the session.
    if [ -f "$MARKER" ]; then
      G="$(cat "$MARKER")"; rm -f "$MARKER"
      post "$(base gate_passed "$(jq -cn --arg g "permission:$G" --arg u "$REPO_URL" '{gate:$g,surface:"class_b_gate",ref_url:$u,result:"rejected"}')")"
    fi
    post "$(base run_completed '{"outcome":"success"}')"
    # The ops_skill_runs row is written by the session itself at end-of-run (CLAUDE.md, session rule 6).
    ;;
  *) exit 0 ;;
esac
exit 0
