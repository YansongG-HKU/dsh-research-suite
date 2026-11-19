/**
 * Acceptance harness. This is a real end-to-end run over a temporary data
 * directory, not a mock of the service: create → full nine-gate release →
 * doctor → export/manifest verification → explicit schema migration + backup →
 * stale-index reindex. The JSON report is written outside the repo by default.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createCampaign,
  makeService,
  passAnalyze,
  passDesign,
  passExecute,
  passHypothesis,
  passReview,
  passRelease,
  passScoping,
  passSurvey,
  passWrite,
  releasedCampaign,
} from '../test/helpers.mjs'
import { VERSION, SCHEMA_VERSION } from '../lib/config.js'
import { sha256Hex } from '../lib/util.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = process.env.DSH_ACCEPTANCE_OUT || join(root, '_artifacts', `acceptance-${VERSION}.json`)
const checks = []
const started = Date.now()
const check = (name, ok, detail, extra = {}) => {
  checks.push({ name, ok: ok === true, detail: detail || '', ...extra })
  return ok === true
}
const phase = async (name, fn) => {
  const at = Date.now()
  try {
    const value = await fn()
    return { name, ok: true, ms: Date.now() - at, value }
  } catch (error) {
    return { name, ok: false, ms: Date.now() - at, error: error.message, stack: error.stack }
  }
}

const { service, store, cleanup } = makeService()
const phases = []
let report = null
try {
  const released = await phase('release', async () => {
    const id = releasedCampaign(service)
    const detail = service.get(id)
    check('release: schema 5', detail.state.schema === SCHEMA_VERSION, String(detail.state.schema))
    check('release: 13/13', detail.gate.ok === true && detail.gate.passed === 13 && detail.gate.total === 13, `${detail.gate.passed}/${detail.gate.total}`)
    check('release: stewardship complete', detail.state.stewardship.completeness.ok === true)
    check('release: chain and state verify', detail.integrity.chainOk === true && detail.integrity.stateOk === true)
    return { id, detail }
  })
  phases.push(released)
  if (!released.ok) throw new Error(`release phase failed: ${released.error}`)
  const releasedId = released.value.id

  const exported = await phase('export', async () => {
    const result = service.write(releasedId, { action: 'export' })
    check('export: manifest path', existsSync(result.paths.manifest), result.paths.manifest)
    check('export: stewardship path', existsSync(result.paths.stewardship), result.paths.stewardship)
    const manifest = JSON.parse(readFileSync(result.paths.manifest, 'utf8'))
    check('export: manifest format', manifest.format === 'dsh-research-suite/export-manifest/1')
    check('export: manifest gate ready', manifest.gate.ok === true)
    check('export: manifest has STEWARDSHIP.md', manifest.files.some((file) => file.path === 'STEWARDSHIP.md'))
    let hashesOk = true
    for (const file of manifest.files) {
      const content = readFileSync(join(result.paths.dir, file.path))
      if (content.length !== file.bytes || sha256Hex(content) !== file.sha256) {
        hashesOk = false
        break
      }
    }
    check('export: every manifest hash verifies', hashesOk)
    const zip = readFileSync(result.paths.bundle)
    check('export: BUNDLE has MANIFEST.json', zip.includes(Buffer.from('MANIFEST.json')))
    check('export: BUNDLE has STEWARDSHIP.md', zip.includes(Buffer.from('STEWARDSHIP.md')))
    const reportText = readFileSync(result.paths.report, 'utf8')
    check('export: report has stewardship section', reportText.includes('## 12.1 研究治理与贡献'))
    return { paths: result.paths, manifest, bundleBytes: zip.length }
  })
  phases.push(exported)
  if (!exported.ok) throw new Error(`export phase failed: ${exported.error}`)

  const legacy = await phase('migration', async () => {
    const id = createCampaign(service)
    const state = store.get(id)
    state.schema = 4
    state.stewardship = undefined
    store.save(state)
    const dry = service.migrate(id, { dryRun: true })
    check('migration: dry-run stays schema 4', dry.migrated === false && store.get(id).schema === 4)
    check('migration: dry-run reports missing fields', dry.missing.length > 0, `${dry.missing.length}`)
    const migrated = service.migrate(id, {
      stewardship: {
        license: 'CC-BY-4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        dataAvailability: 'The acceptance fixture is synthetic and its export package is retained with the run.',
        codeAvailability: 'Node 22 source is in this repository.',
        competingInterests: 'None; this is a local acceptance run.',
        ethics: 'No human subjects or animals.',
        contributors: [{ name: 'YG', roles: ['conceptualization', 'supervision'] }],
      },
    })
    check('migration: schema becomes 5', store.get(id).schema === 5, String(store.get(id).schema))
    check('migration: backup exists', existsSync(store.backupFile(id, migrated.backup.name)), migrated.backup.name)
    check('migration: backup hash recorded', /^[0-9a-f]{64}$/u.test(migrated.backup.sha256))
    check('migration: one campaign.migrated event', store.events(store.get(id)).filter((event) => event.kind === 'campaign.migrated').length === 1)
    check('migration: chain still verifies', store.verify(id).chainOk === true)
    const again = service.migrate(id, {})
    check('migration: idempotent', again.migrated === false && again.alreadyCurrent === true)
    return { id, backup: migrated.backup, gate: migrated.gate }
  })
  phases.push(legacy)
  if (!legacy.ok) throw new Error(`migration phase failed: ${legacy.error}`)

  const reindex = await phase('reindex', async () => {
    const second = service.create({ title: 'acceptance second', question: '第二个项目是否会被索引重建发现？', tier: 'S' }).campaign.id
    const broken = { version: 1, current: releasedId, campaigns: store.listCampaigns().filter((row) => row.id === releasedId) }
    writeFileSync(store.indexFile(), JSON.stringify(broken, null, 2))
    store.index = broken
    const before = service.doctor()
    check('reindex: doctor sees stale index', before.index.ok === false)
    check('reindex: doctor recommends reindex', before.next.some((item) => item.action === 'reindex'))
    const result = service.reindex()
    check('reindex: all directories indexed', result.ok === true && result.indexed === 3, `${result.indexed}`)
    const after = service.doctor()
    check('reindex: doctor index consistent', after.index.ok === true)
    check('reindex: doctor remains healthy', after.ok === true, JSON.stringify(after.counts))
    check('reindex: second campaign readable', store.get(second).title === 'acceptance second')
    return { result, doctor: { ok: after.ok, counts: after.counts } }
  })
  phases.push(reindex)
  if (!reindex.ok) throw new Error(`reindex phase failed: ${reindex.error}`)

  report = {
    ok: checks.every((item) => item.ok),
    version: VERSION,
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    checks,
    phases: phases.map((item) => ({ name: item.name, ok: item.ok, ms: item.ms })),
    counts: {
      checks: checks.length,
      passed: checks.filter((item) => item.ok).length,
      failed: checks.filter((item) => !item.ok).length,
    },
    evidence: {
      released: releasedId,
      export: exported.value.paths.dir,
      bundleBytes: exported.value.bundleBytes,
      manifestFiles: exported.value.manifest.files.length,
      backup: legacy.value.backup.name,
      campaigns: reindex.value.result.indexed,
    },
  }
} catch (error) {
  report = {
    ok: false,
    version: VERSION,
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    error: error.message,
    stack: error.stack,
    checks,
    phases: phases.map((item) => ({ name: item.name, ok: item.ok, ms: item.ms, error: item.error || null })),
    counts: { checks: checks.length, passed: checks.filter((item) => item.ok).length, failed: checks.filter((item) => !item.ok).length },
  }
} finally {
  cleanup()
}

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
process.stdout.write(
  `${report.ok ? 'PASS' : 'FAIL'} ${VERSION} acceptance: ${report.counts.passed}/${report.counts.checks} checks in ${report.elapsedMs} ms\n${out}\n`,
)
if (!report.ok) process.exitCode = 1
