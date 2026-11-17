/**
 * Artifact edge-case reproduction and acceptance probe.
 *
 * Run: node scripts/repro-artifacts.mjs
 * Exits 1 when any check fails; prints a JSON report with codes and details.
 */
import { mkdtempSync, readFileSync, rmSync, statSync, truncateSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { LIMITS } from '../lib/config.js'
import { ResearchStore } from '../lib/ledger.js'

const root = mkdtempSync(join(tmpdir(), 'rs-artifact-probe-'))
const store = new ResearchStore({ dir: root }).init()
const state = store.create({ title: 'artifact probe', question: 'q'.repeat(20), tier: 'S' })
const checks = []

function record(name, expected, fn) {
  try {
    const actual = fn()
    const ok = expected === 'ok' || actual === expected
    checks.push({ name, expected, ok, actual })
  } catch (error) {
    checks.push({ name, expected, ok: expected === error?.code, actual: error?.code || null, message: error?.message || String(error) })
  }
}

record('oversized buffer', 'too_large', () => store.addArtifact(state, Buffer.alloc(LIMITS.maxArtifactBytes + 1), 'stdout'))

const bigPath = join(root, 'oversized.bin')
writeFileSync(bigPath, '')
truncateSync(bigPath, LIMITS.maxArtifactBytes + 1)
record('oversized file (size gate before read)', 'too_large', () => store.addArtifact(state, bigPath, 'stdout'))

record('path traversal id', 'invalid_input', () => store.artifactPath(state.id, 'sha256:../../escape'))
record('short id', 'invalid_input', () => store.artifactPath(state.id, 'sha256:abcd'))
record('uppercase id', 'invalid_input', () => store.artifactPath(state.id, `sha256:${'A'.repeat(64)}`))
record('null id', 'invalid_input', () => store.artifactPath(state.id, null))

const first = store.addArtifact(state, Buffer.from('hello'), 'source')
const target = store.artifactPath(state.id, first.id)
const old = new Date('2000-01-01T00:00:00.000Z')
utimesSync(target, old, old)
const second = store.addArtifact(state, Buffer.from('hello'), 'stdout')
checks.push({
  name: 'valid duplicate is not rewritten',
  expected: 'ok',
  ok: first.id === second.id && state.artifacts.length === 1 && statSync(target).mtimeMs === old.getTime(),
  actual: { sameId: first.id === second.id, entries: state.artifacts.length, mtimeStable: statSync(target).mtimeMs === old.getTime() },
})

writeFileSync(target, 'tampered')
const repaired = store.addArtifact(state, Buffer.from('hello'), 'source')
checks.push({
  name: 'tampered duplicate is repaired without a new entry',
  expected: 'ok',
  ok: readFileSync(target, 'utf8') === 'hello' && repaired.id === first.id && state.artifacts.length === 1,
  actual: { content: readFileSync(target, 'utf8'), entries: state.artifacts.length },
})

const legacy = { ...state, artifacts: undefined }
record('legacy state without artifacts array', 'ok', () => {
  store.addArtifact(legacy, Buffer.from('legacy'), 'stdout')
  return Array.isArray(legacy.artifacts) && legacy.artifacts.length === 1 ? 'ok' : 'missing-array'
})

const normal = store.verify(state.id)
checks.push({ name: 'verify normal chain', expected: 'ok', ok: normal.chainOk === true && normal.events === state.seq, actual: normal })

state.artifacts.push({ id: 'sha256:not-a-hash', bytes: 1, role: 'source' })
let invalid = null
let invalidError = null
try {
  invalid = store.verify(state.id)
} catch (error) {
  invalidError = error
}
checks.push({
  name: 'verify reports invalid artifact id instead of throwing',
  expected: 'ok',
  ok: !invalidError && invalid.artifactProblems.some((item) => item.problem === 'invalid_id'),
  actual: invalidError ? { threw: invalidError.code || null, message: invalidError.message } : invalid.artifactProblems,
})

const report = { ok: checks.every((item) => item.ok), checks }
console.log(JSON.stringify(report, null, 2))
rmSync(root, { recursive: true, force: true })
process.exitCode = report.ok ? 0 : 1
