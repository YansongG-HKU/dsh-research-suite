import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

import { checkGate } from '../../lib/gates.js'
import {
  addHypothesis,
  addSources,
  createCampaign,
  makeService,
  manuscriptText,
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
  service.extractionAdd(id, {
    source: 'S-0001',
    dimension: 'sample_size',
    value: 8,
    quote: '这是第 1 篇来源的正文内容。',
    locator: 'p.1',
    confidence: 0.8,
  })
  passHypothesis(service, id)
  passDesign(service, id)
  const executed = passExecute(service, id)
  const analyzed = passAnalyze(service, id, executed.main.id)
  passWrite(service, id, analyzed.number.id)
  passReview(service, id)
  passRelease(service, id)
  service.monitor(id, {
    status: 'active',
    plan: '发布后每周复查主指标与负对照；出现漂移则暂停使用并回到 analyze 重新评估。',
    owner: 'YG',
    cadence: 'weekly',
    signals: ['accuracy'],
    metrics: [{ name: 'accuracy', target: 0.9, tolerance: 0.02, direction: 'higher' }],
    observations: [{ metric: 'accuracy', value: 0.95, at: '2026-01-01T00:00:00.000Z' }],
  })
  service.evaluate(id)
  return { id, run: executed.main, number: analyzed.number }
}

test('schema 2 blocks primary sources without independence or risk of bias; legacy schema is advisory', () => {
  const { service, store, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    for (let index = 1; index <= 8; index += 1) {
      service.sourceAdd(id, {
        title: `paper ${index}`,
        year: 2024,
        reliability: index <= 2 ? 'primary' : 'secondary',
        content: `content ${index}`,
      })
    }
    service.search(id, { disconfirming: true, query: 'null result' })
    service.world(id, { action: 'set', kind: 'coverage', key: 'a', value: '1' })
    service.world(id, { action: 'set', kind: 'coverage', key: 'b', value: '2' })
    const strict = checkGate(store.get(id), 'survey')
    assert.ok(strict.blocking.includes('source_independence'))
    assert.ok(strict.blocking.includes('source_rob'))
    const legacy = store.get(id)
    legacy.schema = 1
    const advisory = checkGate(legacy, 'survey')
    assert.equal(advisory.ok, true, JSON.stringify(advisory.blocking))
    assert.equal(advisory.checks.find((item) => item.code === 'source_independence').blocking, false)
  } finally {
    cleanup()
  }
})

test('claim update fills warrant, counter-evidence and certainty so analyze can pass', () => {
  const { service, store, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const claim = service.claimAdd(id, { statement: 'temperature raises the rate' }).claim
    const run = service.runRecord(id, { command: 'python x.py', status: 'success', seed: 7, metrics: { r: 0.4 } }).run
    service.numberAdd(id, { name: 'r', value: 0.4, trace: `run:${run.id}#r`, uncertainty: 'CI' })
    service.claimStatus(id, { claim: claim.id, status: 'supported' })
    const blocked = checkGate(store.get(id), 'analyze')
    assert.ok(blocked.blocking.includes('claim_warrant'))
    assert.ok(blocked.blocking.includes('claim_certainty'))
    assert.ok(blocked.blocking.includes('claim_counter_evidence'))
    service.claimUpdate(id, {
      claim: claim.id,
      warrant: 'At fixed substrate concentration a larger rate constant raises the initial rate.',
      counterEvidence: 'Searched for null results in the same temperature range; none found.',
      certainty: 'moderate',
    })
    service.sensitivityAdd(id, {
      claim: claim.id,
      name: 'alternative model',
      method: 'alternative-model',
      specification: '改用秩相关而不是 Pearson 相关，检查方向是否稳定。',
      result: '秩相关仍为正，方向一致。',
      direction: 'consistent',
      trace: `run:${run.id}#r`,
    })
    const passed = checkGate(store.get(id), 'analyze')
    assert.equal(passed.ok, true, JSON.stringify(passed.blocking))
  } finally {
    cleanup()
  }
})

test('a locked pre-registration rejects silent edits and records an attributed amendment', () => {
  const { service, store, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    service.prereg(id, {
      metric: 'r',
      n: 10,
      analysisPlan: 'linear model with batch effect',
      stoppingRule: 'fixed n',
      seed: 3,
      controls: ['negative'],
      envLock: 'python 3.12',
      alpha: '0.05',
      power: '0.8',
    })
    const locked = store.get(id).prereg
    assert.equal(locked.hash, locked.lockedHash)
    assert.throws(
      () => service.prereg(id, { metric: 'r', n: 20, analysisPlan: 'linear model with batch effect', stoppingRule: 'fixed n', seed: 3, controls: ['negative'], envLock: 'python 3.12' }),
      (error) => error.code === 'prereg_locked',
    )
    assert.throws(
      () => service.prereg(id, { metric: 'r', n: 20, analysisPlan: 'linear model with batch effect', stoppingRule: 'fixed n', seed: 3, controls: ['negative'], envLock: 'python 3.12', amend: true, reason: 'short' }),
      (error) => error.code === 'invalid_input',
    )
    const amended = service.prereg(id, {
      metric: 'r',
      n: 20,
      analysisPlan: 'linear model with batch effect',
      stoppingRule: 'fixed n',
      seed: 3,
      controls: ['negative'],
      envLock: 'python 3.12',
      amend: true,
      reason: '样本量计算修正：原 n 未计入批次重复，改为 20。',
    })
    assert.equal(amended.prereg.lockedHash, locked.lockedHash)
    assert.notEqual(amended.prereg.hash, locked.lockedHash)
    assert.equal(amended.prereg.amendments.length, 1)
    assert.match(amended.prereg.amendments[0].reason, /样本量/)
  } finally {
    cleanup()
  }
})

test('a structured waiver can unblock one check but never a protected integrity check', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    for (const protectedCode of ['chain_integrity', 'human_approval']) {
      assert.throws(
        () =>
          service.gate(id, {
            action: 'waive',
            code: protectedCode,
            reason: '这是一次足够长的理由，但受保护校验不允许被豁免。',
            approvedBy: 'YG',
            expiresAt: '2099-01-01',
          }),
        (error) => error.code === 'invalid_input',
      )
    }
    const waived = service.gate(id, {
      action: 'waive',
      code: 'world_question',
      reason: '本次为内部预研，先用外部问题陈述替代世界模型记录。',
      approvedBy: 'YG',
      expiresAt: '2099-01-01',
    })
    assert.equal(waived.waiver.code, 'world_question')
    assert.equal(waived.gate.blocking.includes('world_question'), false)
    assert.equal(waived.gate.waived[0].code, 'world_question')
    const advanced = service.gate(id, { action: 'advance' })
    assert.equal(advanced.stage, 'survey')
    const history = service.gate(id, { action: 'history' }).gates
    assert.ok(history.some((gate) => gate.waived?.some((row) => row.code === 'world_question')))
  } finally {
    cleanup()
  }
})

test('an expired waiver is rejected instead of silently applying', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    assert.throws(
      () =>
        service.gate(id, {
          action: 'waive',
          code: 'world_question',
          reason: '这条理由足够长，但到期日已经过去，不能生效。',
          approvedBy: 'YG',
          expiresAt: '2020-01-01',
        }),
      (error) => error.code === 'invalid_input',
    )
  } finally {
    cleanup()
  }
})

test('an expired waiver stays in history without silencing the check or blocking as corrupt', () => {
  const { service, store, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const state = store.get(id)
    state.waivers = [
      {
        id: 'W-0001',
        code: 'world_question',
        reason: '这条理由是历史记录，足够长但不是永久有效。',
        approvedBy: 'YG',
        expiresAt: '2020-01-01',
        scope: 'campaign',
        createdAt: '2020-01-01T00:00:00.000Z',
      },
    ]
    store.save(state)
    const gate = service.gate(id, { action: 'check' }).gate
    assert.ok(gate.blocking.includes('world_question'))
    const audit = service.audit(id, { record: false }).audit
    assert.ok(audit.findings.some((row) => row.code === 'waiver_expired' && row.severity === 'info'))
    assert.equal(audit.blocking.includes('waiver_invalid'), false)
  } finally {
    cleanup()
  }
})

test('a human approval goes stale when substantive evidence changes', () => {
  const { service, cleanup } = makeService()
  try {
    const { id } = fullCampaign(service)
    const approvals = service.gate(id, { action: 'approvals' })
    assert.equal(approvals.latest.approver, 'YG')
    assert.equal(approvals.latest.fresh, true)
    service.evidenceAdd(id, {
      claim: 'C-0002',
      relation: 'context',
      ref: 'S-0003',
      quote: '反应体系在 60°C 以上会快速失活',
    })
    const after = service.gate(id, { action: 'approvals' })
    assert.equal(after.latest.fresh, false)
    service.gate(id, {
      action: 'approve',
      approver: 'YG',
      role: 'human-reviewer',
      statement: '重新核对新增证据后再次批准发布。',
    })
    const fresh = service.gate(id, { action: 'approvals' })
    assert.equal(fresh.latest.fresh, true)
  } finally {
    cleanup()
  }
})

test('review packet exposes warrants and the lexical entailment screen flags unrelated quotes', () => {
  const { service, cleanup } = makeService()
  try {
    const { id } = fullCampaign(service)
    const result = service.reviewPacket(id)
    assert.equal(result.packet.claims.length, 2)
    assert.ok(result.packet.claims.every((claim) => claim.warrant))
    assert.equal(result.packet.questions.length, 12)
    assert.match(result.markdown, /REVIEW|评审问题/u)
    assert.equal(result.entailment.weak.length, 0)
    service.evidenceAdd(id, {
      claim: 'C-0001',
      relation: 'supports',
      ref: 'S-0004',
      quote: 'completely unrelated words about weather',
    })
    const screened = service.reviewEntailment(id).entailment
    assert.ok(screened.weak.some((row) => row.claim === 'C-0001'))
    const audit = service.audit(id, { record: false }).audit
    assert.ok(audit.findings.some((row) => row.code === 'claim_evidence_weak'))
  } finally {
    cleanup()
  }
})

test('the exported reproduction package has commands, seeds, a negative control and checksums', () => {
  const { service, cleanup } = makeService()
  try {
    const { id, run } = fullCampaign(service)
    const exported = service.write(id, { action: 'export' })
    for (const key of ['repro', 'reproJson', 'checksums', 'packet', 'contribution', 'search', 'sensitivity']) {
      assert.ok(existsSync(exported.paths[key]), `${key} should be exported`)
    }
    assert.match(readFileSync(exported.paths.search, 'utf8'), /检索协议/u)
    assert.match(readFileSync(exported.paths.sensitivity, 'utf8'), /leave-one-batch-out/u)
    const manifest = JSON.parse(readFileSync(exported.paths.reproJson, 'utf8'))
    assert.equal(manifest.runs.length, 2)
    assert.equal(manifest.controls.negative.endsWith(run.id), false)
    assert.ok(manifest.runs.every((item) => item.command && item.seed !== null))
    assert.ok(manifest.checksums.length >= 1)
    assert.match(readFileSync(exported.paths.repro, 'utf8'), /复现包/u)
  } finally {
    cleanup()
  }
})

test('portfolio and exploration graph summarise campaigns without mutation', () => {
  const { service, cleanup } = makeService()
  try {
    const { id } = fullCampaign(service)
    const graph = service.explorationGraph(id)
    assert.ok(graph.nodes.some((node) => node.type === 'claim'))
    assert.ok(graph.edges.some((edge) => edge.type === 'supports'))
    service.evaluate(id)
    const portfolio = service.portfolio()
    assert.ok(portfolio.campaigns.some((row) => row.id === id))
    const row = portfolio.campaigns.find((item) => item.id === id)
    assert.equal(row.stage, 'release')
    assert.equal(row.releasePassed, true)
    assert.equal(row.attention, false)
    assert.equal(row.integrity.chainOk, true)
    assert.ok(portfolio.totals.l4 >= 1)
    assert.ok(portfolio.totals.released >= 1)
    assert.equal(portfolio.totals.archived, 0)
  } finally {
    cleanup()
  }
})

test('all new source, claim, review, gate and write actions are exposed', async () => {
  const { createTools } = await import('../../lib/tools.js')
  const tools = createTools({ service: {} })
  const byName = new Map(tools.map((tool) => [tool.name, tool]))
  assert.ok(byName.get('rsx_source').parameters.properties.action.enum.includes('update'))
  assert.ok(byName.get('rsx_claim').parameters.properties.action.enum.includes('update'))
  assert.ok(byName.get('rsx_review').parameters.properties.action.enum.includes('packet'))
  assert.ok(byName.get('rsx_gate').parameters.properties.action.enum.includes('approve'))
  assert.ok(byName.get('rsx_write').parameters.properties.action.enum.includes('repro'))
  assert.ok(byName.get('rsx_campaign').parameters.properties.action.enum.includes('portfolio'))
  assert.ok(byName.get('rsx_campaign').parameters.properties.action.enum.includes('searchLog'))
  assert.ok(byName.get('rsx_claim').parameters.properties.action.enum.includes('sensitivity'))
  assert.ok(byName.get('rsx_campaign').parameters.properties.hits)
  assert.ok(byName.get('rsx_claim').parameters.properties.direction)
})
