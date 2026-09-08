#!/usr/bin/env bash
# Agent World — re-capture the three Worker responses the contract test validates (U34 + U35, docs/CONTRACT.md).
# GET only. Bearer from .env, never printed. Actors scrubbed, notes trimmed; the ZZTEST runs plus ten others.
# --substrate-only re-captures GET /world/substrate alone (a Worker deploy that changed only the substrate — v2, 2026-09-07).
# --spend-only re-captures GET /world/spend?window=30 alone (U35W).
set -euo pipefail
ONLY="${1:-}"
cd "$(dirname "$0")/.."
if [ -f .env ]; then set -a; . ./.env; set +a; fi
: "${EVENTS_URL:?set EVENTS_URL in .env}"; : "${EVENTS_BEARER_TOKEN:?set EVENTS_BEARER_TOKEN in .env}"
W="${EVENTS_URL%/events}"
STAMP=$(date -u +%Y-%m-%d)
[ "$ONLY" = "--spend-only" ] || curl -sf -H "Authorization: Bearer $EVENTS_BEARER_TOKEN" "$W/world/substrate" | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);j.note=`GET /world/substrate captured ${process.argv[1]} for the contract test (U34). Re-capture with scripts/capture-contract.sh.`;require("fs").writeFileSync("test/fixtures/m2b-substrate.live.json",JSON.stringify(j,null,1)+"\n");console.log("substrate captured:",Object.keys(j).join(","))})' "$STAMP"
[ "$ONLY" = "--substrate-only" ] && exit 0
[ "$ONLY" = "--spend-only" ] || true
curl -sf -H "Authorization: Bearer $EVENTS_BEARER_TOKEN" "$W/world/spend?window=30" | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const out={note:`GET /world/spend?window=30 captured ${process.argv[1]} for the contract test (U35, ES-4.13). Re-capture with scripts/capture-contract.sh.`,...j};require("fs").writeFileSync("test/fixtures/m2b-spend.live.json",JSON.stringify(out,null,1)+"\n");console.log("spend captured:",j.totals?.runs_total,"runs,",j.totals?.runs_metered,"metered")})' "$STAMP"
[ "$ONLY" = "--spend-only" ] && exit 0
SINCE=$(node -e 'process.stdout.write(new Date(Date.now()-14*864e5).toISOString())')
curl -sf -H "Authorization: Bearer $EVENTS_BEARER_TOKEN" "$W/ledger/scan?since=$SINCE" | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  const j=JSON.parse(s)
  const runIds=[...new Set(j.events.map(e=>e.run_id))]
  const zz=runIds.filter(id=>j.events.some(e=>e.run_id===id&&/^zztest-/.test(e.skill||"")))
  const keep=new Set([...zz,...runIds.filter(id=>!zz.includes(id)).slice(0,10)])
  const events=j.events.filter(e=>keep.has(e.run_id)).map(e=>({...e, actor: e.actor ? "actor" : e.actor}))
  const rows=j.rows.filter(r=>keep.has(r.id)).map(r=>({...r, notes: typeof r.notes==="string" ? r.notes.slice(0,80) : r.notes}))
  require("fs").writeFileSync("test/fixtures/m2b-ledger-scan.live.json", JSON.stringify({captured_at:new Date().toISOString(), note:`GET /ledger/scan sample captured ${process.argv[1]} for the contract test (U34): the ZZTEST runs plus ten others; actors scrubbed, notes trimmed. Re-capture with scripts/capture-contract.sh.`, events, rows}, null, 1)+"\n")
  console.log("scan captured:", events.length, "events,", rows.length, "rows")
})' "$STAMP"
