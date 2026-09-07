#!/usr/bin/env bash
# Agent World — Claude Code hooks → Compass Run Ledger (Harness Step 7, Component 7).
# One session = one run: run_id = the Claude Code session_id (SKILL_RUN_LEDGER.endpoint.claude_code).
# Usage (from .claude/settings.json):
#   ledger.sh session_start   SessionStart        — writes .claude/state/<session>.session (session_id, cwd, started_at)
#                                                   and reconciles stale sessions. Posts NOTHING: the desktop app opens
#                                                   sub-second helper sessions that fire SessionStart with no prompt ever
#                                                   typed (a6e2f7d1, d16558a3, 4b23b538 on 2026-09-07 were such phantoms).
#   ledger.sh run_started     UserPromptSubmit    — run_started (id = session id) on the FIRST prompt only; the state file's
#                                                   run_started_at marker makes every later prompt a no-op.
#   ledger.sh gate_waiting    PermissionRequest   — gate_waiting, gate id appended to .claude/state/<session>.gates
#   ledger.sh gate_passed     PostToolUse + PostToolUseFailure — closes the matching gate (tool_failed on failure)
#   ledger.sh run_completed   SessionEnd          — with the marker: rejects gates still open, posts run_completed, removes
#                                                   the files. Without it (a helper session): removes the files, posts nothing.
# Reads the hook's JSON input on stdin. Never blocks the session: every failure exits 0 quietly.
# HOOK_DRY_RUN=1 prints each would-be POST body on stdout instead of sending it (never prints the token).
# Privacy: references only — no tool input, no command text, no file contents, no prompt text (Compass rule 6; the
# Worker refuses content-shaped keys anyway). The gate id carries a sha1 prefix of the tool input, never the input.
#
# Gate ids. PermissionRequest carries no tool_use_id (hooks reference, "PermissionRequest input"), so the gate
# is permission:<tool_name>:<12 hex of sha1(canonical tool_input JSON)>, suffixed -N when the same key is
# already open in this session. PostToolUse / PostToolUseFailure carry the same tool_input (and a tool_use_id,
# honoured when the open side had one), so the close derives the same key and pairs by it.
#
# Event ids are uuid v5 of run_id + gate + event_type: a double post (SessionEnd and a later reconcile, a
# resumed session's first prompt) is a duplicate the Worker ignores (on_conflict=id, ignore-duplicates).
set -u
EVENT="${1:-}"
HERE="$(cd "$(dirname "$0")/../.." && pwd)"
[ -f "$HERE/.env" ] && set -a && . "$HERE/.env" && set +a
: "${EVENTS_URL:=https://tellefsen-compass-mcp.christoffer-7e3.workers.dev/events}"
DRY_RUN="${HOOK_DRY_RUN:-${LEDGER_DRY_RUN:-}}"
[ -n "${EVENTS_BEARER_TOKEN:-}" ] || [ -n "$DRY_RUN" ] || exit 0   # no token, no ledger — the session still runs
command -v jq >/dev/null 2>&1 || exit 0              # jq is required; install with brew install jq
command -v shasum >/dev/null 2>&1 || exit 0

INPUT="$(cat)"
SESSION="$(printf '%s' "$INPUT" | jq -r '.session_id // empty')"
[ -n "$SESSION" ] || exit 0
HOOK_EVENT="$(printf '%s' "$INPUT" | jq -r '.hook_event_name // empty')"
TOOL="$(printf '%s' "$INPUT" | jq -r '.tool_name // empty')"
TOOL_USE_ID="$(printf '%s' "$INPUT" | jq -r '.tool_use_id // empty')"
INPUT_HASH="$(printf '%s' "$INPUT" | jq -cS '.tool_input // {}' | shasum | cut -c1-12)"
CWD="$(printf '%s' "$INPUT" | jq -r '.cwd // empty')"
PROJECT="${AGENT_WORLD_PROJECT_ID:-3d1c0af9-c974-81ce-8a25-f4bdeadd54ab}"
REPO_URL="${REPO_URL:-https://github.com/Christoffer-Tellefsen/agent-world}"
STATE_DIR="$HERE/.claude/state"
GATES="$STATE_DIR/$SESSION.gates"
STATE="$STATE_DIR/$SESSION.session"
RUN_ID_FILE="$HERE/.claude/run_id"
STALE_MINUTES="${LEDGER_STALE_MINUTES:-30}"
mkdir -p "$STATE_DIR"

post() {  # $1 = JSON body. Dry run prints the body instead (offline tests; never prints the token).
  if [ -n "$DRY_RUN" ]; then printf '%s\n' "$1"; return 0; fi
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
# The session state file. started() says whether run_started was posted for a session:
# "yes" when its state file carries the marker, "legacy" when only a pre-marker .gates file exists (the old hooks
# posted run_started at SessionStart, so that run still owes a run_completed), "no" otherwise.
write_state() {  # $1 = session id, $2 = cwd
  [ -f "$STATE_DIR/$1.session" ] && return 0                 # resume / compact fire SessionStart again: keep the marker
  jq -cn --arg s "$1" --arg c "$2" --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{session_id:$s, cwd:$c, started_at:$t, run_started_at:null}' > "$STATE_DIR/$1.session"
}
started() {  # $1 = session id
  local f="$STATE_DIR/$1.session"
  if [ -f "$f" ]; then
    [ "$(jq -r '.run_started_at // empty' "$f" 2>/dev/null)" != "" ] && echo yes || echo no
  elif [ -f "$STATE_DIR/$1.gates" ]; then echo legacy
  else echo no; fi
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
end_session() {  # $1 = session id, $2 = note for rejected closes, $3 = run_completed payload. Posts only if run_started was.
  case "$(started "$1")" in
    yes|legacy) close_run "$1" "$STATE_DIR/$1.gates" "$2" "$3" ;;
    *) rm -f "$STATE_DIR/$1.gates" ;;
  esac
  rm -f "$STATE_DIR/$1.session"
}

case "$EVENT" in
  session_start)
    write_state "$SESSION" "$CWD"
    rm -f "$HERE/.claude/.gate-open"                      # pre-follow-up marker, no longer used
    # Reconcile: SessionEnd may never fire when the desktop app closes a session. Another session's files untouched
    # for STALE_MINUTES (every prompt and tool use touches them) are a session that ended without its SessionEnd:
    # a run that posted run_started gets its terminal event; a helper session that never did is just cleaned up.
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      sid="$(basename "$f")"; sid="${sid%.*}"
      [ "$sid" != "$SESSION" ] || continue
      [ -f "$STATE_DIR/$sid.session" ] && [ "${f##*.}" = "gates" ] && continue   # judged by its .session file instead
      end_session "$sid" "unresolved_at_session_end" '{"outcome":"success","note":"reconciled_at_next_session_start"}'
    done < <(find "$STATE_DIR" -maxdepth 1 \( -name '*.session' -o -name '*.gates' \) -mmin "+$STALE_MINUTES" 2>/dev/null)
    ;;
  run_started)
    # UserPromptSubmit: the first prompt of a session is what makes it a run. Once per session, marker in the state file.
    write_state "$SESSION" "$CWD"                         # the hook may have been added mid-session
    [ "$(started "$SESSION")" = "yes" ] && { touch "$STATE" "$GATES" 2>/dev/null; exit 0; }
    tmp="$(jq -c --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '.run_started_at=$t' "$STATE")" && printf '%s\n' "$tmp" > "$STATE"
    printf '%s' "$SESSION" > "$RUN_ID_FILE"
    [ -f "$GATES" ] || : > "$GATES"
    post "$(base "$SESSION" run_started '{"run_class":"B_judge","skill_version":"m1"}' "$SESSION")"
    ;;
  gate_waiting)
    # A permission prompt is a Class B gate held by a human (SKILL_RUN_LEDGER.write_protocol.1_gates).
    KEY="${TOOL_USE_ID:-h:$INPUT_HASH}"
    GATE="permission:${TOOL:-tool}:${TOOL_USE_ID:-$INPUT_HASH}"
    # Suffix repeats of the same key (open or already closed) so gate ids — and their event ids — stay unique.
    N="$( { [ -f "$GATES" ] && cat "$GATES"; } | awk -F'\t' -v k="$KEY" '$1=="open"&&$2==k{n++} END{print n+0}')"
    [ "$N" -eq 0 ] || GATE="$GATE-$((N+1))"
    printf 'open\t%s\t%s\n' "$KEY" "$GATE" >> "$GATES"
    [ -f "$STATE" ] && touch "$STATE"
    post "$(base "$SESSION" gate_waiting "$(gate_payload "$GATE" '{}')" "$(eid "$SESSION" "$GATE" gate_waiting)")"
    ;;
  gate_passed)
    # Fires after every tool (PostToolUse and PostToolUseFailure); only meaningful when this call held a prompt.
    [ -f "$GATES" ] && touch "$GATES"                    # activity heartbeat for the reconcile age check
    [ -f "$STATE" ] && touch "$STATE"
    GATE="$(open_gates "$GATES" | awk -F'\t' -v a="${TOOL_USE_ID:-}" -v b="h:$INPUT_HASH" '($1==b)||(a!=""&&$1==a){print $2; exit}')"
    [ -n "$GATE" ] || exit 0
    printf 'close\t%s\n' "$GATE" >> "$GATES"
    EXTRA='{"result":"approved"}'
    [ "$HOOK_EVENT" != "PostToolUseFailure" ] || EXTRA='{"result":"approved","tool_failed":true}'
    post "$(base "$SESSION" gate_passed "$(gate_payload "$GATE" "$EXTRA")" "$(eid "$SESSION" "$GATE" gate_passed)")"
    ;;
  run_completed)
    # SessionEnd (per-hook timeout 10 s in settings.json). A prompt still open at exit was never answered: close it
    # as rejected so no ? outlives the session, then the terminal event — but only for a session that posted
    # run_started. A helper session with no prompt just loses its state file. Not on Stop — Stop is per turn.
    end_session "$SESSION" "unresolved_at_session_end" '{"outcome":"success"}'
    # The ops_skill_runs row is written by the session itself at end-of-run (CLAUDE.md, session rule 6).
    ;;
  *) exit 0 ;;
esac
exit 0
