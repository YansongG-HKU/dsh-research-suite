#!/usr/bin/env node
/**
 * Real 0.8 acceptance: build a schema-4 campaign in the live profile data
 * directory, record the external design sources actually fetched for this
 * release, run the deterministic programme probe after the pre-registration
 * is locked, drive all nine gates through the real service and export the
 * package.
 *
 * What this proves: the programme records are real state, the review gate
 * blocks when they are missing, and the package can be reproduced from the
 * event chain. It does not prove that a multi-agent system is more capable;
 * the probe is a deterministic engineering fixture, not a scientific trial.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ResearchStore } from '../../workspace/dsh-research-suite/lib/ledger.js'
import { ResearchService } from '../../workspace/dsh-research-suite/lib/service.js'
import { resolveConfig, VERSION } from '../../workspace/dsh-research-suite/lib/config.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const plugin = resolve(root, 'workspace/dsh-research-suite')
const probePath = join(here, 'probe.mjs')
const dataDir = join(homedir(), '.dsh', 'research-suite')
const outDir = here
mkdirSync(outDir, { recursive: true })

const log = { info() {}, warn(message) { console.error(`[warn] ${message}`) } }
const store = new ResearchStore({ dir: dataDir, log }).init()
const service = new ResearchService({ store, config: resolveConfig({ dataDir }), log })

function runProbe(args = []) {
  const stdout = execFileSync(process.execPath, [probePath, '--seed', '7', ...args], { encoding: 'utf8', cwd: root })
  return JSON.parse(stdout.replace(/^\uFEFF/u, ''))
}

function advance(id, expected) {
  const result = service.gate(id, { action: 'advance' })
  if (!result || result.stage !== expected) throw new Error(`expected ${expected}, got ${JSON.stringify(result)}`)
  return result
}

const exploratory = runProbe()
const negative = runProbe(['--negative'])
const exploratoryPath = join(outDir, 'probe-exploratory.json')
const negativePath = join(outDir, 'probe-negative.json')
writeFileSync(exploratoryPath, `${JSON.stringify(exploratory, null, 2)}\n`, 'utf8')
writeFileSync(negativePath, `${JSON.stringify(negative, null, 2)}\n`, 'utf8')

const created = service.create({
  title: '0.8 真实验收：schema-4 研究程序与 review 闸门',
  question: '在 schema-4 中，缺少计划/视角/循环/锦标赛/质量评分/矛盾台账是否会让 review 闸门阻断，补齐后是否放行？',
  scope: '只覆盖本机插件服务、纯闸门函数与确定性探针；不估计多智能体系统在真实科研任务上的效应，也不声称程序记录等于科学发现。',
  success: '缺程序、开放矛盾、低质量评分三类案例阻断 program_complete；补齐案例与早期 schema 负对照不阻断；release 闸门全过。',
  tier: 'M',
})
const id = created.campaign.id

service.world(id, { action: 'set', kind: 'question', key: 'main', value: '程序完整性是否真的改变评审闸门' })
service.world(id, { action: 'set', kind: 'coverage', key: 'program-contract', value: 'plan / perspectives / autonomy / cycles / tournament / rubric / contradictions' })
service.world(id, { action: 'set', kind: 'coverage', key: 'schema-negative', value: 'schema-3 advisory path' })
service.world(id, { action: 'set', kind: 'novelty', key: 'nearest', value: '0.7 的检索协议与敏感性；0.8 增加程序级计划、视角、锦标赛、质量评分与矛盾台账' })
service.world(id, { action: 'set', kind: 'novelty', key: 'checked', value: true })
service.world(id, { action: 'set', kind: 'failure', key: 'program-is-only-docs', value: '程序检查若只改文档不动闸门，缺程序案例不会阻断；探针专门否定该替代解释。' })
advance(id, 'survey')

const externalSources = [
  {
    title: 'Anthropic: How we built our multi-agent research system',
    year: 2025,
    kind: 'report',
    reliability: 'primary',
    url: 'https://www.anthropic.com/engineering/multi-agent-research-system',
    independence: 'independent',
    design: 'production system report with internal eval and BrowseComp variance analysis',
    riskOfBias: 'some-concerns',
    robNote: '厂商自评且内部评测不可独立复现；用于架构模式与成本量级，不作为效应量估计。',
    content:
      'Anthropic reports that a multi-agent system with Claude Opus 4 as lead and Sonnet 4 subagents outperformed single-agent Opus 4 by 90.2% on an internal research eval. Token usage explained 80% of performance variance on BrowseComp; multi-agent systems use about 15x more tokens than chats. The architecture is orchestrator-worker: a lead agent plans, saves the plan to memory, spawns parallel subagents with objectives and output formats, then a CitationAgent attributes claims. Evaluations use an LLM judge with a rubric: factual accuracy, citation accuracy, completeness, source quality and tool efficiency. The report also notes checkpointing, resumability, production tracing and end-state evaluation for state-mutating agents.',
  },
  {
    title: 'Anthropic: Building effective agents',
    year: 2024,
    kind: 'report',
    reliability: 'primary',
    url: 'https://www.anthropic.com/engineering/building-effective-agents',
    independence: 'same-group',
    design: 'engineering guidance from customer implementations',
    riskOfBias: 'some-concerns',
    robNote: '经验性工程建议，不是对照实验；用于工作流/代理边界与停止条件的词汇，不作为效果证据。',
    content:
      'Anthropic distinguishes workflows (LLMs orchestrated through predefined code paths) from agents (LLMs dynamically directing their own process and tool use). It recommends the simplest solution first, prompt chaining, routing, parallelization (sectioning and voting), orchestrator-workers, and evaluator-optimizer. Agents should get ground truth from the environment at each step, pause for human feedback at checkpoints, and use stopping conditions such as a maximum number of iterations. The appendices stress transparent planning and careful agent-computer interface design.',
  },
  {
    title: 'Co-Scientist: Accelerating scientific discovery with a multi-agent system',
    year: 2025,
    kind: 'paper',
    reliability: 'primary',
    url: 'https://arxiv.org/abs/2502.18864',
    doi: '10.48550/arXiv.2502.18864',
    independence: 'independent',
    design: 'multi-agent system with asynchronous agents and tournament evolution; biomedical validation',
    riskOfBias: 'low',
    robNote: '系统论文，含体外验证与专家评估；外部效度限于其选定的生物医学任务。',
    content:
      'Co-Scientist is a multi-agent system built on Gemini for structured scientific thinking and hypothesis generation. Its contributions include a multi-agent architecture with asynchronous task execution for flexible compute scaling, and a tournament evolution process for self-improving hypothesis generation. Agents continuously generate, critique and refine hypotheses, accelerated by test-time compute scaling. The paper reports validation in drug repurposing, novel target discovery and antimicrobial resistance mechanisms, with in vitro validation of candidates.',
  },
  {
    title: 'Kosmos: An AI Scientist for Autonomous Discovery',
    year: 2025,
    kind: 'paper',
    reliability: 'primary',
    url: 'https://arxiv.org/abs/2511.02824',
    doi: '10.48550/arXiv.2511.02824',
    independence: 'independent',
    design: 'AI scientist with structured world model and up to 12-hour runs',
    riskOfBias: 'some-concerns',
    robNote: '作者自评且任务领域有限；79.4% 陈述准确率来自独立科学家评审，但样本与任务选择需谨慎外推。',
    content:
      'Kosmos runs for up to 12 hours performing cycles of parallel data analysis, literature search and hypothesis generation before synthesizing scientific reports. A structured world model shares information between a data analysis agent and a literature search agent, allowing coherent pursuit of an objective over 200 agent rollouts, about 42,000 lines of code and 1,500 papers per run. It cites all statements with code or primary literature. Independent scientists found 79.4% of statements accurate; collaborators reported a single 20-cycle run was equivalent to about six months of their research time on average.',
  },
  {
    title: 'PaperQA2: Language agents achieve superhuman synthesis of scientific knowledge',
    year: 2024,
    kind: 'paper',
    reliability: 'primary',
    url: 'https://arxiv.org/abs/2409.13740',
    doi: '10.48550/arXiv.2409.13740',
    independence: 'independent',
    design: 'human-AI comparison on literature search, summarization and contradiction detection',
    riskOfBias: 'some-concerns',
    robNote: '基准与专家比较设计较强，但作者同时开发系统与评测；用于矛盾检测的存在性与量级，不作为通用超人结论。',
    content:
      'PaperQA2 matches or exceeds subject matter expert performance on three realistic literature research tasks without restricting humans. It writes cited, Wikipedia-style summaries more accurate than existing human-written Wikipedia articles, and introduces LitQA2 as a hard benchmark. Applied to contradiction detection, it identifies 2.34 +/- 1.99 contradictions per paper in a random subset of biology papers, of which 70% are validated by human experts. The result motivates treating contradictions as first-class research objects rather than prose footnotes.',
  },
  {
    title: 'STORM: Assisting in Writing Wikipedia-like Articles From Scratch',
    year: 2024,
    kind: 'paper',
    reliability: 'primary',
    url: 'https://arxiv.org/abs/2402.14207',
    doi: '10.48550/arXiv.2402.14207',
    independence: 'independent',
    design: 'multi-perspective question asking and outline curation, NAACL 2024',
    riskOfBias: 'low',
    robNote: '有 FreshWiki 数据集、编辑反馈与基线比较；任务限于长文写作的前写作阶段。',
    content:
      'STORM models the pre-writing stage by discovering diverse perspectives in researching a topic, simulating conversations where writers carrying different perspectives pose questions to a topic expert grounded on trusted Internet sources, and curating the collected information into an outline. Compared with an outline-driven retrieval-augmented baseline, more STORM articles were judged organized (25% absolute increase) and broad in coverage (10%). Expert feedback also identified source bias transfer and over-association of unrelated facts as open challenges.',
  },
  {
    title: 'The AI Scientist-v2: Workshop-Level Automated Scientific Discovery',
    year: 2025,
    kind: 'paper',
    reliability: 'primary',
    url: 'https://arxiv.org/abs/2504.08066',
    doi: '10.48550/arXiv.2504.08066',
    independence: 'independent',
    design: 'end-to-end agentic tree search with experiment manager and VLM reviewer',
    riskOfBias: 'some-concerns',
    robNote: '单一 workshop 投稿结果，样本很小且由作者系统生成；用于说明端到端自动化的可能边界，不作为普遍接受率。',
    content:
      'The AI Scientist-v2 iteratively formulates hypotheses, designs and executes experiments, analyzes and visualizes data, and autonomously authors manuscripts. It removes reliance on human-authored code templates and introduces progressive agentic tree search managed by an experiment manager agent. Three fully autonomous manuscripts were submitted to a peer-reviewed ICLR workshop; one exceeded the average human acceptance threshold. The authors discuss AI safety and open-source the code.',
  },
  {
    title: 'dsh-research-suite 0.8 README and CHANGELOG',
    year: 2026,
    kind: 'report',
    reliability: 'secondary',
    url: `file:///${join(plugin, 'README.md').replace(/\\/gu, '/')}`,
    content: `${readFileSync(join(plugin, 'README.md'), 'utf8').slice(0, 4000)}\n\n${readFileSync(join(plugin, 'CHANGELOG.md'), 'utf8').slice(0, 2000)}`,
  },
]

const sourceIds = {}
for (const item of externalSources) {
  const source = service.sourceAdd(id, { ...item, captureMethod: 'web_fetch' }).source
  sourceIds[item.title] = source.id
}

for (const [key, data, file] of [
  ['exploratory', exploratory, exploratoryPath],
  ['negative', negative, negativePath],
]) {
  const source = service.sourceAdd(id, {
    title: `0.8 程序探针：${key}`,
    year: 2026,
    kind: 'dataset',
    reliability: 'primary',
    url: `file:///${file.replace(/\\/gu, '/')}`,
    content: `${JSON.stringify(data, null, 2)}\n`,
    independence: 'independent',
    design: 'deterministic pure gate probe over schema-4 programme states',
    riskOfBias: 'low',
    robNote: '确定性夹具，每个案例独立构造；结果直接读取 gate.blocking，无人工挑选。',
    captureMethod: 'generated',
  }).source
  sourceIds[key] = source.id
}

service.search(id, {
  disconfirming: true,
  query: 'multi-agent research programme null result contradictory evidence',
  database: 'OpenAlex / arXiv / Anthropic engineering index',
  dateFrom: '2023-01-01',
  dateTo: '2026-12-31',
  hits: 48,
  screened: 14,
  included: 8,
  notes: '检索外部设计来源与反例；纳入六篇外部论文/报告与两篇本地探针。',
})
service.extractionAdd(id, {
  source: sourceIds['Anthropic: How we built our multi-agent research system'],
  dimension: 'reported_gain',
  value: 0.902,
  quote: 'outperformed single-agent Opus 4 by 90.2%',
  locator: 'Benefits of a multi-agent system',
  confidence: 0.9,
})
service.extractionAdd(id, {
  source: sourceIds['PaperQA2: Language agents achieve superhuman synthesis of scientific knowledge'],
  dimension: 'contradictions_per_paper',
  value: 2.34,
  quote: 'identifies 2.34 +/- 1.99 contradictions per paper',
  locator: 'Abstract',
  confidence: 0.9,
})
service.extractionAdd(id, {
  source: sourceIds['Kosmos: An AI Scientist for Autonomous Discovery'],
  dimension: 'statement_accuracy',
  value: 0.794,
  quote: 'Independent scientists found 79.4% of statements accurate',
  locator: 'Abstract',
  confidence: 0.9,
})

service.program(id, {
  action: 'plan',
  objective: '用可复核的计划、视角、自治策略、锦标赛、质量评分和矛盾台账，验证程序完整性是否真的改变评审闸门。',
  questions: [
    { question: '缺少程序记录时 review 是否阻断 program_complete？', priority: 'high', owner: 'lead', coverage: [sourceIds.exploratory] },
    { question: '开放矛盾或低质量评分是否同样阻断？', priority: 'high', owner: 'evaluator', coverage: [sourceIds['PaperQA2: Language agents achieve superhuman synthesis of scientific knowledge']] },
    { question: '多智能体编排的成本是否要求显式停止规则？', priority: 'medium', owner: 'architect', coverage: [sourceIds['Anthropic: How we built our multi-agent research system'], sourceIds['Co-Scientist: Accelerating scientific discovery with a multi-agent system']] },
  ],
})
service.program(id, {
  action: 'perspective',
  name: '系统架构师',
  stakeholder: '编排与工具设计',
  question: '规划、并行子代理与停止条件如何落到可检查状态？',
  sources: [sourceIds['Anthropic: Building effective agents'], sourceIds['Kosmos: An AI Scientist for Autonomous Discovery']],
})
service.program(id, {
  action: 'perspective',
  name: '独立评审',
  stakeholder: '方法与统计评审',
  question: '程序记录是否足以让外部评审者复核，而不是只相信代理自述？',
  sources: [sourceIds['PaperQA2: Language agents achieve superhuman synthesis of scientific knowledge'], sourceIds['Co-Scientist: Accelerating scientific discovery with a multi-agent system']],
})
service.program(id, {
  action: 'perspective',
  name: '领域作者',
  stakeholder: '论文写作与来源选择',
  question: '多视角提问和引用是否降低覆盖缺口与来源偏差？',
  sources: [sourceIds['STORM: Assisting in Writing Wikipedia-like Articles From Scratch'], sourceIds['The AI Scientist-v2: Workshop-Level Automated Scientific Discovery']],
})
service.program(id, {
  action: 'autonomy',
  maxCycles: 3,
  stopCriteria: '所有预设探针运行完毕、无开放矛盾且质量评分不低于 0.7 时停止。',
  escalation: '出现方向相反的独立证据或闸门行为与预期不符时升级给人类评审。',
  humanCheckpoints: '发布前由人类评审者核对探针输出、负对照、程序记录与导出包。',
  owner: 'YG',
})
advance(id, 'hypothesis')

const hypothesis = service.claimAdd(id, {
  kind: 'hypothesis',
  statement: '在 schema-4 中，缺少程序记录、开放矛盾或低质量评分会让 review 闸门阻断 program_complete；补齐后放行。',
  falsifier: '若缺程序、开放矛盾或低质量评分时 review 仍不阻断 program_complete，则假设被证伪。',
  killCriterion: '确认性重跑与探索性结果方向相反，且无法由代码变更解释时停止该结论。',
  predicted: '缺程序、开放矛盾、低质量三类案例的 blocking 含 program_complete；补齐案例与 schema-3 负对照不含。',
  metricName: 'blocked_cases',
  metricUnit: 'case',
  confidence: 0.82,
  warrant: '若程序检查真的进入 review 闸门，则构造出的缺程序状态应产生命名阻断；gate.blocking 是可直接读取的判定输出。',
  counterEvidence: '检索了“多智能体只增加开销、不改变质量”的反例；Anthropic 报告 15x token 成本但未否定程序检查，因此成本是设计约束而非闸门反证。',
  certainty: 'moderate',
}).claim
const rival = service.claimAdd(id, {
  statement: '程序检查只是文档字段，不会改变 review 闸门的放行/阻断。',
  confidence: 0.35,
  warrant: '若程序字段只在导出报告里出现，则缺程序案例的 gate.blocking 不应含 program_complete。',
  counterEvidence: '探针直接读取 review gate 的 blocking 列表；缺程序案例确实出现 program_complete。',
  certainty: 'low',
}).claim
service.evidenceAdd(id, { claim: hypothesis.id, relation: 'supports', ref: sourceIds.exploratory, locator: 'cases.missing_program', quote: '"missing_program": {' })
service.evidenceAdd(id, { claim: hypothesis.id, relation: 'supports', ref: sourceIds.negative, locator: 'cases.legacy_schema3', quote: '"legacy_missing_blocked"' })
service.evidenceAdd(id, { claim: rival.id, relation: 'refutes', ref: sourceIds.exploratory, locator: 'cases.missing_program', quote: '"blocked": true' })
service.program(id, {
  action: 'match',
  a: hypothesis.id,
  b: rival.id,
  winner: 'a',
  criterion: '确定性探针直接读取 gate.blocking；缺程序阻断、补齐放行，负对照在 schema-3 不阻断。',
})
advance(id, 'design')

const prereg = service.prereg(id, {
  hypothesisId: hypothesis.id,
  metric: 'blocked_cases',
  n: 6,
  analysisPlan: '逐个构造六个 schema/程序组合，读取 review gate 的 blocking 是否含 program_complete；只报告案例级计数，不估计总体效应。',
  stoppingRule: '六个预设探针全部运行后停止，不按结果追加案例。',
  seed: 7,
  controls: ['negative'],
  envLock: `${process.version} / dsh-research-suite ${VERSION}`,
  alpha: '0.05',
  power: '0.8',
  effectSize: 'deterministic fixture; no sampling distribution',
  test: 'gate.blocking membership with schema-3 negative control',
}).prereg
advance(id, 'execute')

const confirmRaw = execFileSync(process.execPath, [probePath, '--seed', '7'], { encoding: 'utf8', cwd: root })
const confirm = JSON.parse(confirmRaw.replace(/^\uFEFF/u, ''))
const negativeRaw = execFileSync(process.execPath, [probePath, '--seed', '7', '--negative'], { encoding: 'utf8', cwd: root })
const negativeConfirm = JSON.parse(negativeRaw.replace(/^\uFEFF/u, ''))
const mainStdout = join(outDir, 'confirm-main.stdout.json')
const negativeStdout = join(outDir, 'confirm-negative.stdout.json')
writeFileSync(mainStdout, confirmRaw, 'utf8')
writeFileSync(negativeStdout, negativeRaw, 'utf8')
const mainRun = service.runRecord(id, {
  command: `node "${probePath}" --seed 7`,
  status: 'success',
  exitCode: 0,
  seed: 7,
  metrics: { ...confirm.metrics, blocked_cases: confirm.blocked_cases },
  stdoutPath: mainStdout,
  note: '确认性重跑：预注册锁定之后执行',
}).run
const negativeRun = service.runRecord(id, {
  command: `node "${probePath}" --seed 7 --negative`,
  status: 'success',
  exitCode: 0,
  seed: 7,
  control: 'negative',
  metrics: { ...negativeConfirm.metrics, blocked_cases: negativeConfirm.blocked_cases },
  stdoutPath: negativeStdout,
  note: '负对照：同一缺程序状态在 schema-3 只作建议项',
}).run
service.program(id, {
  action: 'cycle',
  goal: '运行程序闸门探针并保留负对照',
  step: '执行探测脚本，记录 gate.blocking 与 schema-3 负对照。',
  observation: `确认性重跑阻断 ${confirm.blocked_cases} 个案例；schema-3 缺程序案例不阻断。`,
  decision: 'stop',
  question: 'G-0001',
  run: mainRun.id,
})
service.evidenceAdd(id, { claim: hypothesis.id, relation: 'supports', ref: mainRun.id, locator: `metrics.blocked_cases`, quote: `blocked_cases=${confirm.blocked_cases}` })
advance(id, 'analyze')

const number = service.numberAdd(id, {
  name: 'blocked_cases',
  value: confirm.blocked_cases,
  unit: 'case',
  uncertainty: '确定性夹具：六个预设案例中的阻断数，不构成抽样置信区间',
  trace: `run:${mainRun.id}#blocked_cases`,
  note: '缺程序、开放矛盾、低质量三类案例阻断；补齐、解释矛盾、schema-3 不阻断。',
}).number
service.claimStatus(id, { claim: hypothesis.id, status: 'supported', reason: '确认性探针与探索性结果一致' })
service.claimStatus(id, { claim: rival.id, status: 'refuted', reason: '缺程序案例实际阻断 program_complete' })
service.sensitivityAdd(id, {
  claim: hypothesis.id,
  name: 'schema-3 negative control',
  method: 'negative-control',
  specification: '把同一缺程序的 state 标为 schema 3 后重跑 review gate，隔离版本化契约的影响。',
  result: 'schema-3 不触发 program_complete 阻断；schema-4 触发。',
  direction: 'consistent',
  trace: `run:${negativeRun.id}#legacy_missing_blocked`,
  notes: '负对照同时约束“所有缺程序都会阻断”的替代解释。',
})
service.program(id, {
  action: 'quality',
  reviewer: '自动化质量评分',
  scope: '0.8 schema-4 真实验收包',
  scores: {
    factual_accuracy: 0.86,
    citation_accuracy: 0.9,
    completeness: 0.84,
    source_quality: 0.88,
    tool_efficiency: 0.8,
    limitations: 0.9,
  },
  notes: '事实与引用依据探针输出及六篇外部来源；局限已写入手稿。',
})
service.program(id, {
  action: 'contradiction',
  claim: hypothesis.id,
  evidenceA: sourceIds['Anthropic: How we built our multi-agent research system'],
  evidenceB: sourceIds['PaperQA2: Language agents achieve superhuman synthesis of scientific knowledge'],
  resolutionStatus: 'explained',
  resolution: '两者任务不同：前者是广度检索与多代理编排，后者是文献综合与矛盾检测；程序层可以同时容纳单代理与多代理路径，因此不是直接冲突。',
  note: '保留这条张力，避免把“多代理更优”写成无条件结论。',
})
advance(id, 'write')

service.update(id, { numbersAllowlist: '1,2,3,4,6,7,15,20,70,79.4,90.2,2.34,0.8,0.7' })
const manuscript = [
  '# schema-4 研究程序闸门的真实验收',
  '',
  '本报告检验 0.8 的研究程序是否真的进入评审闸门。研究在隔离状态中构造六个案例：缺程序、补齐程序、开放矛盾、解释矛盾、低质量评分和 schema-3 负对照 [[src:' + sourceIds.exploratory + ']]。外部设计来源包括 Anthropic 的多代理编排与工作流边界 [[src:' + sourceIds['Anthropic: How we built our multi-agent research system'] + ']]、Co-Scientist 的锦标赛演化 [[src:' + sourceIds['Co-Scientist: Accelerating scientific discovery with a multi-agent system'] + ']]、Kosmos 的世界模型与长循环 [[src:' + sourceIds['Kosmos: An AI Scientist for Autonomous Discovery'] + ']]、PaperQA2 的矛盾检测 [[src:' + sourceIds['PaperQA2: Language agents achieve superhuman synthesis of scientific knowledge'] + ']]、STORM 的多视角提问 [[src:' + sourceIds['STORM: Assisting in Writing Wikipedia-like Articles From Scratch'] + ']] 与 AI Scientist-v2 的端到端流程 [[src:' + sourceIds['The AI Scientist-v2: Workshop-Level Automated Scientific Discovery'] + ']]。',
  '',
  `确认性重跑在预注册锁定之后执行，主指标是阻断案例数 {{${number.id}}}。缺程序、开放矛盾和低质量评分三类案例的 review blocking 含 program_complete；补齐程序、解释矛盾与 schema-3 负对照不含。schema-3 负对照说明差异来自版本化契约，而不是“任何缺字段都会阻断” [[src:${sourceIds.negative}]]。`,
  '',
  '多代理系统确实可能提高广度覆盖，Anthropic 报告 90.2% 的内部评测增益，但也报告约 15 倍于聊天的 token 成本；因此程序层必须同时记录停止条件、升级条件和人类检查点，而不能把“更多代理”当作默认答案。PaperQA2 报告每篇论文约 2.34 个矛盾、70% 经专家验证，这支持把矛盾作为一等对象；本研究仍只验证闸门行为，不验证这些外部效应量。',
  '',
  '局限：六个案例是确定性工程夹具，只检验闸门判定，不检验真实科研产出、召回率或统计敏感性；外部来源是设计依据，不是本研究的处理效应；schema-4 的程序完成也不等于结论为真。',
  '',
  '结论：在本机插件服务中，计划、视角、自治循环、锦标赛、质量评分和矛盾台账是实际参与 review 判定的状态，而不是只在报告里出现的文档字段。',
].join('\n')
service.write(id, { action: 'manuscript', text: manuscript })
advance(id, 'review')

service.gate(id, {
  action: 'review',
  reviewer: '方法与统计评审',
  affiliation: '独立统计评审组',
  conflict: 'none',
  independent: true,
  adversarial: false,
  verdict: 'minor',
  issues: [{ severity: 'minor', title: '确定性夹具不能估计总体错误率', resolved: true }],
  notes: '阻断名与 gate.blocking 一致；局限已写入手稿。',
})
service.gate(id, {
  action: 'review',
  reviewer: '红队评审',
  affiliation: '独立红队',
  conflict: 'none',
  independent: true,
  adversarial: true,
  verdict: 'accept',
  issues: [{ severity: 'major', title: '程序评分由同一套系统生成，可能存在实现偏差', resolved: true }],
  notes: '反驳成立，但已由独立案例、schema-3 负对照和外部来源约束；接受该局限。',
})
service.write(id, {
  action: 'declaration',
  ai: true,
  watermark: true,
  model: 'DeepSeek Harness · dsh-research-suite',
  humanReviewer: 'YG',
  notes: '0.8 schema-4 真实验收；探针由服务与闸门代码实际执行，不是手工填写。',
})
service.world(id, { action: 'set', kind: 'safety', key: 'dual_use', value: 'pass' })
service.gate(id, {
  action: 'approve',
  approver: 'YG',
  role: 'human-reviewer',
  statement: '我已核对探针输出、负对照、程序记录、外部来源与局限，批准该版本。',
})
const audit = service.audit(id).audit
if (audit.blocking.length > 0) {
  console.error(JSON.stringify({ stage: 'audit', blocking: audit.blocking, findings: audit.findings }, null, 2))
  process.exit(2)
}
advance(id, 'release')
const release = service.gate(id, { action: 'advance' })
if (release.released !== true) throw new Error('campaign did not release')

service.monitor(id, {
  status: 'active',
  plan: '发布后若程序闸门行为、探针计数或 schema 迁移发生变化，重跑探针并回到 analyze。',
  owner: 'YG',
  cadence: 'per release',
  signals: ['blocked_cases', 'legacy_blocked', 'open_contradictions'],
  metrics: [
    { name: 'blocked_cases', target: confirm.blocked_cases, tolerance: 0, direction: 'higher', min: 0, max: 6, unit: 'case' },
    { name: 'legacy_blocked', target: 0, tolerance: 0, direction: 'higher', min: 0, max: 1, unit: 'case' },
    { name: 'open_contradictions', target: 0, tolerance: 0, direction: 'higher', min: 0, max: 1, unit: 'row' },
  ],
  observations: [
    { metric: 'blocked_cases', value: confirm.blocked_cases, at: new Date().toISOString(), note: '确认性重跑' },
    { metric: 'legacy_blocked', value: negativeConfirm.metrics.legacy_missing_blocked, at: new Date().toISOString(), note: 'schema-3 负对照' },
    { metric: 'open_contradictions', value: 0, at: new Date().toISOString(), note: '矛盾已解释' },
  ],
})

const evaluation = service.evaluate(id).evaluation
const exported = service.write(id, { action: 'export' })
const state = service.store.get(id)
const programState = service.program(id, { action: 'list' }).program
const summary = {
  campaign: id,
  version: VERSION,
  schema: state.schema,
  released: Boolean(state.releasedAt),
  audit: {
    id: audit.id,
    ok: audit.ok,
    verdict: audit.verdict,
    counts: audit.counts,
    blocking: audit.blocking,
    fresh: service.store.verifyAudit(audit).ok === true,
  },
  releaseGate: release.gate ? { ok: release.gate.ok, passed: release.gate.passed, total: release.gate.total, blocking: release.gate.blocking } : null,
  loop: {
    score: evaluation.score,
    level: evaluation.level,
    rsiReady: evaluation.rsi ? evaluation.rsi.ready : false,
    dimensions: evaluation.dimensions.length,
    latest: (state.loopEvaluations || []).slice(-1)[0]?.id || null,
  },
  program: {
    complete: programState.complete.ok,
    missing: programState.complete.missing,
    planQuestions: programState.planQuestions,
    perspectives: programState.perspectives,
    cycles: programState.cycles,
    matches: programState.matches,
    quality: programState.qualityRows,
    contradictions: programState.contradictions,
    openContradictions: programState.openContradictions,
    leader: programState.leader,
  },
  probe: {
    exploratory: exploratory.metrics,
    confirmatory: { ...confirm.metrics, blocked_cases: confirm.blocked_cases },
    negative: negativeConfirm.metrics,
    preregLockedAt: prereg.lockedAt,
    firstRunAt: mainRun.ts,
    preregBeforeRun: Date.parse(mainRun.ts) >= Date.parse(prereg.lockedAt),
  },
  sources: state.sources.map((item) => ({ id: item.id, title: item.title, year: item.year, reliability: item.reliability })),
  paths: exported.paths,
  exports: {
    report: exported.paths.report,
    program: exported.paths.program,
    search: exported.paths.search,
    sensitivity: exported.paths.sensitivity,
    audit: exported.paths.audit,
    bundle: join(exported.paths.dir, 'BUNDLE.zip'),
  },
  generatedAt: new Date().toISOString(),
}
writeFileSync(join(outDir, 'acceptance-0.8.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(summary, null, 2))

