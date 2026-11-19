import assert from 'node:assert/strict'
import test from 'node:test'

import { checkEntailment } from '../../lib/review.js'
import { createCampaign, makeService } from '../helpers.mjs'

function stateFor(statement, quote) {
  return {
    claims: [{ id: 'C-0001', statement }],
    evidence: [{ id: 'E-0001', claim: 'C-0001', relation: 'supports', ref: 'S-0001', quote }],
  }
}

test('lexical screen flags a negation-polarity mismatch instead of treating overlap as support', () => {
  const screen = checkEntailment(stateFor('温度不会提高酶促反应速率。', '温度会提高酶促反应速率。'))
  assert.equal(screen.rows[0].status, 'weak')
  assert.ok(screen.rows[0].flags.includes('negation_mismatch'))
  assert.equal(screen.flagged.length, 1)
})

test('lexical screen flags a numeric mismatch while leaving the caveat about semantics intact', () => {
  const screen = checkEntailment(stateFor('升温使初速度提高 30%。', '升温使初速度提高 10%。'))
  assert.ok(screen.rows[0].flags.includes('number_mismatch'))
  assert.doesNotMatch(screen.rows[0].flags.join(','), /negation_mismatch/u)
  assert.match(screen.note, /not.*logically entails|not.*语义|Lexical/u)
})

test('audit turns a negation mismatch into a major finding, not a silent pass', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const source = service.sourceAdd(id, {
      title: 'negation fixture',
      year: 2026,
      kind: 'report',
      reliability: 'primary',
      content: '实验显示温度会提高反应速率。',
    }).source
    const claim = service.claimAdd(id, { statement: '实验显示温度不会提高反应速率。' }).claim
    service.evidenceAdd(id, {
      claim: claim.id,
      relation: 'supports',
      ref: source.id,
      quote: '温度会提高反应速率',
    })
    const audit = service.audit(id, { record: false }).audit
    assert.ok(audit.findings.some((row) => row.code === 'claim_evidence_negation' && row.severity === 'major'))
    assert.equal(audit.findings.some((row) => row.code === 'claim_evidence_weak' && row.ref === claim.id), false)
  } finally {
    cleanup()
  }
})
