/**
 * Orphan-file / deleted-entry reproduction probe.
 *
 * Run: node scripts/repro-orphans.mjs
 * Exits 1 when a scenario does not report the expected problem.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ResearchStore } from '../lib/ledger.js'

const root = mkdtempSync(join(tmpdir(), 'rs-orphan-probe-'))
const store = new ResearchStore({ dir: root }).init()
const checks = []

function verifyOf(state) {
  return store.verify(state.id).artifactProblems
}

function report(name, expected, actual) {
  const ok = expected === 'none' ? actual.length === 0 : actual.some((item) => item.problem === expected)
  checks.push({ name, expected, ok, actual })
}

const normal = store.create({ title: 'normal', question: 'q'.repeat(20), tier: 'S' })
store.addArtifact(normal, Buffer.from('normal'), 'source')
report('normal control', 'none', verifyOf(normal))

const orphan = store.create({ title: 'orphan', question: 'q'.repeat(20), tier: 'S' })
store.addArtifact(orphan, Buffer.from('registered'), 'source')
writeFileSync(join(store.artifactsDir(orphan.id), 'orphan.txt'), 'not registered')
report('orphan file is reported', 'orphan_file', verifyOf(orphan))

const deleted = store.create({ title: 'deleted entry', question: 'q'.repeat(20), tier: 'S' })
store.addArtifact(deleted, Buffer.from('entry was deleted'), 'source')
deleted.artifacts = []
report('deleted state entry is reported', 'missing_entry', verifyOf(deleted))

const result = { ok: checks.every((item) => item.ok), checks }
console.log(JSON.stringify(result, null, 2))
rmSync(root, { recursive: true, force: true })
process.exitCode = result.ok ? 0 : 1
