#!/usr/bin/env bash
# Agent World — clear this browser's local hide list so the mirror shows every run again.
# Bot Crossing's A key hides a figure from *this* view only (data/colony.json → archived); nothing in
# the ledger changes. Plots and render settings are kept. Reload the browser afterwards.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f data/colony.json ] || { echo "no data/colony.json yet — nothing hidden"; exit 0; }
node -e '
const fs = require("fs"), f = "data/colony.json"
const s = JSON.parse(fs.readFileSync(f, "utf8"))
const n = (s.archived || []).length
s.archived = []; s.archivedAt = {}
fs.writeFileSync(f, JSON.stringify(s, null, 2))
console.log(`un-hid ${n} run(s); plots kept — reload the browser`)'
