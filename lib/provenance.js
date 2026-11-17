/**
 * Portable provenance.
 *
 * Two views over the same ledger:
 *  - `provenance.json`: W3C PROV-JSON (entity / activity / agent plus the
 *    PROV relations). The compact view is kept internal; the serialised file
 *    only uses PROV-JSON top-level keys, so a PROV-JSON parser can read it.
 *  - `ro-crate-metadata.json`: RO-Crate 1.1 JSON-LD for FAIR exchange.
 *
 * Nothing here reads the event log; the materialised state plus `verify()` is
 * enough, which keeps exports deterministic and cheap.
 */
import { VERSION } from './config.js'
import { utcnow } from './util.js'

export const PROV_PREFIX = Object.freeze({
  prov: 'http://www.w3.org/ns/prov#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  dsh: 'https://github.com/YansongG-HKU/dsh-research-suite/ns#',
})

export const PROV_FORMAT = 'dsh-research-suite/prov-json/1'

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

function artifactId(id) {
  return `dsh:artifact-${hexOf(id)}`
}

function entityId(kind, id) {
  return `dsh:${kind}-${id}`
}

function compact(value) {
  const out = {}
  for (const [key, item] of Object.entries(value || {})) {
    if (item === undefined || item === null || item === '') continue
    out[key] = item
  }
  return out
}

/**
 * The compact model shared by both exports. It is intentionally not part of
 * the public file format: `buildProvenance()` serialises it to PROV-JSON and
 * `buildRoCrate()` maps it to schema.org / RO-Crate.
 */
function buildModel(state, options = {}) {
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
  const sources = arr(state.sources).map((source) => ({
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
    contentPath:
      source.contentArtifact || source.contentHash
        ? artifactPath(source.contentArtifact || source.contentHash)
        : null,
    retracted: source.retracted === true,
  }))
  return {
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
          stateOk: integrity.stateOk ?? null,
          stateHash: integrity.stateHash || null,
          stateProblems: integrity.stateProblems || [],
        }
      : null,
    agents: [
      { id: 'dsh:software', type: 'prov:SoftwareAgent', name: 'dsh-research-suite', version: options.version || VERSION },
      ...(state.declaration && state.declaration.humanReviewer
        ? [
            {
              id: `dsh:person-${encodeURIComponent(state.declaration.humanReviewer)}`,
              type: 'prov:Person',
              name: state.declaration.humanReviewer,
            },
          ]
        : []),
    ],
    artifacts,
    sources,
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
      wasGeneratedBy: String(number.trace || '').startsWith('run:')
        ? String(number.trace).slice(4).split('#')[0]
        : null,
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
      source: figure.source || null,
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
        ? {
            id: latest.id,
            ok: latest.ok,
            verdict: latest.verdict,
            subjectHash: latest.subjectHash,
            ts: latest.ts,
            counts: latest.counts || {},
            signature: latest.signature || null,
            signatureKeyId: latest.keyId || null,
          }
        : null
    })(),
  }
}

function add(map, key, record) {
  map[key] = compact(record)
}

function addRelation(map, prefix, record) {
  const key = `_${prefix}-${Object.keys(map).length + 1}`
  map[key] = compact(record)
}

export function buildProvenance(state, options = {}) {
  const model = buildModel(state, options)
  const entities = {}
  const activities = {}
  const agents = {}
  const generated = {}
  const used = {}
  const derived = {}
  const attributed = {}
  const associated = {}

  add(entities, 'dsh:document', {
    'prov:type': 'dsh:ProvenanceDocument',
    'dsh:format': PROV_FORMAT,
    'dsh:generatedAt': model.generatedAt,
    'dsh:campaign': model.campaign.id,
    'dsh:version': options.version || VERSION,
  })
  add(entities, 'dsh:campaign', {
    'prov:type': 'prov:Collection',
    'dsh:title': model.campaign.title,
    'dsh:question': model.campaign.question,
    'dsh:scope': model.campaign.scope,
    'dsh:success': model.campaign.success,
    'dsh:tier': model.campaign.tier,
    'dsh:stage': model.campaign.stage,
    'dsh:templateId': model.campaign.templateId,
    'dsh:createdAt': model.campaign.createdAt,
    'dsh:updatedAt': model.campaign.updatedAt,
  })

  for (const agent of model.agents) {
    add(agents, agent.id, {
      'prov:type': agent.type,
      'dsh:name': agent.name,
      'dsh:version': agent.version,
    })
  }

  for (const artifact of model.artifacts) {
    add(entities, artifactId(artifact.id), {
      'prov:type': 'dsh:Artifact',
      'prov:label': artifact.label || artifact.id,
      'dsh:sha256': hexOf(artifact.id),
      'dsh:path': artifact.path,
      'dsh:bytes': artifact.bytes,
      'dsh:role': artifact.role,
      'dsh:description': artifact.description,
      'dsh:mime': artifact.mime,
    })
  }

  for (const source of model.sources) {
    add(entities, entityId('source', source.id), {
      'prov:type': 'dsh:Source',
      'prov:label': source.title,
      'dsh:kind': source.kind,
      'dsh:reliability': source.reliability,
      'dsh:year': source.year,
      'dsh:doi': source.doi,
      'dsh:url': source.url,
      'dsh:authors': source.authors,
      'dsh:journal': source.journal,
      'dsh:contentArtifact': source.contentArtifact,
      'dsh:contentPath': source.contentPath,
      'dsh:retracted': source.retracted === true ? true : undefined,
    })
  }

  for (const claim of model.claims) {
    add(entities, entityId('claim', claim.id), {
      'prov:type': 'dsh:Claim',
      'prov:label': claim.statement,
      'dsh:kind': claim.kind,
      'dsh:statement': claim.statement,
      'dsh:status': claim.status,
      'dsh:confidence': claim.confidence,
    })
  }

  for (const row of model.evidence) {
    add(entities, entityId('evidence', row.id), {
      'prov:type': 'dsh:Evidence',
      'dsh:claim': row.claim,
      'dsh:relation': row.relation,
      'dsh:ref': row.ref,
      'dsh:locator': row.locator,
      'dsh:quote': row.quote,
    })
  }

  for (const row of model.extraction) {
    add(entities, entityId('extraction', row.id), {
      'prov:type': 'dsh:Extraction',
      'dsh:source': row.source,
      'dsh:dimension': row.dimension,
      'dsh:value': row.value,
      'dsh:quote': row.quote,
      'dsh:locator': row.locator,
    })
  }

  for (const run of model.activities) {
    add(activities, entityId('run', run.id), {
      'prov:type': 'prov:Activity',
      'prov:label': run.command || run.id,
      'prov:startTime': run.startedAt || undefined,
      'prov:endTime': run.finishedAt || undefined,
      'dsh:command': run.command,
      'dsh:status': run.status,
      'dsh:seed': run.seed,
      'dsh:exitCode': run.exitCode,
      'dsh:control': run.control || undefined,
      'dsh:metrics': run.metrics,
      'dsh:stdoutArtifact': run.stdoutArtifact,
    })
    addRelation(used, 'used', { 'prov:activity': entityId('run', run.id), 'prov:entity': 'dsh:campaign' })
    addRelation(associated, 'assoc', {
      'prov:activity': entityId('run', run.id),
      'prov:agent': 'dsh:software',
    })
    if (run.stdoutArtifact) {
      addRelation(generated, 'wgb', {
        'prov:entity': artifactId(run.stdoutArtifact),
        'prov:activity': entityId('run', run.id),
      })
    }
  }

  for (const number of model.numbers) {
    add(entities, entityId('number', number.id), {
      'prov:type': 'dsh:Number',
      'prov:label': number.name,
      'prov:value': number.value,
      'dsh:unit': number.unit,
      'dsh:uncertainty': number.uncertainty,
      'dsh:trace': number.trace,
    })
    if (number.wasGeneratedBy) {
      addRelation(generated, 'wgb', {
        'prov:entity': entityId('number', number.id),
        'prov:activity': entityId('run', number.wasGeneratedBy),
      })
    }
  }

  for (const figure of model.figures) {
    add(entities, entityId('figure', figure.id), {
      'prov:type': 'dsh:Figure',
      'prov:label': figure.title,
      'dsh:caption': figure.caption,
      'dsh:description': figure.description,
      'dsh:artifact': figure.artifact,
      'dsh:codeArtifact': figure.codeArtifact,
      'dsh:dataArtifact': figure.dataArtifact,
      'dsh:envArtifact': figure.envArtifact,
      'dsh:env': figure.env,
      'dsh:run': figure.run,
      'dsh:source': figure.source,
    })
    for (const artifact of [figure.artifact, figure.codeArtifact, figure.dataArtifact, figure.envArtifact]) {
      if (!artifact) continue
      addRelation(derived, 'wd', {
        'prov:generatedEntity': entityId('figure', figure.id),
        'prov:usedEntity': artifactId(artifact),
      })
    }
    if (figure.source) {
      addRelation(derived, 'wd', {
        'prov:generatedEntity': entityId('figure', figure.id),
        'prov:usedEntity': entityId('source', figure.source),
      })
    }
    if (figure.run) {
      addRelation(generated, 'wgb', {
        'prov:entity': entityId('figure', figure.id),
        'prov:activity': entityId('run', figure.run),
      })
    }
  }

  if (model.manuscript) {
    add(entities, 'dsh:manuscript', {
      'prov:type': 'dsh:Manuscript',
      'prov:label': model.manuscript.title || 'Manuscript',
      'dsh:title': model.manuscript.title,
      'dsh:chars': model.manuscript.chars,
      'dsh:artifact': model.manuscript.artifact,
      'dsh:path': model.manuscript.path,
      'dsh:revision': model.manuscript.revision,
      'dsh:updatedAt': model.manuscript.updatedAt,
    })
    if (model.manuscript.artifact) {
      addRelation(derived, 'wd', {
        'prov:generatedEntity': 'dsh:manuscript',
        'prov:usedEntity': artifactId(model.manuscript.artifact),
      })
    }
  }

  if (model.audit) {
    add(activities, entityId('audit', model.audit.id), {
      'prov:type': 'prov:Activity',
      'prov:label': `automated review ${model.audit.id}`,
      'prov:startTime': model.audit.ts,
      'prov:endTime': model.audit.ts,
      'dsh:ok': model.audit.ok,
      'dsh:verdict': model.audit.verdict,
      'dsh:subjectHash': model.audit.subjectHash,
      'dsh:counts': model.audit.counts,
      'dsh:signatureKeyId': model.audit.signatureKeyId,
    })
    addRelation(used, 'used', {
      'prov:activity': entityId('audit', model.audit.id),
      'prov:entity': 'dsh:campaign',
    })
    addRelation(associated, 'assoc', {
      'prov:activity': entityId('audit', model.audit.id),
      'prov:agent': 'dsh:software',
    })
  }

  for (const source of model.sources) {
    if (!source.contentArtifact) continue
    addRelation(derived, 'wd', {
      'prov:generatedEntity': entityId('source', source.id),
      'prov:usedEntity': artifactId(source.contentArtifact),
    })
  }

  for (const row of model.evidence) {
    const ref = String(row.ref || '')
    if (ref.startsWith('S-') || ref.startsWith('source:')) {
      addRelation(derived, 'wd', {
        'prov:generatedEntity': entityId('evidence', row.id),
        'prov:usedEntity': entityId('source', ref.replace(/^source:/u, '')),
      })
    } else if (ref.startsWith('sha256:')) {
      addRelation(derived, 'wd', {
        'prov:generatedEntity': entityId('evidence', row.id),
        'prov:usedEntity': artifactId(ref),
      })
    } else if (ref.startsWith('R-') || ref.startsWith('run:')) {
      addRelation(generated, 'wgb', {
        'prov:entity': entityId('evidence', row.id),
        'prov:activity': entityId('run', ref.replace(/^run:/u, '')),
      })
    }
  }

  for (const row of model.extraction) {
    addRelation(derived, 'wd', {
      'prov:generatedEntity': entityId('extraction', row.id),
      'prov:usedEntity': entityId('source', row.source),
    })
  }

  // Attribute the research content to the software that recorded it. A named
  // human reviewer takes attribution for the manuscript when a declaration
  // exists, because the declaration is the human sign-off on that artifact.
  const reviewer = model.agents.find((agent) => agent.type === 'prov:Person')
  for (const id of Object.keys(entities)) {
    if (id === 'dsh:document') continue
    const owner = id === 'dsh:manuscript' && reviewer ? reviewer.id : 'dsh:software'
    addRelation(attributed, 'attr', { 'prov:entity': id, 'prov:agent': owner })
  }

  return {
    prefix: { ...PROV_PREFIX },
    entity: entities,
    activity: activities,
    agent: agents,
    wasGeneratedBy: generated,
    used,
    wasDerivedFrom: derived,
    wasAttributedTo: attributed,
    wasAssociatedWith: associated,
  }
}

export function buildRoCrate(state, options = {}) {
  const model = buildModel(state, options)
  const graph = []
  const rootId = './'
  graph.push({
    '@id': rootId,
    '@type': 'Dataset',
    name: state.title || state.id,
    description: state.question || '',
    datePublished: state.createdAt || model.generatedAt,
    conformsTo: { '@id': 'https://w3id.org/ro/crate/1.1' },
    author: { '@id': 'dsh:software' },
    hasPart: [
      { '@id': '#campaign' },
      ...model.artifacts.map((item) => ({ '@id': item.path })),
      ...model.claims.map((item) => ({ '@id': `#claim-${item.id}` })),
      ...model.evidence.map((item) => ({ '@id': `#evidence-${item.id}` })),
      ...model.extraction.map((item) => ({ '@id': `#extraction-${item.id}` })),
      ...model.figures.map((item) => ({ '@id': `#figure-${item.id}` })),
      ...model.numbers.map((item) => ({ '@id': `#number-${item.id}` })),
      ...(model.manuscript && model.manuscript.path ? [{ '@id': model.manuscript.path }] : []),
      ...(model.manuscript ? [{ '@id': '#manuscript' }] : []),
    ],
  })
  graph.push({
    '@id': 'dsh:software',
    '@type': 'SoftwareApplication',
    name: 'dsh-research-suite',
    applicationCategory: 'ResearchApplication',
    version: options.version || VERSION,
  })
  if (state.declaration && state.declaration.humanReviewer) {
    graph.push({
      '@id': `dsh:person-${encodeURIComponent(state.declaration.humanReviewer)}`,
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
  for (const artifact of model.artifacts) {
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
  for (const source of model.sources) {
    graph.push({
      '@id': `#source-${source.id}`,
      '@type': source.kind === 'paper' ? 'ScholarlyArticle' : 'CreativeWork',
      name: source.title,
      identifier: source.doi || source.url || source.id,
      url: source.url || undefined,
      datePublished: source.year ? String(source.year) : undefined,
      author: source.authors || undefined,
      isPartOf: source.journal || undefined,
      contentUrl: source.contentPath ? { '@id': source.contentPath } : undefined,
    })
  }
  for (const claim of model.claims) {
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
  for (const row of model.evidence) {
    const ref = String(row.ref || '')
    const target =
      ref.startsWith('S-') || ref.startsWith('source:')
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
  for (const row of model.extraction) {
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
  for (const run of model.activities) {
    graph.push({
      '@id': `#run-${run.id}`,
      '@type': 'CreateAction',
      name: run.command || run.id,
      startTime: run.startedAt,
      endTime: run.finishedAt,
      actionStatus: run.status === 'success' ? 'CompletedActionStatus' : 'FailedActionStatus',
      instrument: { '@id': 'dsh:software' },
      object: { '@id': '#campaign' },
      result: arr(state.numbers)
        .filter((number) => String(number.trace || '').startsWith(`run:${run.id}`))
        .map((number) => ({ '@id': `#number-${number.id}` })),
      seed: run.seed,
      metrics: run.metrics,
    })
  }
  for (const number of model.numbers) {
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
  for (const figure of model.figures) {
    graph.push({
      '@id': `#figure-${figure.id}`,
      '@type': 'ImageObject',
      name: figure.title,
      caption: figure.caption,
      description: figure.description,
      contentUrl: { '@id': figure.artifactPath },
      isBasedOn: [figure.codePath, figure.dataPath].filter(Boolean).map((id) => ({ '@id': id })),
      // Independent figure → source edge: the figure interprets this source,
      // not merely the code/data artifacts it was drawn from.
      about: figure.source ? { '@id': `#source-${figure.source}` } : undefined,
      wasGeneratedBy: figure.run ? { '@id': `#run-${figure.run}` } : undefined,
    })
  }
  if (model.manuscript) {
    graph.push({
      '@id': '#manuscript',
      '@type': 'ScholarlyArticle',
      name: model.manuscript.title || 'Manuscript',
      encoding: model.manuscript.path ? { '@id': model.manuscript.path } : undefined,
      about: { '@id': '#campaign' },
    })
  }
  graph.push({
    '@id': '#audit',
    '@type': 'Review',
    name: 'Automated review',
    identifier: model.audit ? model.audit.id : undefined,
    reviewBody: model.audit && model.audit.verdict ? model.audit.verdict : 'not-run',
    datePublished: model.audit && model.audit.ts ? model.audit.ts : undefined,
    about: { '@id': '#campaign' },
  })
  return {
    '@context': 'https://w3id.org/ro/crate/1.1/context',
    '@graph': graph,
  }
}
