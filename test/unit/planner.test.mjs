import test from 'node:test'
import assert from 'node:assert/strict'

import { planNext, nextSummary } from '../../lib/planner.js'
import {
  makeService,
  createCampaign,
  passScoping,
  passSurvey,
  passHypothesis,
  passDesign,
  passExecute,
  passAnalyze,
  passWrite,
  passReview,
  passRelease,
} from '../helpers.mjs'

function planOf(service, id) {
  const state = service.get(id).state
  const gate = service.gate(id, { action: 'check' }).gate
  const raw = service.store.get(id)
  return { state: raw, gate, plan: planNext(raw, { gate }) }
}

test('fresh campaign plans the one missing scoping field', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const { plan } = planOf(service, id)
    assert.equal(plan.stage, 'scoping')
    assert.equal(plan.gateOk, false)
    assert.equal(plan.primary.tool, 'rsx_campaign')
    assert.equal(plan.primary.args.action, 'world')
    assert.deepEqual(plan.primary.unblocks, ['world_question'])
    assert.match(plan.primary.args.value, /温度升高/u)
    assert.equal(plan.primary.args.value.startsWith('<'), false)
    assert.equal(plan.primary.human, false)
    assert.equal(plan.stop.blocked, false)
  } finally {
    cleanup()
  }
})

test('survey starts with a real search, not a source template', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    passScoping(service, id)
    const { plan } = planOf(service, id)
    assert.equal(plan.stage, 'survey')
    assert.equal(plan.primary.tool, 'rsx_search')
    assert.equal(plan.primary.args.provider, 'both')
    assert.ok(plan.primary.args.query.length > 0)
    assert.ok(plan.primary.unblocks.includes('min_sources'))
    assert.ok(plan.steps.some((item) => item.tool === 'rsx_campaign' && item.args.action === 'search'))
    assert.ok(plan.programMissing.length > 0)
  } finally {
    cleanup()
  }
})

test('hypothesis stage plans a complete testable claim record', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    passScoping(service, id)
    passSurvey(service, id)
    const { plan } = planOf(service, id)
    assert.equal(plan.stage, 'hypothesis')
    assert.equal(plan.primary.tool, 'rsx_claim')
    assert.equal(plan.primary.args.action, 'add')
    assert.equal(plan.primary.args.kind, 'hypothesis')
    assert.ok(plan.primary.args.falsifier)
    assert.ok(plan.primary.args.killCriterion)
  } finally {
    cleanup()
  }
})

test('review-stage programme gaps are expanded into concrete program calls', () => {
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
    const { plan } = planOf(service, id)
    assert.equal(plan.stage, 'review')
    assert.equal(plan.primary.tool, 'rsx_review')
    assert.ok(plan.programMissing.length > 0)
    const programSteps = plan.steps.filter((item) => item.tool === 'rsx_program')
    assert.ok(programSteps.length >= 1)
    assert.ok(programSteps.some((item) => item.args.action === 'plan'))
  } finally {
    cleanup()
  }
})

test('a released campaign stops with export and handoff', () => {
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
    passRelease(service, id)
    const { plan } = planOf(service, id)
    assert.equal(plan.stage, 'release')
    assert.equal(plan.gateOk, true)
    assert.equal(plan.stop.ready, true)
    assert.equal(plan.primary.tool, 'rsx_write')
    assert.equal(plan.primary.args.action, 'export')
    assert.match(nextSummary(plan), /READY/u)
  } finally {
    cleanup()
  }
})

test('a passing release gate outranks a terminal cycle stop', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const state = service.store.get(id)
    state.stage = 'release'
    state.cycles = [{ id: 'K-0001', decision: 'stop' }]
    const plan = planNext(state, {
      gate: { stage: 'release', ok: true, checks: [], blocking: [], waived: [], passed: 1, total: 1 },
      integrity: { chainOk: true, stateOk: true, artifactProblems: [] },
    })
    assert.equal(plan.stop.ready, true)
    assert.equal(plan.stop.blocked, false)
    assert.equal(plan.primary.args.action, 'export')
  } finally {
    cleanup()
  }
})
test('budget overrun stops the loop instead of recommending more work', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const state = service.store.get(id)
    state.budget.stages.scoping.tokensUsed = state.budget.stages.scoping.tokensLimit + 1
    const plan = planNext(state, { gate: service.gate(id, { action: 'check' }).gate })
    assert.equal(plan.stop.blocked, true)
    assert.equal(plan.stop.code, 'budget')
    assert.equal(plan.primary, null)
  } finally {
    cleanup()
  }
})

test('an integrity failure stops the loop and asks for inspection', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const state = service.store.get(id)
    const plan = planNext(state, {
      gate: service.gate(id, { action: 'check' }).gate,
      integrity: { chainOk: false, stateOk: true, artifactProblems: [] },
    })
    assert.equal(plan.stop.blocked, true)
    assert.equal(plan.stop.code, 'integrity')
    assert.equal(plan.stop.escalate, true)
    assert.equal(plan.primary, null)
  } finally {
    cleanup()
  }
})

test('stop and escalate decisions are respected', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const state = service.store.get(id)
    state.autonomy = { maxCycles: 2 }
    state.cycles = [{ id: 'K-0001', decision: 'stop' }]
    const gate = service.gate(id, { action: 'check' }).gate
    assert.equal(planNext(state, { gate }).stop.code, 'cycle_stop')
    state.cycles[0].decision = 'escalate'
    const escalated = planNext(state, { gate })
    assert.equal(escalated.stop.code, 'cycle_escalate')
    assert.equal(escalated.stop.escalate, true)
    state.cycles = [{ id: 'K-0001', decision: 'continue' }, { id: 'K-0002', decision: 'continue' }]
    const exhausted = planNext(state, { gate })
    assert.equal(exhausted.stop.code, 'cycle_budget')
    assert.equal(exhausted.stop.escalate, true)
  } finally {
    cleanup()
  }
})

test('a pre-registration locked after data stops the loop', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    passScoping(service, id)
    passSurvey(service, id)
    passHypothesis(service, id)
    passDesign(service, id)
    passExecute(service, id)
    const state = service.store.get(id)
    state.prereg.lockedAt = new Date(Date.now() + 60_000).toISOString()
    const plan = planNext(state, { gate: service.gate(id, { action: 'check' }).gate })
    assert.equal(plan.stop.blocked, true)
    assert.equal(plan.stop.code, 'prereg_timing')
    assert.equal(plan.stop.escalate, true)
  } finally {
    cleanup()
  }
})

test('invalid input is rejected rather than guessed', () => {
  assert.throws(() => planNext(null), (error) => error.code === 'invalid_input')
})








