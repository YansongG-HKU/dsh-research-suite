import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ResearchStore } from '../lib/ledger.js'
import { ResearchService } from '../lib/service.js'
import { resolveConfig } from '../lib/config.js'

export function makeService() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-rs-'))
  const store = new ResearchStore({ dir }).init()
  const service = new ResearchService({ store, config: resolveConfig({}), log: { info() {}, warn() {} } })
  return {
    dir,
    store,
    service,
    cleanup() {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* Windows may hold a handle briefly */
      }
    },
  }
}

export function createCampaign(service) {
  const created = service.create({
    title: '测试研究',
    question: '温度升高是否显著改变酶促反应速率？',
    scope: '只讨论体外纯化酶，温度 20–60°C，不涉及体内环境。',
    success: '主指标斜率方向明确且 95% 置信区间不含 0。',
    tier: 'M',
  })
  return created.campaign.id
}

export function passScoping(service, id) {
  service.world(id, { action: 'set', kind: 'question', key: 'main', value: '温度对酶促反应速率的影响' })
  const result = service.gate(id, { action: 'advance' })
  return result
}

export function addSources(service, id, count = 8) {
  for (let i = 1; i <= count; i += 1) {
    service.sourceAdd(id, {
      title: `酶动力学研究 ${i}`,
      year: i === 1 ? 2024 : 2020,
      kind: 'paper',
      reliability: i <= 2 ? 'primary' : 'secondary',
      content: `这是第 ${i} 篇来源的正文内容，用于测试内容捕获与哈希。`,
      url: `https://example.org/paper/${i}`,
    })
  }
}

export function passSurvey(service, id) {
  addSources(service, id, 8)
  service.search(id, { disconfirming: true, query: 'enzyme temperature null result' })
  service.world(id, { action: 'set', kind: 'coverage', key: 'in-vitro', value: 'covered by S-0001..S-0008' })
  service.world(id, { action: 'set', kind: 'coverage', key: 'in-vivo', value: 'out of scope' })
  return service.gate(id, { action: 'advance' })
}

export function addHypothesis(service, id) {
  const hypothesis = service.claimAdd(id, {
    kind: 'hypothesis',
    statement: '温度从 20°C 升到 40°C 会提高酶促反应初速度。',
    falsifier: '若 40°C 的初速度不高于 20°C，且置信区间排除正效应。',
    killCriterion: '负对照显示同等升温幅度下无差异时放弃该假设。',
    predicted: '40°C 的初速度比 20°C 高至少 30%。',
    metricName: 'initial_rate',
    metricUnit: 'umol/min',
    confidence: 0.6,
  }).claim
  const again = service.claimAdd(id, {
    statement: '反应体系在 60°C 以上会快速失活。',
    confidence: 0.5,
  }).claim
  service.evidenceAdd(id, { claim: hypothesis.id, relation: 'supports', ref: 'S-0001', locator: 'p.4', quote: 'rate increases with temperature up to 40C' })
  service.evidenceAdd(id, { claim: hypothesis.id, relation: 'supports', ref: 'S-0002', locator: 'Fig.2', quote: 'initial rate doubled at 40C' })
  service.world(id, { action: 'set', kind: 'novelty', key: 'nearest', value: 'S-0002 studies a different enzyme family' })
  service.world(id, { action: 'set', kind: 'novelty', key: 'checked', value: true })
  return { hypothesis, again }
}

export function passHypothesis(service, id) {
  addHypothesis(service, id)
  return service.gate(id, { action: 'advance' })
}

export function passDesign(service, id) {
  service.prereg(id, {
    metric: 'initial_rate',
    n: 200,
    analysisPlan: '线性混合模型，温度为主效应，批次为随机效应。',
    stoppingRule: '固定 200 次测量后停止，不按结果提前停。',
    seed: 7,
    controls: ['negative'],
    envLock: 'node 22 / python 3.12 / numpy 2.1',
  })
  return service.gate(id, { action: 'advance' })
}

export function passExecute(service, id) {
  const main = service.runRecord(id, {
    command: 'python work/exp.py --seed 7',
    status: 'success',
    seed: 7,
    metrics: { pearson_r: 0.4461, p_value: 0.0005 },
  }).run
  service.runRecord(id, {
    command: 'python work/exp.py --seed 7 --permute-labels',
    status: 'success',
    seed: 7,
    control: 'negative',
    metrics: { pearson_r: -0.0399 },
  })
  return { main, ...service.gate(id, { action: 'advance' }) }
}

export function passAnalyze(service, id, runId) {
  const number = service.numberAdd(id, {
    name: 'Pearson r',
    value: 0.4461,
    unit: 'r',
    uncertainty: '95% CI 0.31–0.57',
    trace: `run:${runId}#pearson_r`,
  }).number
  service.claimStatus(id, { claim: 'C-0001', status: 'supported', reason: '主运行与文献一致' })
  service.claimStatus(id, { claim: 'C-0002', status: 'supported', reason: '文献支持高温失活' })
  return { number, ...service.gate(id, { action: 'advance' }) }
}

export function manuscriptText(numberId) {
  return [
    '# 温度对酶促反应速率的影响',
    '',
    '本研究在体外纯化酶体系上检验温度与初速度的关系。我们把 20°C 到 40°C 的升温作为处理，初速度作为主指标。',
    '',
    `主运行得到 Pearson r = {{${numberId}}}，与文献方向一致 [[src:S-0001]]，并与另一份独立数据吻合 [[src:S-0002]]。`,
    '',
    '负对照使用标签置换，未观察到同等效应，说明结果不太可能来自随机波动。',
    '',
    '局限：只覆盖体外体系，温度上限为 40°C；60°C 以上失活未在本实验中直接测量，仅由文献支持。',
    '',
    '结论：在体外纯化酶体系中，20–40°C 区间内升温与初速度正相关，效应方向稳定。',
  ].join('\n')
}

export function passWrite(service, id, numberId) {
  // 20/40/60 are method constants stated up front; everything else must trace.
  service.update(id, { numbersAllowlist: '1,2,3,20,40,60' })
  service.write(id, { action: 'manuscript', text: manuscriptText(numberId) })
  return service.gate(id, { action: 'advance' })
}

export function passReview(service, id) {
  service.audit(id)
  service.gate(id, {
    action: 'review',
    reviewer: '方法与统计评审',
    affiliation: '独立统计评审组',
    conflict: 'none',
    independent: true,
    adversarial: false,
    verdict: 'minor',
    issues: [{ severity: 'minor', title: '补充批次效应说明', resolved: true }],
    notes: '结构完整，统计前提写清楚了。',
  })
  service.gate(id, {
    action: 'review',
    reviewer: '红队评审',
    affiliation: '独立红队',
    conflict: 'none',
    independent: true,
    adversarial: true,
    verdict: 'accept',
    issues: [{ severity: 'major', title: '温度上限外推需谨慎', resolved: true }],
    notes: '最强反驳是外推，但稿件已经声明局限，可以接受。',
  })
  return service.gate(id, { action: 'advance' })
}

export function passRelease(service, id) {
  service.world(id, { action: 'set', kind: 'safety', key: 'dual_use', value: 'pass' })
  service.write(id, {
    action: 'declaration',
    ai: true,
    watermark: true,
    model: 'DeepSeek Harness test',
    humanReviewer: 'YG',
  })
  return service.gate(id, { action: 'advance' })
}
