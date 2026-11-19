import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'

import { handleRequest } from '../../lib/panel.js'
import { createCampaign, makeService, releasedCampaign } from '../helpers.mjs'

async function withPanel(run) {
  const { service } = makeService()
  const server = http.createServer((req, res) => {
    void handleRequest(service, req, res)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const base = `http://127.0.0.1:${port}/dsh-research-suite`
  try {
    await run({ base, service, port })
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

async function getJson(url) {
  const response = await fetch(url)
  return { status: response.status, body: await response.json() }
}

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dsh-research-suite': '1', ...headers },
    body: JSON.stringify(body || {}),
  })
  return { status: response.status, body: await response.json() }
}

async function expectActionBlocked(url, body, action, reason) {
  const response = await postJson(url, body)
  assert.equal(response.status, 409)
  assert.equal(response.body.ok, false)
  assert.equal(response.body.code, 'action_blocked')
  assert.equal(response.body.detail.action, action)
  assert.equal(response.body.detail.reason, reason)
  assert.match(response.body.error, new RegExp(`${action} is blocked`, 'u'))
  return response.body.detail
}

test('panel API: reads, refusal without the header, create and export', async () => {
  await withPanel(async ({ base, service }) => {
    const state = await getJson(`${base}/api/state`)
    assert.equal(state.status, 200)
    assert.equal(state.body.ok, true)
    assert.equal(Array.isArray(state.body.data.campaigns), true)
    assert.equal(typeof state.body.data.dataDir, 'string')
    assert.ok(state.body.data.dataDir.length > 0)
    assert.equal(state.body.data.apiVersion, 1)
    assert.equal(state.body.data.schemaVersion, 5)
    assert.equal(state.body.data.pluginVersion, '1.1.0')

    const doctor = await getJson(`${base}/api/doctor`)
    assert.equal(doctor.status, 200)
    assert.equal(doctor.body.data.ok, true)
    assert.equal(doctor.body.data.schemaVersion, 5)
    assert.equal(doctor.body.data.index.ok, true)

    const templates = await getJson(`${base}/api/templates`)
    assert.equal(templates.body.data.templates.length, 14)

    const savedSettings = await postJson(`${base}/api/settings`, { patch: { defaultTier: 'L', language: 'en', allowExec: true } })
    assert.equal(savedSettings.status, 200)
    assert.equal(savedSettings.body.data.settings.defaultTier, 'L')
    assert.equal('allowExec' in savedSettings.body.data.settings, false)

    const refused = await postJson(`${base}/api/campaign`, { action: 'create', question: 'x' }, { 'x-dsh-research-suite': '' })
    assert.equal(refused.status, 403)
    assert.equal(refused.body.code, 'forbidden')

    const created = await postJson(`${base}/api/campaign`, {
      action: 'create',
      title: '面板冒烟',
      question: '面板是否可以创建、读取并导出同一个项目？',
      scope: '仅本地回环测试数据，不访问外部服务。',
      success: '全部路由返回预期状态码。',
      tier: 'S',
    })
    assert.equal(created.status, 200)
    assert.equal(created.body.ok, true)
    const id = created.body.data.campaign.id
    assert.match(id, /^rs-[0-9a-f]{8}$/u)

    const detail = await getJson(`${base}/api/campaign/${id}`)
    assert.equal(detail.body.data.state.title, '面板冒烟')
    assert.equal(detail.body.data.gate.ok, false)
    assert.equal(detail.body.data.integrity.chainOk, true)
    assert.equal(detail.body.data.budget.tier, 'S')
    assert.equal(detail.body.data.next.primary.tool, 'rsx_campaign')
    assert.equal(detail.body.data.next.primary.args.action, 'world')

    const stewardship = await getJson(`${base}/api/stewardship/${id}`)
    assert.equal(stewardship.body.data.schema, 5)
    assert.equal(stewardship.body.data.completeness.ok, false)
    const setStewardship = await postJson(`${base}/api/campaign`, {
      action: 'stewardship',
      campaign: id,
      license: 'MIT',
      dataAvailability: 'Local fixture data is included in the export package.',
      codeAvailability: 'Node 22 source is in the repository.',
      competingInterests: 'None.',
      ethics: 'No human subjects.',
      contributors: [{ name: 'YG', roles: ['conceptualization', 'supervision'] }],
    })
    assert.equal(setStewardship.status, 200)
    assert.equal(setStewardship.body.data.completeness.ok, true)
    assert.equal(setStewardship.body.data.gate.checks.find((item) => item.code === 'stewardship').ok, true)

    const domainList = await getJson(`${base}/api/domains`)
    assert.equal(domainList.body.data.domains.length, 4)
    const domainBefore = await getJson(`${base}/api/campaign/${id}/domain`)
    assert.equal(domainBefore.body.data.domainId, 'general')
    const domainSet = await postJson(`${base}/api/campaign/${id}/domain`, { action: 'set', domain: 'ai' })
    assert.equal(domainSet.body.data.domainId, 'ai')
    assert.ok(domainSet.body.data.completeness.required > 0)
    const monitored = await postJson(`${base}/api/campaign/${id}/monitor`, {
      status: 'planned',
      plan: '上线后每周检查漂移与安全事件，超过阈值回滚。',
      owner: 'YG',
      cadence: 'weekly',
      signals: ['drift', 'incident'],
    })
    assert.equal(monitored.body.data.monitoring.status, 'planned')
    assert.equal(monitored.body.data.monitoring.signals.length, 2)
    const evaluated = await postJson(`${base}/api/campaign/${id}/evaluate`, {})
    assert.equal(evaluated.status, 200)
    assert.equal(evaluated.body.data.evaluation.dimensions.length, 13)
    assert.equal(evaluated.body.data.recorded, true)

    const declaration = await postJson(`${base}/api/declaration/${id}`, { model: 'test-model', humanReviewer: 'YG' })
    assert.equal(declaration.status, 200)
    assert.equal(declaration.body.data.declaration.humanReviewer, 'YG')

    service.sourceAdd(id, {
      title: '面板来源',
      year: 2024,
      kind: 'paper',
      reliability: 'primary',
      content: 'We measured 42 samples at 40C.',
      doi: '10.1000/panel',
    })
    service.extractionAdd(id, { source: 'S-0001', dimension: 'sample_size', value: 42, quote: '42 samples at 40C' })
    service.artifactAdd(id, { content: 'panel dataset', role: 'dataset', label: 'panel.csv' })
    const audited = await postJson(`${base}/api/audit/${id}`, {})
    assert.equal(audited.status, 200)
    assert.ok(audited.body.data.audit.id)
    const auditView = await getJson(`${base}/api/audit/${id}`)
    assert.equal(auditView.body.data.fresh, true)
    assert.equal(auditView.body.data.matrix.dimensions.includes('sample_size'), true)
    const matrix = await getJson(`${base}/api/matrix/${id}`)
    assert.equal(matrix.body.data.matrix.rows[0].source, 'S-0001')
    assert.match(matrix.body.data.csv, /sample_size/u)
    const bibtex = await getJson(`${base}/api/bibtex/${id}`)
    assert.match(bibtex.body.data.bibtex, /@article\{/u)
    const references = await getJson(`${base}/api/references/${id}?format=csl-json`)
    assert.equal(references.body.data.format, 'csl-json')
    assert.equal(JSON.parse(references.body.data.content)[0].title, '面板来源')
    const ris = await getJson(`${base}/api/references/${id}?format=ris`)
    assert.match(ris.body.data.content, /^TY  - JOUR$/mu)
    const screened = await postJson(`${base}/api/campaign`, {
      action: 'screen',
      campaign: id,
      source: 'S-0001',
      stage: 'title',
      decision: 'include',
    })
    assert.equal(screened.status, 200)
    assert.equal(screened.body.data.candidate.id, 'R-0001')
    assert.equal(screened.body.data.candidate.source, 'S-0001')
    const prismaJson = await getJson(`${base}/api/prisma/${id}`)
    assert.equal(prismaJson.body.data.format, 'json')
    assert.equal(prismaJson.body.data.prisma.counts.recordsIdentified, 1)
    assert.equal(prismaJson.body.data.prisma.counts.titleAbstractScreened, 1)
    const prismaMarkdown = await getJson(`${base}/api/prisma/${id}?format=markdown`)
    assert.match(prismaMarkdown.body.data.content, /PRISMA 2020/u)
    assert.match(prismaMarkdown.body.data.content, /```mermaid/u)
    const prismaCsv = await getJson(`${base}/api/prisma/${id}?format=csv`)
    assert.match(prismaCsv.body.data.content, /^candidateId,title,/u)
    const artifacts = await getJson(`${base}/api/artifacts/${id}`)
    assert.ok(artifacts.body.data.artifacts.some((item) => item.role === 'dataset'))

    const report = await getJson(`${base}/api/report/${id}`)
    assert.match(report.body.data.markdown, /面板冒烟/u)
    assert.match(report.body.data.markdown, /## 0\. 状态/u)
    assert.match(report.body.data.markdown, /YG/u)
    assert.match(report.body.data.markdown, /自动化审查/u)
    assert.match(report.body.data.markdown, /证据抽取矩阵/u)

    const releasedId = releasedCampaign(service)
    const exported = await postJson(`${base}/api/export/${releasedId}`, {})
    assert.equal(exported.status, 200)
    assert.match(exported.body.data.paths.bundle, /BUNDLE\.zip$/u)
    assert.match(exported.body.data.paths.report, /REPORT\.md$/u)
    assert.match(exported.body.data.paths.manifest, /MANIFEST\.json$/u)
    assert.match(exported.body.data.paths.stewardship, /STEWARDSHIP\.md$/u)

    const reindex = await postJson(`${base}/api/reindex`, {})
    assert.equal(reindex.status, 200)
    assert.equal(reindex.body.data.ok, true)
    assert.equal(reindex.body.data.indexed, 2)

    const settings = await postJson(`${base}/api/settings`, { patch: { defaultTier: 'L', language: 'en' } })
    assert.equal(settings.body.data.settings.defaultTier, 'L')
    const reread = await getJson(`${base}/api/settings`)
    assert.equal(reread.body.data.settings.language, 'en')

    const missing = await getJson(`${base}/api/nothing-here`)
    assert.equal(missing.status, 404)
    assert.equal(missing.body.code, 'not_found')
  })
})

function rawGet(port, path, host) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, path, method: 'GET', headers: { host } }, (response) => {
      let body = ''
      response.on('data', (chunk) => {
        body += chunk
      })
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(body) }))
    })
    request.on('error', reject)
    request.end()
  })
}

test('panel API: rejects a non-loopback Host and an oversized body', async () => {
  await withPanel(async ({ base, port }) => {
    const foreign = await rawGet(port, '/dsh-research-suite/api/state', 'example.com')
    assert.equal(foreign.status, 403)
    assert.equal(foreign.body.code, 'forbidden')
    assert.match(foreign.body.error, /loopback/u)

    const huge = 'x'.repeat(2 * 1024 * 1024 + 64)
    const tooLarge = await postJson(`${base}/api/campaign`, { action: 'create', question: huge })
    assert.equal(tooLarge.status, 413)
    assert.equal(tooLarge.body.code, 'too_large')
  })
})

test('panel API: doctor and explicit schema migration are available without a gate', async () => {
  await withPanel(async ({ base, service }) => {
    const created = await postJson(`${base}/api/campaign`, {
      action: 'create',
      title: '迁移测试',
      question: '面板能否显式迁移旧 schema 而不自动改状态？',
      scope: '本地夹具。',
      success: '迁移前 doctor 提示，迁移后备份可查。',
      tier: 'S',
    })
    const id = created.body.data.campaign.id
    const state = service.store.get(id)
    state.schema = 4
    state.stewardship = undefined
    service.store.save(state)

    const before = await getJson(`${base}/api/doctor`)
    assert.equal(before.body.data.ok, true)
    const row = before.body.data.campaigns.find((item) => item.id === id)
    assert.equal(row.canMigrate, true)
    assert.equal(row.schema, 4)
    assert.ok(before.body.data.next.some((item) => item.action === 'migrate'))

    const dry = await postJson(`${base}/api/campaign`, { action: 'migrate', campaign: id, dryRun: true })
    assert.equal(dry.status, 200)
    assert.equal(dry.body.data.migrated, false)
    assert.equal(dry.body.data.dryRun, true)
    assert.equal(service.store.get(id).schema, 4)

    const migrated = await postJson(`${base}/api/campaign`, {
      action: 'migrate',
      campaign: id,
      stewardship: {
        license: 'MIT',
        dataAvailability: 'Fixture data is included in the export package.',
        codeAvailability: 'Node 22 source is in the repository.',
        competingInterests: 'None.',
        ethics: 'No human subjects.',
        contributors: [{ name: 'YG', roles: ['conceptualization'] }],
      },
    })
    assert.equal(migrated.status, 200)
    assert.equal(migrated.body.data.migrated, true)
    assert.equal(migrated.body.data.to, 5)
    assert.match(migrated.body.data.backup.name, /^backup-.*\.zip$/u)
    assert.equal(service.store.get(id).schema, 5)

    const after = await getJson(`${base}/api/doctor`)
    const migratedRow = after.body.data.campaigns.find((item) => item.id === id)
    assert.equal(migratedRow.canMigrate, false)
    assert.equal(migratedRow.stewardship.ok, true)
    assert.equal(after.body.data.ok, true)
  })
})

test('panel API: export follows release while archive is a reversible lifecycle action', async () => {
  await withPanel(async ({ base, service }) => {
    const store = service.store
    const exportAt = (id) => `${base}/api/export/${id}`
    const archiveAt = (id) => ({ action: 'archive', campaign: id })
    const unarchiveAt = (id) => ({ action: 'unarchive', campaign: id })

    const beforeWrite = createCampaign(service)
    const beforeWriteGate = await expectActionBlocked(exportAt(beforeWrite), {}, 'export', 'release')
    assert.equal(beforeWriteGate.gate.ok, false)
    assert.equal(service.actionGate(beforeWrite, 'archive').ok, true)

    const earlyArchive = await postJson(`${base}/api/campaign`, archiveAt(beforeWrite))
    assert.equal(earlyArchive.status, 200)
    assert.equal(store.get(beforeWrite).archived, true)
    let state = await getJson(`${base}/api/state`)
    assert.equal(state.body.data.campaigns.some((row) => row.id === beforeWrite), false)
    assert.equal(state.body.data.archivedCampaigns.some((row) => row.id === beforeWrite), true)
    assert.equal(state.body.data.archivedCount, 1)

    const restored = await postJson(`${base}/api/campaign`, unarchiveAt(beforeWrite))
    assert.equal(restored.status, 200)
    assert.equal(restored.body.data.changed, true)
    assert.equal(store.get(beforeWrite).archived, false)
    state = await getJson(`${base}/api/state`)
    assert.equal(state.body.data.archivedCount, 0)

    const released = releasedCampaign(service)
    const completeExport = await postJson(exportAt(released), {})
    assert.equal(completeExport.status, 200)
    assert.equal(service.actionGate(released, 'export').ok, true)

    state = store.get(released)
    const approvals = state.approvals
    state.approvals = []
    store.save(state)
    const releaseBlocked = await expectActionBlocked(exportAt(released), {}, 'export', 'release')
    assert.equal(releaseBlocked.gate.total, 13)
    assert.equal(releaseBlocked.gate.passed, 12)
    assert.ok(releaseBlocked.gate.blocking.includes('human_approval'))
    state = store.get(released)
    state.approvals = approvals
    store.save(state)

    state = store.get(released)
    state.loop = { ...(state.loop || {}), status: 'paused' }
    state.loopPauses = [
      {
        id: 'LP-TEST',
        status: 'open',
        kind: 'needs_input',
        reason: 'waiting for test input',
        createdAt: '2026-11-19T00:00:00.000Z',
      },
    ]
    store.save(state)
    const paused = await expectActionBlocked(exportAt(released), {}, 'export', 'paused')
    assert.equal(paused.pause.id, 'LP-TEST')
    const pausedArchive = await postJson(`${base}/api/campaign`, archiveAt(released))
    assert.equal(pausedArchive.status, 200)
    assert.equal(store.get(released).archived, true)
    const pausedRestore = await postJson(`${base}/api/campaign`, unarchiveAt(released))
    assert.equal(pausedRestore.status, 200)
    state = store.get(released)
    state.loop.status = 'running'
    state.loopPauses = []
    store.save(state)

    state = store.get(released)
    state.archived = true
    store.save(state)
    await expectActionBlocked(exportAt(released), {}, 'export', 'archived')
    await expectActionBlocked(`${base}/api/campaign`, archiveAt(released), 'archive', 'archived')
    state = store.get(released)
    state.archived = false
    store.save(state)

    const token = store.acquireLock(released)
    try {
      await expectActionBlocked(exportAt(released), {}, 'export', 'busy')
      await expectActionBlocked(`${base}/api/campaign`, archiveAt(released), 'archive', 'busy')
    } finally {
      store.releaseLock(released, token)
    }

    state = store.get(released)
    state.archived = true
    store.save(state)
    const token2 = store.acquireLock(released)
    try {
      const blockedRestore = await postJson(`${base}/api/campaign`, unarchiveAt(released))
      assert.equal(blockedRestore.status, 409)
      assert.equal(blockedRestore.body.detail.reason, 'busy')
    } finally {
      store.releaseLock(released, token2)
    }
    await postJson(`${base}/api/campaign`, unarchiveAt(released))

    const archived = await postJson(`${base}/api/campaign`, archiveAt(released))
    assert.equal(archived.status, 200)
    assert.equal(store.get(released).archived, true)
    await expectActionBlocked(exportAt(released), {}, 'export', 'archived')

    const portfolio = await getJson(`${base}/api/portfolio`)
    assert.equal(portfolio.status, 200)
    assert.ok(portfolio.body.data.campaigns.some((row) => row.id === beforeWrite))
    assert.equal(portfolio.body.data.campaigns.some((row) => row.id === released), false)
    assert.equal(portfolio.body.data.totals.archived, 1)
    assert.equal(typeof portfolio.body.data.totals.attention, 'number')
  })
})



