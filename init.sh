#!/usr/bin/env bash
# Agent World — session start: install, build, test, smoke. Exit non-zero on any breakage.
# Run this before changing anything, every session (CLAUDE.md, session rule 1).
set -euo pipefail
cd "$(dirname "$0")"
if [ -f .env ]; then set -a; . ./.env; set +a; fi
PORT="${PORT:-5274}"
node -e 'const [M]=process.versions.node.split("."); if(+M<20){console.error("Node >= 20 required");process.exit(1)}'
(npm ci --no-audit --no-fund --silent 2>/dev/null || npm install --no-audit --no-fund --silent)
npm run build --silent
[ -f server/harnesses/compass.mjs ] && node --check server/harnesses/compass.mjs
npm test --silent
node server/serve.mjs >/tmp/agent-world.log 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do curl -sf "http://127.0.0.1:${PORT}/api/harnesses" >/dev/null 2>&1 && break; sleep 0.5; done
curl -s "http://127.0.0.1:${PORT}/api/harnesses" | node -e '
  let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
    const {harnesses=[]}=JSON.parse(s||"{}");
    const ids=harnesses.map(h=>h.id);
    if(ids.length!==1||ids[0]!=="compass"){console.error("registry must be exactly [compass], got",ids);process.exit(1)}
    if(!harnesses[0].detected){console.error("compass not detected — set EVENTS_URL and EVENTS_BEARER_TOKEN in .env");process.exit(1)}
    console.log("harness: compass detected")})'
curl -s "http://127.0.0.1:${PORT}/api/threads" | node -e '
  let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
    const {threads=[]}=JSON.parse(s||"{}");
    const bad=threads.flatMap(t=>Object.entries(t).filter(([,v])=>v===undefined).map(([k])=>k));
    console.log(`threads: ${threads.length}${bad.length?" · undefined fields: "+[...new Set(bad)].join(","):""}`);
    if(bad.length)process.exit(1)})'
echo "smoke ok"
