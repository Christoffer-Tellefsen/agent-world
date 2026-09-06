/**
 * Compass adapter — configuration from the environment.
 *
 * No Supabase URL or service-role key here: the Compass Supabase project is provisioned through
 * Lovable Cloud, which does not expose either outside the Worker that already owns them. Reads go
 * through the Worker's /ledger/scan route (worker/ledger-read.mjs) over the same bearer token
 * /events already uses — so `ledgerUrl` is derived from `EVENTS_URL`, not configured separately.
 */
const num = (v, d) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : d
}

export function loadConfig(env = process.env) {
  const eventsUrl = (env.EVENTS_URL || '').replace(/\/+$/, '')
  return {
    eventsUrl,
    eventsBearerToken: env.EVENTS_BEARER_TOKEN || '',
    /** Sibling of EVENTS_URL: .../events → .../ledger/scan. No separate env var needed. */
    ledgerUrl: eventsUrl.replace(/\/events$/, '/ledger/scan'),
    notionToken: env.NOTION_TOKEN || '',
    airtableToken: env.AIRTABLE_TOKEN || '',
    airtableBaseId: env.AIRTABLE_BASE_ID || 'appixWl8C3bogLsvp',
    claudeProjectUrl: env.CLAUDE_PROJECT_URL || '',
    tenant: env.WORLD_TENANT || 'tellefsen',
    viewerPreset: env.WORLD_VIEWER_PRESET || 'owner',
    windowDays: num(env.WORLD_WINDOW_DAYS, 14),
    runningTtlMs: num(env.WORLD_RUNNING_TTL_HOURS, 2) * 3600 * 1000,
    scanCacheMs: 5000,
    debug: /\bworld\b|\*/.test(env.DEBUG || ''),
  }
}

/** Zone name for runs with no client. The campus. */
export const CAMPUS = 'Tellefsen HQ'
