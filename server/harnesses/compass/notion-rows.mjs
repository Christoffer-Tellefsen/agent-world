/**
 * The row shapes of the env-named Notion sources (M2b, ENV re-run 2026-09-07 — the six databases were shared with the
 * "Tellefsen - Agent world" integration that day). Every property name below was read from the source's own schema
 * through GET /v1/data_sources/<id> on 2026-09-07 — never assumed; a name that is not in the schema reads empty, and
 * the sitting's spot checks compare these rows with the Notion views. Pure: no fetch, node runs it under npm test.
 *
 *   🩺 System Health   Finding (title) · Status [Open | Acknowledged | Fixed | Won't Fix | Recurring] · Severity · Source ·
 *                      Airtable Table · Rule ID · Detected At · Resolved At          → healthRow, HEALTH_OPEN_FILTER
 *   📚 Research        Title · Status · Type · Refresh due · Handoff ready (checkbox) · Related client · Related project ·
 *                      Date completed · Confidence level · Region scope             → researchRow
 *   🔌 Integrations    Integration (title) · Status · Drift Status [✅ In sync | 🔴 Drift detected | ⚪ Unchecked] · Platform ·
 *                      Source System · Target System · Direction · Project · Milestone · Mappings (rollup) · Last Drift Check ·
 *                      Last Verified · Live Link · Runbook · Diagram · Evidence     → integrationRow, isDriftOpen
 *   🗺️ Field Mappings  Mapping (title) · Drift · Integration (relation) · Engagement · Verified · Verified On · Last Checked ·
 *                      Source Field → Target Field                                    → fieldMappingRow
 *   📎 Deliverables    Name (title) · Status [Draft | Sent to Client | Signed | Superseded | Archived] · Type · Version · Client ·
 *                      Project · Drive PDF URL · Drive DOCX URL · Created            → deliverableRow
 *   ✅ Tasks           Task (title) · Status · Priority · Do Date · Project · Client  → taskRow (the option names come from
 *                      the schema at read time — rooms.optionNamed; this mapper only shapes the row)
 * Relations carry page ids: Client / Related client → a Client Wiki page (surfaces.clientNameOf turns it into the town's
 * name); Project / Related project → a Projects page (undashed id, the fixture key); Integration → an Integrations page.
 */
import { titleOf, selectName, dateStart, relationIds, urlOf, richText } from './notion.mjs'

const str = (v) => (typeof v === 'string' ? v.trim() : '')
const undash = (id) => str(id).replace(/-/g, '').toLowerCase()
const when = (...candidates) => { for (const c of candidates) { const t = Date.parse(str(c)); if (Number.isFinite(t)) return t } return 0 }
const checkbox = (prop) => prop?.type === 'checkbox' && prop.checkbox === true
const number = (prop) => (prop?.type === 'number' && Number.isFinite(prop.number) ? prop.number : prop?.type === 'rollup' && Number.isFinite(prop.rollup?.number) ? prop.rollup.number : null)
const first = (prop) => relationIds(prop)[0] || ''

/** The server-side filter for the open findings — the source has hundreds of Fixed rows; only the Open ones are requests. */
export const HEALTH_OPEN_FILTER = Object.freeze({ property: 'Status', select: { equals: 'Open' } })
export const HEALTH_SORT = Object.freeze([{ property: 'Detected At', direction: 'descending' }])
export function healthRow(p) {
  const pr = p?.properties || {}
  return { id: p?.id || '', title: titleOf(p), status: selectName(pr.Status), severity: selectName(pr.Severity), source: selectName(pr.Source), table: selectName(pr['Airtable Table']), ruleId: richText(pr['Rule ID']), at: when(dateStart(pr['Detected At']), p?.created_time), resolvedAt: dateStart(pr['Resolved At']), url: p?.url || '' }
}
export const isOpenFinding = (r) => /^open$/i.test(str(r?.status))

export function researchRow(p) {
  const pr = p?.properties || {}
  const completed = dateStart(pr['Date completed'])
  return { id: p?.id || '', title: titleOf(p), status: selectName(pr.Status), type: selectName(pr.Type), refreshDue: dateStart(pr['Refresh due']), handoff: checkbox(pr['Handoff ready']), clientPage: first(pr['Related client']), project: undash(first(pr['Related project'])), completed, confidence: selectName(pr['Confidence level']), region: selectName(pr['Region scope']), at: when(completed, p?.last_edited_time), edited: p?.last_edited_time || '', url: p?.url || '' }
}
export const needsRefresh = (r, today) => /needs refresh/i.test(str(r?.status)) || (Boolean(r?.refreshDue) && str(r.refreshDue) < str(today))

export function integrationRow(p) {
  const pr = p?.properties || {}
  const links = [['Live Link', urlOf(pr['Live Link'])], ['Runbook', urlOf(pr.Runbook)], ['Diagram', urlOf(pr.Diagram)], ['Evidence', urlOf(pr.Evidence)]].filter(([, u]) => /^https?:\/\//i.test(u)).map(([label, url]) => ({ label, url }))
  return { id: p?.id || '', title: titleOf(p), status: selectName(pr.Status), drift: selectName(pr['Drift Status']), platform: selectName(pr.Platform), source: selectName(pr['Source System']), target: selectName(pr['Target System']), direction: selectName(pr.Direction), project: undash(first(pr.Project)), mappings: number(pr.Mappings), lastDriftCheck: dateStart(pr['Last Drift Check']), lastVerified: dateStart(pr['Last Verified']), links, at: when(p?.last_edited_time), url: p?.url || '' }
}
export const isDriftOpen = (r) => /drift detected/i.test(str(r?.drift))
export const isUnchecked = (r) => /unchecked/i.test(str(r?.drift)) || !str(r?.drift)

export function fieldMappingRow(p) {
  const pr = p?.properties || {}
  const verifiedOn = dateStart(pr['Verified On'])
  return { id: p?.id || '', title: titleOf(p), drift: selectName(pr.Drift), integration: undash(first(pr.Integration)), engagement: richText(pr.Engagement), verified: checkbox(pr.Verified), verifiedOn, lastChecked: dateStart(pr['Last Checked']), sourceField: richText(pr['Source Field']), targetField: richText(pr['Target Field']), at: when(verifiedOn, p?.last_edited_time), url: p?.url || '' }
}

export function deliverableRow(p) {
  const pr = p?.properties || {}
  return { id: p?.id || '', title: titleOf(p), status: selectName(pr.Status), type: selectName(pr.Type), version: number(pr.Version), clientPage: first(pr.Client), project: undash(first(pr.Project)), pdf: urlOf(pr['Drive PDF URL']), docx: urlOf(pr['Drive DOCX URL']), at: when(p?.created_time, p?.last_edited_time), url: p?.url || '' }
}

export function taskRow(p) {
  const pr = p?.properties || {}
  return { id: p?.id || '', title: titleOf(p), status: selectName(pr.Status), priority: selectName(pr.Priority), doDate: dateStart(pr['Do Date']), project: undash(first(pr.Project)), url: p?.url || '' }
}
