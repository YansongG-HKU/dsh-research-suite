import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { buildPrisma, renderPrismaCsv, renderPrismaMarkdown } from '../../lib/screening.js'
import { createCampaign, makeService } from '../helpers.mjs'

function source(service, id, title, extra = {}) {
  return service.sourceAdd(id, {
    title,
    year: 2024,
    kind: 'paper',
    reliability: 'primary',
    ...extra,
  }).source
}

test('screening stores title, abstract and full-text decisions on the schema-5 campaign', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const paper = source(service, id, 'Temperature and enzyme rate', { doi: '10.1000/temp' })
    const title = service.sourceScreen(id, {
      source: paper.id,
      stage: 'title',
      decision: 'include',
      reviewer: 'YG',
    })
    assert.equal(title.candidate.id, 'R-0001')
    assert.equal(title.candidate.source, 'S-0001')
    assert.equal(title.candidate.decisions.title.decision, 'include')
    assert.equal(title.candidate.decisions.title.reviewer, 'YG')
    assert.equal(title.created, true)

    const abstract = service.sourceScreen(id, {
      candidate: 'R-0001',
      stage: 'abstract',
      decision: 'include',
      reviewer: 'YG',
    })
    assert.equal(abstract.counts.pending, 1)
    assert.equal(abstract.counts.pendingFullText, 1)

    const fullText = service.sourceScreen(id, {
      candidate: 'R-0001',
      stage: 'full-text',
      decision: 'include',
      reviewer: 'YG',
    })
    assert.equal(fullText.counts.studiesIncluded, 1)
    assert.equal(fullText.complete, true)

    const state = service.store.get(id)
    assert.equal(state.schema, 5)
    assert.equal(state.screening.candidates.length, 1)
    assert.equal(state.screening.candidates[0].decisions.abstract.decision, 'include')
    assert.equal(state.screening.candidates[0].decisions.fullText.decision, 'include')
    const kinds = service.store.events(state).map((event) => event.kind)
    assert.equal(kinds.filter((kind) => kind === 'screening.decided').length, 3)
    assert.equal(service.store.verify(id).chainOk, true)
  } finally {
    cleanup()
  }
})

test('screening rejects missing or invalid exclusion reasons and a misplaced not-retrieved', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    service.sourceScreen(id, { title: 'Validation paper', stage: 'title', decision: 'include' })
    assert.throws(
      () => service.sourceScreen(id, { candidate: 'R-0001', stage: 'title', decision: 'exclude' }),
      (error) => error.code === 'invalid_input' && /reason/u.test(error.message),
    )
    assert.throws(
      () => service.sourceScreen(id, { candidate: 'R-0001', stage: 'title', decision: 'exclude', reason: 'made-up' }),
      (error) => error.code === 'invalid_input' && /reason/u.test(error.message),
    )
    assert.throws(
      () => service.sourceScreen(id, { candidate: 'R-0001', stage: 'title', decision: 'exclude', reason: 'not-retrieved' }),
      (error) => error.code === 'invalid_input' && /full-text/u.test(error.message),
    )
    assert.throws(
      () => service.sourceScreen(id, { candidate: 'R-0001', stage: 'abstract', decision: 'exclude' }),
      (error) => error.code === 'invalid_input',
    )
    service.sourceScreen(id, { candidate: 'R-0001', stage: 'abstract', decision: 'include' })
    const excluded = service.sourceScreen(id, {
      candidate: 'R-0001',
      stage: 'full-text',
      decision: 'exclude',
      reason: 'wrong-outcome',
      notes: 'outcome was a surrogate',
    })
    assert.equal(excluded.counts.reportsAssessed, 1)
    assert.equal(excluded.counts.fullTextExcluded, 1)
    assert.equal(excluded.counts.studiesIncluded, 0)
    const prisma = service.screeningPrisma(id)
    assert.equal(prisma.stages.fullText.reasons['wrong-outcome'], 1)
    assert.equal(prisma.records[0].decisions.fullText.note, 'outcome was a surrogate')
  } finally {
    cleanup()
  }
})

test('duplicates are removed before screening and counted once', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    service.sourceScreen(id, { title: 'Retained paper', doi: '10.1000/dup', stage: 'title', decision: 'include' })
    const duplicate = service.sourceScreen(id, {
      duplicateOf: 'R-0001',
      stage: '',
      decision: '',
    })
    assert.equal(duplicate.candidate.id, 'R-0002')
    assert.equal(duplicate.candidate.duplicate, true)
    assert.equal(duplicate.candidate.title, 'Retained paper')
    assert.equal(duplicate.counts.duplicatesRemoved, 1)
    assert.equal(duplicate.counts.recordsIdentified, 2)
    assert.equal(duplicate.counts.recordsAfterDuplicates, 1)

    const again = service.sourceScreen(id, { duplicateOf: 'R-0001' })
    assert.equal(again.candidate.id, 'R-0002')
    assert.equal(again.created, false)

    assert.throws(
      () => service.sourceScreen(id, { duplicateOf: 'R-0001', stage: 'title', decision: 'include' }),
      (error) => error.code === 'invalid_input' && /duplicate/u.test(error.message),
    )
    assert.throws(
      () => service.sourceScreen(id, { candidate: 'R-0002', stage: 'title', decision: 'include' }),
      (error) => error.code === 'invalid_input' && /duplicate/u.test(error.message),
    )
    assert.throws(
      () => service.sourceScreen(id, { duplicateOf: 'R-9999' }),
      (error) => error.code === 'not_found',
    )

    const prisma = service.screeningPrisma(id)
    assert.equal(prisma.duplicates.removed, 1)
    assert.deepEqual(prisma.duplicates.pairs, [{ id: 'R-0002', duplicateOf: 'R-0001' }])
    assert.equal(prisma.flow.nodes.find((node) => node.id === 'duplicates-removed').count, 1)
  } finally {
    cleanup()
  }
})

test('PRISMA keeps pending and out-of-order decisions visible instead of guessing', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    service.sourceScreen(id, { title: 'Only title decision', stage: 'title', decision: 'include' })
    const pending = service.screeningPrisma(id)
    assert.equal(pending.complete, false)
    assert.equal(pending.counts.pending, 1)
    assert.equal(pending.counts.pendingScreening, 1)
    assert.equal(pending.counts.reportsSought, 0)
    assert.ok(pending.warnings.some((warning) => warning.code === 'screening_pending'))

    service.sourceScreen(id, { title: 'Out of order', stage: 'abstract', decision: 'include' })
    const outOfOrder = service.screeningPrisma(id)
    assert.ok(outOfOrder.warnings.some((warning) => warning.code === 'decision_out_of_order'))
    assert.equal(outOfOrder.counts.pending, 2)
    assert.equal(outOfOrder.complete, false)

    service.sourceScreen(id, { title: 'Excluded at title', stage: 'title', decision: 'exclude', reason: 'not-relevant' })
    const withTitleExcluded = service.screeningPrisma(id)
    assert.equal(withTitleExcluded.stages.title.exclude, 1)
    assert.equal(withTitleExcluded.stages.abstract.decided, 0)
    assert.equal(withTitleExcluded.stages.abstract.missing, 1)
    assert.equal(withTitleExcluded.counts.pending, 2)
  } finally {
    cleanup()
  }
})

test('a non-include decision clears later stages and a failed write does not leak a candidate', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    service.sourceScreen(id, { title: 'Cleared downstream', stage: 'title', decision: 'include', reviewer: 'A' })
    service.sourceScreen(id, { candidate: 'R-0001', stage: 'abstract', decision: 'include' })
    service.sourceScreen(id, { candidate: 'R-0001', stage: 'full-text', decision: 'include' })
    const before = structuredClone(service.store.get(id).screening)

    assert.throws(
      () => service.sourceScreen(id, { title: 'Phantom', stage: 'title', decision: 'exclude' }),
      (error) => error.code === 'invalid_input' && /reason/u.test(error.message),
    )
    assert.deepEqual(service.store.get(id).screening, before)
    assert.equal(service.screeningPrisma(id).records.length, 1)

    const changed = service.sourceScreen(id, {
      candidate: 'R-0001',
      stage: 'title',
      decision: 'maybe',
      reviewer: 'B',
      notes: 'downgraded after reading the abstract',
    })
    assert.equal(changed.candidate.decisions.abstract, null)
    assert.equal(changed.candidate.decisions.fullText, null)
    assert.equal(changed.counts.pending, 1)
    assert.throws(
      () => service.sourceScreen(id, { candidate: 'R-0001', stage: 'full-text', decision: 'include' }),
      (error) => error.code === 'invalid_input' && /requires title and abstract/u.test(error.message),
    )

    const events = service.store.events(service.store.get(id))
    const cleared = events.find(
      (event) => event.kind === 'screening.decided' && event.payload.cleared && event.payload.cleared.includes('fullText'),
    )
    assert.ok(cleared)
    assert.deepEqual(cleared.payload.cleared, ['abstract', 'fullText'])
    assert.equal(cleared.payload.reviewer, 'B')
    assert.equal(cleared.payload.note, 'downgraded after reading the abstract')

    service.sourceScreen(id, { candidate: 'R-0001', stage: 'title', decision: 'include' })
    service.sourceScreen(id, { candidate: 'R-0001', stage: 'abstract', decision: 'include' })
    const recovered = service.sourceScreen(id, { candidate: 'R-0001', stage: 'full-text', decision: 'include' })
    assert.equal(recovered.complete, true)

    const tampered = structuredClone(service.store.get(id))
    tampered.screening.candidates[0].decisions.title = { decision: 'exclude', reason: 'not-relevant' }
    tampered.screening.candidates[0].decisions.fullText = { decision: 'include', reason: '' }
    const inconsistent = buildPrisma(tampered)
    assert.equal(inconsistent.consistency.ok, false)
    assert.equal(inconsistent.counts.pending, 0)
    assert.equal(inconsistent.complete, false)
    assert.ok(inconsistent.warnings.some((warning) => warning.code === 'decision_after_exclusion'))
    assert.match(renderPrismaMarkdown(inconsistent), /数据一致：否/u)

    const malformed = buildPrisma({ screening: { candidates: [{ id: 'not-a-candidate' }] } })
    assert.equal(malformed.consistency.ok, false)
    assert.ok(malformed.warnings.some((warning) => warning.code === 'invalid_candidates'))

    const duplicateChain = buildPrisma({
      screening: {
        candidates: [
          { id: 'R-0001', title: 'A', decisions: { title: { decision: 'include' }, abstract: { decision: 'include' } } },
          { id: 'R-0002', title: 'B', duplicateOf: 'R-0001' },
          { id: 'R-0003', title: 'C', duplicateOf: 'R-0002' },
        ],
      },
    })
    assert.ok(duplicateChain.warnings.some((warning) => warning.code === 'duplicate_of_duplicate'))
    assert.equal(duplicateChain.complete, false)
  } finally {
    cleanup()
  }
})

test('PRISMA renderers and export produce JSON, Markdown, CSV and bundle entries', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const paper = source(service, id, 'Included paper', { doi: '10.1000/keep' })
    service.sourceScreen(id, { source: paper.id, stage: 'title', decision: 'include' })
    service.sourceScreen(id, { source: paper.id, stage: 'abstract', decision: 'include' })
    service.sourceScreen(id, { source: paper.id, stage: 'full-text', decision: 'include' })
    service.sourceScreen(id, { title: 'Excluded paper', stage: 'title', decision: 'include' })
    service.sourceScreen(id, { title: 'Excluded paper', stage: 'abstract', decision: 'exclude', reason: 'wrong-design' })
    service.sourceScreen(id, { duplicateOf: 'R-0001' })
    service.search(id, {
      disconfirming: true,
      query: 'enzyme temperature',
      database: 'PubMed',
      dateFrom: '2015-01-01',
      dateTo: '2025-12-31',
      hits: 3,
      screened: 3,
      included: 1,
    })

    const prisma = buildPrisma(service.store.get(id))
    assert.equal(prisma.counts.recordsIdentified, 3)
    assert.equal(prisma.counts.duplicatesRemoved, 1)
    assert.equal(prisma.counts.studiesIncluded, 1)
    assert.equal(prisma.counts.titleAbstractExcluded, 1)
    assert.equal(prisma.stages.abstract.reasons['wrong-design'], 1)

    const markdown = renderPrismaMarkdown(prisma, { level: 2, title: '17.2 PRISMA 2020 候选筛选流程' })
    assert.match(markdown, /^## 17\.2 PRISMA 2020/u)
    assert.match(markdown, /```mermaid/u)
    assert.match(markdown, /wrong-design/u)
    assert.match(markdown, /Included paper/u)
    assert.match(markdown, /→ R-0001/u)
    assert.match(markdown, /数据一致：是/u)
    const csv = renderPrismaCsv(prisma)
    assert.match(csv, /^candidateId,title,/u)
    assert.match(csv, /"R-0001","Included paper"/u)
    assert.equal(csv.trim().split('\n').length, 4)

    const formulaPrisma = buildPrisma({
      screening: {
        candidates: [
          { id: 'R-0001', title: '=SUM(A1:A2)', decisions: { title: { decision: 'include' } } },
        ],
      },
    })
    assert.match(renderPrismaCsv(formulaPrisma), /"'=SUM\(A1:A2\)"/u)

    const exported = service.write(id, { action: 'export' })
    assert.match(exported.paths.prismaJson, /PRISMA\.json$/u)
    assert.match(exported.paths.prismaMarkdown, /PRISMA\.md$/u)
    assert.match(exported.paths.prismaCsv, /PRISMA\.csv$/u)
    const json = JSON.parse(readFileSync(exported.paths.prismaJson, 'utf8'))
    assert.equal(json.counts.studiesIncluded, 1)
    assert.equal(json.consistency.ok, true)
    const report = readFileSync(exported.paths.report, 'utf8')
    assert.match(report, /## 17\.2 PRISMA 2020/u)
    assert.match(report, /PRISMA\.json/u)
    const zip = readFileSync(exported.paths.bundle)
    for (const name of ['PRISMA.json', 'PRISMA.md', 'PRISMA.csv']) {
      assert.ok(zip.includes(Buffer.from(name)), `${name} must be in BUNDLE.zip`)
    }
  } finally {
    cleanup()
  }
})
