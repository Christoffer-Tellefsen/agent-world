#!/usr/bin/env bash
# Agent World — run the world locally. Loads .env, then starts Vite with the API inside it.
# `npm run dev` on its own does NOT read .env (Vite only exposes VITE_* vars to the browser,
# never to the server-side API middleware), so the adapter would start with no token and show
# an empty world. This wrapper is the one to use. init.sh already does the same for its smoke test.
set -euo pipefail
cd "$(dirname "$0")"
if [ -f .env ]; then set -a; . ./.env; set +a; fi
exec npm run dev
