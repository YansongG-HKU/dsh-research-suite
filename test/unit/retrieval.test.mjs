import assert from 'node:assert/strict'
import test from 'node:test'

import {
  abstractFromInvertedIndex,
  cleanText,
  mergeCandidates,
  normalizeDoi,
  parseCrossref,
  parseOpenAlex,
  searchLiterature,
} from '../../lib/retrieval.js'

const OPENALEX = {
  results: [
    {
      id: 'https://openalex.org/W1',
      doi: 'https://doi.org/10.1234/ABC',
      display_name: 'Multi-agent <b>research</b> systems',
      publication_year: 2025,
      authorships: [{ author: { display_name: 'Ada Lovelace' } }, { author: { display_name: 'Alan Turing' } }],
      primary_location: { source: { display_name: 'Nature' }, landing_page_url: 'https://example.org/w1' },
      abstract_inverted_index: { Multi: [0], agent: [1], research: [2], systems: [3] },
      cited_by_count: 42,
      type: 'article',
    },
  ],
}

const CROSSREF = {
  message: {
    items: [
      {
        DOI: '10.1234/abc',
        title: ['Multi-agent research systems'],
        issued: { 'date-parts': [[2025, 1, 1]] },
        author: [{ given: 'Ada', family: 'Lovelace' }],
        'container-title': ['Nature'],
        URL: 'https://doi.org/10.1234/abc',
        abstract: '<jats:p>Agents that search and write.</jats:p>',
        type: 'journal-article',
        'is-referenced-by-count': 50,
      },
    ],
  },
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload
    },
  }
}

test('cleanText strips markup and decodes entities without executing anything', () => {
  assert.equal(cleanText('<jats:p>A &amp; B</jats:p>'), 'A & B')
  assert.equal(cleanText('x <script>alert(1)</script> y'), 'x alert(1) y')
  assert.equal(cleanText('x&#32;y'), 'x y')
})

test('normalizeDoi and abstract inversion are deterministic', () => {
  assert.equal(normalizeDoi('https://doi.org/10.1234/ABC.'), '10.1234/abc')
  assert.equal(normalizeDoi('doi: 10.1234/xyz'), '10.1234/xyz')
  assert.equal(abstractFromInvertedIndex({ b: [2], a: [0], c: [1] }), 'a c b')
  assert.equal(abstractFromInvertedIndex(null), '')
})

test('OpenAlex and Crossref normalize to the same candidate shape', () => {
  const [openalex] = parseOpenAlex(OPENALEX)
  assert.equal(openalex.provider, 'openalex')
  assert.equal(openalex.doi, '10.1234/abc')
  assert.equal(openalex.title, 'Multi-agent research systems')
  assert.equal(openalex.year, 2025)
  assert.equal(openalex.authors.length, 2)
  assert.equal(openalex.venue, 'Nature')
  assert.equal(openalex.abstract, 'Multi agent research systems')
  assert.equal(openalex.citations, 42)
  assert.equal(openalex.kind, 'paper')

  const [crossref] = parseCrossref(CROSSREF)
  assert.equal(crossref.provider, 'crossref')
  assert.equal(crossref.doi, '10.1234/abc')
  assert.equal(crossref.title, 'Multi-agent research systems')
  assert.equal(crossref.abstract, 'Agents that search and write.')
  assert.equal(crossref.citations, 50)
})

test('mergeCandidates deduplicates DOI case and preserves richer fields', () => {
  const [openalex] = parseOpenAlex(OPENALEX)
  const [crossref] = parseCrossref(CROSSREF)
  const merged = mergeCandidates([openalex, crossref])
  assert.equal(merged.length, 1)
  assert.deepEqual(merged[0].providers, ['openalex', 'crossref'])
  assert.equal(merged[0].providerIds.openalex, 'https://openalex.org/W1')
  assert.equal(merged[0].providerIds.crossref, '10.1234/abc')
  assert.equal(merged[0].abstract, 'Agents that search and write.')
  assert.equal(merged[0].citations, 50)
})

test('searchLiterature returns bounded merged candidates and request counts', async () => {
  const seen = []
  const result = await searchLiterature({
    query: 'multi-agent research',
    limit: 3,
    fetchImpl: async (url) => {
      seen.push(String(url))
      return jsonResponse(String(url).includes('openalex') ? OPENALEX : CROSSREF)
    },
  })
  assert.equal(result.ok, true)
  assert.equal(result.provider, 'both')
  assert.deepEqual(result.counts, { openalex: 1, crossref: 1 })
  assert.equal(result.candidates.length, 1)
  assert.equal(result.candidates[0].providers.length, 2)
  assert.equal(seen.length, 2)
  assert.match(seen[0], /^https:\/\/api\.openalex\.org\/works\?/u)
  assert.match(seen[1], /^https:\/\/api\.crossref\.org\/works\?/u)
})

test('one failed provider becomes a warning and the other still returns results', async () => {
  const result = await searchLiterature({
    query: 'fallback',
    provider: 'both',
    fetchImpl: async (url) => {
      if (String(url).includes('openalex')) throw new Error('network down')
      return jsonResponse(CROSSREF)
    },
  })
  assert.equal(result.candidates.length, 1)
  assert.equal(result.warnings.length, 1)
  assert.equal(result.warnings[0].provider, 'openalex')
  assert.equal(result.warnings[0].code, 'retrieval_failed')
  assert.equal(result.counts.openalex, 0)
  assert.equal(result.counts.crossref, 1)
})

test('malformed provider payload is a warning, not a fabricated candidate', async () => {
  const result = await searchLiterature({
    query: 'malformed',
    provider: 'both',
    fetchImpl: async (url) =>
      String(url).includes('openalex') ? jsonResponse({ results: 'not-an-array' }) : jsonResponse(CROSSREF),
  })
  assert.equal(result.candidates.length, 1)
  assert.equal(result.warnings.length, 1)
  assert.match(result.warnings[0].message, /results array/u)
})

test('both providers failing raises retrieval_failed with warnings', async () => {
  await assert.rejects(
    () =>
      searchLiterature({
        query: 'all fail',
        provider: 'both',
        fetchImpl: async () => {
          throw new Error('offline')
        },
      }),
    (error) => error.code === 'retrieval_failed' && error.detail.warnings.length === 2,
  )
})

test('oversized provider responses are rejected before parsing', async () => {
  await assert.rejects(
    () =>
      searchLiterature({
        query: 'huge',
        provider: 'openalex',
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          headers: { get: () => String(5 * 1024 * 1024) },
          json: async () => OPENALEX,
        }),
      }),
    (error) => error.code === 'retrieval_failed' && /too large/u.test(error.message),
  )
})

test('AbortError is reported as retrieval_timeout', async () => {
  await assert.rejects(
    () =>
      searchLiterature({
        query: 'timeout',
        provider: 'openalex',
        fetchImpl: async () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          throw error
        },
      }),
    (error) => error.code === 'retrieval_timeout',
  )
})

test('invalid query, provider, year and limits are rejected before network access', async () => {
  let called = 0
  const fetchImpl = async () => {
    called += 1
    return jsonResponse(CROSSREF)
  }
  await assert.rejects(() => searchLiterature({ query: '  ', fetchImpl }), /query must be a non-empty/u)
  await assert.rejects(() => searchLiterature({ query: 'x', provider: 'pubmed', fetchImpl }), /provider must be/u)
  await assert.rejects(
    () => searchLiterature({ query: 'x', yearFrom: 2025, yearTo: 2020, fetchImpl }),
    /yearFrom must not be after yearTo/u,
  )
  await assert.rejects(
    () => searchLiterature({ query: 'x', yearFrom: 1700, fetchImpl }),
    /yearFrom must be an integer/u,
  )
  assert.equal(called, 0)
})

test('year filters are passed as provider-native parameters', async () => {
  const seen = []
  await searchLiterature({
    query: 'filtered',
    provider: 'both',
    yearFrom: 2020,
    yearTo: 2024,
    fetchImpl: async (url) => {
      seen.push(String(url))
      return jsonResponse(String(url).includes('openalex') ? OPENALEX : CROSSREF)
    },
  })
  assert.match(seen[0], /filter=from_publication_date%3A2020-01-01%2Cto_publication_date%3A2024-12-31/u)
  assert.match(seen[1], /filter=from-pub-date%3A2020-01-01%2Cuntil-pub-date%3A2024-12-31/u)
})
