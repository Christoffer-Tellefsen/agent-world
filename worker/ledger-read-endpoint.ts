// ─── Read-only ledger proxy for local readers: GET /ledger/scan ─────────────
//
// Why this exists: the Compass Supabase project is provisioned through Lovable
// Cloud, which exposes no Supabase URL or service-role key outside itself — no
// dashboard, no chat answer, nothing (confirmed 2026-09-06, matches Supabase's
// own documented Lovable Cloud behaviour). This Worker already holds
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as its own secrets — that's how
// POST /events already reaches Postgres. This endpoint lets a local reader
// (the Agent World adapter, or any future one) borrow that access, scoped to
// exactly two tables, read-only, behind the same bearer token /events uses.
//
// Behaviour
//   - Auth: Authorization: Bearer <EVENTS_BEARER_TOKEN>. Same constant-time
//     compare as /events. Never returns the Supabase key.
//   - GET /ledger/scan?since=<ISO-8601> → { events: [...], rows: [...] }
//       events — every ops_run_events row with at >= since, oldest first
//       rows   — every ops_skill_runs row whose id is one of those events'
//                 run_id values (so the caller never needs a second round trip)
//   - SELECT only. No path in this file writes to Supabase.
//   - A malformed or missing `since` is a 400, not a guess.

export interface LedgerReadEndpointEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  EVENTS_BEARER_TOKEN: string;
}

interface LedgerEvent {
  id: string;
  run_id: string;
  at: string;
  event_type: string;
  skill: string;
  trigger: string | null;
  client: string | null;
  project: string | null;
  actor: string | null;
  payload: Record<string, unknown> | null;
}

interface LedgerRow {
  id: string;
  model: string | null;
  outcome: string;
  notes: string | null;
  artifacts: unknown;
  duration_s: number | null;
  run_class: string;
  human_edit_level: string;
}

const PAGE = 1000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ─── Entry point ─────────────────────────────────────────────────────────────
export async function handleLedgerScanRequest(
  request: Request,
  env: LedgerReadEndpointEnv,
): Promise<Response> {
  if (request.method !== "GET") {
    return json({ error: "method not allowed" }, 405, { Allow: "GET" });
  }
  if (!env.EVENTS_BEARER_TOKEN) {
    return json(
      { error: "EVENTS_BEARER_TOKEN is not configured on the Worker" },
      503,
    );
  }
  if (!bearerOk(request.headers.get("Authorization"), env.EVENTS_BEARER_TOKEN)) {
    return json({ error: "unauthorized" }, 401, {
      "WWW-Authenticate": 'Bearer realm="compass-events"',
    });
  }

  const url = new URL(request.url);
  const since = url.searchParams.get("since");
  if (!since || Number.isNaN(Date.parse(since))) {
    return json({ error: "since must be an ISO-8601 timestamp" }, 400);
  }

  const base = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    return json(
      { error: "Supabase credentials are not configured on the Worker" },
      503,
    );
  }

  let events: LedgerEvent[];
  try {
    events = await getAll<LedgerEvent>(
      base,
      key,
      `/rest/v1/ops_run_events?select=id,run_id,at,event_type,skill,trigger,client,project,actor,payload` +
        `&at=gte.${encodeURIComponent(since)}&order=at.asc,id.asc`,
    );
  } catch (e) {
    return json(
      {
        error: "supabase read failed",
        detail: e instanceof Error ? e.message : String(e),
      },
      502,
    );
  }

  const ids = [
    ...new Set(events.map((e) => e.run_id).filter((id) => UUID_RE.test(id || ""))),
  ];
  const rows: LedgerRow[] = [];
  try {
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      rows.push(
        ...(await getAll<LedgerRow>(
          base,
          key,
          `/rest/v1/ops_skill_runs?select=id,model,outcome,notes,artifacts,duration_s,run_class,human_edit_level` +
            `&id=in.(${chunk.join(",")})`,
        )),
      );
    }
  } catch (e) {
    return json(
      {
        error: "supabase read failed",
        detail: e instanceof Error ? e.message : String(e),
      },
      502,
    );
  }

  return json({ events, rows });
}

// ─── Paged PostgREST GET ──────────────────────────────────────────────────────
async function getAll<T>(
  base: string,
  key: string,
  pathAndQuery: string,
): Promise<T[]> {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
    Prefer: "count=none",
  };
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${base}${pathAndQuery}`, {
      headers: {
        ...headers,
        Range: `${from}-${from + PAGE - 1}`,
        "Range-Unit": "items",
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `supabase ${res.status} on ${pathAndQuery.split("?")[0]}: ${text}`,
      );
    }
    const page = (await res.json()) as T[];
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

// ─── Bearer check — constant time (identical to events-endpoint.ts) ─────────
function bearerOk(header: string | null, expected: string): boolean {
  if (!header || !header.startsWith("Bearer ")) return false;
  const given = header.slice(7).trim();
  if (!given || !expected) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (x: ArrayBufferView, y: ArrayBufferView) => boolean;
  };
  if (typeof subtle.timingSafeEqual === "function") {
    return subtle.timingSafeEqual(a, b);
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function json(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}
