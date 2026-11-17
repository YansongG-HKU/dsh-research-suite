import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  addSources,
  makeService,
  createCampaign,
  passScoping,
  passSurvey,
  passHypothesis,
  passDesign,
  passExecute,
  passAnalyze,
  passWrite,
} from '../helpers.mjs'
import { renderMatrixMarkdown } from '../../lib/matrix.js'
import { buildRoCrate } from '../../lib/provenance.js'
import { VERSION } from '../../lib/config.js'

function reachWrite(service) {
  const id = createCampaign(service)
  passScoping(service, id)
  passSurvey(service, id)
  passHypothesis(service, id)
  passDesign(service, id)
  const execution = passExecute(service, id)
  const analyzed = passAnalyze(service, id, execution.main.id)
  passWrite(service, id, analyzed.number.id)
  return id
}

test('audit records a fresh subject hash and the review gate consumes it', () => {
  const { service, cleanup } = makeService()
  try {
    const id = reachWrite(service)
    const first = service.audit(id).audit
    assert.equal(first.ok, true)
    assert.deepEqual(first.blocking, [])
    assert.equal(first.counts.blocking, 0)
    assert.ok(first.counts.major > 0, 'pre-release audits surface advisory majors')
    assert.match(first.subjectHash, /^[0-9a-f]{64}$/u)

    const review = service.gate(id, { action: 'check', stage: 'review' }).gate
    assert.equal(review.blocking.includes('automated_audit'), false)
    assert.equal(service.auditView(id).fresh, true)

    // Gate checks and review bookkeeping must not invalidate the subject.
    service.gate(id, { action: 'check', stage: 'review' })
    assert.equal(service.auditView(id).fresh, true)

    // The number allowlist changes what counts as an orphan number, so it is
    // part of the audit subject rather than release-time bookkeeping.
    service.update(id, { numbersAllowlist: '1,2,3,20,40,60,99' })
    assert.equal(service.auditView(id).fresh, false)
    service.audit(id)
    assert.equal(service.auditView(id).fresh, true)

    addSources(service, id, 1)
    assert.equal(service.auditView(id).fresh, false)
    const stale = service.gate(id, { action: 'check', stage: 'review' }).gate
    assert.equal(stale.blocking.includes('automated_audit'), true)

    const again = service.audit(id).audit
    assert.equal(again.ok, true)
    assert.equal(service.auditView(id).fresh, true)
  } finally {
    cleanup()
  }
})

test('audit blocks an unknown citation and a retracted source', () => {
  const { service, cleanup } = makeService()
  try {
    const id = reachWrite(service)
    const ok = service.audit(id, { record: false }).audit
    assert.equal(ok.ok, true)

    const state = service.store.get(id)
    state.manuscript.text += '\n补一句不存在的引用 [[src:S-9999]]。'
    service.store.save(state)

    const broken = service.audit(id, { record: false }).audit
    assert.equal(broken.ok, false)
    assert.ok(broken.blocking.includes('citation_unknown'))
    assert.ok(broken.findings.some((item) => item.code === 'citation_unknown' && item.ref === 'S-9999'))

    service.sourceAdd(id, { title: '撤稿研究', year: 2019, retracted: true, content: 'retracted body' })
    const retractedId = service.store.get(id).sources[service.store.get(id).sources.length - 1].id
    const state2 = service.store.get(id)
    state2.manuscript.text += `\n再引用一条撤稿来源 [[src:${retractedId}]]。`
    service.store.save(state2)
    const retracted = service.audit(id, { record: false }).audit
    assert.equal(retracted.ok, false)
    assert.ok(retracted.blocking.includes('retracted_source_cited'))
  } finally {
    cleanup()
  }
})

test('audit flags a quote that is not in the captured source text', () => {
  const { service, cleanup } = makeService()
  try {
    const id = reachWrite(service)
    const state = service.store.get(id)
    const evidence = state.evidence.find((item) => item.claim === 'C-0001')
    evidence.quote = 'this sentence does not occur in the captured source'
    service.store.save(state)

    const audit = service.audit(id, { record: false }).audit
    assert.equal(audit.ok, true, 'quote fidelity is a major, not a blocking finding')
    assert.ok(audit.findings.some((item) => item.code === 'quote_not_in_source' && item.ref === evidence.id))
    assert.ok(audit.findings.some((item) => item.code === 'quote_not_in_source' && item.severity === 'major'))

    // Artifact references are first-class evidence refs, not malformed strings.
    const artifactRef = state.artifacts[0].id
    const artifactEvidence = service.evidenceAdd(id, {
      claim: 'C-0001',
      relation: 'context',
      ref: artifactRef,
      locator: 'manuscript artifact',
    }).evidence
    const withArtifact = service.audit(id, { record: false }).audit
    assert.equal(
      withArtifact.findings.some((item) => item.code === 'evidence_ref_invalid' && item.ref === artifactEvidence.id),
      false,
    )

    // A source content hash and an evidence artifact ref must resolve in the
    // artifact ledger; a dangling pointer is blocking, not merely unverifiable.
    const broken = service.store.get(id)
    broken.sources[0].contentHash = `sha256:${'0'.repeat(64)}`
    broken.evidence.find((item) => item.id === artifactEvidence.id).ref = `sha256:${'a'.repeat(64)}`
    service.store.save(broken)
    const dangling = service.audit(id, { record: false }).audit
    assert.equal(dangling.ok, false)
    assert.ok(dangling.blocking.includes('source_content_missing'))
    assert.ok(dangling.blocking.includes('evidence_artifact_missing'))
  } finally {
    cleanup()
  }
})

test('artifacts deduplicate and figures carry figure + code + data provenance', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const first = service.artifactAdd(id, { content: 'x,y\n1,2\n', role: 'dataset', label: 'data.csv', description: 'raw data' })
    assert.equal(first.duplicate, false)
    assert.equal(first.counts.artifacts, 1)
    assert.match(first.artifact.id, /^sha256:[0-9a-f]{64}$/u)

    const duplicate = service.artifactAdd(id, { content: 'x,y\n1,2\n', role: 'dataset', label: 'data.csv copy' })
    assert.equal(duplicate.duplicate, true)
    assert.equal(duplicate.counts.artifacts, 1)
    assert.equal(duplicate.artifact.id, first.artifact.id)

    const code = service.artifactAdd(id, { content: 'print("rate")\n', role: 'code', label: 'plot.py' }).artifact
    const fig = service.artifactAdd(id, { content: 'PNGDATA', role: 'figure', label: 'fig1.png' }).artifact

    const attached = service.figureAttach(id, {
      artifact: fig.id,
      codeArtifact: code.id,
      dataArtifact: first.artifact.id,
      title: 'Rate curve',
      caption: 'Initial rate vs temperature',
      description: 'Line plot of initial rate against temperature.',
      env: 'node 22',
    })
    assert.equal(attached.provenanceOk, true)
    assert.equal(attached.complete, true)
    assert.equal(service.figureList(id).figures.length, 1)

    const fetched = service.artifactGet(id, { artifact: first.artifact.id })
    assert.equal(fetched.artifact.role, 'dataset')
    assert.match(fetched.preview, /^x,y/u)
    assert.equal(service.artifactList(id, { role: 'code' }).artifacts.length, 1)
  } finally {
    cleanup()
  }
})

test('export includes BibTeX, matrix, audit, provenance and RO-Crate', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    service.sourceAdd(id, {
      title: 'A captured paper',
      year: 2024,
      kind: 'paper',
      reliability: 'primary',
      content: 'We measured 42 samples at 40C. The initial rate doubled.',
      doi: '10.1000/abc',
    })
    service.extractionAdd(id, {
      source: 'S-0001',
      dimension: 'sample_size',
      value: 42,
      quote: '42 samples at 40C',
      locator: 'p.2',
      confidence: 0.9,
    })
    service.extractionAdd(id, { source: 'S-0001', dimension: 'note', value: '=SUM(A1:A2)' })
    service.artifactAdd(id, { content: 'dataset bytes', role: 'dataset', label: 'raw.csv' })
    const claim = service.claimAdd(id, { statement: '样本量为 42 且初速度上升。' }).claim
    service.evidenceAdd(id, { claim: claim.id, relation: 'supports', ref: 'S-0001', locator: 'p.2', quote: '42 samples at 40C' })
    service.claimStatus(id, { claim: claim.id, status: 'supported', reason: '摘录与正文一致' })
    service.audit(id)

    const matrix = service.matrix(id)
    assert.ok(matrix.matrix.dimensions.includes('sample_size'))
    assert.equal(matrix.matrix.coverage, 1)
    assert.match(matrix.csv, /source_id,title,year,kind,reliability,sample_size/u)
    assert.match(matrix.csv, /'=SUM\(A1:A2\)/u, 'CSV formula injection is neutralised')

    // Dimensions and titles are escaped independently of table cells, and a
    // matrix assembled by a caller without cells must not throw.
    const special = renderMatrixMarkdown({
      dimensions: ['rate|unit'],
      rows: [{ source: 'S-0001', title: 'a|b\nc', cells: {} }],
      covered: 0,
    })
    assert.match(special, /rate\\\|unit/u)
    assert.match(special, /a\\\|b c/u)
    assert.match(special, /\| — \|/u)

    const provenance = service.provenance(id)
    assert.equal(provenance.provenance.prefix.prov, 'http://www.w3.org/ns/prov#')
    assert.equal(provenance.provenance.entity['dsh:document']['dsh:format'], 'dsh-research-suite/prov-json/1')
    assert.ok(Object.keys(provenance.provenance.entity).some((key) => key.startsWith('dsh:artifact-')))
    assert.equal(provenance.provenance.entity['dsh:claim-C-0001']['dsh:status'], 'supported')
    assert.equal(provenance.provenance.entity['dsh:evidence-E-0001']['dsh:ref'], 'S-0001')
    assert.equal(provenance.provenance.entity['dsh:extraction-X-0001']['dsh:dimension'], 'sample_size')
    assert.equal(provenance.provenance.entity['dsh:extraction-X-0002']['dsh:value'], '=SUM(A1:A2)')
    assert.equal(provenance.provenance.agent['dsh:software']['prov:type'], 'prov:SoftwareAgent')
    assert.ok(Object.values(provenance.provenance.wasDerivedFrom).some((row) => row['prov:generatedEntity'] === 'dsh:evidence-E-0001'))
    assert.equal(provenance.roCrate['@context'], 'https://w3id.org/ro/crate/1.1/context')
    const graph = provenance.roCrate['@graph']
    assert.ok(graph.some((node) => node['@type'] === 'Dataset'))
    assert.ok(graph.some((node) => node['@type'] === 'Assertion' && node.identifier === claim.id))
    assert.ok(graph.some((node) => node['@type'] === 'CreativeWork' && node.citation && String(node.citation['@id']).startsWith('#source-')))
    assert.ok(graph.some((node) => node['@type'] === 'PropertyValue' && node.name === 'sample_size'))
    assert.ok(graph.some((node) => node['@type'] === 'PropertyValue' && node.value === '=SUM(A1:A2)'))
    const software = graph.find((node) => node['@id'] === 'dsh:software')
    assert.equal(software.version, VERSION)
    const root = graph.find((node) => node['@id'] === './')
    assert.ok(root.hasPart.some((item) => String(item['@id']).startsWith('artifacts/')))
    assert.ok(root.hasPart.some((item) => String(item['@id']).startsWith('#claim-')))
    assert.ok(root.hasPart.some((item) => String(item['@id']).startsWith('#evidence-')))
    assert.ok(root.hasPart.some((item) => String(item['@id']).startsWith('#extraction-')))
    assert.ok(graph.some((node) => node['@type'] === 'File' && /^[0-9a-f]{64}$/u.test(node.sha256)))

    // Direct builder call (no service version argument) must still use the
    // package version rather than a frozen literal.
    const direct = buildRoCrate(service.store.get(id))
    assert.equal(direct['@graph'].find((node) => node['@id'] === 'dsh:software').version, VERSION)

    const written = service.write(id, { action: 'export' })
    for (const key of ['bibtex', 'matrix', 'matrixCsv', 'audit', 'provenance', 'roCrate']) {
      assert.ok(written.paths[key], `missing export path: ${key}`)
      assert.ok(readFileSync(written.paths[key], 'utf8').length > 0, `empty export: ${key}`)
    }
    const crate = JSON.parse(readFileSync(written.paths.roCrate, 'utf8'))
    assert.equal(crate['@context'], 'https://w3id.org/ro/crate/1.1/context')
    const bib = readFileSync(written.paths.bibtex, 'utf8')
    assert.match(bib, /@(article|misc)\{/u)
  } finally {
    cleanup()
  }
})
