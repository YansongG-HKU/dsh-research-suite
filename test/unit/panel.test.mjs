import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'

import { handleRequest } from '../../lib/panel.js'
import { makeService } from '../helpers.mjs'

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

test('panel API: reads, refusal without the header, create and export', async () => {
  await withPanel(async ({ base, service }) => {
    const state = await getJson(`${base}/api/state`)
    assert.equal(state.status, 200)
    assert.equal(state.body.ok, true)
    assert.equal(Array.isArray(state.body.data.campaigns), true)
    assert.equal(typeof state.body.data.dataDir, 'string')
    assert.ok(state.body.data.dataDir.length > 0)

    const templates = await getJson(`${base}/api/templates`)
    assert.equal(templates.body.data.templates.length, 14)

    const refused = await postJson(`${base}/api/campaign`, { action: 'create', question: 'x' }, { 'x-dsh-research-suite': '' })
    assert.equal(refused.status, 403)
    assert.equal(refused.body.code, 'forbidden')

    const created = await postJson(`${base}/api/campaign`, {
      action: 'create',
      title: '面板冒烟',
      question: '面板是否可以创建、读取并导出同一个项目？',
      scope: '仅本地回环测试数据。',
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
    assert.equal(evaluated.body.data.evaluation.dimensions.length, 12)
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
    const artifacts = await getJson(`${base}/api/artifacts/${id}`)
    assert.ok(artifacts.body.data.artifacts.some((item) => item.role === 'dataset'))

    const report = await getJson(`${base}/api/report/${id}`)
    assert.match(report.body.data.markdown, /面板冒烟/u)
    assert.match(report.body.data.markdown, /## 0\. 状态/u)
    assert.match(report.body.data.markdown, /YG/u)
    assert.match(report.body.data.markdown, /自动化审查/u)
    assert.match(report.body.data.markdown, /证据抽取矩阵/u)

    const exported = await postJson(`${base}/api/export/${id}`, {})
    assert.equal(exported.status, 200)
    assert.match(exported.body.data.paths.bundle, /BUNDLE\.zip$/u)
    assert.match(exported.body.data.paths.report, /REPORT\.md$/u)

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
