import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
    const primary = i <= 2
    service.sourceAdd(id, {
      title: `酶动力学研究 ${i}`,
      year: i === 1 ? 2024 : 2020,
      kind: 'paper',
      reliability: primary ? 'primary' : 'secondary',
      content: `这是第 ${i} 篇来源的正文内容。在体外纯化酶体系中，温度从 20°C 升到 40°C 会提高初速度，40°C 时初速度约为 20°C 的两倍。反应体系在 60°C 以上会快速失活，初速度显著下降。`,
      url: `https://example.org/paper/${i}`,
      ...(primary
        ? {
            independence: 'independent',
            design: 'in-vitro enzyme kinetics assay',
            riskOfBias: 'low',
            robNote: '随机化加样顺序，盲法读数，样本量足够。',
            captureMethod: 'html',
          }
        : {}),
      ...(i === 3
        ? { independence: 'same-group', design: 'secondary analysis' }
        : {}),
    })
  }
}

export function passSurvey(service, id) {
  addSources(service, id, 8)
  service.search(id, {
    disconfirming: true,
    query: 'enzyme temperature null result',
    database: 'PubMed',
    dateFrom: '2015-01-01',
    dateTo: '2025-12-31',
    hits: 120,
    screened: 40,
    included: 8,
  })
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
    warrant: '若升温提高催化速率常数，则同一底物浓度下的初速度应随温度单调上升；文献与主运行都测量同一初速度定义。',
    counterEvidence: '检索了 “enzyme temperature optimum null result” 与 “heat inactivation” 两组关键词；未发现 20–40°C 区间内方向相反的独立研究。',
    certainty: 'moderate',
  }).claim
  const again = service.claimAdd(id, {
    statement: '反应体系在 60°C 以上会快速失活。',
    confidence: 0.5,
    warrant: '超过最适温度后蛋白变性占主导，同一体系在 60°C 以上初速度应显著下降。',
    counterEvidence: '检索了热稳定酶与嗜热同源酶文献；未发现本体系在 60°C 以上仍保持初速度的证据。',
    certainty: 'low',
  }).claim
  service.evidenceAdd(id, { claim: hypothesis.id, relation: 'supports', ref: 'S-0001', locator: 'p.4', quote: '温度从 20°C 升到 40°C 会提高初速度' })
  service.evidenceAdd(id, { claim: hypothesis.id, relation: 'supports', ref: 'S-0002', locator: 'Fig.2', quote: '温度从 20°C 升到 40°C 会提高初速度，40°C 时初速度约为 20°C 的两倍' })
  service.evidenceAdd(id, { claim: again.id, relation: 'supports', ref: 'S-0003', locator: 'p.2', quote: '反应体系在 60°C 以上会快速失活' })
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
    alpha: '0.05',
    power: '0.8',
    effectSize: 'r=0.3',
    test: 'Pearson correlation with permutation negative control',
  })
  return service.gate(id, { action: 'advance' })
}

export function passExecute(service, id) {
  const stdoutPath = join(tmpdir(), `dsh-rs-stdout-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`)
  writeFileSync(stdoutPath, 'pearson_r=0.4461\np_value=0.0005\nseed=7\n', 'utf8')
  const main = service.runRecord(id, {
    command: 'python work/exp.py --seed 7',
    status: 'success',
    seed: 7,
    metrics: { pearson_r: 0.4461, p_value: 0.0005 },
    stdoutPath,
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
  service.sensitivityAdd(id, {
    claim: 'C-0001',
    name: 'leave-one-batch-out',
    method: 'leave-one-out',
    specification: '逐批剔除一个批次后重估温度主效应，检查是否由单一批次驱动。',
    result: 'r 仍在 0.41–0.46 之间，方向不变。',
    direction: 'consistent',
    trace: `run:${runId}#pearson_r`,
  })
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

export function seedProgram(service, id) {
  service.program(id, {
    action: 'plan',
    objective: '用可复核的计划、视角与锦标赛判断温度效应是否成立。',
    questions: [
      {
        question: '20–40°C 升温是否提高体外纯化酶的初速度？',
        priority: 'high',
        owner: 'lead',
        coverage: ['S-0001', 'S-0002'],
      },
      {
        question: '60°C 以上失活是否构成主效应的边界条件？',
        priority: 'medium',
        owner: 'domain-reviewer',
        coverage: ['S-0003'],
      },
    ],
  })
  service.program(id, {
    action: 'perspective',
    name: '动力学实验者',
    stakeholder: '实验团队',
    question: '升温效应在批间是否稳定？',
    sources: ['S-0001', 'S-0002'],
  })
  service.program(id, {
    action: 'perspective',
    name: '统计评审',
    stakeholder: '独立评审组',
    question: '效应是否可能由批次或标签置换解释？',
    sources: ['S-0001', 'S-0003'],
  })
  service.program(id, {
    action: 'autonomy',
    maxCycles: 4,
    stopCriteria: '主运行与负对照结果一致，或达到预注册的 200 次测量后停止。',
    escalation: '出现方向相反的独立证据时升级给人类评审。',
    humanCheckpoints: '发布前由人类评审者核对证据、复现包与局限。',
    owner: 'YG',
  })
  service.program(id, {
    action: 'cycle',
    goal: '检验升温主效应并保留负对照',
    step: '执行主运行与标签置换负对照，记录指标与 stdout。',
    observation: '主运行 r=0.4461，负对照 r=-0.0399。',
    decision: 'continue',
    question: 'G-0001',
  })
  service.program(id, {
    action: 'match',
    a: 'C-0001',
    b: 'C-0002',
    winner: 'a',
    criterion: '主运行与两条独立来源方向一致，负对照不支持随机波动解释。',
  })
  service.program(id, {
    action: 'quality',
    reviewer: '自动化质量评分',
    scope: '完整研究包',
    scores: {
      factual_accuracy: 0.86,
      citation_accuracy: 0.9,
      completeness: 0.82,
      source_quality: 0.84,
      tool_efficiency: 0.8,
      limitations: 0.88,
    },
  })
}

export function passReview(service, id) {
  seedProgram(service, id)
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

export function passStewardship(service, id) {
  return service.stewardship(id, {
    action: 'set',
    license: 'CC-BY-4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    dataAvailability: '合成夹具与导出包随仓库提供；真实数据不包含。',
    codeAvailability: '全部代码在仓库内，Node 22 可重跑。',
    competingInterests: '无。测试夹具不代表真实利益关系。',
    ethics: '不涉及人类受试者或动物实验。',
    funding: ['内部测试预算'],
    keywords: ['research-suite', 'fixture'],
    contributors: [
      {
        name: 'YG',
        roles: ['conceptualization', 'supervision', 'writing-review-editing'],
        affiliation: 'Independent',
      },
      {
        name: '小码酱',
        roles: ['software', 'validation', 'writing-original-draft'],
        affiliation: 'DeepSeek Harness',
      },
    ],
  })
}

export function passRelease(service, id) {
  passStewardship(service, id)
  service.world(id, { action: 'set', kind: 'safety', key: 'dual_use', value: 'pass' })
  service.write(id, {
    action: 'declaration',
    ai: true,
    watermark: true,
    model: 'DeepSeek Harness test',
    humanReviewer: 'YG',
  })
  service.gate(id, {
    action: 'approve',
    approver: 'YG',
    role: 'human-reviewer',
    statement: '我已核对证据、复现包与局限，批准发布该版本。',
  })
  return service.gate(id, { action: 'advance' })
}

/**
 * A fully released fixture for route-level action-gate tests. Kept separate
 * from the short create/export smoke fixture so existing assertions keep
 * their original meaning.
 */
export function releasedCampaign(service) {
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
  return id
}
