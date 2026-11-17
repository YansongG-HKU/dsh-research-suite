import assert from 'node:assert/strict'
import test from 'node:test'

import { renderReport } from '../../lib/report.js'

test('report header uses the verified event count, not a later sequence', () => {
  const state = {
    id: 'rs-00000000',
    title: 'header consistency',
    stage: 'write',
    tier: 'S',
    seq: 12,
    claims: [],
    sources: [],
    numbers: [],
    runs: [],
    reviews: [],
    figures: [],
    artifacts: [],
    world: {},
  }
  const markdown = renderReport(state, {
    integrity: { chainOk: true, events: 11, artifacts: 0, artifactProblems: [] },
    events: [],
  })
  assert.match(markdown, /事件 11 条/u)
  assert.doesNotMatch(markdown, /事件 12 条/u)
})
