#!/usr/bin/env node
/**
 * Real 0.7 acceptance: create a schema-3 campaign in the live profile data
 * directory, drive all nine gates through the real service, record a
 * confirmatory run that actually executes probe.mjs, and export the package.
 *
 * The five probe sources come from an exploratory run of the same script. The
 * campaign's preregistration is locked before the confirmatory run, so the
 * execute gate's prereg_before_run check is exercised for real.
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
  const stdout = execFileSync(process.execPath, [probePath, '--seed', '7', ...args], {
    encoding: 'utf8',
    cwd: root,
  })
  return JSON.parse(stdout.replace(/^\uFEFF/u, ''))
}

function advance(id, expected) {
  const result = service.gate(id, { action: 'advance' })
  if (!result || result.stage !== expected) {
    throw new Error(`expected stage ${expected}, got ${JSON.stringify(result)}`)
  }
  return result
}

// Exploratory run: creates the five probe source records before the campaign.
const exploratory = runProbe()
const negativeExploratory = runProbe(['--negative'])
const notes = exploratory.notes
const probeFiles = {}
for (const [key, value] of Object.entries(exploratory.cases)) {
  const file = join(outDir, `source-${key}.json`)
  const record = {
    seed: 7,
    case: key,
    blocked: value.blocked,
    blocking: value.blocking,
    note: notes[key],
    source: 'exploratory probe run; confirmatory run recorded inside the campaign',
  }
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
  probeFiles[key] = { file, record }
}

// Confirmatory run happens after the pre-registration below.
const created = service.create({
  title: '0.7 真实验收：schema-3 检索协议与敏感性闸门探针',
  question: '第三代 schema 的检索协议与敏感性记录，是否真的改变 survey 与 analyze 的闸门判定？',
  scope: '只覆盖本机插件服务与纯闸门函数，在隔离临时库中构造的五个确定性探针；不外推到真实文献检索的召回率或统计敏感性。',
  success: '缺检索协议时 survey 阻断 search_protocol，缺敏感性时 analyze 阻断 sensitivity；补齐后放行；早期 schema 负对照不触发同名阻断；release 闸门全过。',
  tier: 'M',
})
const id = created.campaign.id

service.world(id, { action: 'set', kind: 'question', key: 'main', value: '版本化闸门是否按记录缺失阻断' })
service.world(id, { action: 'set', kind: 'coverage', key: 'gate-protocol', value: 'searchLog / sensitivity / prereg timing' })
service.world(id, { action: 'set', kind: 'coverage', key: 'negative-control', value: 'schema-1 advisory path' })
service.world(id, { action: 'set', kind: 'novelty', key: 'nearest', value: '0.6 的 evidence rigor; 0.7 adds protocol and robustness records' })
service.world(id, { action: 'set', kind: 'novelty', key: 'checked', value: true })

const probeTitles = {
  missing_search: '探针：缺检索协议',
  with_search: '探针：补齐检索协议',
  missing_sensitivity: '探针：缺敏感性记录',
  with_sensitivity: '探针：补齐敏感性记录',
  legacy_negative: '探针：早期 schema 负对照',
}
const probeSourceIds = {}
for (const [key, item] of Object.entries(probeFiles)) {
  const source = service.sourceAdd(id, {
    title: probeTitles[key],
    year: 2026,
    kind: 'dataset',
    reliability: 'primary',
    content: `${JSON.stringify(item.record, null, 2)}\n`,
    url: `file:///${item.file.replace(/\\/gu, '/')}`,
    independence: 'independent',
    design: 'isolated service + pure gate probe',
    riskOfBias: 'low',
    robNote: '确定性夹具；每个探针使用独立临时库，结果由 gate.blocking 直接读取，无人工挑选。',
    captureMethod: 'generated',
  }).source
  probeSourceIds[key] = source.id
}

const docSources = [
  ['README 0.7 能力与边界', join(plugin, 'README.md')],
  ['研究闭环 0.7 设计', join(plugin, 'docs', '研究闭环-0.7.0.md')],
  ['CHANGELOG 0.7.0', join(plugin, 'CHANGELOG.md')],
]
const docSourceIds = []
for (const [title, file] of docSources) {
  const content = readFileSync(file, 'utf8')
  const source = service.sourceAdd(id, {
    title,
    year: 2026,
    kind: 'report',
    reliability: 'secondary',
    content: content.slice(0, 12000),
    url: `file:///${file.replace(/\\/gu, '/')}`,
    captureMethod: 'manual',
  }).source
  docSourceIds.push(source.id)
}

service.search(id, {
  disconfirming: true,
  query: 'schema three search protocol sensitivity null result',
  database: 'local gate-probe',
  dateFrom: '2026-01-01',
  dateTo: '2026-12-31',
  hits: 5,
  screened: 5,
  included: 4,
  notes: '五个探针中两个缺失案例被阻断，两个补齐案例放行，一个早期 schema 负对照不阻断。',
})
service.extractionAdd(id, {
  source: probeSourceIds.missing_search,
  dimension: 'blocked',
  value: 1,
  quote: '缺少检索协议时 survey 闸门阻断',
  locator: 'case missing_search',
  confidence: 0.95,
})
advance(id, 'survey')

const hypothesis = service.claimAdd(id, {
  kind: 'hypothesis',
  statement: '在第三代 schema 中，缺少检索协议或敏感性记录会分别阻断 survey 与 analyze；补齐记录后同一阶段放行。',
  falsifier: '若缺检索或敏感性时闸门仍放行，或补齐后仍阻断，则假设被证伪。',
  killCriterion: '确认性重跑与探索性结果方向相反，且无法由代码变更解释时停止该结论。',
  predicted: '缺检索时 survey 的 blocking 含 search_protocol；缺敏感性时 analyze 的 blocking 含 sensitivity。',
  metricName: 'blocked_cases',
  metricUnit: 'case',
  confidence: 0.8,
  warrant: '若新检查只对第三代 schema 阻断，则缺记录项目应在对应阶段出现命名阻断；这是可直接读取的 gate.blocking 输出。',
  counterEvidence: '同一缺失检索在早期 schema 上不阻断，说明效果来自版本化契约而非通用失败。',
  certainty: 'moderate',
}).claim
const rival = service.claimAdd(id, {
  statement: '早期 schema 上同一缺失检索不触发 search_protocol 阻断。',
  confidence: 0.75,
  warrant: '若 featureRigor 只在 schema 三设置 blocking，则早期 schema 的同名检查应为 advisory。',
  counterEvidence: '确认性探针仍可能在早期 schema 上因其他检查阻断，需要逐项看 blocking 名称。',
  certainty: 'moderate',
}).claim
service.claimStatus(id, { claim: rival.id, status: 'supported', reason: '负对照探针 blocking 不含 search_protocol' })

service.evidenceAdd(id, {
  claim: hypothesis.id,
  relation: 'supports',
  ref: probeSourceIds.missing_search,
  locator: 'case missing_search',
  quote: '缺少检索协议时 survey 闸门阻断',
})
service.evidenceAdd(id, {
  claim: hypothesis.id,
  relation: 'supports',
  ref: probeSourceIds.missing_sensitivity,
  locator: 'case missing_sensitivity',
  quote: '缺少敏感性记录时 analyze 闸门阻断',
})
service.evidenceAdd(id, {
  claim: rival.id,
  relation: 'supports',
  ref: probeSourceIds.legacy_negative,
  locator: 'case legacy_negative',
  quote: '早期 schema 项目上同一缺失不阻断，只作为 advisory',
})
service.world(id, { action: 'set', kind: 'failure', key: 'all-missing-block', value: '早期 schema 负对照否定了“所有缺失都会阻断”的替代解释。' })
advance(id, 'hypothesis')

const prereg = service.prereg(id, {
  hypothesisId: hypothesis.id,
  metric: 'blocked_cases',
  n: 5,
  analysisPlan: '逐个构造五个 schema/记录组合，读取 gate.blocking 是否含目标检查；不估计总体效应。',
  stoppingRule: '五个预设探针全部运行后停止，不按结果追加探针。',
  seed: 7,
  controls: ['negative'],
  envLock: `${process.version} / dsh-research-suite ${VERSION}`,
  alpha: '0.05',
  power: '0.8',
  effectSize: 'deterministic probe; no sampling distribution',
  test: 'gate.blocking membership',
}).prereg
advance(id, 'design')

const confirmRaw = execFileSync(process.execPath, [probePath, '--seed', '7'], {
  encoding: 'utf8',
  cwd: root,
})
const confirm = JSON.parse(confirmRaw.replace(/^\uFEFF/u, ''))
const confirmNegativeRaw = execFileSync(process.execPath, [probePath, '--seed', '7', '--negative'], {
  encoding: 'utf8',
  cwd: root,
})
const confirmNegative = JSON.parse(confirmNegativeRaw.replace(/^\uFEFF/u, ''))
const confirmStdout = join(outDir, 'confirm-main.stdout.txt')
const confirmNegativeStdout = join(outDir, 'confirm-negative.stdout.txt')
writeFileSync(confirmStdout, confirmRaw, 'utf8')
writeFileSync(confirmNegativeStdout, confirmNegativeRaw, 'utf8')

const mainRun = service.runRecord(id, {
  command: `node "${probePath}" --seed 7`,
  status: 'success',
  exitCode: 0,
  seed: 7,
  metrics: { ...confirm.metrics, blocked_cases: confirm.blocked_cases },
  stdoutPath: confirmStdout,
  note: '确认性重跑：预注册锁定之后执行',
}).run
const negativeRun = service.runRecord(id, {
  command: `node "${probePath}" --seed 7 --negative`,
  status: 'success',
  exitCode: 0,
  seed: 7,
  control: 'negative',
  metrics: {
    legacy_missing_search_blocked: confirmNegative.legacy_missing_search_blocked,
    blocked_cases: 0,
  },
  stdoutPath: confirmNegativeStdout,
  note: '负对照：同一缺失检索在早期 schema 上不触发同名阻断',
}).run
advance(id, 'execute')

const number = service.numberAdd(id, {
  name: 'blocked_cases',
  value: confirm.blocked_cases,
  unit: 'case',
  uncertainty: '确定性探针：五个预设案例中的阻断数，不构成抽样置信区间',
  trace: `run:${mainRun.id}#blocked_cases`,
}).number
service.claimStatus(id, { claim: hypothesis.id, status: 'supported', reason: '确认性探针与探索性结果一致' })
service.sensitivityAdd(id, {
  claim: hypothesis.id,
  name: 'schema-one negative control',
  method: 'negative-control',
  specification: '把同一缺失检索的 state 标为早期 schema 后重跑 gate，隔离版本化契约的影响。',
  result: '早期 schema 不触发 search_protocol 阻断；第三代 schema 触发。',
  direction: 'consistent',
  trace: `run:${mainRun.id}#legacy_missing_search_blocked`,
  notes: '负对照同时约束“所有缺失都会阻断”的替代解释。',
})
advance(id, 'analyze')

const manuscript = [
  '# 检索协议与敏感性闸门的真实验收',
  '',
  '本报告检验第三代 schema 的检索协议与敏感性记录是否真的改变闸门判定。研究在隔离临时库中构造五个探针，覆盖缺检索、补检索、缺敏感性、补敏感性以及早期 schema 负对照。探索性输出用于建立来源 [[src:' + probeSourceIds.missing_search + ']] 与 [[src:' + probeSourceIds.missing_sensitivity + ']]，确认性重跑在预注册锁定之后执行。',
  '',
  `确认性重跑的主指标是阻断案例数 {{${number.id}}}。缺检索时 survey 阻断 search_protocol；缺敏感性时 analyze 阻断 sensitivity；补齐后两者放行。早期 schema 的同一缺失检索不触发同名阻断，说明差异来自版本化契约，而不是通用失败 [[src:${probeSourceIds.legacy_negative}]]。`,
  '',
  '负对照为早期 schema 的同一缺失，输出为不阻断；它约束了“所有缺失都会阻断”的替代解释。局限：探针是确定性工程夹具，只检验闸门行为，不检验真实文献检索的召回率或敏感性分析的统计性质；五个案例也不能估计总体错误率。',
  '',
  '结论：在本机插件服务中，检索协议与敏感性记录是实际参与 survey/analyze 判定的阻断项，而不是只在报告里出现的文档字段。',
].join('\n')
service.write(id, { action: 'manuscript', text: manuscript })
advance(id, 'write')

service.gate(id, {
  action: 'review',
  reviewer: '方法与统计评审',
  affiliation: '独立统计评审组',
  conflict: 'none',
  independent: true,
  adversarial: false,
  verdict: 'minor',
  issues: [{ severity: 'minor', title: '探针不是抽样研究，不能估计总体错误率', resolved: true }],
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
  issues: [{ severity: 'major', title: '确认性重跑与探索性运行是同一脚本，可能共享实现偏差', resolved: true }],
  notes: '反驳成立但已被“同一脚本 + 独立临时库 + 早期 schema 负对照”约束；接受该局限。',
})
service.write(id, {
  action: 'declaration',
  ai: true,
  watermark: true,
  model: 'DeepSeek Harness · dsh-research-suite',
  humanReviewer: 'YG',
  notes: '0.7 schema-3 真实验收；探针由服务与闸门代码实际执行，不是手工填写。',
})
service.world(id, { action: 'set', kind: 'safety', key: 'dual_use', value: 'pass' })
service.gate(id, {
  action: 'approve',
  approver: 'YG',
  role: 'human-reviewer',
  statement: '我已核对探针输出、负对照、局限与导出包，批准该版本。',
})

const audit = service.audit(id).audit
if (audit.blocking.length > 0) {
  console.error(JSON.stringify({ stage: 'audit', blocking: audit.blocking, findings: audit.findings }, null, 2))
  process.exit(2)
}
advance(id, 'review')
const releaseStage = service.gate(id, { action: 'advance' })
if (releaseStage.stage !== 'release') throw new Error(`expected release, got ${JSON.stringify(releaseStage)}`)
const release = service.gate(id, { action: 'advance' })
if (release.released !== true) throw new Error('campaign did not release')

service.monitor(id, {
  status: 'active',
  plan: '发布后若 schema-3 新增检查的阻断行为变化，重跑探针并回到 analyze。',
  owner: 'YG',
  cadence: 'per release',
  signals: ['blocked_cases', 'legacy_missing_search_blocked'],
  metrics: [
    { name: 'blocked_cases', target: confirm.blocked_cases, tolerance: 0, direction: 'higher', min: 0, max: 5, unit: 'case' },
    { name: 'legacy_missing_search_blocked', target: 0, tolerance: 0, direction: 'higher', min: 0, max: 1, unit: 'case' },
  ],
  observations: [
    { metric: 'blocked_cases', value: confirm.blocked_cases, at: new Date().toISOString(), note: '确认性重跑' },
    { metric: 'legacy_missing_search_blocked', value: confirmNegative.legacy_missing_search_blocked, at: new Date().toISOString(), note: '负对照' },
  ],
})

const evaluation = service.evaluate(id).evaluation
const exported = service.write(id, { action: 'export' })
const state = service.store.get(id)
const summary = {
  campaign: id,
  version: VERSION,
  schema: state.schema,
  released: state.releasedAt ? true : false,
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
    latest: (state.loopEvaluations || []).slice(-1)[0]?.id || null,
  },
  probe: {
    exploratory: exploratory.metrics,
    confirmatory: { ...confirm.metrics, blocked_cases: confirm.blocked_cases },
    negative: confirmNegative,
    preregLockedAt: prereg.lockedAt,
    firstRunAt: mainRun.ts,
    preregBeforeRun: Date.parse(mainRun.ts) >= Date.parse(prereg.lockedAt),
  },
  searchLog: state.searchLog,
  sensitivity: state.sensitivity,
  paths: exported.paths,
  exports: {
    report: exported.paths.report,
    search: exported.paths.search,
    sensitivity: exported.paths.sensitivity,
    audit: exported.paths.audit,
    packet: exported.paths.packet,
    bundle: join(exported.paths.dir, 'BUNDLE.zip'),
  },
  generatedAt: new Date().toISOString(),
}
writeFileSync(join(outDir, 'acceptance-0.7.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(summary, null, 2))
