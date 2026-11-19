import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import test from 'node:test'

import { checkGate } from '../../lib/gates.js'
import {
  CREDIT_ROLES,
  mergeStewardship,
  normalizeStewardship,
  renderStewardshipMarkdown,
  stewardshipCompleteness,
} from '../../lib/stewardship.js'
import { sha256Hex } from '../../lib/util.js'
import { createCampaign, makeService, releasedCampaign } from '../helpers.mjs'

const COMPLETE = {
  license: 'CC-BY-4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  dataAvailability: 'Synthetic fixture data is included in the export package.',
  codeAvailability: 'Node 22 source is in the repository; the fixture is reproducible.',
  competingInterests: 'None.',
  ethics: 'No human subjects or animals were involved.',
  contributors: [{ name: 'YG', roles: ['conceptualization', 'supervision'] }],
}

test('schema 5 creates a stewardship record and completeness requires the FAIR/CRediT core', () => {
  const { service, store, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const state = store.get(id)
    assert.equal(state.schema, 5)
    assert.equal(state.stewardship.license, '')
    const empty = stewardshipCompleteness(state.stewardship)
    assert.equal(empty.ok, false)
    assert.equal(empty.percent, 0)
    assert.ok(empty.missingFields.includes('license'))
    assert.ok(empty.missingFields.includes('contributors'))

    const set = service.stewardship(id, { action: 'set', ...COMPLETE })
    assert.equal(set.completeness.ok, true)
    assert.equal(set.completeness.percent, 100)
    assert.equal(set.stewardship.contributors[0].name, 'YG')
    assert.equal(set.stewardship.contributors[0].roles.includes('supervision'), true)
    assert.match(renderStewardshipMarkdown(store.get(id)), /CC-BY-4\.0/u)
    assert.match(renderStewardshipMarkdown(store.get(id)), /CRediT/u)
  } finally {
    cleanup()
  }
})

test('stewardship validation rejects unknown fields, bad roles, duplicate names and non-http license URLs', () => {
  assert.throws(() => mergeStewardship(null, { license: 'MIT', typo: 'x' }), /unknown stewardship field/u)
  assert.throws(
    () => mergeStewardship(null, { contributors: [{ name: 'YG', roles: ['invented-role'] }] }),
    /unknown CRediT role/u,
  )
  assert.throws(
    () => mergeStewardship(null, { contributors: [{ name: 'YG' }] }),
    /needs at least one CRediT role/u,
  )
  assert.throws(
    () =>
      mergeStewardship(null, {
        contributors: [
          { name: 'YG', roles: ['conceptualization'] },
          { name: 'yg', roles: ['software'] },
        ],
      }),
    /duplicate contributor/u,
  )
  assert.throws(() => mergeStewardship(null, { licenseUrl: 'ftp://example.org/license' }), /http/u)
  assert.throws(
    () => mergeStewardship(null, { contributors: [{ name: 'YG', roles: ['software'], orcid: '1234' }] }),
    /ORCID/u,
  )
  assert.equal(CREDIT_ROLES.length, 14)
  const normalized = normalizeStewardship({ contributors: [{ name: 'YG', roles: ['software'], orcid: 'https://orcid.org/0000-0002-1825-0097' }] })
  assert.equal(normalized.contributors[0].orcid, '0000-0002-1825-0097')
})

test('release blocks schema 5 without stewardship and leaves schema 4 advisory', () => {
  const { service, store, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const fresh = checkGate(store.get(id), 'release')
    assert.equal(fresh.blocking.includes('stewardship'), true)
    assert.equal(fresh.ok, false)

    service.stewardship(id, { action: 'set', ...COMPLETE })
    const complete = checkGate(store.get(id), 'release')
    assert.equal(complete.blocking.includes('stewardship'), false)
    const row = complete.checks.find((item) => item.code === 'stewardship')
    assert.equal(row.ok, true)
    assert.equal(row.blocking, true)

    const state = store.get(id)
    state.schema = 4
    state.stewardship = undefined
    store.save(state)
    const legacy = checkGate(store.get(id), 'release')
    const advisory = legacy.checks.find((item) => item.code === 'stewardship')
    assert.equal(advisory.ok, false)
    assert.equal(advisory.blocking, false)
    assert.equal(legacy.blocking.includes('stewardship'), false)
  } finally {
    cleanup()
  }
})

test('migrate verifies, backs up state+ledger, records campaign.migrated and is idempotent', () => {
  const { service, store, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const legacy = store.get(id)
    legacy.schema = 4
    legacy.stewardship = undefined
    store.save(legacy)

    const dry = service.migrate(id, { dryRun: true })
    assert.equal(dry.migrated, false)
    assert.equal(dry.from, 4)
    assert.equal(dry.to, 5)
    assert.equal(dry.backup, null)
    assert.ok(dry.missing.length > 0)
    assert.equal(store.get(id).schema, 4)

    const migrated = service.migrate(id, { stewardship: COMPLETE })
    assert.equal(migrated.migrated, true)
    assert.equal(migrated.from, 4)
    assert.equal(migrated.to, 5)
    assert.equal(store.get(id).schema, 5)
    assert.equal(store.get(id).stewardship.license, 'CC-BY-4.0')
    assert.equal(store.get(id).migrations.length, 1)
    assert.equal(existsSync(migrated.backup.name ? store.backupFile(id, migrated.backup.name) : ''), true)
    assert.match(migrated.backup.sha256, /^[0-9a-f]{64}$/u)
    const backupZip = readFileSync(store.backupFile(id, migrated.backup.name))
    assert.equal(backupZip.readUInt32LE(0), 0x04034b50)
    assert.ok(backupZip.includes(Buffer.from('manifest.json')))
    assert.ok(backupZip.includes(Buffer.from('events.jsonl')))
    assert.equal(store.verify(id).chainOk, true)
    const kinds = store.events(store.get(id)).map((event) => event.kind)
    assert.equal(kinds.filter((kind) => kind === 'campaign.migrated').length, 1)

    const again = service.migrate(id, {})
    assert.equal(again.migrated, false)
    assert.equal(again.alreadyCurrent, true)
    assert.equal(store.get(id).migrations.length, 1)
    assert.equal(store.listBackups(id).length, 1)
  } finally {
    cleanup()
  }
})

test('migrate refuses a broken chain before writing a backup', () => {
  const { service, store, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const state = store.get(id)
    state.schema = 4
    state.stewardship = undefined
    store.save(state)
    writeFileSync(
      store.eventsFile(id),
      `${readFileSync(store.eventsFile(id), 'utf8')}${JSON.stringify({ seq: 999, ts: 'x', kind: 'tamper', actor: 'x', payload: {}, prev: '0', hash: '0' })}\n`,
    )
    assert.equal(store.verify(id).chainOk, false)
    assert.throws(() => service.migrate(id, { stewardship: COMPLETE }), /migration is blocked/u)
    assert.equal(store.get(id).schema, 4)
    assert.equal(store.listBackups(id).length, 0)
  } finally {
    cleanup()
  }
})

test('doctor is read-only, reports a stale index, and reindex repairs only index.json', () => {
  const { service, store, cleanup } = makeService()
  try {
    const first = createCampaign(service)
    const second = service.create({ title: 'second', question: '第二个研究问题是否足够长？', tier: 'S' }).campaign.id
    const before = readFileSync(store.stateFile(first), 'utf8')
    const healthy = service.doctor()
    assert.equal(healthy.ok, true)
    assert.equal(healthy.counts.campaigns, 2)
    assert.equal(healthy.index.ok, true)

    const brokenIndex = { version: 1, current: first, campaigns: [store.summaryOf(store.get(first))] }
    writeFileSync(store.indexFile(), JSON.stringify(brokenIndex, null, 2))
    store.index = brokenIndex
    const bad = service.doctor()
    assert.equal(bad.ok, false)
    assert.equal(bad.index.ok, false)
    assert.ok(bad.next.some((item) => item.action === 'reindex'))
    assert.equal(readFileSync(store.stateFile(first), 'utf8'), before)

    const reindexed = service.reindex()
    assert.equal(reindexed.ok, true)
    assert.equal(reindexed.indexed, 2)
    assert.equal(reindexed.integrity.ok, true)
    assert.deepEqual(reindexed.skipped, [])
    const after = service.doctor()
    assert.equal(after.ok, true)
    assert.equal(after.index.ok, true)
    assert.equal(after.counts.campaigns, 2)
    assert.equal(store.get(second).title, 'second')
    assert.equal(readFileSync(store.stateFile(first), 'utf8'), before)
  } finally {
    cleanup()
  }
})

test('doctor reports chain damage and stale locks without repairing them', () => {
  const { service, store, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const lockToken = store.acquireLock(id)
    try {
      const held = service.doctor()
      const row = held.campaigns.find((item) => item.id === id)
      assert.equal(row.lock.stale, false)
      assert.equal(row.issues.some((item) => item.code === 'active_lock'), true)
    } finally {
      store.releaseLock(id, lockToken)
    }

    writeFileSync(
      store.eventsFile(id),
      `${readFileSync(store.eventsFile(id), 'utf8')}${JSON.stringify({ seq: 2, ts: 'x', kind: 'tamper', actor: 'x', payload: {}, prev: '0', hash: '0' })}\n`,
    )
    const broken = service.doctor()
    assert.equal(broken.ok, false)
    const row = broken.campaigns.find((item) => item.id === id)
    assert.equal(row.chainOk, false)
    assert.equal(row.issues.some((item) => item.code === 'chain_broken'), true)
    assert.equal(store.verify(id).chainOk, false)
  } finally {
    cleanup()
  }
})

test('export writes a verifiable manifest, STEWARDSHIP.md and the bundle carries both', () => {
  const { service, cleanup } = makeService()
  try {
    const id = releasedCampaign(service)
    const detail = service.get(id)
    assert.equal(detail.state.schema, 5)
    assert.equal(detail.state.stewardship.completeness.ok, true)
    assert.equal(detail.gate.ok, true)
    assert.equal(detail.gate.total, 13)

    const exported = service.write(id, { action: 'export' })
    assert.ok(existsSync(exported.paths.manifest))
    assert.ok(existsSync(exported.paths.stewardship))
    const manifest = JSON.parse(readFileSync(exported.paths.manifest, 'utf8'))
    assert.equal(manifest.format, 'dsh-research-suite/export-manifest/1')
    assert.equal(manifest.campaign.schema, 5)
    assert.equal(manifest.campaign.released, true)
    assert.equal(manifest.gate.ok, true)
    assert.equal(manifest.files.some((file) => file.path === 'STEWARDSHIP.md'), true)
    assert.equal(manifest.files.some((file) => file.path === 'MANIFEST.json'), false)
    for (const file of manifest.files) {
      const content = readFileSync(`${exported.paths.dir}/${file.path}`)
      assert.equal(content.length, file.bytes)
      assert.equal(sha256Hex(content), file.sha256)
    }
    const report = readFileSync(exported.paths.report, 'utf8')
    assert.match(report, /## 12\.1 研究治理与贡献/u)
    const zip = readFileSync(exported.paths.bundle)
    assert.ok(zip.includes(Buffer.from('MANIFEST.json')))
    assert.ok(zip.includes(Buffer.from('STEWARDSHIP.md')))
    assert.ok(zip.includes(Buffer.from('stewardship.updated')))
  } finally {
    cleanup()
  }
})
