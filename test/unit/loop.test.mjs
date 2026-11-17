import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

import {
  evaluateLoop,
  renderLoopMarkdown,
} from '../../lib/loop.js'
import { evaluateMonitoring, normalizeMonitoring } from '../../lib/monitor.js'
import {
  createCampaign,
  makeService,
  passAnalyze,
  passDesign,
  passExecute,
  passHypothesis,
  passRelease,
  passReview,
  passScoping,
  passSurvey,
  passWrite,
} from '../helpers.mjs'

function fullCampaign(service) {
  const id = createCampaign(service)
  passScoping(service, id)
  passSurvey(service, id)
  passHypothesis(service, id)
  passDesign(service, id)
  const executed = passExecute(service, id)
  const analyzed = passAnalyze(service, id, executed.main.id)
  passWrite(service, id, analyzed.number.id)
  passReview(service, id)
  passRelease(service, id)
  return id
}

test('monitoring evaluation is deterministic and distinguishes gaps from alerts', () => {
  const planned = normalizeMonitoring({
    status: 'active',
    signals: ['accuracy', 'latency'],
    metrics: [{ name: 'accuracy', target: 0.9, tolerance: 0.02, direction: 'higher' }],
  })
  const first = evaluateMonitoring(planned)
  assert.equal(first.alerts.length, 0)
  assert.equal(first.gaps.some((item) => item.code === 'metric_without_observation'), true)
  assert.equal(first.gaps.some((item) => item.code === 'signal_without_metric'), true)

  const observed = normalizeMonitoring({
    ...planned,
    observations: [
      { metric: 'accuracy', value: 0.95, at: '2026-01-01T00:00:00.000Z' },
      { metric: 'accuracy', value: 0.8, at: '2026-01-02T00:00:00.000Z' },
    ],
  })
  const second = evaluateMonitoring(observed)
  assert.equal(second.alerts.length, 1)
  assert.equal(second.alerts[0].metric, 'accuracy')
  assert.equal(second.status, 'alert')
  assert.equal(second.metrics[0].latest.value, 0.8)
})

test('monitor accepts the nested monitoring envelope from the tool schema', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const result = service.monitor(id, {
      monitoring: {
        status: 'active',
        plan: '每周检查漂移与安全事件；越界则暂停并复核。',
        owner: 'YG',
        cadence: 'weekly',
        signals: ['accuracy'],
        metrics: [{ name: 'accuracy', target: 0.9, tolerance: 0.02, direction: 'higher' }],
        observations: [{ metric: 'accuracy', value: 0.95 }],
      },
    })
    assert.equal(result.monitoring.metrics.length, 1)
    assert.equal(result.monitoring.observations.length, 1)
    assert.equal(result.assessment.alerts.length, 0)
    assert.equal(result.monitoring.reviewedAt.length > 0, true)
    assert.throws(
      () => service.monitor(id, { metrics: [{ name: 'no_target' }] }),
      (error) => error.code === 'invalid_input',
    )
  } finally {
    cleanup()
  }
})

test('empty campaign gets a low loop score and a recorded baseline', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const result = service.evaluate(id)
    assert.equal(result.recorded, true)
    assert.equal(result.evaluation.dimensions.length, 12)
    assert.ok(result.evaluation.score < 45)
    assert.equal(result.evaluation.rsi.ready, false)
    assert.ok(result.evaluation.gaps.length > 0)
    assert.ok(result.evaluation.nextActions.length > 0)
    assert.ok(result.baseline.id.startsWith('L-'))
    const state = service.store.get(id)
    assert.equal(state.loopEvaluations.length, 1)
    assert.equal(state.loopBaseline.score, result.evaluation.score)
    const markdown = renderLoopMarkdown(result.evaluation, state)
    assert.match(markdown, /研究闭环评估/u)
    assert.match(markdown, /自我改进前提/u)
  } finally {
    cleanup()
  }
})

test('a complete campaign scores high, persists LOOP.md and can be re-evaluated', () => {
  const { service, cleanup } = makeService()
  try {
    const id = fullCampaign(service)
    service.monitor(id, {
      status: 'active',
      plan: '发布后每周复查主指标与负对照，出现漂移则暂停使用并回到 analyze。',
      owner: 'YG',
      cadence: 'weekly',
      signals: ['accuracy'],
      metrics: [{ name: 'accuracy', target: 0.9, tolerance: 0.02, direction: 'higher' }],
      observations: [{ metric: 'accuracy', value: 0.95, at: '2026-01-01T00:00:00.000Z' }],
    })
    const first = service.evaluate(id)
    assert.equal(first.recorded, true)
    assert.ok(first.evaluation.score >= 60, `expected a substantive score, got ${first.evaluation.score}`)
    assert.equal(first.evaluation.rsi.ready, true)
    assert.equal(first.evaluation.dimensions.find((item) => item.id === 'monitoring').checks.find((item) => item.id === 'alerts').ok, true)

    const second = service.evaluate(id)
    assert.equal(second.recorded, true)
    assert.equal(second.evaluation.previousScore, first.evaluation.score)
    assert.equal(second.evaluation.delta, 0)
    const state = service.store.get(id)
    assert.equal(state.loopEvaluation.dimensions[0].checks, undefined)
    assert.equal(state.loopEvaluations[0].dimensions, undefined)
    assert.equal(state.loopEvaluations.length, 2)
    const exported = service.write(id, { action: 'export' })
    assert.ok(existsSync(exported.paths.loop))
    assert.match(readFileSync(exported.paths.loop, 'utf8'), /闭环成熟度/u)
    const zip = readFileSync(exported.paths.bundle)
    assert.ok(zip.includes(Buffer.from('LOOP.md')))
    assert.match(service.report(id).markdown, /## 19\. 研究闭环评估/u)
  } finally {
    cleanup()
  }
})

test('an out-of-tolerance observation alerts and can reopen a released campaign', () => {
  const { service, cleanup } = makeService()
  try {
    const id = fullCampaign(service)
    service.monitor(id, {
      status: 'active',
      plan: '发布后每周复查主指标；越界则暂停并复核。',
      owner: 'YG',
      cadence: 'weekly',
      metrics: [{ name: 'accuracy', target: 0.9, tolerance: 0.02, direction: 'higher' }],
    })
    const monitored = service.monitor(id, {
      observations: [{ metric: 'accuracy', value: 0.7, at: '2026-02-01T00:00:00.000Z' }],
      reopen: true,
      reason: '主指标跌破目标，回到分析阶段复核',
    })
    assert.equal(monitored.assessment.alerts.length, 1)
    assert.equal(monitored.monitoring.status, 'alert')
    assert.equal(monitored.reopened, true)
    assert.equal(service.store.get(id).stage, 'analyze')
    const events = service.store.events(service.store.get(id))
    assert.ok(events.some((event) => event.kind === 'monitoring.alert'))
    assert.ok(events.some((event) => event.kind === 'loop.reopened'))
  } finally {
    cleanup()
  }
})

test('evaluateLoop is pure and reports missing integrity instead of throwing', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const state = service.store.get(id)
    const evaluation = evaluateLoop(state)
    assert.equal(evaluation.dimensions.find((item) => item.id === 'integrity').score, 0)
    assert.equal(evaluation.kind, 'research-loop')
    assert.equal(evaluation.basis.events > 0, true)
  } finally {
    cleanup()
  }
})
