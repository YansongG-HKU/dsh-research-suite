import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

import {
  DOMAINS,
  DOMAIN_IDS,
  GENERAL_DOMAIN,
  domainChecks,
  domainCompleteness,
  domainValueDefaults,
  fieldSatisfied,
  getDomain,
  listDomains,
  renderDomainMarkdown,
  validateDomainValues,
} from '../../lib/domains.js'
import { checkGate } from '../../lib/gates.js'
import { runAudit } from '../../lib/audit.js'
import {
  createCampaign,
  passAnalyze,
  passDesign,
  passExecute,
  passHypothesis,
  passScoping,
  passStewardship,
  passSurvey,
  passWrite,
  makeService,
  seedProgram,
} from '../helpers.mjs'

function domainCampaign(service, domain = 'finance') {
  const created = service.create({
    title: `${domain} 领域测试`,
    question: '这个领域的研究结论能否被可执行检查约束住？',
    scope: '本地合成数据与公开标准文本，不涉及真实受试者或交易。',
    success: '九道闸门全部通过，领域字段、角色与监测计划均有记录。',
    tier: 'M',
    domain,
  })
  return created.campaign.id
}

function fillStage(service, id, profile, stage) {
  const defaults = domainValueDefaults(profile)
  const values = {}
  for (const field of profile.fields.filter((item) => item.stage === stage)) {
    values[field.id] = defaults[field.id]
  }
  service.domain(id, { action: 'set', domain: profile.id, values })
}

test('domain registry exposes four complete profiles and stage-mapped fields', () => {
  assert.equal(DOMAINS.length, 4)
  assert.deepEqual([...DOMAIN_IDS], ['finance', 'ai', 'medicine', 'industrial'])
  for (const domain of DOMAINS) {
    assert.ok(domain.title.zh && domain.title.en)
    assert.ok(domain.summary.zh && domain.summary.en)
    assert.ok(domain.fields.length >= 20, `${domain.id} should have a substantive field set`)
    assert.ok(domain.standards.length >= 4, `${domain.id} should cite several standards`)
    assert.ok(
      domain.standards.every((item) => item.status === 'current' && /^\d{4}-\d{2}-\d{2}$/u.test(item.reviewedAt)),
      `${domain.id} standards need a lifecycle status and review date`,
    )
    assert.equal(domain.reviewRoles.length, 2)
    assert.equal(domain.monitoring.required, true)
    for (const field of domain.fields) {
      assert.ok(['scoping', 'survey', 'hypothesis', 'design', 'execute', 'analyze', 'write', 'review', 'release'].includes(field.stage))
      assert.ok(field.label.zh && field.id)
      if (field.type === 'enum') assert.ok(field.options.length >= 2)
    }
  }
  assert.equal(getDomain('finance').id, 'finance')
  assert.equal(getDomain('missing'), null)
  assert.equal(listDomains().length, 4)
  assert.equal(listDomains()[0].standards.length >= 4, true)
})

test('domain set validates ids and unknown fields, and general clears the profile', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    assert.throws(
      () => service.domain(id, { action: 'set', domain: 'astrology' }),
      (error) => error.code === 'invalid_input' && error.detail.available.includes('finance'),
    )
    assert.throws(
      () => service.domain(id, { action: 'set', domain: 'ai', values: { not_a_field: 'x' } }),
      (error) => error.code === 'invalid_input' && error.detail.errors.some((item) => item.includes('not_a_field')),
    )
    const selected = service.domain(id, { action: 'set', domain: 'ai' })
    assert.equal(selected.domainId, 'ai')
    assert.equal(selected.completeness.missing > 0, true)
    assert.equal(selected.domain.reviewRoles[0].id, 'ml')
    const cleared = service.domain(id, { action: 'set', domain: GENERAL_DOMAIN })
    assert.equal(cleared.domainId, GENERAL_DOMAIN)
    assert.equal(cleared.domain, null)
    assert.equal(domainChecks(service.store.get(id), 'scoping').length, 0)
  } finally {
    cleanup()
  }
})

test('domain fields become blocking gate checks and pass when registered', () => {
  const { service, store, cleanup } = makeService()
  try {
    const id = domainCampaign(service, 'finance')
    service.world(id, { action: 'set', kind: 'question', key: 'main', value: '回测结论是否稳健' })
    const profile = getDomain('finance')
    let gate = checkGate(store.get(id), 'scoping')
    assert.ok(gate.blocking.includes('domain_finance_mandate'))
    assert.ok(gate.blocking.includes('domain_finance_universe'))
    fillStage(service, id, profile, 'scoping')
    gate = checkGate(store.get(id), 'scoping')
    assert.equal(gate.ok, true, JSON.stringify(gate.blocking))
    assert.equal(gate.checks.some((item) => item.code === 'domain_finance_mandate' && item.ok), true)
  } finally {
    cleanup()
  }
})

test('finance enforces the out-of-sample date order at design', () => {
  const { service, store, cleanup } = makeService()
  try {
    const id = domainCampaign(service, 'finance')
    const profile = getDomain('finance')
    fillStage(service, id, profile, 'design')
    service.domain(id, {
      action: 'set',
      domain: 'finance',
      values: { in_sample_end: '2025-12-31', oos_start: '2024-01-01' },
    })
    service.prereg(id, {
      metric: 'net_sharpe',
      n: 120,
      analysisPlan: '固定样本外评估，成本翻倍与参数扰动做敏感性分析。',
      stoppingRule: '固定样本外窗口，不按结果延长。',
      seed: 11,
      controls: ['negative'],
      envLock: 'python 3.12 / pandas 2.2',
    })
    const gate = checkGate(store.get(id), 'design')
    assert.ok(gate.blocking.includes('domain_finance_oos_after_in_sample'))
    service.domain(id, {
      action: 'set',
      domain: 'finance',
      values: { in_sample_end: 'N/A — 本研究没有样本内切分', oos_start: 'N/A — 本研究没有样本外切分' },
    })
    const waived = domainChecks(store.get(id), 'design')
    assert.equal(waived.some((item) => item.code === 'domain_finance_oos_after_in_sample'), false)
    assert.equal(waived.find((item) => item.code === 'domain_finance_in_sample_end').ok, true)
  } finally {
    cleanup()
  }
})

test('medicine enforces PRISMA count monotonicity', () => {
  const { service, store, cleanup } = makeService()
  try {
    const id = domainCampaign(service, 'medicine')
    const profile = getDomain('medicine')
    fillStage(service, id, profile, 'survey')
    service.domain(id, {
      action: 'set',
      domain: 'medicine',
      values: { study_design: 'systematic-review', prisma_identified: 5, prisma_included: 9 },
    })
    const gate = checkGate(store.get(id), 'survey')
    assert.ok(gate.blocking.includes('domain_medicine_prisma_included_lte_identified'))
  } finally {
    cleanup()
  }
})

test('domain review roles and monitoring are separate blocking checks', () => {
  const { service, store, cleanup } = makeService()
  try {
    const id = domainCampaign(service, 'ai')
    service.gate(id, { action: 'review', reviewer: 'ML reviewer', affiliation: '独立 ML 评审组', conflict: 'none', role: 'ml', verdict: 'minor', notes: 'ml only' })
    let review = checkGate(store.get(id), 'review')
    assert.ok(review.blocking.includes('domain_ai_review_safety'))
    assert.equal(review.blocking.includes('domain_ai_review_ml'), false)
    service.gate(id, { action: 'review', reviewer: 'Safety reviewer', affiliation: '独立安全评审组', conflict: 'none', role: 'safety', adversarial: true, verdict: 'accept', notes: 'safety' })
    review = checkGate(store.get(id), 'review')
    assert.equal(review.blocking.includes('domain_ai_review_safety'), false)

    let release = checkGate(store.get(id), 'release')
    assert.ok(release.blocking.includes('domain_ai_monitoring'))
    service.monitor(id, {
      plan: '上线后每周检查数据漂移、校准与安全事件，触发回滚阈值。',
      owner: 'YG',
      cadence: 'weekly',
      status: 'planned',
      signals: ['data_drift', 'safety_incident'],
    })
    release = checkGate(store.get(id), 'release')
    assert.equal(release.blocking.includes('domain_ai_monitoring'), false)
  } finally {
    cleanup()
  }
})

test('audit reports missing domain fields and a stale profile as blocking', () => {
  const { service, cleanup } = makeService()
  try {
    const id = domainCampaign(service, 'medicine')
    const audit = runAudit(service.store.get(id), { integrity: service.store.verify(id) })
    assert.equal(audit.blocking.includes('domain_medicine_population'), true)
    assert.equal(audit.findings.some((item) => item.code === 'domain_medicine_population'), true)
    assert.equal(audit.subjectHash.length, 64)
  } finally {
    cleanup()
  }
})

test('domain export writes DOMAIN.md and includes it in the bundle', () => {
  const { service, cleanup } = makeService()
  try {
    const id = domainCampaign(service, 'industrial')
    service.monitor(id, { status: 'active', plan: '试产阶段每周跟踪 SPC 与校准到期，异常即停线复核。', owner: '质量负责人', cadence: 'weekly' })
    const exported = service.write(id, { action: 'export' })
    assert.ok(existsSync(exported.paths.domain))
    const markdown = readFileSync(exported.paths.domain, 'utf8')
    assert.match(markdown, /工业与工程研究/u)
    assert.match(markdown, /ISO\/IEC 17025/u)
    assert.match(markdown, /发布后监测/u)
    const report = service.report(id).markdown
    assert.match(report, /## 1\.1 领域研究档案/u)
    assert.match(report, /## 18\. 发布后监测/u)
    const zip = readFileSync(exported.paths.bundle)
    assert.ok(zip.includes(Buffer.from('DOMAIN.md')))
    const provenance = JSON.parse(readFileSync(exported.paths.provenance, 'utf8'))
    assert.equal(provenance.entity['dsh:campaign']['dsh:domain'], 'industrial')
    assert.equal(provenance.entity['dsh:campaign']['dsh:monitoringStatus'], 'active')
    const crate = JSON.parse(readFileSync(exported.paths.roCrate, 'utf8'))
    const campaign = crate['@graph'].find((node) => node['@id'] === '#campaign')
    assert.ok(campaign.keywords.includes('industrial'))
  } finally {
    cleanup()
  }
})

test('templates carry a domain profile into the campaign', () => {
  const { service, cleanup } = makeService()
  try {
    const applied = service.templateApply({ template: 'quant-backtest', topic: '动量策略' })
    assert.equal(applied.campaign.domain, 'finance')
    assert.equal(applied.domain.id, 'finance')
    const ai = service.templateApply({ template: 'ml-pipeline', topic: '睡眠分期' })
    assert.equal(ai.campaign.domain, 'ai')
    const industrial = service.templateApply({ template: 'industrial-doe', topic: '焊接窗口' })
    assert.equal(industrial.campaign.domain, 'industrial')
  } finally {
    cleanup()
  }
})

test('full AI campaign runs all nine gates with domain fields, roles and monitoring', () => {
  const { service, store, cleanup } = makeService()
  try {
    const id = domainCampaign(service, 'ai')
    const profile = getDomain('ai')

    fillStage(service, id, profile, 'scoping')
    assert.equal(passScoping(service, id).stage, 'survey')

    fillStage(service, id, profile, 'survey')
    assert.equal(passSurvey(service, id).stage, 'hypothesis')

    assert.equal(passHypothesis(service, id).stage, 'design')

    fillStage(service, id, profile, 'design')
    assert.equal(passDesign(service, id).stage, 'execute')

    fillStage(service, id, profile, 'execute')
    const executed = passExecute(service, id)
    assert.equal(executed.stage, 'analyze')

    fillStage(service, id, profile, 'analyze')
    const analyzed = passAnalyze(service, id, executed.main.id)
    assert.equal(analyzed.stage, 'write')

    fillStage(service, id, profile, 'write')
    assert.equal(passWrite(service, id, analyzed.number.id).stage, 'review')
    seedProgram(service, id)

    service.gate(id, {
      action: 'review',
      reviewer: 'ML reviewer',
      affiliation: '独立 ML 评审组',
      conflict: 'none',
      role: 'ml',
      adversarial: false,
      verdict: 'minor',
      issues: [{ severity: 'minor', title: '补充切片', resolved: true }],
      notes: 'ML review complete',
    })
    service.gate(id, {
      action: 'review',
      reviewer: 'Safety reviewer',
      affiliation: '独立安全评审组',
      conflict: 'none',
      role: 'safety',
      adversarial: true,
      verdict: 'accept',
      issues: [{ severity: 'major', title: '分布外场景需监测', resolved: true }],
      notes: 'Safety review complete',
    })
    service.audit(id)
    assert.equal(service.gate(id, { action: 'advance' }).stage, 'release')

    fillStage(service, id, profile, 'release')
    service.monitor(id, {
      plan: '上线后监控数据漂移、精度退化与安全事件，超过阈值即回滚模型。',
      owner: 'YG',
      cadence: 'weekly',
      status: 'active',
      signals: ['data_drift', 'accuracy_drift', 'safety_incident'],
    })
    service.world(id, { action: 'set', kind: 'safety', key: 'dual_use', value: 'pass' })
    service.write(id, {
      action: 'declaration',
      ai: true,
      watermark: true,
      model: 'DeepSeek Harness test',
      humanReviewer: 'YG',
    })
    passStewardship(service, id)
    service.audit(id)
    service.gate(id, {
      action: 'approve',
      approver: 'YG',
      role: 'human-reviewer',
      statement: '已核对领域协议、证据与监测计划，批准发布。',
    })
    const released = service.gate(id, { action: 'advance' })
    assert.equal(released.released, true)
    const state = store.get(id)
    assert.equal(state.stage, 'release')
    assert.equal(state.monitoring.status, 'active')
    assert.equal(store.verify(id).chainOk, true)
    assert.equal(checkGate(state, 'release').ok, true, JSON.stringify(checkGate(state, 'release').blocking))

    const exported = service.write(id, { action: 'export' })
    assert.ok(existsSync(exported.paths.domain))
    assert.match(service.report(id).markdown, /## 1\.1 领域研究档案/u)
  } finally {
    cleanup()
  }
})

test('conditional fields disappear when the design makes them inapplicable', () => {
  const { service, store, cleanup } = makeService()
  try {
    const id = domainCampaign(service, 'medicine')
    service.domain(id, { action: 'set', domain: 'medicine', values: { study_design: 'rct' } })
    const rct = domainChecks(store.get(id), 'survey')
    assert.equal(rct.some((item) => item.code.includes('prisma_')), false)
    const rctCompleteness = domainCompleteness(store.get(id))
    assert.ok(rctCompleteness.notApplicable >= 5)
    const rctMarkdown = renderDomainMarkdown(store.get(id))
    assert.match(rctMarkdown, /不适用/u)
    assert.match(rctMarkdown, /参考：仅系统综述/u)

    service.domain(id, { action: 'set', domain: 'medicine', values: { study_design: 'systematic-review' } })
    const sr = domainChecks(store.get(id), 'survey')
    assert.equal(sr.some((item) => item.code === 'domain_medicine_prisma_identified'), true)
    assert.ok(domainCompleteness(store.get(id)).required > rctCompleteness.required)

    const industrial = domainCampaign(service, 'industrial')
    service.domain(industrial, { action: 'set', domain: 'industrial', values: { design_type: 'acceptance' } })
    const acceptance = domainChecks(store.get(industrial), 'design')
    assert.equal(acceptance.some((item) => item.code === 'domain_industrial_factors'), false)
    service.domain(industrial, { action: 'set', domain: 'industrial', values: { design_type: 'doe' } })
    const doe = domainChecks(store.get(industrial), 'design')
    assert.equal(doe.some((item) => item.code === 'domain_industrial_factors'), true)
  } finally {
    cleanup()
  }
})

test('new review records need identity, conflict and independence; duplicates do not cover roles', () => {
  const { service, store, cleanup } = makeService()
  try {
    const id = domainCampaign(service, 'ai')
    service.gate(id, { action: 'review', reviewer: 'Reviewer A', role: 'ml', verdict: 'minor', notes: 'no envelope' })
    let review = checkGate(store.get(id), 'review')
    assert.ok(review.blocking.includes('domain_ai_review_ml'))

    service.gate(id, {
      action: 'review',
      reviewer: 'Reviewer B',
      affiliation: 'Independent Lab',
      conflict: 'none',
      independent: true,
      role: 'ml',
      verdict: 'minor',
      notes: 'with envelope',
    })
    review = checkGate(store.get(id), 'review')
    assert.equal(review.blocking.includes('domain_ai_review_ml'), false)
    assert.ok(review.blocking.includes('domain_ai_review_safety'))

    service.gate(id, {
      action: 'review',
      reviewer: 'Reviewer B',
      affiliation: 'Independent Lab',
      conflict: 'none',
      independent: true,
      role: 'safety',
      adversarial: true,
      verdict: 'accept',
      notes: 'same person, second role',
    })
    review = checkGate(store.get(id), 'review')
    assert.ok(review.blocking.includes('domain_ai_review_independence'))
  } finally {
    cleanup()
  }
})

test('validateDomainValues normalises numbers, enums and dates', () => {
  const profile = getDomain('medicine')
  const values = domainValueDefaults(profile)
  values.prisma_identified = '12'
  values.prisma_included = 7
  const result = validateDomainValues(profile, values)
  assert.equal(result.ok, true, result.errors.join('; '))
  assert.equal(result.values.prisma_identified, 12)
  const invalid = validateDomainValues(profile, { study_design: 'not-a-design' })
  assert.equal(invalid.ok, false)
  assert.match(invalid.errors[0], /study_design|研究设计/u)
  const dateProfile = getDomain('finance')
  const badDate = validateDomainValues(dateProfile, { in_sample_end: '2025-02-30' })
  assert.equal(badDate.ok, false)
  assert.match(badDate.errors[0], /有效日期|YYYY-MM-DD/u)
  const defaults = domainValueDefaults(dateProfile)
  assert.equal(validateDomainValues(dateProfile, defaults).ok, true)
  const waived = validateDomainValues(dateProfile, { in_sample_end: 'N/A — 本研究没有样本区间' })
  assert.equal(waived.ok, true, waived.errors.join('; '))
  assert.equal(fieldSatisfied(dateProfile.fields.find((item) => item.id === 'in_sample_end'), waived.values.in_sample_end), true)
  const waiverWithoutReason = validateDomainValues(dateProfile, { in_sample_end: 'N/A' })
  assert.equal(waiverWithoutReason.ok, false)
  assert.match(waiverWithoutReason.errors[0], /N\/A|理由/u)
})
