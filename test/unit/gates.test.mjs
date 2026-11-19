import assert from 'node:assert/strict'
import test from 'node:test'

import { checkGate, orphanNumbers, resolveTrace } from '../../lib/gates.js'
import { makeService, createCampaign } from '../helpers.mjs'

function fixture() {
  const { service, cleanup } = makeService()
  const id = createCampaign(service)
  const { state } = service.get(id)
  return { service, store: service.store, id, state, cleanup }
}

test('gate scoping blocks an under-specified campaign', () => {
  const { service, id, cleanup } = fixture()
  try {
    const result = checkGate(service.store.get(id), 'scoping')
    assert.equal(result.ok, false)
    assert.ok(result.blocking.includes('question') === false)
    assert.ok(result.blocking.includes('world_question'))
  } finally {
    cleanup()
  }
})

test('gate scoping passes after the world model records the question', () => {
  const { service, id, cleanup } = fixture()
  try {
    service.world(id, { action: 'set', kind: 'question', key: 'main', value: '温度是否影响酶速' })
    const result = checkGate(service.store.get(id), 'scoping')
    assert.equal(result.ok, true, JSON.stringify(result.blocking))
  } finally {
    cleanup()
  }
})

test('gate survey needs eight sources, two primary, capture and a disconfirming search', () => {
  const { service, store, id, cleanup } = fixture()
  try {
    service.world(id, { action: 'set', kind: 'question', key: 'main', value: '温度是否影响酶速' })
    let result = checkGate(store.get(id), 'survey')
    assert.ok(result.blocking.includes('min_sources'))
    assert.ok(result.blocking.includes('disconfirming_search'))
    for (let i = 1; i <= 8; i += 1) {
      service.sourceAdd(id, {
        title: `paper ${i}`,
        year: i === 1 ? 2024 : 2019,
        reliability: i <= 2 ? 'primary' : 'secondary',
        content: `content ${i}`,
        ...(i <= 2
          ? { independence: 'independent', design: 'bench assay', riskOfBias: 'low', robNote: 'randomized order' }
          : {}),
      })
    }
    service.search(id, { disconfirming: true, query: 'null result' })
    service.world(id, { action: 'set', kind: 'coverage', key: 'a', value: '1' })
    service.world(id, { action: 'set', kind: 'coverage', key: 'b', value: '2' })
    result = checkGate(store.get(id), 'survey')
    assert.equal(result.ok, true, JSON.stringify(result.blocking))
  } finally {
    cleanup()
  }
})

test('gate hypothesis blocks until falsifier and two supports exist', () => {
  const { service, store, id, cleanup } = fixture()
  try {
    service.sourceAdd(id, { title: 'paper one', year: 2024, reliability: 'primary', content: 'a' })
    service.claimAdd(id, { kind: 'hypothesis', statement: 'temperature raises rate' })
    let result = checkGate(store.get(id), 'hypothesis')
    assert.ok(result.blocking.includes('falsifier'))
    assert.ok(result.blocking.includes('support'))
    const claim = store.get(id).claims[0]
    service.evidenceAdd(id, { claim: claim.id, relation: 'supports', ref: 'S-0001' })
    result = checkGate(store.get(id), 'hypothesis')
    assert.ok(result.blocking.includes('support'))
  } finally {
    cleanup()
  }
})

test('gate design needs a negative control and an environment lock', () => {
  const { service, store, id, cleanup } = fixture()
  try {
    service.prereg(id, { metric: 'r', n: 10, analysisPlan: 'linear model with batch effect', stoppingRule: 'fixed n', seed: 3, controls: [], envLock: '' })
    const result = checkGate(store.get(id), 'design')
    assert.ok(result.blocking.includes('negative_control'))
    assert.ok(result.blocking.includes('env_lock'))
  } finally {
    cleanup()
  }
})

test('gate execute requires a seeded metric-bearing run and a negative control run', () => {
  const { service, store, id, cleanup } = fixture()
  try {
    service.runRecord(id, { command: 'python x.py', status: 'success', seed: 7, metrics: { r: 0.4 } })
    let result = checkGate(store.get(id), 'execute')
    assert.ok(result.blocking.includes('negative_control_run'))
    service.runRecord(id, { command: 'python x.py --permute', status: 'success', seed: 7, control: 'negative', metrics: { r: 0 } })
    store.get(id).runs[0].stdoutArtifact = 'sha256:' + '0'.repeat(64)
    result = checkGate(store.get(id), 'execute')
    assert.equal(result.ok, true, JSON.stringify(result.blocking))
  } finally {
    cleanup()
  }
})

test('gate analyze rejects an unresolved trace and a mismatched value', () => {
  const { service, store, id, cleanup } = fixture()
  try {
    const claim = service.claimAdd(id, {
      statement: 'temperature raises the rate',
      warrant: 'A higher rate constant raises the initial rate at fixed substrate concentration.',
      counterEvidence: 'Searched for null results; none in the 20-40C range.',
      certainty: 'moderate',
    }).claim
    const run = service.runRecord(id, { command: 'python x.py', status: 'success', seed: 7, metrics: { r: 0.4461 } }).run
    service.numberAdd(id, { name: 'r', value: 0.4461, trace: `run:${run.id}#r`, uncertainty: 'CI' })
    let result = checkGate(store.get(id), 'analyze')
    assert.ok(result.blocking.includes('claims_resolved'))
    service.claimStatus(id, { claim: claim.id, status: 'supported' })
    service.sensitivityAdd(id, {
      claim: claim.id,
      name: 'subgroup split',
      method: 'subgroup',
      specification: '按批次拆成两组分别重估 r，检查效应是否只来自其中一组。',
      result: '两组 r 均为正，方向一致。',
      direction: 'consistent',
      trace: `run:${run.id}#r`,
    })
    result = checkGate(store.get(id), 'analyze')
    assert.equal(result.ok, true, JSON.stringify(result.blocking))
    assert.equal(resolveTrace(store.get(id), 'run:nope#r').ok, false)
  } finally {
    cleanup()
  }
})

test('gate write rejects orphan digits and unknown refs', () => {
  const state = {
    manuscript: { text: `正文 ${'很长的内容'.repeat(60)} 结果 0.77 与 [[src:S-0001]] [[src:S-9999]]。` },
    numbers: [],
    sources: [{ id: 'S-0001' }],
    figures: [],
    numbersAllowlist: '1,2,3',
  }
  const result = checkGate(state, 'write')
  assert.ok(result.blocking.includes('number_refs'))
  assert.ok(result.blocking.includes('no_orphan_numbers'))
  assert.ok(result.blocking.includes('cite_refs_known'))
})

test('orphanNumbers ignores years, allowlist and code fences', () => {
  const found = orphanNumbers('2024 年，1 和 2 允许；`0.99` 也不算；{{N-0001}} 与 [[src:S-0002]]。剩 0.5', '1,2,3')
  assert.deepEqual(found.map((item) => item.value), ['0.5'])
})

test('gate release requires declaration, dual-use pass and upstream gates', () => {
  const { service, store, id, cleanup } = fixture()
  try {
    const result = checkGate(store.get(id), 'release')
    assert.equal(result.ok, false)
    assert.ok(result.blocking.includes('declaration'))
    assert.ok(result.blocking.includes('dual_use'))
  } finally {
    cleanup()
  }
})
