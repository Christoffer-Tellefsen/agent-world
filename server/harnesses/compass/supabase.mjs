/**
 * Ledger reads via the Compass Worker's /ledger/scan proxy (worker/ledger-read.mjs).
 *
 * The Compass Supabase project is provisioned through Lovable Cloud, so no Supabase URL or
 * service-role key is available on this machine — Lovable-Cloud-managed projects don't expose
 * either outside Lovable itself. The Worker already holds that access; this client just asks it
 * for events + rows over the same bearer token /events already uses. Read only: this file has no
 * method that writes, and never sees the Supabase key.
 */
export function createLedgerClient(cfg, { fetchImpl = globalThis.fetch, log = () => {} } = {}) {
  return {
    /**
     * { events, rows } — every ops_run_events row at or after sinceIso, oldest first, plus the
     * ops_skill_runs rows for the runs those events belong to. Paging is the Worker's problem now.
     */
    async scanSince(sinceIso) {
      const res = await fetchImpl(`${cfg.ledgerUrl}?since=${encodeURIComponent(sinceIso)}`, {
        headers: { Authorization: `Bearer ${cfg.eventsBearerToken}`, Accept: 'application/json' },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(`ledger read ${res.status}${body?.error ? `: ${body.error}` : ''}`)
      }
      const { events = [], rows = [] } = await res.json()
      log(`ledger: ${events.length} events, ${rows.length} rows since ${sinceIso}`)
      return { events, rows }
    },
  }
}
