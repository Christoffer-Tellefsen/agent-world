#!/usr/bin/env bash
# Agent World — Claude Code hooks → Compass Run Ledger (Harness Step 7, Component 7).
# One session = one run: run_id = the Claude Code session_id (SKILL_RUN_LEDGER.endpoint.claude_code).
# Usage (from .claude/settings.json):
#   ledger.sh run_started     SessionStart        — run_started (id = session id) + reconcile stale sessions
#   ledger.sh gate_waiting    PermissionRequest   — gate_waiting, gate id appended to .claude/state/<session>.gates
#   ledger.sh gate_passed     PostToolUse + PostToolUseFailure — closes the matching gate (tool_failed on failure)
#   ledger.sh run_completed   SessionEnd          — rejects gates still open, posts run_completed, removes the file
# Reads the hook's JSON input on stdin. Never blocks the session: every failure exits 0 quietly.
# Privacy: references only — no tool input, no command text, no file contents (Compass rule 6; the Worker
# refuses content-shaped keys anyway). The gate id carries a sha1 prefix of the tool input, never the input.
#
# Gate ids. PermissionRequest carries no tool_use_id (hooks reference, "PermissionRequest input"), so the gate
# is permission:<tool_name>:<12 hex of sha1(canonical tool_input JSON)>, suffixed -N when the same key is
# already open in this session. PostToolUse / PostToolUseFailure carry the same tool_input (and a tool_use_id,
# honoured when the open side had one), so the close derives the same key and pairs by it.
#
# Event ids are uuid v5 of run_id + gate + event_type: a double post (SessionEnd and a later reconcile, a
# resumed session's run_started) is a duplicate the Worker ignores (on_conflict=id, ignore-duplicates).
set -u
EVENT="${1:-}"
HERE="$(cd "$(dirname "$0")/../.." && pwd)"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
: "${EVENTS_URL:=https://tellefsen-compass-mcp.christoffer-7e3.workers.dev/events}"
[ -n "${EVENTS_BEARER_TOKEN:-}" ] || [ -n "${LEDGER_DRY_RUN:-}" ] || exit 0   # no token, no ledger — the session still runs
command -v jq >/dev/null 2>&1 || exit 0              # jq is required; install with brew install jq
command -v shasum >/dev/null 2>&1 || exit 0

INPUT="$(cat)"
SESSION="$(printf '%s' "$INPUT" | jq -r '.session_id // empty')"
[ -n "$SESSION" ] || exit 0
HOOK_EVENT="$(printf '%s' "$INPUT" | jq -r '.hook_event_name // empty')"
TOOL="$(printf '%s' "$INPUT" | jq -r '.tool_name // empty')"
TOOL_USE_ID="$(printf '%s' "$INPUT" | jq -r '.tool_use_id // empty')"
INPUT_HASH="$(printf '%s' "$INPUT" | jq -cS '.tool_input // {}' | shasum | cut -c1-12)"
PROJECT="${AGENT_WORLD_PROJECT_ID:-3d1c0af9-c974-81ce-8a25-f4bdeadd54ab}"
REPO_URL="${REPO_URL:-https://github.com/Christoffer-Tellefsen/agent-world}"
STATE_DIR="$HERE/.claude/state"
GATES="$STATE_DIR/$SESSION.gates"
RUN_ID_FILE="$HERE/.claude/run_id"
STALE_MINUTES="${LEDGER_STALE_MINUTES:-30}"
mkdir -p "$STATE_DIR"

post() {  # $1 = JSON body. LEDGER_DRY_RUN=1 prints the body instead (offline tests; never prints the token).
  if [ -n "${LEDGER_DRY_RUN:-}" ]; then printf '%s\n' "$1"; return 0; fi
  curl -s -m 4 -o /dev/null -X POST "$EVENTS_URL" \
    -H "Authorization: Bearer $EVENTS_BEARER_TOKEN" \
    -H "Content-Type: application/json" \
    --data "$1" || true
}
uuid5() {  # $1 = name → RFC 4122 v5 uuid in the URL namespace (6ba7b811-9dad-11d1-80b4-00c04fd430c8)
  local h v
  h="$( { printf '\x6b\xa7\xb8\x11\x9d\xad\x11\xd1\x80\xb4\x00\xc0\x4f\xd4\x30\xc8'; printf '%s' "$1"; } | shasum | cut -c1-32)"
  case "${h:16:1}" in [0-3]) v=8 ;; [4-7]) v=9 ;; [89ab]) v=a ;; *) v=b ;; esac
  printf '%s-%s-5%s-%s%s-%s' "${h:0:8}" "${h:8:4}" "${h:13:3}" "$v" "${h:17:3}" "${h:20:12}"
}
eid() {  # $1 = run_id, $2 = gate (may be empty), $3 = event_type
  uuid5 "agent-world:$1:$2:$3"
}
base() {  # $1 = run_id, $2 = event_type, $3 = payload json, $4 = id
  jq -cn --arg t "$2" --arg run "$1" --arg project "$PROJECT" --arg id "$4" --argjson payload "$3" '
    {id:$id, event_type:$t, run_id:$run, skill:"agent-world-build", trigger:"claude_code", client:null,
     project:$project, actor:"claude_code", payload:$payload}'
}
gate_payload() {  # $1 = gate, $2 = extra json object merged in
  jq -cn --arg g "$1" --arg u "$REPO_URL" --argjson x "$2" '{gate:$g,surface:"class_b_gate",ref_url:$u} + $x'
}
open_gates() {  # $1 = gates file → lines "key<TAB>gate", oldest first, for gates opened and not yet closed
  [ -f "$1" ] || return 0
  awk -F'\t' '$1=="open"{o[$3]=$2; ord[++n]=$3} $1=="close"{delete o[$2]}
              END{for(i=1;i<=n;i++) if (ord[i] in o) print o[ord[i]] "\t" ord[i]}' "$1"
}
close_run() {  # $1 = run_id, $2 = gates file, $3 = note for the rejected closes, $4 = run_completed payload
  local key gate extra
  extra="$(jq -cn --arg n "$3" '{result:"rejected",note:$n}')"
  while IFS=$'\t' read -r key gate; do
    [ -n "$gate" ] || continue
    printf 'close\t%s\n' "$gate" >> "$2"
    post "$(base "$1" gate_passed "$(gate_payload "$gate" "$extra")" "$(eid "$1" "$gate" gate_passed)")"
  done < <(open_gates "$2")
  post "$(base "$1" run_completed "$4" "$(eid "$1" "" run_completed)")"
  rm -f "$2"
}

case "$EVENT" in
  run_started)
    # id = session id → a resumed session (SessionStart fires on resume too) is a duplicate, ignored by the Worker.
    printf '%s' "$SESSION" > "$RUN_ID_FILE"
    rm -f "$HERE/.claude/.gate-open"                      # pre-follow-up marker, no longer used
    [ -f "$GATES" ] || : > "$GATES"                       # every session has a file, so every session gets reconciled
    post "$(base "$SESSION" run_started '{"run_class":"B_judge","skill_version":"m1"}' "$SESSION")"
    # Reconcile: SessionEnd may never fire when the desktop app closes a session. Another session's gates file
    # untouched for STALE_MINUTES (every tool use touches it) is a run that ended without its terminal event.
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      sid="$(basename "$f" .gates)"
      [ "$sid" != "$SESSION" ] || continue
      close_run "$sid" "$f" "unresolved_at_session_end" '{"outcome":"success","note":"reconciled_at_next_session_start"}'
    done < <(find "$STATE_DIR" -maxdepth 1 -name '*.gates' -mmin "+$STALE_MINUTES" 2>/dev/null)
    ;;
  gate_waiting)
    # A permission prompt is a Class B gate held by a human (SKILL_RUN_LEDGER.write_protocol.1_gates).
    KEY="${TOOL_USE_ID:-h:$INPUT_HASH}"
    GATE="permission:${TOOL:-tool}:${TOOL_USE_ID:-$INPUT_HASH}"
    # Suffix repeats of the same key (open or already closed) so gate ids — and their event ids — stay unique.
    N="$( { [ -f "$GATES" ] && cat "$GATES"; } | awk -F'\t' -v k="$KEY" '$1=="open"&&$2==k{n++} END{print n+0}')"
    [ "$N" -eq 0 ] || GATE="$GATE-$((N+1))"
    printf 'open\t%s\t%s\n' "$KEY" "$GATE" >> "$GATES"
    post "$(base "$SESSION" gate_waiting "$(gate_payload "$GATE" '{}')" "$(eid "$SESSION" "$GATE" gate_waiting)")"
    ;;
  gate_passed)
    # Fires after every tool (PostToolUse and PostToolUseFailure); only meaningful when this call held a prompt.
    [ -f "$GATES" ] && touch "$GATES"                    # activity heartbeat for the reconcile age check
    GATE="$(open_gates "$GATES" | awk -F'\t' -v a="${TOOL_USE_ID:-}" -v b="h:$INPUT_HASH" '($1==b)||(a!=""&&$1==a){print $2; exit}')"
    [ -n "$GATE" ] || exit 0
    printf 'close\t%s\n' "$GATE" >> "$GATES"
    EXTRA='{"result":"approved"}'
    [ "$HOOK_EVENT" != "PostToolUseFailure" ] || EXTRA='{"result":"approved","tool_failed":true}'
    post "$(base "$SESSION" gate_passed "$(gate_payload "$GATE" "$EXTRA")" "$(eid "$SESSION" "$GATE" gate_passed)")"
    ;;
  run_completed)
    # SessionEnd (per-hook timeout 10 s in settings.json). A prompt still open at exit was never answered: close it
    # as rejected so no ? outlives the session, then the terminal event. Not on Stop — Stop is per turn.
    close_run "$SESSION" "$GATES" "unresolved_at_session_end" '{"outcome":"success"}'
    # The ops_skill_runs row is written by the session itself at end-of-run (CLAUDE.md, session rule 6).
    ;;
  *) exit 0 ;;
esac
exit 0
