import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { createTools, TOOL_NAMES } from '../../lib/tools.js'
import { createCampaign, makeService } from '../helpers.mjs'

function toolMap(service, retrieval, lookup) {
  const tools = createTools({ service, retrieval, lookup })
  const map = new Map(tools.map((tool) => [tool.name, tool]))
  return { tools, map }
}

test('sixteen tools are registered with strict schemas and renderers', () => {
  const { service } = makeService()
  const { tools, map } = toolMap(service)
  assert.equal(tools.length, 16)
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
  assert.equal(map.get('rsx_campaign').parameters.properties.action.enum.includes('next'), true)
  assert.equal(map.get('rsx_gate').parameters.properties.action.enum.includes('advance'), true)
  assert.equal(map.get('rsx_source').parameters.properties.action.enum.includes('import'), true)
  assert.equal(map.get('rsx_source').parameters.properties.action.enum.includes('export'), true)
  assert.equal(map.get('rsx_source').parameters.properties.action.enum.includes('lookup'), true)
  assert.equal(map.get('rsx_source').parameters.properties.action.enum.includes('screen'), true)
  assert.equal(map.get('rsx_source').parameters.properties.action.enum.includes('prisma'), true)
  assert.equal(map.get('rsx_source').parameters.properties.stage.enum.includes('full-text'), true)
  assert.equal(map.get('rsx_source').parameters.properties.decision.enum.includes('exclude'), true)
  assert.equal(map.get('rsx_source').parameters.properties.reason.enum.includes('not-retrieved'), true)
  assert.equal(map.get('rsx_source').parameters.properties.format.enum.includes('csl-json'), true)
  assert.equal(map.get('rsx_review').parameters.properties.action.enum.includes('audit'), true)
  assert.equal(map.get('rsx_extract').parameters.properties.action.enum.includes('matrix'), true)
  assert.equal(map.get('rsx_figure').parameters.properties.action.enum.includes('add'), true)
  assert.equal(map.get('rsx_artifact').parameters.properties.action.enum.includes('add'), true)
  assert.equal(map.get('rsx_domain').parameters.properties.action.enum.includes('set'), true)
  assert.equal(map.get('rsx_domain').parameters.properties.action.enum.includes('check'), true)
  assert.equal(map.get('rsx_campaign').parameters.properties.action.enum.includes('monitor'), true)
  assert.equal(map.get('rsx_campaign').parameters.properties.action.enum.includes('evaluate'), true)
  assert.ok(map.get('rsx_search'), 'live retrieval tool must be registered')
  assert.equal(map.get('rsx_search').parameters.required.includes('query'), true)
  assert.equal(map.get('rsx_search').parameters.properties.provider.enum.includes('both'), true)
  assert.ok(map.get('rsx_program'), 'programme tool must be registered')
  assert.equal(map.get('rsx_program').parameters.properties.action.enum.includes('quality'), true)
  assert.equal(map.get('rsx_program').parameters.properties.action.enum.includes('contradiction'), true)
  assert.equal(map.get('rsx_campaign').parameters.properties.action.enum.includes('stewardship'), true)
  assert.equal(map.get('rsx_campaign').parameters.properties.action.enum.includes('migrate'), true)
  assert.equal(map.get('rsx_campaign').parameters.properties.action.enum.includes('doctor'), true)
  assert.equal(map.get('rsx_campaign').parameters.properties.action.enum.includes('reindex'), true)
  assert.ok(map.get('rsx_campaign').parameters.properties.stewardship, 'FAIR/CRediT fields must be exposed')
  assert.ok(map.get('rsx_campaign').parameters.properties.dryRun, 'migration dry-run must be exposed')
  assert.ok(map.get('rsx_campaign').parameters.properties.metrics, 'monitoring metrics must be exposed')
  assert.ok(map.get('rsx_campaign').parameters.properties.observations, 'monitoring observations must be exposed')
  assert.ok(map.get('rsx_campaign').parameters.properties.reopen, 'reopen must be exposed')
  assert.ok(map.get('rsx_gate').parameters.properties.role, 'review role must be exposed')
  assert.ok(map.get('rsx_gate').parameters.properties.affiliation, 'review affiliation must be exposed')
  assert.ok(map.get('rsx_gate').parameters.properties.conflict, 'review conflict must be exposed')
  assert.ok(map.get('rsx_gate').parameters.properties.independent, 'review independence must be exposed')
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
  const planned = await campaign.execute({ action: 'next', campaign: created.campaign.id })
  assert.equal(planned.ok, true)
  assert.equal(planned.plan.stage, 'scoping')
  assert.equal(planned.plan.primary.tool, 'rsx_campaign')
  assert.equal(planned.plan.primary.args.action, 'world')
  assert.equal(planned.gate.ok, false)
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
  const evaluated = await campaign.execute({ action: 'evaluate', campaign: created.campaign.id })
  assert.equal(evaluated.ok, true)
  assert.equal(evaluated.recorded, true)
  assert.equal(evaluated.evaluation.dimensions.length, 13)
  assert.equal(evaluated.evaluation.score < 45, true)

  const archived = await campaign.execute({ action: 'archive', campaign: created.campaign.id })
  assert.equal(archived.ok, true)
  assert.equal(archived.archived, true)
  assert.equal(service.store.get(created.campaign.id).archived, true)
  const restored = await campaign.execute({ action: 'unarchive', campaign: created.campaign.id })
  assert.equal(restored.ok, true)
  assert.equal(restored.archived, false)
  assert.equal(restored.changed, true)
  assert.equal(service.store.get(created.campaign.id).archived, false)
})

test('rsx_campaign searchLog and rsx_claim sensitivity are callable through the tool handlers', async () => {
  const { service } = makeService()
  const { map } = toolMap(service)
  const created = await map.get('rsx_campaign').execute({
    action: 'create',
    title: '检索与敏感性工具冒烟',
    question: '新增的检索与敏感性动作能否通过真实工具入口写入台账？',
    scope: '本地临时 campaign。',
    success: '两个动作都返回结构化记录并写入 state。',
    tier: 'S',
  })
  const id = created.campaign.id
  const logged = await map.get('rsx_campaign').execute({
    action: 'searchLog',
    campaign: id,
    searchKind: 'database',
    database: 'Local Index',
    query: 'schema three search protocol',
    hits: 9,
    screened: 4,
    included: 2,
  })
  assert.equal(logged.ok, true)
  assert.equal(logged.searchLog.id, 'Q-0001')
  const claim = await map.get('rsx_claim').execute({
    action: 'add',
    campaign: id,
    statement: '检索记录会进入闸门检查。',
  })
  const sensitivity = await map.get('rsx_claim').execute({
    action: 'sensitivity',
    campaign: id,
    claim: claim.claim.id,
    name: 'alternative index',
    method: 'alternative-source',
    specification: '换一个检索库重跑同一个查询。',
    result: '两个库都得到相同的方向。',
    direction: 'consistent',
  })
  assert.equal(sensitivity.ok, true)
  assert.equal(sensitivity.sensitivity.id, 'Z-0001')
})

test('rsx_run attaches captured stdout to an existing run without inventing metrics', async () => {
  const { service, dir } = makeService()
  const { map } = toolMap(service)
  const created = await map.get('rsx_campaign').execute({
    action: 'create',
    title: '运行输出补录',
    question: '已经记录但没有 stdout 的运行，能否在不重写指标的情况下补上原始输出？',
    scope: '本地临时 stdout 文件。',
    success: '同一条运行获得 stdout 工件，命令、种子和指标保持不变。',
    tier: 'S',
  })
  const id = created.campaign.id
  const runTool = map.get('rsx_run')
  const recorded = await runTool.execute({
    action: 'record',
    campaign: id,
    command: 'node experiment.mjs --seed 7',
    seed: 7,
    metrics: { r: 0.4 },
  })
  assert.equal(recorded.ok, true)
  const stdoutPath = join(dir, 'run.stdout.txt')
  writeFileSync(stdoutPath, '{"r":0.4}\n', 'utf8')
  const attached = await runTool.execute({ action: 'attach', campaign: id, id: recorded.run.id, stdoutPath })
  assert.equal(attached.ok, true)
  assert.match(attached.artifact, /^sha256:[0-9a-f]{64}$/u)
  assert.equal(attached.run.command, 'node experiment.mjs --seed 7')
  assert.equal(attached.run.seed, 7)
  assert.deepEqual(attached.run.metrics, { r: 0.4 })
  assert.equal(attached.run.stdoutArtifact, attached.artifact)
  const got = await runTool.execute({ action: 'get', campaign: id, id: recorded.run.id })
  assert.equal(got.run.stdoutArtifact, attached.artifact)
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

test('rsx_source imports CSL-JSON, exports RIS and turns a DOI lookup into a draft', async () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const lookupCalls = []
    const { map } = toolMap(service, undefined, async (doi) => {
      lookupCalls.push(doi)
      return {
        ok: true,
        doi,
        provider: 'crossref',
        candidate: {
          title: 'Looked up paper',
          authors: ['Ada Lovelace', 'Alan Turing'],
          year: 2024,
          venue: 'Nature',
          doi,
          url: `https://doi.org/${doi}`,
          kind: 'paper',
          abstract: 'Resolved from a DOI.',
        },
      }
    })

    const imported = await map.get('rsx_source').execute({
      campaign: id,
      action: 'import',
      data: JSON.stringify([
        {
          type: 'article-journal',
          title: 'Zotero import',
          author: [{ family: 'Smith', given: 'Jane' }],
          issued: { 'date-parts': [[2024]] },
          DOI: '10.1000/zotero',
        },
      ]),
    })
    assert.equal(imported.format, 'csl-json')
    assert.deepEqual(imported.imported, ['S-0001'])

    const ris = await map.get('rsx_source').execute({ campaign: id, action: 'export', format: 'ris' })
    assert.equal(ris.format, 'ris')
    assert.match(ris.content, /^TY  - JOUR$/mu)

    const looked = await map.get('rsx_source').execute({ action: 'lookup', doi: '10.1234/abc' })
    assert.equal(looked.ok, true)
    assert.deepEqual(lookupCalls, ['10.1234/abc'])
    assert.equal(looked.sourceDraft.title, 'Looked up paper')
    assert.equal(looked.sourceDraft.authors, 'Ada Lovelace and Alan Turing')
    assert.equal(looked.sourceDraft.reliability, 'primary')
  } finally {
    cleanup()
  }
})

test('rsx_source screens a candidate and returns PRISMA flow data', async () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const paper = service.sourceAdd(id, {
      title: 'Screened through the tool',
      year: 2024,
      kind: 'paper',
      reliability: 'primary',
      doi: '10.1000/tool-screen',
    }).source
    const { map } = toolMap(service)
    const title = await map.get('rsx_source').execute({
      campaign: id,
      action: 'screen',
      source: paper.id,
      stage: 'title',
      decision: 'include',
    })
    assert.equal(title.ok, true)
    assert.equal(title.candidate.id, 'R-0001')
    assert.equal(title.candidate.decisions.title.decision, 'include')
    const abstract = await map.get('rsx_source').execute({
      campaign: id,
      action: 'screen',
      candidate: 'R-0001',
      stage: 'abstract',
      decision: 'include',
    })
    assert.equal(abstract.counts.pendingFullText, 1)
    const prisma = await map.get('rsx_source').execute({ campaign: id, action: 'prisma' })
    assert.equal(prisma.ok, true)
    assert.equal(prisma.prisma.counts.recordsIdentified, 1)
    assert.equal(prisma.prisma.records[0].title, 'Screened through the tool')
  } finally {
    cleanup()
  }
})

test('rsx_search delegates to the injected retrieval adapter without writing a campaign', async () => {
  const { service } = makeService()
  const calls = []
  const retrieval = async (args) => {
    calls.push(args)
    return {
      ok: true,
      query: args.query,
      provider: 'both',
      candidates: [{ title: 'A candidate', doi: '10.1234/abc' }],
      counts: { openalex: 1, crossref: 0 },
      warnings: [],
      elapsedMs: 3,
    }
  }
  const { map } = toolMap(service, retrieval)
  const result = await map.get('rsx_search').execute({ query: 'multi-agent research', limit: 2 })
  assert.equal(result.ok, true)
  assert.equal(result.candidates.length, 1)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].query, 'multi-agent research')
  assert.equal(service.state().campaigns.length, 0)
})

test('rsx_search maps a retrieval failure to a structured repair', async () => {
  const { service } = makeService()
  const retrieval = async () => {
    const error = new Error('OpenAlex timed out')
    error.code = 'retrieval_timeout'
    throw error
  }
  const { map } = toolMap(service, retrieval)
  const result = await map.get('rsx_search').execute({ query: 'slow' })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'retrieval_timeout')
  assert.match(result.repair, /do not invent candidates/u)
})

test('rsx_campaign exposes stewardship, migration, doctor and reindex', async () => {
  const { service } = makeService()
  const { map } = toolMap(service)
  const campaign = map.get('rsx_campaign')
  const created = await campaign.execute({
    action: 'create',
    question: '1.0 的治理字段能否通过工具写入并驱动闸门？',
    scope: '本地夹具。',
    success: '治理字段完整，schema 4 可显式迁移到 5，导出带清单。',
    tier: 'S',
  })
  const set = await campaign.execute({
    action: 'stewardship',
    campaign: created.campaign.id,
    license: 'MIT',
    dataAvailability: 'Synthetic fixture data is included in the bundle.',
    codeAvailability: 'Node 22 source in the repository.',
    competingInterests: 'None.',
    ethics: 'No human subjects.',
    contributors: [{ name: 'YG', roles: ['conceptualization'] }],
  })
  assert.equal(set.ok, true)
  assert.equal(set.completeness.ok, true)
  assert.equal(set.stewardship.license, 'MIT')

  const doctor = await campaign.execute({ action: 'doctor' })
  assert.equal(doctor.ok, true)
  assert.equal(doctor.doctor.schemaVersion, 5)
  assert.equal(doctor.doctor.counts.campaigns, 1)
  assert.equal(doctor.doctor.index.ok, true)

  const legacy = service.store.get(created.campaign.id)
  legacy.schema = 4
  legacy.stewardship = undefined
  service.store.save(legacy)
  const migrated = await campaign.execute({ action: 'migrate', campaign: created.campaign.id, stewardship: { license: 'MIT' } })
  assert.equal(migrated.ok, true)
  assert.equal(migrated.migrated, true)
  assert.equal(migrated.from, 4)
  assert.equal(migrated.to, 5)
  assert.match(migrated.backup.name, /^backup-.*\.zip$/u)

  const reindex = await campaign.execute({ action: 'reindex' })
  assert.equal(reindex.ok, true)
  assert.equal(reindex.reindex.indexed, 1)
  assert.equal(reindex.reindex.integrity.ok, true)
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


