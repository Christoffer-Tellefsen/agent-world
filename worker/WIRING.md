# U10 — Worker ledger-read proxy: what was actually deployed

Deployed 2026-09-06 13:12 Muscat on `tellefsen-compass-mcp`, version `7f50efee-3fc0-4cbf-9c66-cea85c4a0d3b`.
Verified: `401` (no token), `401` (wrong token), `400` (no `since`), `200` with real rows that match the
Compass MCP's `list_records(ops_run_events)` id-for-id.

The repo is a TypeScript Cloudflare Worker (`wrangler.jsonc`, `src/index.ts` entry, one
`src/lib/<name>-endpoint.ts` per bearer-authenticated route, routed ahead of the OAuth provider).
The file in this folder, `ledger-read-endpoint.ts`, is the deployed source — it lives at
`src/lib/ledger-read-endpoint.ts` in that repo and mirrors `events-endpoint.ts` exactly: same
`XEndpointEnv` interface pattern, same constant-time `bearerOk`, same `json()` helper, same
PostgREST headers.

Wired into `src/index.ts` with two additions (applied by script, not by hand):

```ts
import { handleLedgerScanRequest, type LedgerReadEndpointEnv } from "./lib/ledger-read-endpoint.js";
```
```ts
    if (url.pathname === "/ledger/scan") {
      return handleLedgerScanRequest(request, env as unknown as LedgerReadEndpointEnv);
    }
```
— the second block sits directly before `return oauthProvider.fetch(request, env, ctx);`.

No new secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `EVENTS_BEARER_TOKEN` already existed
as Worker secrets. `EVENTS_BEARER_TOKEN` was rotated at deploy time (safe — nothing live used the
old value yet) and the new value was written to `agent-world/.env` in the same step.

Smoke test (replace `<token>`):
```bash
W=https://tellefsen-compass-mcp.christoffer-7e3.workers.dev
curl -s -o /dev/null -w '%{http_code}\n' "$W/ledger/scan?since=2026-09-01T00:00:00Z"                                  # 401
curl -s -o /dev/null -w '%{http_code}\n' -H 'Authorization: Bearer wrong' "$W/ledger/scan?since=2026-09-01T00:00:00Z" # 401
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer <token>" "$W/ledger/scan"                           # 400
curl -s -H "Authorization: Bearer <token>" "$W/ledger/scan?since=2026-09-01T00:00:00Z" | head -c 300                   # 200 {"events":[...
```
