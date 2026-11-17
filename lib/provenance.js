/**
 * Portable provenance.
 *
 * Two views over the same ledger:
 *  - `provenance.json`: a compact, PROV-inspired activity graph for scripts.
 *  - `ro-crate-metadata.json`: RO-Crate 1.1 JSON-LD for FAIR exchange.
 *
 * Nothing here reads the event log; the materialised state plus `verify()` is
 * enough, which keeps exports deterministic and cheap.
 */
import { VERSION } from './config.js'
import { utcnow } from './util.js'

function arr(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []
}

function hexOf(value) {
  return String(value || '').replace(/^sha256:/u, '')
}

function artifactPath(id) {
  const hex = hexOf(id)
  return /^[0-9a-f]{64}$/u.test(hex) ? `artifacts/${hex}` : `artifacts/${hex || 'unknown'}`
}

export function buildProvenance(state, options = {}) {
  const integrity = options.integrity || null
  const generatedAt = options.generatedAt || utcnow()
  const artifacts = arr(state.artifacts).map((item) => ({
    id: item.id,
    path: artifactPath(item.id),
    bytes: item.bytes,
    role: item.role,
    label: item.label || '',
    description: item.description || '',
    mime: item.mime || '',
  }))
  return {
    format: 'dsh-research-suite/provenance/1',
    generatedAt,
    campaign: {
      id: state.id,
      title: state.title,
      question: state.question,
      scope: state.scope,
      success: state.success,
      tier: state.tier,
      stage: state.stage,
      templateId: state.templateId || null,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
    },
    integrity: integrity
      ? {
          chainOk: integrity.chainOk === true,
          events: integrity.events,
          artifacts: integrity.artifacts,
          brokenSeq: integrity.brokenSeq,
          artifactProblems: integrity.artifactProblems || [],
        }
      : null,
    agents: [
      { id: 'software:dsh-research-suite', type: 'SoftwareApplication', name: 'dsh-research-suite' },
      ...(state.declaration && state.declaration.humanReviewer
        ? [{ id: `person:${state.declaration.humanReviewer}`, type: 'Person', name: state.declaration.humanReviewer }]
        : []),
    ],
    artifacts,
    sources: arr(state.sources).map((source) => ({
      id: source.id,
      title: source.title,
      year: source.year,
      kind: source.kind,
      reliability: source.reliability,
      url: source.url || '',
      doi: source.doi || '',
      authors: source.authors || '',
      journal: source.journal || '',
      contentArtifact: source.contentArtifact || source.contentHash || null,
      contentPath: source.contentArtifact || source.contentHash ? artifactPath(source.contentArtifact || source.contentHash) : null,
      retracted: source.retracted === true,
    })),
    extraction: arr(state.extractions).map((row) => ({
      id: row.id,
      source: row.source,
      dimension: row.dimension,
      value: row.value,
      quote: row.quote || '',
      locator: row.locator || '',
    })),
    claims: arr(state.claims).map((claim) => ({
      id: claim.id,
      kind: claim.kind,
      statement: claim.statement,
      status: claim.status,
      confidence: claim.confidence,
    })),
    evidence: arr(state.evidence).map((row) => ({
      id: row.id,
      claim: row.claim,
      relation: row.relation,
      ref: row.ref,
      locator: row.locator || '',
      quote: row.quote || '',
    })),
    activities: arr(state.runs).map((run) => ({
      id: run.id,
      type: 'CreateAction',
      command: run.command,
      status: run.status,
      seed: run.seed,
      exitCode: run.exitCode,
      control: run.control || null,
      metrics: run.metrics || {},
      startedAt: run.startedAt || null,
      finishedAt: run.finishedAt || null,
      stdoutArtifact: run.stdoutArtifact || null,
      stdoutPath: run.stdoutArtifact ? artifactPath(run.stdoutArtifact) : null,
    })),
    numbers: arr(state.numbers).map((number) => ({
      id: number.id,
      name: number.name,
      value: number.value,
      unit: number.unit || '',
      uncertainty: number.uncertainty || '',
      trace: number.trace,
      wasGeneratedBy: String(number.trace || '').startsWith('run:') ? String(number.trace).slice(4).split('#')[0] : null,
    })),
    figures: arr(state.figures).map((figure) => ({
      id: figure.id,
      title: figure.title,
      caption: figure.caption || '',
      description: figure.description || '',
      artifact: figure.artifact,
      codeArtifact: figure.codeArtifact,
      dataArtifact: figure.dataArtifact,
      envArtifact: figure.envArtifact || null,
      env: figure.env || '',
      run: figure.run || null,
      createdBy: figure.createdBy || null,
      artifactPath: artifactPath(figure.artifact),
      codePath: figure.codeArtifact ? artifactPath(figure.codeArtifact) : null,
      dataPath: figure.dataArtifact ? artifactPath(figure.dataArtifact) : null,
    })),
    manuscript: state.manuscript
      ? {
          title: state.manuscript.title || '',
          chars: state.manuscript.chars || 0,
          artifact: state.manuscript.artifact || null,
          path: state.manuscript.artifact ? artifactPath(state.manuscript.artifact) : null,
          revision: state.manuscript.revision || 0,
          updatedAt: state.manuscript.updatedAt,
        }
      : null,
    declaration: state.declaration || null,
    audit: (() => {
      const audits = arr(state.audits)
      const latest = audits[audits.length - 1]
      return latest
        ? { id: latest.id, ok: latest.ok, verdict: latest.verdict, subjectHash: latest.subjectHash, ts: latest.ts, counts: latest.counts || {} }
        : null
    })(),
  }
}

export function buildRoCrate(state, options = {}) {
  const prov = buildProvenance(state, options)
  const graph = []
  const rootId = './'
  graph.push({
    '@id': rootId,
    '@type': 'Dataset',
    name: state.title || state.id,
    description: state.question || '',
    datePublished: state.createdAt || prov.generatedAt,
    conformsTo: { '@id': 'https://w3id.org/ro/crate/1.1' },
    author: { '@id': 'software:dsh-research-suite' },
    hasPart: [
      { '@id': '#campaign' },
      ...prov.artifacts.map((item) => ({ '@id': item.path })),
      ...prov.claims.map((item) => ({ '@id': `#claim-${item.id}` })),
      ...prov.evidence.map((item) => ({ '@id': `#evidence-${item.id}` })),
      ...prov.extraction.map((item) => ({ '@id': `#extraction-${item.id}` })),
      ...(prov.manuscript && prov.manuscript.path ? [{ '@id': prov.manuscript.path }] : []),
    ],
  })
  graph.push({
    '@id': 'software:dsh-research-suite',
    '@type': 'SoftwareApplication',
    name: 'dsh-research-suite',
    applicationCategory: 'ResearchApplication',
    version: options.version || VERSION,
  })
  if (state.declaration && state.declaration.humanReviewer) {
    graph.push({
      '@id': `person:${state.declaration.humanReviewer}`,
      '@type': 'Person',
      name: state.declaration.humanReviewer,
    })
  }
  graph.push({
    '@id': '#campaign',
    '@type': ['Dataset', 'ResearchProject'],
    name: state.title || state.id,
    description: state.question || '',
    identifier: state.id,
    dateCreated: state.createdAt,
    dateModified: state.updatedAt,
    measurementTechnique: state.prereg && state.prereg.analysisPlan ? state.prereg.analysisPlan : '',
  })
  for (const artifact of prov.artifacts) {
    graph.push({
      '@id': artifact.path,
      '@type': 'File',
      name: artifact.label || artifact.id,
      description: artifact.description || '',
      contentSize: String(artifact.bytes ?? ''),
      sha256: hexOf(artifact.id),
      encodingFormat: artifact.mime || 'application/octet-stream',
      about: { '@id': '#campaign' },
    })
  }
  for (const source of prov.sources) {
    graph.push({
      '@id': `#source-${source.id}`,
      '@type': source.kind === 'paper' ? 'ScholarlyArticle' : 'CreativeWork',
      name: source.title,
      identifier: source.doi || source.url || source.id,
      url: source.url || undefined,
      datePublished: source.year ? String(source.year) : undefined,
      author: source.authors || undefined,
      isPartOf: source.journal || undefined,
    })
  }
  for (const claim of prov.claims) {
    graph.push({
      '@id': `#claim-${claim.id}`,
      '@type': 'Assertion',
      name: claim.statement,
      text: claim.statement,
      identifier: claim.id,
      creativeWorkStatus: claim.status,
      about: { '@id': '#campaign' },
    })
  }
  for (const row of prov.evidence) {
    const ref = String(row.ref || '')
    const target = ref.startsWith('S-') || ref.startsWith('source:')
      ? `#source-${ref.replace(/^source:/u, '')}`
      : ref.startsWith('sha256:')
        ? artifactPath(ref)
        : `#run-${ref.replace(/^run:/u, '')}`
    graph.push({
      '@id': `#evidence-${row.id}`,
      '@type': 'CreativeWork',
      name: `${row.relation || 'supports'} ${row.claim}`,
      description: row.locator || '',
      text: row.quote || '',
      about: { '@id': `#claim-${row.claim}` },
      citation: { '@id': target },
    })
  }
  for (const row of prov.extraction) {
    graph.push({
      '@id': `#extraction-${row.id}`,
      '@type': 'PropertyValue',
      name: row.dimension,
      value: row.value,
      description: row.quote || '',
      identifier: row.id,
      about: { '@id': `#source-${row.source}` },
    })
  }
  for (const run of prov.activities) {
    graph.push({
      '@id': `#run-${run.id}`,
      '@type': 'CreateAction',
      name: run.command || run.id,
      startTime: run.startedAt,
      endTime: run.finishedAt,
      actionStatus: run.status === 'success' ? 'CompletedActionStatus' : 'FailedActionStatus',
      instrument: { '@id': 'software:dsh-research-suite' },
      object: run.control ? { '@id': '#campaign' } : { '@id': '#campaign' },
      result: arr(state.numbers)
        .filter((number) => String(number.trace || '').startsWith(`run:${run.id}`))
        .map((number) => ({ '@id': `#number-${number.id}` })),
      seed: run.seed,
      metrics: run.metrics,
    })
  }
  for (const number of prov.numbers) {
    graph.push({
      '@id': `#number-${number.id}`,
      '@type': 'PropertyValue',
      name: number.name,
      value: number.value,
      unitText: number.unit,
      description: number.uncertainty,
      wasGeneratedBy: number.wasGeneratedBy ? { '@id': `#run-${number.wasGeneratedBy}` } : undefined,
    })
  }
  for (const figure of prov.figures) {
    graph.push({
      '@id': `#figure-${figure.id}`,
      '@type': 'ImageObject',
      name: figure.title,
      caption: figure.caption,
      description: figure.description,
      contentUrl: { '@id': figure.artifactPath },
      isBasedOn: [figure.codePath, figure.dataPath].filter(Boolean).map((id) => ({ '@id': id })),
      wasGeneratedBy: figure.run ? { '@id': `#run-${figure.run}` } : undefined,
    })
  }
  if (prov.manuscript) {
    graph.push({
      '@id': '#manuscript',
      '@type': 'ScholarlyArticle',
      name: prov.manuscript.title || 'Manuscript',
      encoding: prov.manuscript.path ? { '@id': prov.manuscript.path } : undefined,
      about: { '@id': '#campaign' },
    })
  }
  graph.push({
    '@id': '#audit',
    '@type': 'Review',
    name: 'Automated review',
    reviewBody: prov.audit && prov.audit.verdict ? prov.audit.verdict : 'not-run',
    datePublished: prov.audit && prov.audit.ts ? prov.audit.ts : undefined,
  })
  return {
    '@context': 'https://w3id.org/ro/crate/1.1/context',
    '@graph': graph,
  }
}
