import assert from 'node:assert/strict'
import test from 'node:test'

import { checkLoop, loopPauses, normalizeLoopState, openLoopPause } from '../../lib/loop-control.js'
import { createTools } from '../../lib/tools.js'
import {
  createCampaign,
  makeService,
  passAnalyze,
  passDesign,
  passExecute,
  passHypothesis,
  passReview,
  passScoping,
  passSurvey,
  passWrite,
} from '../helpers.mjs'

function context(service, id, integrity) {
  const detail = service.get(id)
  return {
    gate: detail.gate,
    integrity: integrity || detail.integrity,
    state: service.store.get(id),
  }
}

function scopedCampaign(service) {
  const created = service.create({
    title: '循环控制器验收',
    question: '循环控制器能否在预算与人工检查点处停下来？',
    scope: '只使用本地测试数据与真实事件链，不联网、不调用模型。',
    success: '暂停、恢复与停止都有事件记录，且没有自动批准。',
    tier: 'S',
  })
  const id = created.campaign.id
  service.world(id, { action: 'set', kind: 'question', key: 'main', value: '循环控制器能否在预算与人工检查点处停下来？' })
  return id
}

function futureGate(code) {
  return {
    stage: 'scoping',
    ok: false,
    blocking: [code],
    checks: [{ code, ok: false, blocking: true, detail: `future check ${code}` }],
    waived: [],
    passed: 1,
    total: 2,
    ts: '2026-01-01T00:00:00.000Z',
  }
}

test('checkLoop continues on a safe primary and never mutates state', () => {
  const { service, cleanup } = makeService()
  try {
    const id = scopedCampaign(service)
    const { state, gate, integrity } = context(service, id)
    const seq = state.seq
    const loop = checkLoop(state, { gate, integrity })
    assert.equal(loop.status, 'continue')
    assert.equal(loop.code, null)
    assert.equal(loop.primary.tool, 'rsx_gate')
    assert.equal(loop.primary.args.action, 'advance')
    assert.equal(loop.checks.integrity.ok, true)
    assert.equal(loop.checks.budget.ok, true)
    assert.equal(loop.checks.gate.ok, true)
    assert.equal(loop.checks.cycles.ok, true)
    assert.equal(loop.iteration, 1)
    assert.equal(state.seq, seq)
  } finally {
    cleanup()
  }
})

test('checkLoop pauses a placeholder action and classifies it as needs_input', () => {
  const { service, cleanup } = makeService()
  try {
    const created = service.create({
      title: '缺少边界',
      question: '缺少边界时循环是否停下并请求输入？',
      success: '暂停记录包含缺失字段与工具调用。',
      tier: 'S',
    })
    const id = created.campaign.id
    const { state, gate, integrity } = context(service, id)
    const loop = checkLoop(state, { gate, integrity })
    assert.equal(loop.status, 'pause')
    assert.equal(loop.code, 'needs_input')
    assert.equal(loop.pauseKind, 'needs_input')
    assert.equal(loop.primary.tool, 'rsx_campaign')
    assert.equal(loop.primary.args.action, 'update')
    assert.equal(loop.primary.needsInput, true)
    assert.match(loop.reason, /scope|输入/u)
  } finally {
    cleanup()
  }
})

test('checkLoop pauses a human approval and an unmapped gate recipe', () => {
  const state = {
    stage: 'release',
    question: '人工批准是否由循环自动完成？',
    scope: '本地夹具；不调用任何审批工具。',
    success: '未批准时返回 human_checkpoint，不写审批。',
    tier: 'S',
    autonomy: {},
    cycles: [],
    world: {},
  }
  const human = checkLoop(state, {
    gate: {
      stage: 'release',
      ok: false,
      blocking: ['human_approval'],
      checks: [{ code: 'human_approval', ok: false, blocking: true, detail: 'fresh human approval required' }],
      passed: 1,
      total: 2,
    },
    integrity: { chainOk: true, stateOk: true, artifactProblems: [] },
  })
  assert.equal(human.status, 'pause')
  assert.equal(human.code, 'human_checkpoint')
  assert.equal(human.primary.tool, 'rsx_gate')
  assert.equal(human.primary.args.action, 'approve')
  assert.equal(human.primary.human, true)

  const unmapped = checkLoop(
    { ...state, stage: 'scoping' },
    { gate: futureGate('unmapped_future_check'), integrity: { chainOk: true, stateOk: true, artifactProblems: [] } },
  )
  assert.equal(unmapped.status, 'pause')
  assert.equal(unmapped.code, 'unmapped_gate')
  assert.equal(unmapped.primary.unmapped, true)
  assert.match(unmapped.reason, /no specific recipe|unmapped_future_check/u)
})

test('checkLoop stops on budget, integrity, prereg timing and cycle budget before pausing', () => {
  const { service, cleanup } = makeService()
  try {
    const id = scopedCampaign(service)
    const { state, gate } = context(service, id)

    state.budget.stages.scoping.tokensUsed = state.budget.stages.scoping.tokensLimit + 1
    const budget = checkLoop(state, { gate, integrity: { chainOk: true, stateOk: true, artifactProblems: [] } })
    assert.equal(budget.status, 'stop')
    assert.equal(budget.code, 'budget')
    assert.equal(budget.primary, null)

    state.budget.stages.scoping.tokensUsed = 0
    const integrity = checkLoop(state, { gate, integrity: { chainOk: false, stateOk: true, artifactProblems: [] } })
    assert.equal(integrity.status, 'stop')
    assert.equal(integrity.code, 'integrity')
    assert.equal(integrity.checks.integrity.ok, false)

    state.autonomy = { maxCycles: 1 }
    state.cycles = [{ id: 'K-0001', decision: 'continue' }]
    const cycles = checkLoop(state, { gate, integrity: { chainOk: true, stateOk: true, artifactProblems: [] } })
    assert.equal(cycles.status, 'stop')
    assert.equal(cycles.code, 'cycle_budget')
  } finally {
    cleanup()
  }
})

test('checkLoop reports ready after every release gate passes', () => {
  const state = { stage: 'release', question: '发布后循环是否结束？', scope: '本地夹具。', success: '全部闸门通过。', tier: 'S', autonomy: {}, cycles: [] }
  const loop = checkLoop(state, {
    gate: { stage: 'release', ok: true, blocking: [], checks: [], passed: 12, total: 12 },
    integrity: { chainOk: true, stateOk: true, artifactProblems: [] },
  })
  assert.equal(loop.status, 'ready')
  assert.equal(loop.primary.tool, 'rsx_write')
  assert.equal(loop.primary.args.action, 'export')
})

test('service.loop records one pause, is idempotent, rejects an unchanged resume and resumes after the input', () => {
  const { service, cleanup } = makeService()
  try {
    const created = service.create({
      title: '暂停与恢复',
      question: '暂停记录是否幂等且恢复条件明确？',
      success: '重复检查不重复写，未补输入不允许恢复。',
      tier: 'S',
    })
    const id = created.campaign.id
    const first = service.loop(id)
    assert.equal(first.status, 'pause')
    assert.equal(first.pause.id, 'LP-0001')
    assert.equal(first.pause.kind, 'needs_input')
    assert.equal(first.pause.status, 'open')
    const afterPause = service.store.get(id)
    assert.equal(loopPauses(afterPause).length, 1)
    assert.equal(afterPause.loop.status, 'paused')
    const seq = afterPause.seq

    const second = service.loop(id)
    assert.equal(second.status, 'pause')
    assert.equal(second.pause.id, 'LP-0001')
    assert.equal(service.store.get(id).seq, seq)
    assert.equal(loopPauses(service.store.get(id)).length, 1)

    const rejected = service.loop(id, { resume: true })
    assert.equal(rejected.status, 'pause')
    assert.equal(rejected.resumeRejected, true)
    assert.equal(rejected.loop.resumeRejected, true)
    assert.equal(service.store.get(id).seq, seq)

    service.update(id, { scope: '只使用本地数据；不联网；不调用模型；不自动批准。' })
    service.world(id, { action: 'set', kind: 'question', key: 'main', value: '暂停记录是否幂等且恢复条件明确？' })
    const beforeResume = service.store.get(id)
    const beforeResumeSeq = beforeResume.seq
    const resumed = service.loop(id, { resume: true, reason: '边界与主问题已补齐' })
    assert.equal(resumed.status, 'continue')
    assert.equal(resumed.loop.resumed, true)
    assert.equal(resumed.loop.status, 'running')
    assert.equal(resumed.pause, null)
    const afterResume = service.store.get(id)
    assert.equal(loopPauses(afterResume)[0].status, 'resumed')
    assert.equal(loopPauses(afterResume)[0].resumeReason, '边界与主问题已补齐')
    assert.equal(afterResume.seq, beforeResumeSeq + 1)
  } finally {
    cleanup()
  }
})

test('service.loop pauses on a real human approval and never creates one', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    passScoping(service, id)
    passSurvey(service, id)
    passHypothesis(service, id)
    passDesign(service, id)
    const executed = passExecute(service, id)
    const analyzed = passAnalyze(service, id, executed.main.id)
    passWrite(service, id, analyzed.number.id)
    passReview(service, id)
    service.world(id, { action: 'set', kind: 'safety', key: 'dual_use', value: 'pass' })
    service.write(id, {
      action: 'declaration',
      ai: true,
      watermark: true,
      model: 'DeepSeek Harness test',
      humanReviewer: 'YG',
    })
    const state = service.store.get(id)
    assert.equal(state.approvals.length, 0)
    const loop = service.loop(id)
    assert.equal(loop.status, 'pause')
    assert.equal(loop.pause.human, true)
    assert.equal(loop.pause.kind, 'human_checkpoint')
    assert.equal(loop.pause.tool, 'rsx_gate')
    assert.equal(loop.pause.args.action, 'approve')
    assert.equal(service.store.get(id).approvals.length, 0)
    const rejected = service.loop(id, { resume: true })
    assert.equal(rejected.resumeRejected, true)
    assert.equal(service.store.get(id).approvals.length, 0)
  } finally {
    cleanup()
  }
})

test('rsx_campaign exposes loop, resume and the persisted pause state', async () => {
  const { service, cleanup } = makeService()
  try {
    const tools = createTools({ service })
    const campaign = tools.find((tool) => tool.name === 'rsx_campaign')
    assert.ok(campaign.parameters.properties.action.enum.includes('loop'))
    assert.ok(campaign.parameters.properties.resume)
    const created = await campaign.execute({
      action: 'create',
      title: '工具循环',
      question: '工具层是否暴露循环暂停与恢复参数？',
      success: 'loop 返回暂停记录，schema 暴露 resume。',
      tier: 'S',
    })
    const result = await campaign.execute({ action: 'loop', campaign: created.campaign.id })
    assert.equal(result.ok, true)
    assert.equal(result.status, 'pause')
    assert.equal(result.pause.id, 'LP-0001')
    assert.equal(result.loop.status, 'paused')
    assert.equal(normalizeLoopState(service.store.get(created.campaign.id)).status, 'paused')
    assert.ok(openLoopPause(service.store.get(created.campaign.id)))
  } finally {
    cleanup()
  }
})
