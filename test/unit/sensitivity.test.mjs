import assert from 'node:assert/strict'
import test from 'node:test'

import { checkGate, preregTiming } from '../../lib/gates.js'
import {
  createCampaign,
  makeService,
  passDesign,
  passExecute,
  passHypothesis,
  passScoping,
  passSurvey,
} from '../helpers.mjs'

test('schema-3 analyze requires a sensitivity record and a resolvable trace', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    passScoping(service, id)
    passSurvey(service, id)
    passHypothesis(service, id)
    passDesign(service, id)
    const executed = passExecute(service, id)
    const runId = executed.main.id
    service.numberAdd(id, {
      name: 'Pearson r',
      value: 0.4461,
      uncertainty: '95% CI 0.31–0.57',
      trace: `run:${runId}#pearson_r`,
    })
    service.claimStatus(id, { claim: 'C-0001', status: 'supported' })
    service.claimStatus(id, { claim: 'C-0002', status: 'supported' })

    const blocked = checkGate(service.store.get(id), 'analyze')
    assert.ok(blocked.blocking.includes('sensitivity'), JSON.stringify(blocked.blocking))
    const audit = service.audit(id, { record: false }).audit
    assert.ok(audit.findings.some((row) => row.code === 'sensitivity_missing'))

    const row = service.sensitivityAdd(id, {
      claim: 'C-0001',
      name: 'alternative model',
      method: 'alternative-model',
      specification: '改用秩相关而不是 Pearson 相关，重估温度与初速度的关系。',
      result: '秩相关仍为正，方向一致。',
      direction: 'consistent',
      trace: `run:${runId}#pearson_r`,
    }).sensitivity
    assert.equal(row.id, 'Z-0001')
    assert.equal(row.direction, 'consistent')

    const passed = checkGate(service.store.get(id), 'analyze')
    assert.equal(passed.ok, true, JSON.stringify(passed.blocking))

    assert.throws(
      () =>
        service.sensitivityAdd(id, {
          name: 'missing direction',
          method: 'subgroup',
          specification: '按批次拆开重估主效应。',
          result: '方向未填写。',
        }),
      (error) => error.code === 'invalid_input',
    )
    assert.throws(
      () =>
        service.sensitivityAdd(id, {
          name: 'bad trace',
          method: 'subgroup',
          specification: '把样本按批次拆开，检查方向与强度。',
          result: '方向一致。',
          direction: 'consistent',
          trace: 'run:R-0000000000#missing',
        }),
      (error) => error.code === 'trace_unresolved',
    )
  } finally {
    cleanup()
  }
})

test('prereg timing compares the lock with the earliest run and blocks an after-the-fact protocol', () => {
  const timing = preregTiming({
    prereg: { lockedAt: '2026-01-01T00:00:00.000Z' },
    runs: [
      { id: 'R-0000000001', ts: '2025-12-31T23:59:59.000Z' },
      { id: 'R-0000000002', ts: '2026-01-02T00:00:00.000Z' },
    ],
  })
  assert.equal(timing.ok, false)
  assert.match(timing.detail, /predates the lock/u)
  assert.equal(
    preregTiming({
      prereg: { lockedAt: '2026-01-01T00:00:00.000Z' },
      runs: [{ id: 'R-0000000003', ts: '2026-01-01T00:00:01.000Z' }],
    }).ok,
    true,
  )

  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    passScoping(service, id)
    passSurvey(service, id)
    passHypothesis(service, id)
    passDesign(service, id)
    passExecute(service, id)
    const state = structuredClone(service.store.get(id))
    state.prereg.lockedAt = '2099-01-01T00:00:00.000Z'
    const gate = checkGate(state, 'execute')
    assert.ok(gate.blocking.includes('prereg_before_run'), JSON.stringify(gate.blocking))
  } finally {
    cleanup()
  }
})
