import assert from 'node:assert/strict'
import test from 'node:test'

import { createTools, TOOL_NAMES } from '../../lib/tools.js'
import { makeService } from '../helpers.mjs'

function toolMap(service) {
  const tools = createTools({ service })
  const map = new Map(tools.map((tool) => [tool.name, tool]))
  return { tools, map }
}

test('fourteen tools are registered with strict schemas and renderers', () => {
  const { service } = makeService()
  const { tools, map } = toolMap(service)
  assert.equal(tools.length, 14)
  assert.deepEqual(tools.map((tool) => tool.name), [...TOOL_NAMES])
  for (const tool of tools) {
    assert.equal(typeof tool.description, 'string')
    assert.ok(tool.description.length > 40, `${tool.name} description is too thin`)
    assert.equal(tool.parameters.type, 'object')
    assert.equal(tool.parameters.additionalProperties, false)
    assert.ok(tool.parameters.properties && typeof tool.parameters.properties === 'object')
    assert.equal(typeof tool.output.render, 'function')
    assert.equal(typeof tool.execute, 'function')
    const rendered = tool.output.render({}, { ok: true, sample: 'x' })
    assert.equal(rendered[0].type, 'text')
    assert.match(rendered[0].text, /"ok":true/u)
  }
  assert.equal(map.get('rsx_campaign').parameters.properties.action.enum.includes('world'), true)
  assert.equal(map.get('rsx_gate').parameters.properties.action.enum.includes('advance'), true)
  assert.equal(map.get('rsx_source').parameters.properties.action.enum.includes('import'), true)
  assert.equal(map.get('rsx_review').parameters.properties.action.enum.includes('audit'), true)
  assert.equal(map.get('rsx_extract').parameters.properties.action.enum.includes('matrix'), true)
  assert.equal(map.get('rsx_figure').parameters.properties.action.enum.includes('add'), true)
  assert.equal(map.get('rsx_artifact').parameters.properties.action.enum.includes('add'), true)
  assert.equal(map.get('rsx_domain').parameters.properties.action.enum.includes('set'), true)
  assert.equal(map.get('rsx_domain').parameters.properties.action.enum.includes('check'), true)
  assert.equal(map.get('rsx_campaign').parameters.properties.action.enum.includes('monitor'), true)
  assert.ok(map.get('rsx_gate').parameters.properties.role, 'review role must be exposed')
})

test('rsx_campaign creates, reports status and rejects unknown actions', async () => {
  const { service } = makeService()
  const { map } = toolMap(service)
  const campaign = map.get('rsx_campaign')
  const created = await campaign.execute({
    action: 'create',
    title: '工具链冒烟',
    question: '这套工具能否在真实会话里跑完整条流水线？',
    scope: '本地测试数据，不访问外部服务。',
    success: '九个闸门全部通过且导出研究包。',
    tier: 'S',
  })
  assert.equal(created.ok, true)
  assert.match(created.campaign.id, /^rs-[0-9a-f]{8}$/u)
  const status = await campaign.execute({ action: 'status', campaign: created.campaign.id })
  assert.equal(status.ok, true)
  assert.equal(status.campaign.stage, 'scoping')
  assert.equal(status.gate.ok, false)
  assert.ok(status.gate.blocking.length > 0)
  assert.equal(status.integrity.chainOk, true)
  const got = await campaign.execute({ action: 'get', campaign: created.campaign.id })
  assert.equal(got.ok, true)
  assert.equal('events' in got.state, false)
  assert.equal(got.integrity.stateOk, true)
  assert.match(got.state.stateHash, /^[0-9a-f]{64}$/u)
  const bad = await campaign.execute({ action: 'nope' })
  assert.equal(bad.ok, false)
  assert.equal(bad.code, 'invalid_input')
  assert.match(bad.repair, /parameter|valid/u)
  const missing = await campaign.execute({ action: 'get', campaign: 'rs-deadbeef' })
  assert.equal(missing.ok, false)
  assert.equal(missing.code, 'not_found')
})

test('rsx_gate blocks an under-specified campaign and reports checks', async () => {
  const { service } = makeService()
  const { map } = toolMap(service)
  const created = await map.get('rsx_campaign').execute({
    action: 'create',
    question: '一个足够长但仍然没有世界模型的问题？',
    scope: '本地。',
    success: '通过闸门。',
  })
  const gate = await map.get('rsx_gate').execute({ campaign: created.campaign.id, action: 'check' })
  assert.equal(gate.ok, true)
  assert.equal(gate.gate.ok, false)
  assert.ok(gate.gate.blocking.includes('world_question'))
  const advance = await map.get('rsx_gate').execute({ campaign: created.campaign.id, action: 'advance' })
  assert.equal(advance.ok, false)
  assert.equal(advance.code, 'gate_blocked')
  assert.ok(Array.isArray(advance.detail.blocking))
})

test('new entity tools: BibTeX import, artifact, figure, extraction and review', async () => {
  const { service } = makeService()
  const { map } = toolMap(service)
  const created = await map.get('rsx_campaign').execute({
    action: 'create',
    title: '新工具冒烟',
    question: '新增的工件、图、抽取与审查工具能否在同一项目里协同？',
    scope: '本地临时目录。',
    success: '每个工具都返回结构化 payload，审查记录带 subjectHash。',
    tier: 'S',
  })
  const id = created.campaign.id

  const imported = await map.get('rsx_source').execute({
    campaign: id,
    action: 'import',
    bibtex: '@article{a2024, title={First paper}, author={A, B}, year={2024}, journal={J}}\n@misc{b2020, title={Second paper}, year={2020}}',
  })
  assert.equal(imported.ok, true)
  assert.equal(imported.imported.length, 2)
  const captured = await map.get('rsx_source').execute({
    campaign: id,
    title: 'Captured source',
    year: 2024,
    kind: 'paper',
    reliability: 'primary',
    content: 'The actual text says 41 samples were measured.',
  })
  assert.equal(captured.ok, true)

  const figureArtifact = await map.get('rsx_artifact').execute({
    campaign: id,
    content: 'PNG data',
    role: 'figure',
    label: 'fig1.png',
    description: 'A tiny figure for the smoke test.',
  })
  const codeArtifact = await map.get('rsx_artifact').execute({ campaign: id, content: 'print(1)', role: 'code', label: 'fig.py' })
  const dataArtifact = await map.get('rsx_artifact').execute({ campaign: id, content: 'x,y\n1,2\n', role: 'dataset', label: 'fig.csv' })
  assert.equal(figureArtifact.ok, true)
  assert.equal(figureArtifact.duplicate, false)

  const figure = await map.get('rsx_figure').execute({
    campaign: id,
    artifact: figureArtifact.artifact.id,
    codeArtifact: codeArtifact.artifact.id,
    dataArtifact: dataArtifact.artifact.id,
    title: 'Smoke figure',
    caption: 'A caption.',
    description: 'A description.',
    env: 'node 22',
  })
  assert.equal(figure.ok, true)
  assert.equal(figure.provenanceOk, true)

  const extracted = await map.get('rsx_extract').execute({
    campaign: id,
    source: captured.source.id,
    dimension: 'sample_size',
    value: 42,
    quote: '42 samples were measured',
    locator: 'p.1',
  })
  assert.equal(extracted.ok, true)
  assert.equal(extracted.matrix.dimensions.includes('sample_size'), true)
  const matrix = await map.get('rsx_extract').execute({ campaign: id, action: 'matrix' })
  assert.equal(matrix.ok, true)
  assert.match(matrix.csv, /sample_size/u)

  const reviewed = await map.get('rsx_review').execute({ campaign: id, action: 'audit' })
  assert.equal(reviewed.ok, true)
  assert.match(reviewed.audit.subjectHash, /^[0-9a-f]{64}$/u)
  assert.ok(reviewed.audit.findings.some((item) => item.code === 'extraction_quote_mismatch'))
  const view = await map.get('rsx_review').execute({ campaign: id, action: 'view' })
  assert.equal(view.ok, true)
  assert.equal(view.fresh, true)

  const bibtex = await map.get('rsx_source').execute({ campaign: id, action: 'bibtex' })
  assert.equal(bibtex.ok, true)
  assert.match(bibtex.bibtex, /@article\{/u)
})

test('rsx_write export produces a report and a bundle', async () => {
  const { service } = makeService()
  const { map } = toolMap(service)
  const created = await map.get('rsx_campaign').execute({
    action: 'create',
    question: '导出的研究包应当包含哪些文件？',
    scope: '本地。',
    success: 'REPORT.md、declaration.md、campaign.json、ledger.jsonl 与 BUNDLE.zip 都在。',
    tier: 'S',
  })
  const written = await map.get('rsx_write').execute({ campaign: created.campaign.id, action: 'export' })
  assert.equal(written.ok, true)
  assert.match(written.paths.report, /REPORT\.md$/u)
  assert.match(written.paths.bundle, /BUNDLE\.zip$/u)
  assert.ok(written.chars > 100)
  const rendered = map.get('rsx_write').output.render({}, written)
  assert.match(rendered[0].text, /BUNDLE\.zip/u)
})
