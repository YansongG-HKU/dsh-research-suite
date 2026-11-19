#!/usr/bin/env node
/**
 * Re-open the 0.8 acceptance campaign and re-verify the claims in
 * acceptance-0.8.json without mutating it. Also checks that an older released
 * campaign keeps its release gate and audit freshness after the schema bump.
 */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ResearchStore } from '../../workspace/dsh-research-suite/lib/ledger.js'
import { ResearchService } from '../../workspace/dsh-research-suite/lib/service.js'
import { resolveConfig, VERSION } from '../../workspace/dsh-research-suite/lib/config.js'
import { checkGate } from '../../workspace/dsh-research-suite/lib/gates.js'
import { programComplete } from '../../workspace/dsh-research-suite/lib/program.js'

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = join(homedir(), '.dsh', 'research-suite')
const store = new ResearchStore({ dir: dataDir }).init()
const service = new ResearchService({ store, config: resolveConfig({ dataDir }), log: { info() {}, warn() {} } })
const acceptance = JSON.parse(readFileSync(join(here, 'acceptance-0.8.json'), 'utf8'))
const state = store.get(acceptance.campaign)

assert.equal(state.schema, 4)
assert.equal(state.releasedAt != null, true)
assert.equal(VERSION, '0.8.0')
const program = programComplete(state)
assert.equal(program.ok, true, JSON.stringify(program.missing))
assert.equal(state.plan.questions.length, 3)
assert.equal(state.perspectives.length, 3)
assert.equal(state.cycles.length, 1)
assert.equal(state.tournament.matches.length, 1)
assert.equal(state.quality.rows.length, 1)
assert.equal(state.contradictions.length, 1)
assert.equal(state.contradictions.filter((row) => row.status === 'open').length, 0)

const release = checkGate(state, 'release', {
  integrity: store.verify(state.id),
  verifyAudit: (audit) => store.verifyAudit(audit),
})
assert.equal(release.ok, true, JSON.stringify(release.blocking))
const audit = (state.audits || []).slice(-1)[0]
assert.equal(audit.ok, true)
assert.equal(audit.verdict, 'accept')
assert.equal(store.verifyAudit(audit).ok, true)
assert.equal(audit.subjectHash, (await import('../../workspace/dsh-research-suite/lib/subject.js')).auditSubjectHash(state))

const probe = JSON.parse(readFileSync(join(here, 'probe-exploratory.json'), 'utf8'))
assert.equal(probe.blocked_cases, 3)
assert.equal(probe.metrics.missing_blocked, 1)
assert.equal(probe.metrics.complete_blocked, 0)
assert.equal(probe.metrics.open_contradiction_blocked, 1)
assert.equal(probe.metrics.resolved_contradiction_blocked, 0)
assert.equal(probe.metrics.low_quality_blocked, 1)
assert.equal(probe.metrics.legacy_blocked, 0)
const negative = JSON.parse(readFileSync(join(here, 'probe-negative.json'), 'utf8'))
assert.equal(negative.metrics.legacy_missing_blocked, 0)
assert.equal(negative.blocked_cases, 0)

const legacy = store.get('rs-ad07b91f')
const legacyRelease = checkGate(legacy, 'release', {
  integrity: store.verify('rs-ad07b91f'),
  verifyAudit: (item) => store.verifyAudit(item),
})
assert.equal(legacyRelease.ok, true, JSON.stringify(legacyRelease.blocking))
assert.equal(legacyRelease.total, 16)

const result = {
  ok: true,
  version: VERSION,
  campaign: state.id,
  schema: state.schema,
  program: { ...service.program(state.id, { action: 'list' }).program, completeOk: program.ok, missing: program.missing },
  release: { ok: release.ok, passed: release.passed, total: release.total, blocking: release.blocking },
  audit: { id: audit.id, ok: audit.ok, verdict: audit.verdict, fresh: store.verifyAudit(audit).ok === true, subjectHash: audit.subjectHash },
  probe: { blocked_cases: probe.blocked_cases, metrics: probe.metrics, negative: negative.metrics },
  legacy: { id: legacy.id, schema: legacy.schema, releaseOk: legacyRelease.ok, releasePassed: legacyRelease.passed, releaseTotal: legacyRelease.total },
  generatedAt: new Date().toISOString(),
}
writeFileSync(join(here, 'verify.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(result, null, 2))
