import assert from 'node:assert/strict'
import test from 'node:test'

import { PROV_FORMAT, PROV_PREFIX, buildProvenance, buildRoCrate } from '../../lib/provenance.js'

function hex(char) {
  return `sha256:${char.repeat(64)}`
}

function fixture() {
  const sourceArtifact = hex('a')
  const codeArtifact = hex('b')
  const dataArtifact = hex('c')
  const imageArtifact = hex('d')
  const manuscriptArtifact = hex('e')
  const now = '2026-11-18T00:00:00.000Z'
  return {
    id: 'rs-12345678',
    title: 'PROV fixture',
    question: 'Does the figure interpret the source?',
    scope: 'unit fixture',
    success: 'all relations resolve',
    tier: 'M',
    stage: 'write',
    createdAt: now,
    updatedAt: now,
    artifacts: [
      { id: sourceArtifact, bytes: 12, role: 'source', label: 'source.txt', mime: 'text/plain' },
      { id: codeArtifact, bytes: 20, role: 'code', label: 'plot.py' },
      { id: dataArtifact, bytes: 30, role: 'dataset', label: 'data.csv' },
      { id: imageArtifact, bytes: 40, role: 'figure', label: 'figure.png', mime: 'image/png' },
      { id: manuscriptArtifact, bytes: 50, role: 'manuscript', label: 'manuscript.md' },
    ],
    sources: [
      {
        id: 'S-0001',
        title: 'A captured paper',
        year: 2024,
        kind: 'paper',
        reliability: 'primary',
        doi: '10.1000/abc',
        url: 'https://example.org/paper',
        contentArtifact: sourceArtifact,
      },
    ],
    claims: [
      { id: 'C-0001', kind: 'hypothesis', statement: 'Rate rises.', status: 'supported', confidence: 0.8 },
    ],
    evidence: [
      { id: 'E-0001', claim: 'C-0001', relation: 'supports', ref: 'S-0001', locator: 'p.2', quote: '42 samples' },
      { id: 'E-0002', claim: 'C-0001', relation: 'supports', ref: 'run:R-0001', locator: 'metric' },
    ],
    extractions: [
      { id: 'X-0001', source: 'S-0001', dimension: 'sample_size', value: 42, quote: '42 samples', locator: 'p.2' },
    ],
    runs: [
      {
        id: 'R-0001',
        command: 'python plot.py --seed 7',
        status: 'success',
        seed: 7,
        exitCode: 0,
        metrics: { pearson_r: 0.42 },
        startedAt: now,
        finishedAt: now,
        stdoutArtifact: dataArtifact,
      },
    ],
    numbers: [
      {
        id: 'N-0001',
        name: 'Pearson r',
        value: 0.42,
        unit: 'r',
        uncertainty: '95% CI 0.2–0.6',
        trace: 'run:R-0001#pearson_r',
      },
    ],
    figures: [
      {
        id: 'F-0001',
        title: 'Rate figure',
        caption: 'Rate rises with temperature.',
        description: 'A plotted relationship from the source.',
        artifact: imageArtifact,
        codeArtifact,
        dataArtifact,
        env: 'node 24',
        run: 'R-0001',
        source: 'S-0001',
      },
    ],
    manuscript: {
      title: 'Manuscript',
      chars: 120,
      artifact: manuscriptArtifact,
      revision: 1,
      updatedAt: now,
      text: 'Body with [[src:S-0001]] and {{N-0001}}.',
    },
    declaration: { humanReviewer: 'YG' },
    audits: [
      {
        id: 'A-0001',
        ok: true,
        verdict: 'accept',
        subjectHash: 'f'.repeat(64),
        ts: now,
        counts: { blocking: 0 },
        signature: '1'.repeat(64),
        keyId: 'abcd1234',
        signatureVersion: 'hmac-sha256-v1',
      },
    ],
  }
}

function relationTargets(prov) {
  const ids = [
    ...Object.keys(prov.entity),
    ...Object.keys(prov.activity),
    ...Object.keys(prov.agent),
  ]
  const known = new Set(ids)
  const targets = []
  for (const group of ['wasGeneratedBy', 'used', 'wasDerivedFrom', 'wasAttributedTo', 'wasAssociatedWith']) {
    for (const row of Object.values(prov[group] || {})) {
      for (const key of ['prov:entity', 'prov:activity', 'prov:agent']) {
        if (row[key]) targets.push([group, key, row[key]])
      }
    }
  }
  return { known, targets }
}

test('provenance is W3C PROV-JSON with resolvable relations', () => {
  const prov = buildProvenance(fixture())
  assert.deepEqual(
    Object.keys(prov).sort(),
    ['activity', 'agent', 'entity', 'prefix', 'used', 'wasAssociatedWith', 'wasAttributedTo', 'wasDerivedFrom', 'wasGeneratedBy'].sort(),
  )
  assert.deepEqual(prov.prefix, PROV_PREFIX)
  assert.equal(prov.entity['dsh:document']['dsh:format'], PROV_FORMAT)
  assert.equal(prov.entity['dsh:campaign']['prov:type'], 'prov:Collection')
  assert.equal(prov.entity['dsh:source-S-0001']['dsh:contentPath'], `artifacts/${'a'.repeat(64)}`)
  assert.equal(prov.entity['dsh:extraction-X-0001']['dsh:value'], 42)
  assert.equal(prov.entity['dsh:number-N-0001']['prov:value'], 0.42)
  assert.equal(prov.entity['dsh:figure-F-0001']['dsh:source'], 'S-0001')
  assert.equal(prov.activity['dsh:run-R-0001']['prov:type'], 'prov:Activity')
  assert.equal(prov.activity['dsh:run-R-0001']['dsh:seed'], 7)
  assert.equal(prov.activity['dsh:audit-A-0001']['dsh:verdict'], 'accept')
  assert.equal(prov.agent['dsh:software']['prov:type'], 'prov:SoftwareAgent')
  assert.equal(prov.agent['dsh:person-YG']['prov:type'], 'prov:Person')
  assert.ok(Object.values(prov.wasGeneratedBy).some((row) => row['prov:entity'] === 'dsh:number-N-0001'))
  assert.ok(Object.values(prov.wasGeneratedBy).some((row) => row['prov:entity'] === 'dsh:figure-F-0001'))
  assert.ok(Object.values(prov.wasDerivedFrom).some((row) => row['prov:generatedEntity'] === 'dsh:figure-F-0001'))
  assert.ok(Object.values(prov.wasDerivedFrom).some((row) => row['prov:generatedEntity'] === 'dsh:evidence-E-0002') === false)
  assert.ok(Object.values(prov.wasGeneratedBy).some((row) => row['prov:entity'] === 'dsh:evidence-E-0002'))
  const { known, targets } = relationTargets(prov)
  assert.ok(targets.length > 0)
  for (const [group, key, target] of targets) {
    assert.ok(known.has(target), `${group}.${key} has a dangling target: ${target}`)
  }
  assert.doesNotThrow(() => JSON.stringify(prov))
})

test('RO-Crate gives a figure an independent edge to its source', () => {
  const crate = buildRoCrate(fixture())
  const graph = crate['@graph']
  const source = graph.find((node) => node['@id'] === '#source-S-0001')
  const figure = graph.find((node) => node['@id'] === '#figure-F-0001')
  assert.ok(source)
  assert.ok(figure)
  assert.equal(figure.about['@id'], '#source-S-0001')
  assert.ok(figure.isBasedOn.some((edge) => edge['@id'] === `artifacts/${'b'.repeat(64)}`))
  assert.ok(figure.isBasedOn.some((edge) => edge['@id'] === `artifacts/${'c'.repeat(64)}`))
  const root = graph.find((node) => node['@id'] === './')
  assert.ok(root.hasPart.some((edge) => edge['@id'] === '#figure-F-0001'))
  assert.ok(root.hasPart.some((edge) => edge['@id'] === '#number-N-0001'))
  assert.ok(root.hasPart.some((edge) => edge['@id'] === '#manuscript'))
})
