import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  citationCoverage,
  detectReferenceFormat,
  parseCslJson,
  parseReferences,
  parseRis,
  renderCslJson,
  renderReferencesMarkdown,
  renderRis,
} from '../../lib/references.js'
import { lookupDoi } from '../../lib/retrieval.js'
import { createCampaign, makeService } from '../helpers.mjs'

const CSL = [
  {
    id: 'zotero-1',
    type: 'article-journal',
    title: 'A <b>bounded</b> reference',
    author: [
      { family: 'Smith', given: 'Jane' },
      { literal: 'World Health Organization' },
    ],
    issued: { 'date-parts': [[2024, 3, 1]] },
    'container-title': 'Journal of Tests',
    DOI: 'https://doi.org/10.1000/ABC',
    URL: 'https://example.org/a',
    abstract: '<p>An abstract with markup.</p>',
    note: 'keep me',
  },
  {
    id: 'zotero-2',
    type: 'book',
    title: 'A book',
    author: [{ family: 'Doe', given: 'John' }],
    issued: { 'date-parts': [[2020]] },
    publisher: 'Test Press',
  },
]

const RIS = [
  'TY  - JOUR',
  'TI  - First RIS paper',
  'AU  - Smith, Jane',
  'AU  - Lee, Kai',
  'PY  - 2024',
  'JO  - Journal of Tests',
  'DO  - 10.1000/ris',
  'UR  - https://example.org/ris',
  'AB  - First line of the abstract.',
  '  Continued line.',
  'ER  - ',
  '',
  'TY  - BOOK',
  'TI  - Second RIS book',
  'ER  - ',
].join('\n')

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload
    },
  }
}

test('CSL-JSON parses Zotero arrays and {items} wrappers with bounded fields', () => {
  const rows = parseCslJson(JSON.stringify(CSL))
  assert.equal(rows.length, 2)
  assert.equal(rows[0].title, 'A bounded reference')
  assert.equal(rows[0].authors, 'Smith, Jane and World Health Organization')
  assert.equal(rows[0].year, 2024)
  assert.equal(rows[0].journal, 'Journal of Tests')
  assert.equal(rows[0].doi, '10.1000/abc')
  assert.equal(rows[0].kind, 'paper')
  assert.equal(rows[0].reliability, 'primary')
  assert.match(rows[0].notes, /An abstract with markup/u)
  assert.match(rows[0].notes, /keep me/u)
  assert.equal(rows[1].kind, 'book')
  assert.equal(rows[1].journal, 'Test Press')

  const wrapped = parseCslJson(JSON.stringify({ items: [CSL[1]] }))
  assert.equal(wrapped.length, 1)
  assert.equal(wrapped[0].title, 'A book')
})

test('CSL-JSON rejects malformed and empty payloads without inventing records', () => {
  assert.throws(() => parseCslJson('{not json'), (error) => error.code === 'invalid_input')
  assert.throws(() => parseCslJson('{"foo":[]}'), /array or an object with an items array/u)
  assert.deepEqual(parseCslJson('[]'), [])
})

test('RIS handles multiple records, continuation lines and common tags', () => {
  const rows = parseRis(RIS)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].title, 'First RIS paper')
  assert.equal(rows[0].authors, 'Smith, Jane and Lee, Kai')
  assert.equal(rows[0].year, 2024)
  assert.equal(rows[0].journal, 'Journal of Tests')
  assert.equal(rows[0].doi, '10.1000/ris')
  assert.equal(rows[0].kind, 'paper')
  assert.match(rows[0].notes, /Continued line/u)
  assert.equal(rows[1].kind, 'book')

  const looseSpacing = parseRis('TY - JOUR\nTI - One space tag\nER - \n')
  assert.equal(looseSpacing.length, 1)
  assert.equal(looseSpacing[0].title, 'One space tag')
})

test('format detection accepts all three exports and refuses unknown text', () => {
  assert.equal(detectReferenceFormat(JSON.stringify(CSL)), 'csl-json')
  assert.equal(detectReferenceFormat(RIS), 'ris')
  assert.equal(detectReferenceFormat('@article{k, title={T}}'), 'bibtex')
  assert.equal(detectReferenceFormat('hello world'), '')

  assert.equal(parseReferences(JSON.stringify(CSL), 'auto').format, 'csl-json')
  assert.equal(parseReferences(RIS, 'auto').format, 'ris')
  assert.equal(parseReferences('@misc{k, title={T}}', 'auto').format, 'bibtex')
  assert.throws(() => parseReferences('hello world', 'auto'), (error) => error.code === 'invalid_input')
})

test('CSL-JSON and RIS renderers are valid, stable and key-deduplicated', () => {
  const sources = [
    {
      id: 'S-0001',
      title: 'A paper',
      authors: 'Smith, Jane and Lee, Kai',
      year: 2024,
      journal: 'Journal of Tests',
      doi: '10.1000/abc',
      url: 'https://example.org/a',
      kind: 'paper',
      notes: 'A note',
    },
    {
      id: 'S-0002',
      title: 'A paper',
      authors: 'Smith, Jane',
      year: 2024,
      kind: 'paper',
    },
    {
      id: 'S-0003',
      title: 'A book',
      authors: 'Doe, John',
      year: 2021,
      journal: 'Test Press',
      kind: 'book',
    },
  ]
  const csl = JSON.parse(renderCslJson(sources))
  assert.equal(csl.length, 3)
  assert.equal(csl[0].type, 'article-journal')
  assert.equal(csl[0].DOI, '10.1000/abc')
  assert.deepEqual(csl[0].author[0], { family: 'Smith', given: 'Jane' })
  assert.equal(csl[0].note, 'A note')
  assert.notEqual(csl[0]['citation-key'], csl[1]['citation-key'])
  assert.equal(csl[2].publisher, 'Test Press')
  assert.equal(csl[2]['container-title'], undefined)

  const ris = renderRis(sources)
  assert.match(ris, /^TY  - JOUR$/mu)
  assert.match(ris, /^AU  - Smith, Jane$/mu)
  assert.match(ris, /^DO  - 10\.1000\/abc$/mu)
  assert.match(ris, /^PB  - Test Press$/mu)
  assert.equal((ris.match(/^ER  - $/gmu) || []).length, 3)
  const roundTrip = parseRis(ris)
  assert.equal(roundTrip.length, 3)
  assert.equal(roundTrip[0].title, 'A paper')
  assert.equal(roundTrip[0].doi, '10.1000/abc')
  assert.equal(roundTrip[0].kind, 'paper')
  assert.equal(roundTrip[2].kind, 'book')
  assert.equal(roundTrip[2].journal, 'Test Press')
})

test('reference import deduplicates DOI/title and exports CSL-JSON and RIS', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const first = service.sourceImport(id, { data: JSON.stringify(CSL), format: 'auto' })
    assert.equal(first.format, 'csl-json')
    assert.deepEqual(first.imported, ['S-0001', 'S-0002'])
    assert.equal(first.items[0].reliability, 'primary')

    const again = service.sourceImport(id, { data: JSON.stringify(CSL) })
    assert.equal(again.imported.length, 0)
    assert.equal(again.skipped.filter((row) => row.reason === 'duplicate').length, 2)

    const ris = service.sourceImport(id, { data: RIS, format: 'ris' })
    assert.equal(ris.format, 'ris')
    assert.deepEqual(ris.imported, ['S-0003', 'S-0004'])

    const cslExport = service.sourceReferences(id, 'csl-json')
    assert.equal(cslExport.format, 'csl-json')
    assert.equal(JSON.parse(cslExport.content).length, 4)
    const risExport = service.sourceReferences(id, 'ris')
    assert.equal(risExport.format, 'ris')
    assert.equal((risExport.content.match(/^ER  - $/gmu) || []).length, 4)

    const written = service.write(id, { action: 'export' })
    assert.match(written.paths.cslJson, /references\.csl\.json$/u)
    assert.match(written.paths.ris, /references\.ris$/u)
    assert.equal(JSON.parse(readFileSync(written.paths.cslJson, 'utf8')).length, 4)
    assert.match(readFileSync(written.paths.ris, 'utf8'), /^TY  - JOUR$/mu)
    const report = readFileSync(written.paths.report, 'utf8')
    assert.match(report, /## 17\. 参考文献/u)
    assert.match(report, /S-0001/u)
    assert.match(report, /## 17\.1 文献与溯源文件/u)
  } finally {
    cleanup()
  }
})

test('reference list marks ledger sources not cited by the manuscript', () => {
  const state = {
    sources: [
      { id: 'S-0001', title: 'Cited', authors: 'A', year: 2024, doi: '10.1/a' },
      { id: 'S-0002', title: 'Uncited', authors: 'B', year: 2023 },
    ],
    manuscript: { text: 'The result is supported [[src:S-0001]].' },
  }
  const coverage = citationCoverage(state)
  assert.equal(coverage.citedCount, 1)
  assert.deepEqual(coverage.uncited, ['S-0002'])
  const markdown = renderReferencesMarkdown(state)
  assert.match(markdown, /台账 2 条；手稿引用 1 条；未引用 1 条/u)
  assert.match(markdown, /\[S-0001\]/u)
  assert.match(markdown, /（手稿未引用）/u)
})

test('DOI lookup resolves one Crossref work and maps it to a source draft shape', async () => {
  const seen = []
  const result = await lookupDoi('https://doi.org/10.1234/ABC', {
    fetchImpl: async (url) => {
      seen.push(String(url))
      return jsonResponse({
        message: {
          DOI: '10.1234/abc',
          title: ['A DOI lookup'],
          issued: { 'date-parts': [[2024, 1, 1]] },
          author: [{ given: 'Ada', family: 'Lovelace' }],
          'container-title': ['Nature'],
          URL: 'https://doi.org/10.1234/abc',
          abstract: '<jats:p>Looked up.</jats:p>',
          type: 'journal-article',
        },
      })
    },
  })
  assert.equal(result.ok, true)
  assert.equal(result.doi, '10.1234/abc')
  assert.equal(result.candidate.title, 'A DOI lookup')
  assert.equal(result.candidate.doi, '10.1234/abc')
  assert.match(seen[0], /^https:\/\/api\.crossref\.org\/works\/10\.1234%2Fabc$/u)
})

test('DOI lookup rejects malformed IDs and maps 404 to not_found', async () => {
  await assert.rejects(() => lookupDoi('not-a-doi', { fetchImpl: async () => jsonResponse({}) }), /canonical DOI/u)
  await assert.rejects(
    () =>
      lookupDoi('10.1234/missing', {
        fetchImpl: async () => jsonResponse({}, 404),
      }),
    (error) => error.code === 'not_found' && error.detail.status === 404,
  )
})
