// Agent World — U34: contract v1. The schemas validate the captured Worker responses and the packs;
// the adapter reads exactly three Worker routes (U35 added /world/spend, ES-4.13).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { validate } from './lib/validate.mjs'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'))

test('U34: spec/world-substrate.v1.json validates the captured GET /world/substrate', () => {
  const errs = validate(read('spec/world-substrate.v1.json'), read('test/fixtures/m2b-substrate.live.json'))
  assert.deepEqual(errs, [])
})

test('U35: spec/world-spend.v1.json validates the captured GET /world/spend, and refuses a bucket short of a counter', () => {
  const schema = read('spec/world-spend.v1.json')
  const live = read('test/fixtures/m2b-spend.live.json')
  assert.deepEqual(validate(schema, live), [])
  assert.ok(validate(schema, { ...live, totals: { runs_total: 1 } }).some((e) => /totals.*runs_metered/.test(e)))
  assert.ok(validate(schema, { ...live, by_client: [{ runs_total: 0 }] }).some((e) => /by_client\[0\].*client/.test(e)))
  assert.ok(!JSON.stringify(live).includes('"actor"'), 'the captured response carries no per-person field')
})

test('U34: spec/ledger-scan.v1.json validates the captured GET /ledger/scan, and refuses a shape that is not the ledger', () => {
  const schema = read('spec/ledger-scan.v1.json')
  assert.deepEqual(validate(schema, read('test/fixtures/m2b-ledger-scan.live.json')), [])
  assert.ok(validate(schema, { events: [{ id: 'x', run_id: 'r', at: 't', event_type: 'made_up', skill: 's' }], rows: [] }).some((e) => /event_type/.test(e)))
  assert.ok(validate(schema, { events: [] }).some((e) => /rows/.test(e)))
})

test('U34: spec/pack.v1.json validates both shipped packs and carries figure ∈ {character, marker}', () => {
  const schema = read('spec/pack.v1.json')
  for (const id of ['tellefsen-campus', 'neutral']) assert.deepEqual(validate(schema, read(`overlay/packs/${id}/pack.json`)), [], id)
  assert.deepEqual(schema.properties.figure.enum, ['character', 'marker'])
  const bad = { ...read('overlay/packs/neutral/pack.json'), figure: 'sprite' }
  assert.ok(validate(schema, bad).some((e) => /figure/.test(e)))
  for (const k of ['skin', 'rooms', 'names', 'lod', 'layout', 'figure']) assert.ok(schema.required.includes(k), k)
  assert.deepEqual(schema.properties.rooms.items.required, ['id', 'name', 'mirrors', 'surface', 'ring', 'spoke'])
})

/** Every Worker route the adapter's code names. */
const walk = (dir, out = []) => {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) walk(p, out)
    else if (/\.m?js$/.test(name)) out.push(p)
  }
  return out
}
test('U34/U35: the adapter reads only /ledger/scan, /world/substrate and /world/spend — any other Worker route in server/harnesses/compass* fails', () => {
  const files = [path.join(root, 'server/harnesses/compass.mjs'), ...walk(path.join(root, 'server/harnesses/compass'))]
  const allowed = new Set(['/ledger/scan', '/world/substrate', '/world/spend'])
  const hits = []
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    // the sidecar (overlay-api.mjs) serves its own loopback routes (/world, /rooms …) and never fetches anything: it is a listener, not a reader
    if (path.basename(f) === 'overlay-api.mjs') {
      assert.ok(!/\bfetch(Impl)?\s*\(/.test(text) && !/https?\.(get|request)\s*\(/.test(text), 'overlay-api.mjs must not fetch or request')
      continue
    }
    // a Worker URL is built in config.mjs and nowhere else: no other file may touch eventsUrl or assemble one from a Worker field
    if (path.basename(f) !== 'config.mjs') {
      assert.ok(!/eventsUrl/.test(text), `${path.relative(root, f)} references eventsUrl — Worker URLs are config.mjs's to derive`)
      assert.ok(!/(ledgerUrl|substrateUrl|spendUrl)\s*\.\s*(replace|slice|split|concat)\(/.test(text), `${path.relative(root, f)} rebuilds a Worker URL from a derived field`)
      // every fetch of a Worker field is one of the two reads, verbatim
      for (const m of text.matchAll(/fetch(?:Impl)?\s*\(\s*([^,)]+)/g)) {
        const arg = m[1].trim()
        if (!/ledgerUrl|substrateUrl|spendUrl|eventsUrl/.test(arg)) continue
        assert.ok(arg === 'cfg.substrateUrl' || arg.startsWith('`${cfg.ledgerUrl}?since=') || arg.startsWith('`${cfg.spendUrl}?window='), `${path.relative(root, f)} fetches a Worker URL that is not one of the three reads: ${arg}`)
      }
    }
    for (const m of text.matchAll(/\/(?:ledger|world|ask|actions|events)(?:\/[a-z0-9_-]+)?\b/g)) {
      const route = m[0]
      // config.mjs derives the two allowed routes from EVENTS_URL by replacing its `/events` tail — that mention is the derivation, not a read
      if (route === '/events' && path.basename(f) === 'config.mjs' && /replace\(\/\\\/events\$\//.test(text)) continue
      if (!allowed.has(route)) hits.push(`${path.relative(root, f)}: ${route}`)
    }
  }
  assert.deepEqual(hits, [], `Worker routes outside the contract:\n${hits.join('\n')}`)
})
