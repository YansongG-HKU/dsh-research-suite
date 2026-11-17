import assert from 'node:assert/strict'
import test from 'node:test'

import { parseBibtex, renderBibtex, sourceFromBibEntry } from '../../lib/bibtex.js'
import { makeService, createCampaign } from '../helpers.mjs'

const SAMPLE = `
@comment{this is ignored}
@string{jrn = "Journal of Tests"}
@article{Smith2024,
  title = {Enzyme kinetics under heat: a {nested} study},
  author = {Smith, Jane and Lee, Kai},
  year = {2024},
  journal = {J. Enzymol.},
  doi = {10.1000/XYZ123},
  url = {https://example.org/a}
}
@misc{doe2020,
  title = "A null result",
  author = "Doe, John",
  year = "2020",
  note = {preprint}
}
@article{broken,
  author = {Nobody}
}
`

test('BibTeX parser handles braces, quotes, comments and missing fields', () => {
  const entries = parseBibtex(SAMPLE)
  assert.equal(entries.length, 3)
  assert.equal(entries[0].key, 'Smith2024')
  assert.equal(entries[0].fields.title, 'Enzyme kinetics under heat: a {nested} study')
  assert.equal(entries[0].fields.author, 'Smith, Jane and Lee, Kai')
  assert.equal(entries[1].fields.title, 'A null result')
  assert.equal(entries[2].key, 'broken')
  assert.equal(entries[2].fields.title, undefined)
})

test('sourceFromBibEntry maps the common fields and kind', () => {
  const [entry] = parseBibtex(SAMPLE)
  const source = sourceFromBibEntry(entry)
  assert.equal(source.title, 'Enzyme kinetics under heat: a {nested} study')
  assert.equal(source.year, 2024)
  assert.equal(source.doi, '10.1000/XYZ123')
  assert.equal(source.journal, 'J. Enzymol.')
  assert.equal(source.kind, 'paper')
  assert.equal(source.reliability, 'primary')
  assert.equal(source.url, 'https://example.org/a')
  const none = sourceFromBibEntry({ type: 'misc', key: 'x', fields: { title: 'T' } })
  assert.equal(none.kind, 'other')
  assert.equal(none.reliability, 'secondary')
  assert.equal(none.year, null)
  const preprint = sourceFromBibEntry({ type: 'misc', key: 'p', fields: { title: 'P', eprint: '2401.00001' } })
  assert.equal(preprint.kind, 'preprint')
  assert.equal(preprint.reliability, 'primary')
})

test('BibTeX round-trips through the generated renderer', () => {
  const source = {
    id: 'S-0001',
    title: 'A title with {braces}',
    authors: 'Smith, Jane and Lee, Kai',
    year: 2024,
    kind: 'paper',
    reliability: 'primary',
    journal: 'J. Tests',
    doi: '10.1000/abc',
    url: 'https://example.org/x',
    bibtexKey: 'smith2024',
  }
  const text = renderBibtex([source])
  const entries = parseBibtex(text)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].key, 'smith2024')
  assert.equal(entries[0].fields.title, 'A title with \\{braces\\}')
  assert.equal(entries[0].fields.doi, '10.1000/abc')

  // An explicit key is unique too: two records with the same requested key
  // must not silently generate a duplicate citation key.
  const duplicateKeys = parseBibtex(
    renderBibtex([
      { title: 'First', bibtexKey: 'same' },
      { title: 'Second', bibtexKey: 'same' },
    ]),
  )
  assert.equal(duplicateKeys.length, 2)
  assert.notEqual(duplicateKeys[0].key, duplicateKeys[1].key)

  // BibTeX has no portable dataset/report entry type, so the renderer stores
  // the ledger kind in note and the importer must recover it.
  const dataset = sourceFromBibEntry(parseBibtex(renderBibtex([{ title: 'Dataset', kind: 'dataset', year: 2024 }]))[0])
  assert.equal(dataset.kind, 'dataset')
  assert.equal(dataset.reliability, 'primary')
})

test('source import deduplicates DOI and title and exports references.bib', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const first = service.sourceImportBibtex(id, { bibtex: SAMPLE })
    assert.deepEqual(first.imported, ['S-0001', 'S-0002'])
    assert.equal(first.skipped.length, 1)
    assert.equal(first.skipped[0].reason, 'missing_title')
    assert.equal(first.items[0].reliability, 'primary')
    assert.equal(first.items[1].reliability, 'secondary')

    const again = service.sourceImportBibtex(id, { bibtex: SAMPLE })
    assert.equal(again.imported.length, 0)
    assert.equal(again.skipped.filter((row) => row.reason === 'duplicate').length, 2)
    assert.equal(again.skipped.filter((row) => row.reason === 'missing_title').length, 1)

    const exported = service.sourceBibtex(id)
    assert.equal(exported.sources, 2)
    assert.match(exported.bibtex, /@article\{/u)
    assert.match(exported.bibtex, /@misc\{/u)
  } finally {
    cleanup()
  }
})

test('source import rejects unparsable input and respects the entry cap', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    assert.throws(() => service.sourceImportBibtex(id, { bibtex: 'not bibtex at all' }), /no parsable BibTeX/u)
    const tooMany = Array.from({ length: 101 }, (_, index) => `@misc{k${index}, title={T${index}}}`).join('\n')
    assert.throws(() => service.sourceImportBibtex(id, { bibtex: tooMany }), /at most 100 BibTeX entries/u)
  } finally {
    cleanup()
  }
})
