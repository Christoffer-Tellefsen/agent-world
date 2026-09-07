// Agent World — invariants that hold for every unit, every session. `npm test` runs this file.
// 1. src/ is byte-identical to upstream (the fork's seam is one adapter file).
// 2. The world burns zero tokens: no model endpoint or SDK anywhere outside node_modules.
// 3. The adapter never writes to the substrate (static guard; the human checks prove it live).
// 4. The registry is exactly [compass].
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const sh = (cmd) => execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

test('src/ is byte-identical to upstream/main', () => {
  let ref
  try {
    ref = sh('git rev-parse --verify upstream/main')
  } catch {
    assert.fail('no upstream/main — add the remote: git remote add upstream https://github.com/jarrenrocks/bot-crossing && git fetch upstream')
  }
  assert.ok(ref)
  const diff = sh('git diff --stat upstream/main -- src/')
  assert.equal(diff, '', `src/ differs from upstream:\n${diff}`)
})

const walk = (dir, out = []) => {
  for (const name of fs.readdirSync(dir)) {
    if (['node_modules', '.git', 'dist', 'data', 'recordings', 'test', 'assets-src', 'public'].includes(name)) continue
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(m?js|cjs|ts|html|json|sh)$/.test(name)) out.push(p)
  }
  return out
}

test('no model API anywhere in the fork (zero tokens)', () => {
  const needles = [/api\.anthropic\.com/, /api\.openai\.com/, /generativelanguage\.googleapis/, /@anthropic-ai\/sdk/, /["']openai["']/, /messages\.create\(/]
  const hits = []
  for (const f of walk(root)) {
    if (path.basename(f) === 'invariants.test.mjs') continue
    const text = fs.readFileSync(f, 'utf8')
    for (const n of needles) if (n.test(text)) hits.push(`${path.relative(root, f)} matches ${n}`)
  }
  assert.deepEqual(hits, [], `model endpoints found:\n${hits.join('\n')}`)
})

test('the adapter never writes: no non-GET request and no supabase-js write chain in server/harnesses/compass*', () => {
  const files = []
  const entry = path.join(root, 'server/harnesses/compass.mjs')
  if (fs.existsSync(entry)) files.push(entry)
  const dir = path.join(root, 'server/harnesses/compass')
  if (fs.existsSync(dir)) walk(dir, files)
  // Two shapes of write: an HTTP verb on a request, or a supabase-js query chain (.from(...).insert/update/upsert/delete/rpc).
  // A Map or Set .delete() is not a write to anything; only chains that start at .from( count.
  const httpNeedles = [/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/i, /['"](POST|PUT|PATCH|DELETE)['"]\s*,\s*['"]\/rest\//i]
  // The one allowed non-GET: Notion lists a database's rows only through POST /v1/data_sources/<id>/query —
  // a read with a body (filter, sort, page size). steering.mjs (U19) makes it and nothing else may; the file
  // must contain no other verb and must only ever build that path (design detail 2026-09-07, proposed Decision).
  const ALLOWED_LINE = "init.method = 'POST'"
  const notionQueryOnly = (text) => {
    const lines = text.split('\n')
    const allowed = lines.filter((l) => l.includes(ALLOWED_LINE))
    // exactly one such line, it is the only `.method` assignment in the file, and the file only ever builds the /query path
    const assignments = lines.filter((l) => /\.method\s*=/.test(l) || /method:\s*['"]/.test(l))
    if (allowed.length !== 1 || assignments.length !== 1 || !/data_sources\/\$\{[A-Z_]+\}\/query/.test(text)) return null
    return lines.filter((l) => !l.includes(ALLOWED_LINE)).join('\n') // the rest is checked like every other file
  }
  const chainNeedle = /\.from\([^)]*\)[\s\S]{0,200}?\.(insert|update|upsert|delete|rpc)\(/
  const hits = []
  for (const f of files) {
    let text = fs.readFileSync(f, 'utf8')
    if (path.basename(f) === 'steering.mjs') {
      const rest = notionQueryOnly(text)
      if (rest == null) hits.push('server/harnesses/compass/steering.mjs: more than the one Notion data-source query is written')
      else text = rest
    }
    for (const n of httpNeedles) if (n.test(text)) hits.push(`${path.relative(root, f)} matches ${n}`)
    if (/\.method\s*=\s*['"](POST|PUT|PATCH|DELETE)['"]/i.test(text)) hits.push(`${path.relative(root, f)} assigns a write method`)
    if (chainNeedle.test(text)) hits.push(`${path.relative(root, f)} has a supabase-js write chain`)
  }
  assert.deepEqual(hits, [], `write calls found in the adapter:\n${hits.join('\n')}`)
})

test('harness registry is exactly [compass]', async () => {
  const mod = await import(path.join(root, 'server/harnesses/index.mjs'))
  const ids = mod.HARNESSES.map((h) => h.id)
  assert.deepEqual(ids, ['compass'], `registry is ${JSON.stringify(ids)} — expected exactly ["compass"]`)
})

test('never-touch files are unchanged vs upstream', () => {
  const diff = sh('git diff --stat upstream/main -- server/scan.mjs server/api.mjs server/harnesses/claude-code.mjs')
  assert.equal(diff, '', `never-touch files differ from upstream:\n${diff}`)
})
