/**
 * Research-loop evaluation.
 *
 * This is not a claim that a conclusion is true, and it is not a measure of
 * intelligence. It scores whether a campaign has the engineering properties
 * that make a closed loop reviewable: a falsifiable question, captured
 * evidence, a pre-registered design, a reproducible execution, traceable
 * numbers, a fresh audit, independent review, domain applicability, monitoring
 * with real observations, and a release record.
 *
 * Scores are deliberately transparent: every point comes from a named check.
 * Re-run after a change and compare the new score with the previous evaluation;
 * that comparison, not the absolute number, is the self-improvement signal.
 */
import { STAGE_ORDER } from './config.js'
import { domainChecks, domainCompleteness, fieldApplicable, getDomain, standardApplicability } from './domains.js'
import { evaluateMonitoring, normalizeMonitoring } from './monitor.js'
import { preregTiming, resolveTrace } from './gates.js'
import { auditSubjectHash } from './subject.js'
import { searchProtocol } from './search.js'
import { sensitivityRows } from './sensitivity.js'
import { programComplete } from './program.js'
import {
  approvalFresh,
  assessedPrimarySources,
  independentPrimarySources,
  isCoreSchema,
  isFeatureSchema,
  isProgramSchema,
  latestApproval,
  waiverProblems,
} from './rigor.js'

const CITE_REF = /\[\[src:(S-\d{4})\]\]/gu

function arr(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []
}

function str(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function latestGate(state, stage) {
  return [...arr(state.gates)].reverse().find((item) => item && item.stage === stage) || null
}

function latestAudit(state) {
  const audits = arr(state.audits)
  return audits[audits.length - 1] || null
}

function check(id, ok, detail, fix) {
  return { id, ok: ok === true, detail: String(detail || ''), fix: String(fix || '') }
}

function dimension(id, title, weight, checks) {
  const passed = checks.filter((item) => item.ok).length
  return {
    id,
    title,
    weight,
    score: checks.length ? Number((passed / checks.length).toFixed(4)) : 0,
    passed,
    total: checks.length,
    checks,
    gaps: checks.filter((item) => !item.ok),
  }
}

function sourceCounts(state) {
  const sources = arr(state.sources)
  return {
    sources,
    primary: sources.filter((item) => item.reliability === 'primary').length,
    recent: sources.filter((item) => Number(item.year) >= 2023).length,
    captured: sources.filter((item) => str(item.contentHash) || str(item.contentArtifact)).length,
    cited: new Set(
      [...String(state.manuscript && state.manuscript.text ? state.manuscript.text : '').matchAll(CITE_REF)].map(
        (match) => match[1],
      ),
    ),
  }
}

function checkQuestion(state, profile) {
  const world = state.world && typeof state.world === 'object' ? state.world : {}
  const scopeOk = str(state.scope).length >= 20
  const successOk = str(state.success).length >= 10
  const checks = [
    check('question', str(state.question).length >= 12, '研究问题至少 12 字', '把问题写成可证伪的问句'),
    check('scope', scopeOk, '边界至少 20 字', '写清数据、对象、时间与不做什么'),
    check('success', successOk, '成功判据至少 10 字', '预先写下主指标与判定阈值'),
    check('world_question', Boolean(world.question && Object.keys(world.question).length), '世界模型记录主问题', '用 rsx_campaign action:"world" 记录 question'),
  ]
  if (profile) {
    const missing = domainCompleteness(state).missingFields.filter((item) => item.stage === 'scoping')
    checks.push(check('domain_scoping', missing.length === 0, `领域 scoping 待补 ${missing.length} 项`, '补领域 scoping 字段或写 N/A 理由'))
  }
  return checks
}

function checkSurvey(state) {
  const counts = sourceCounts(state)
  const coverage = Object.keys((state.world && state.world.coverage) || {}).length
  const extractions = arr(state.extractions).length
  const protocol = searchProtocol(state)
  return [
    check('sources', counts.sources.length >= 8, `来源 ${counts.sources.length}/8`, '至少捕获 8 条来源'),
    check('primary', counts.primary >= 2, `primary ${counts.primary}/2`, '加入原始数据/原始论文，而不是只读综述'),
    check('recent', counts.recent >= 1, `2023+ ${counts.recent}/1`, '补一条近期证据并说明与旧结论的差异'),
    check('captured', counts.captured >= 5, `有正文 ${counts.captured}/5`, '用 content 或 path 捕获全文，避免只存标题'),
    check('disconfirming', Boolean(state.search && state.search.disconfirming === true), '记录了否证检索', '用 rsx_campaign action:"search" 记录一次否证检索'),
    check(
      'search_protocol',
      !isFeatureSchema(state) || protocol.ok,
      `检索协议 ${protocol.entries.length} 条 / 问题 ${protocol.problems.length}`,
      '用 action:"searchLog" 登记数据库、查询、日期窗口与筛选计数',
    ),
    check('coverage', coverage >= 2, `覆盖图 ${coverage}/2`, '至少覆盖两个检索/证据领域'),
    check('extraction', extractions >= 1, `抽取矩阵 ${extractions} 行`, '用 rsx_extract 至少抽取一行关键维度'),
    check('independence', independentPrimarySources(state).length >= 2, `独立原始来源 ${independentPrimarySources(state).length}/2`, '声明 independence 或 lineage，避免同源重复'),
    check('risk_of_bias', assessedPrimarySources(state).length === counts.primary, `偏倚评估 ${assessedPrimarySources(state).length}/${counts.primary}`, '给每条 primary 来源写 design 与 riskOfBias'),
  ]
}

function checkHypothesis(state) {
  const hypothesis = arr(state.claims).find((item) => item.kind === 'hypothesis')
  if (!hypothesis) return [check('hypothesis', false, '没有 hypothesis', '用 rsx_claim kind:"hypothesis" 建立主假设')]
  const supports = arr(state.evidence).filter((item) => item.claim === hypothesis.id && item.relation === 'supports').length
  const novelty = state.world && state.world.novelty
  return [
    check('hypothesis', true, hypothesis.statement || hypothesis.id),
    check('falsifier', str(hypothesis.falsifier).length > 0, '有 falsifier', '写下什么观察会推翻假设'),
    check('kill_criterion', str(hypothesis.killCriterion).length > 0, '有 killCriterion', '写下何时放弃这条线'),
    check('predicted', str(hypothesis.predicted).length > 0, '有预测观察', '写清预测的方向与量级'),
    check('metric', str(hypothesis.metricName).length > 0 && str(hypothesis.metricUnit).length > 0, '有主指标与单位', '定义可计算的指标'),
    check('supports', supports >= 2, `支持证据 ${supports}/2`, '补到至少两条独立支持证据'),
    check('novelty', Boolean(novelty && novelty.checked === true), '已查最近先验工作', '记录 novelty.checked 与最近工作'),
    check('resolved', hypothesis.status !== 'proposed', `状态 ${hypothesis.status || 'proposed'}`, '给出 supported/contested/refuted 与理由'),
    check('warrant', str(hypothesis.warrant).length > 0, '有 warrant', '写清哪条规则让证据支持假设'),
    check('counter_search', str(hypothesis.counterEvidence).length > 0, '有反向证据检索', '记录反证检索与空结果'),
    check(
      'alternatives',
      arr(state.claims).length >= 2 || Object.keys((state.world && (state.world.failures || state.world.failure)) || {}).length > 0,
      '有竞争解释或失败记录',
      '记录一条竞争假设或放弃的路线',
    ),
  ]
}

function checkDesign(state) {
  const prereg = state.prereg && typeof state.prereg === 'object' ? state.prereg : {}
  const controls = Array.isArray(prereg.controls) ? prereg.controls : []
  return [
    check('prereg', Boolean(prereg.lockedAt || prereg.metric), '有预注册', '用 rsx_campaign action:"prereg" 锁定设计'),
    check('hypothesis_link', str(prereg.hypothesisId).length > 0, '预注册关联假设', '填写 hypothesisId'),
    check('metric', str(prereg.metric).length > 0, '有主指标', '预注册主指标'),
    check('n', Number.isFinite(Number(prereg.n)) && Number(prereg.n) > 0, '有样本量/运行数', '预注册 n'),
    check('analysis_plan', str(prereg.analysisPlan).length > 0, '有分析计划', '写下统计/判定计划'),
    check('stopping_rule', str(prereg.stoppingRule).length > 0, '有停止规则', '写下何时停止采样'),
    check('seed', prereg.seed !== null && prereg.seed !== '' && Number.isFinite(Number(prereg.seed)), '有随机种子', '预注册种子'),
    check('negative_control', controls.includes('negative'), '含负对照设计', '在 controls 中加入 negative'),
    check('env_lock', str(prereg.envLock).length > 0, '有环境锁', '记录版本/硬件/容器'),
    check('prereg_lock', str(prereg.lockedHash).length > 0, '预注册已锁定哈希', '锁定后再改会留下修订记录'),
    check('prereg_stats', str(prereg.alpha).length > 0 && str(prereg.power).length > 0, '有 alpha/power', '记录统计参数与效应量'),
  ]
}

function checkExecute(state) {
  const runs = arr(state.runs)
  const successes = runs.filter((item) => item.status === 'success')
  const negatives = runs.filter((item) => item.control === 'negative' && item.status === 'success')
  const metricRuns = successes.filter((item) => item.metrics && Object.keys(item.metrics).length > 0)
  const seeded = successes.filter((item) => item.seed !== null && item.seed !== undefined && item.seed !== '')
  const timing = preregTiming(state)
  return [
    check('success_run', successes.length > 0, `成功运行 ${successes.length}`, '记录一次真实运行'),
    check('prereg_timing', !isFeatureSchema(state) || timing.ok, timing.detail, '先锁定预注册，再开始采集数据'),
    check('seeded_run', seeded.length > 0, `带种子运行 ${seeded.length}`, '运行时传 seed'),
    check('metrics', metricRuns.length > 0, `带指标运行 ${metricRuns.length}`, '运行记录里写 metrics'),
    check('negative_run', negatives.length > 0, `负对照运行 ${negatives.length}`, '实际运行并记录负对照'),
    check('command', successes.every((item) => str(item.command).length > 0), '每条成功运行都有命令', '记录 exact command'),
    check('stdout', runs.some((item) => str(item.stdoutArtifact).length > 0), '至少一条运行有 stdout 工件', '用 stdoutPath 存原始输出'),
    check('run_history', runs.length >= 2, `运行历史 ${runs.length}/2`, '保留探索与确认两次运行'),
  ]
}

function checkTraceability(state, integrity) {
  const numbers = arr(state.numbers)
  const traces = numbers.map((item) => str(item.trace))
  const unresolved = numbers.filter((item) => !str(item.trace) || !resolveTrace(state, item.trace))
  const cited = sourceCounts(state).cited
  const knownSources = new Set(arr(state.sources).map((item) => item.id))
  const unknownCitations = [...cited].filter((id) => !knownSources.has(id))
  const figures = arr(state.figures)
  const completeFigures = figures.filter(
    (item) => str(item.artifact) && str(item.codeArtifact) && str(item.dataArtifact),
  )
  const artifacts = arr(state.artifacts)
  const claims = arr(state.claims).filter((claim) => claim.status && claim.status !== 'proposed')
  const evidence = arr(state.evidence)
  const noCertainty = claims.filter((claim) => !str(claim.certainty))
  const noCounter = claims.filter((claim) => !str(claim.counterEvidence))
  const contradicted = claims.filter(
    (claim) => claim.status === 'supported' && evidence.some((row) => row.claim === claim.id && row.relation === 'refutes'),
  )
  const sensitivities = sensitivityRows(state)
  const tracedSensitivities = sensitivities.filter((row) => str(row.trace) && resolveTrace(state, row.trace).ok)
  return [
    check('numbers', numbers.length > 0, `登记数字 ${numbers.length}`, '用 rsx_number 登记手稿中的数字'),
    check('traces', numbers.every((item) => str(item.trace).length > 0), '每个数字都有 trace', '数字必须来自 run/source 追溯'),
    check('traces_resolve', unresolved.length === 0, `未解析 trace ${unresolved.length}`, '运行 rsx_gate action:"check" 查看未解析项'),
    check('citations', cited.size > 0, `引用来源 ${cited.size}`, '在手稿中使用 [[src:S-0001]]'),
    check('citations_known', unknownCitations.length === 0, `未知引用 ${unknownCitations.length}`, '先登记来源再引用'),
    check('figures', figures.length === 0 || completeFigures.length === figures.length, `完整图 ${completeFigures.length}/${figures.length}`, '图需要 figure + code + data'),
    check('artifact_kinds', new Set(artifacts.map((item) => item.role)).size >= 2, '工件角色覆盖至少两类', '登记代码/数据/环境/输出等工件'),
    check('certainty', noCertainty.length === 0, `确定性缺口 ${noCertainty.length}`, '给每条定论写 CERTAINTY 等级'),
    check('counter_evidence', noCounter.length === 0, `反向检索缺口 ${noCounter.length}`, '定论也要记录反向证据检索'),
    check('contested_handled', contradicted.length === 0, `反证未处理 ${contradicted.length}`, '有 refutes 时改为 contested 或说明反证不成立'),
    check(
      'sensitivity',
      !isFeatureSchema(state) || sensitivities.length > 0,
      `敏感性分析 ${sensitivities.length}`,
      '用 rsx_claim action:"sensitivity" 记录换设定后的结果',
    ),
    check(
      'sensitivity_trace',
      !isFeatureSchema(state) || tracedSensitivities.length > 0,
      `可追溯敏感性 ${tracedSensitivities.length}`,
      '至少一条敏感性结果要能追到 run 或 source',
    ),
    check('integrity_reference', Boolean(integrity && integrity.chainOk === true), '事件链可验证', '修复链或重新 verify'),
  ]
}

function checkAudit(state, verifyAudit) {
  const audit = latestAudit(state)
  if (!audit) return [check('audit', false, '没有审查记录', '用 rsx_review action:"audit" 运行审查')]
  const fresh = audit.subjectHash === auditSubjectHash(state)
  const signature = typeof verifyAudit === 'function' ? verifyAudit(audit) : null
  const blocking = Array.isArray(audit.blocking) ? audit.blocking : []
  return [
    check('audit', true, audit.id || 'audit'),
    check('fresh', fresh, fresh ? '审查对象哈希新鲜' : '审查已过期', '修改台账后重新运行 audit'),
    check('signature', Boolean(signature && signature.ok === true), signature ? signature.reason || '签名有效' : '未提供验签函数', '用当前签名密钥重新审计'),
    check('no_blocking', blocking.length === 0, `blocking ${blocking.length}`, '解决 blocking 发现'),
    check('state_digest', audit.stateHash !== null && audit.stateHash !== undefined, '审查记录含 stateHash', '重新运行 audit 生成 stateHash'),
    check('waivers', waiverProblems(state).length === 0, `豁免问题 ${waiverProblems(state).length}`, '豁免要有理由、批准人、到期日且不能关掉受保护校验'),
  ]
}

function checkReview(state, profile) {
  const reviews = arr(state.reviews)
  const blocking = reviews.flatMap((review) =>
    arr(review.issues).filter((issue) => issue.severity === 'blocking' && issue.resolved !== true),
  )
  const roles = profile ? profile.reviewRoles : []
  const roleCovered = roles.filter((role) =>
    reviews.some((review) => review.role === role.id && review.independent !== false),
  )
  const independentPeople = new Set(
    reviews.filter((review) => review.independent !== false && str(review.reviewer)).map((review) => str(review.reviewer).toLowerCase()),
  )
  const checks = [
    check('reviews', reviews.length >= 2, `审查 ${reviews.length}/2`, '至少两条结构化审查'),
    check('adversarial', reviews.some((review) => review.adversarial === true), '含对抗审查', '至少一条红队审查'),
    check('no_reject', reviews.every((review) => review.verdict !== 'reject'), '无 reject', '处理拒绝意见后重新审查'),
    check('no_blocking', blocking.length === 0, `未解决 blocking ${blocking.length}`, '解决 blocking 问题'),
    check('independent_people', independentPeople.size >= 2, `独立评审人 ${independentPeople.size}/2`, '至少两位不同评审人'),
  ]
  const invalid = reviews.filter((review) => review.schema >= 2 && (!str(review.affiliation) || !str(review.conflict)))
  checks.push(check('identity_envelope', invalid.length === 0, `新式评审缺少身份/COI ${invalid.length}`, '补充 affiliation、conflict、independent'))
  if (roles.length) {
    checks.push(check('domain_roles', roleCovered.length === roles.length, `角色覆盖 ${roleCovered.length}/${roles.length}`, '每个领域角色各一条独立审查'))
  }
  return checks
}

function checkDomain(state, profile) {
  if (!profile) return [check('domain', true, '通用流程（未选择领域档案）')]
  const completeness = domainCompleteness(state)
  const applicableFields = profile.fields.filter((item) => item.required !== false && fieldApplicable(item, state))
  const fieldChecks = STAGE_ORDER.flatMap((stage) =>
    domainChecks(state, stage).filter((item) => !item.code.includes('_review_') && !item.code.endsWith('_monitoring')),
  )
  const failed = fieldChecks.filter((item) => !item.ok)
  const applicableStandards = profile.standards.filter((item) => standardApplicability(item, state).applicable)
  return [
    check('profile', true, `${profile.title.zh} (${profile.id})`),
    check('applicability', applicableFields.length > 0, `适用字段 ${applicableFields.length}`, '选择研究设计/风险等级以启用条件字段'),
    check('completeness', completeness.missing === 0, `领域完成 ${completeness.filled}/${completeness.required}`, '补齐缺失字段或写 N/A 理由'),
    check('checks', failed.length === 0, `阶段检查未通过 ${failed.length}`, '按 rsx_domain action:"check" 修正'),
    check('standards', applicableStandards.length > 0, `适用标准 ${applicableStandards.length}`, '核对标准适用性'),
  ]
}

function checkMonitoring(state) {
  const monitoring = normalizeMonitoring(state.monitoring)
  const assessment = evaluateMonitoring(monitoring)
  const active = monitoring.status === 'planned' || monitoring.status === 'active'
  return [
    check('status', active, `状态 ${monitoring.status}`, '发布后设为 planned/active'),
    check('plan', monitoring.plan.length >= 20, '监测计划 ≥20 字', '写清监测什么、触发什么动作'),
    check('owner', monitoring.owner.length >= 2, '有负责人', '指定一个可追责的人/角色'),
    check('cadence', monitoring.cadence.length >= 2, '有复查频率', '写每周/每月/每次发布'),
    check('metrics', monitoring.metrics.length > 0, `指标 ${monitoring.metrics.length}/1`, '登记至少一个可计算指标'),
    check('observations', monitoring.observations.length > 0, `观测 ${monitoring.observations.length}/1`, '记录至少一个真实观测值'),
    check('alerts', assessment.alerts.length === 0, `未处理告警 ${assessment.alerts.length}`, '处置告警或回到 analyze'),
    check('coverage', assessment.gaps.length === 0, `未覆盖信号/指标缺口 ${assessment.gaps.length}`, '为每个信号登记指标并记录观测'),
    check('reviewed', str(monitoring.reviewedAt).length > 0, '有最近复查时间', '登记 reviewedAt'),
  ]
}

function checkRelease(state) {
  const declaration = state.declaration && typeof state.declaration === 'object' ? state.declaration : {}
  const safety = state.world && state.world.safety && typeof state.world.safety === 'object' ? state.world.safety : {}
  const releaseGate = latestGate(state, 'release')
  const approval = latestApproval(state)
  const contributions = arr(declaration.contributions)
  const runs = arr(state.runs).filter((run) => run.status === 'success')
  const reproOk =
    runs.length > 0 &&
    runs.every((run) => str(run.command) && run.seed !== null && run.seed !== undefined) &&
    Boolean(str((state.prereg || {}).envLock)) &&
    runs.some((run) => str(run.stdoutArtifact))
  const costs = arr(state.costs)
  return [
    check('released', Boolean(state.releasedAt) || state.stage === 'release', '已到 release 阶段', '完成前八道闸门并推进 release'),
    check('declaration_ai', declaration.ai === true, '声明 AI 参与', 'rsx_write action:"declaration" ai:true'),
    check('declaration_watermark', declaration.watermark === true, '声明水印', 'watermark:true'),
    check('declaration_human', str(declaration.humanReviewer).length > 0, '有人工复核人', '署名 humanReviewer'),
    check('dual_use', safety.dual_use === 'pass', '双重用途检查通过', '在 world.safety 记录 dual_use:"pass"'),
    check('release_gate', Boolean(releaseGate && releaseGate.ok === true), 'release 闸门最近通过', '运行 release gate'),
    check('human_approval', Boolean(approval && approvalFresh(state, approval)), approval ? (approvalFresh(state, approval) ? `批准 ${approval.id}` : '批准已过期') : '没有人工批准', '用 rsx_gate action:"approve" 记录人类批准'),
    check('ai_contribution', contributions.some((item) => item.actor === 'ai') && contributions.some((item) => item.actor === 'human'), '有 AI/人类贡献矩阵', '在 declaration.contributions 记录双方角色'),
    check('repro_package', reproOk, '复现包完整', '命令、种子、环境锁与 stdout 齐备'),
    check('cost_ledger', isCoreSchema(state) ? costs.length > 0 || Number((state.budget || {}).spent?.tokens || 0) === 0 : true, '成本台账已记录', '用 rsx_campaign action:"budget" 记账'),
  ]
}

function checkIntegrity(state, integrity) {
  if (!integrity) return [check('integrity', false, '未提供完整性结果', '运行 store.verify')]
  return [
    check('chain', integrity.chainOk === true, integrity.chainOk ? '事件链完整' : `链断裂 seq ${integrity.brokenSeq ?? '?'}`, '从备份恢复 events.jsonl'),
    check('state', integrity.stateOk !== false, integrity.stateOk === false ? 'stateHash 不匹配' : 'stateHash 一致', '恢复 state.json 后重新 verify'),
    check('artifacts', (integrity.artifactProblems || []).length === 0, `工件异常 ${(integrity.artifactProblems || []).length}`, '修复缺失/篡改工件'),
    check('events', Number(integrity.events || state.seq || 0) > 0, `事件 ${integrity.events || state.seq || 0}`, '重新创建活动或恢复事件日志'),
  ]
}

function checkProgram(state) {
  if (!isProgramSchema(state)) {
    return [check('applicability', true, 'schema 1–3：研究程序完整性只作建议项', '新建 schema-4 项目时启用计划/视角/锦标赛/质量评审')]
  }
  const complete = programComplete(state)
  return complete.checks.map((row) => check(row.code, row.ok, row.detail, '用 rsx_program 补齐研究程序记录'))
}

const DIMENSIONS = [
  { id: 'question', title: '问题与边界', weight: 6, run: (state, profile) => checkQuestion(state, profile) },
  { id: 'survey', title: '证据测绘', weight: 10, run: (state) => checkSurvey(state) },
  { id: 'hypothesis', title: '可证伪假设', weight: 10, run: (state) => checkHypothesis(state) },
  { id: 'design', title: '预注册设计', weight: 7, run: (state) => checkDesign(state) },
  { id: 'program', title: '研究程序完整性', weight: 8, run: (state) => checkProgram(state) },
  { id: 'execution', title: '可复现执行', weight: 13, run: (state) => checkExecute(state) },
  { id: 'traceability', title: '数字与引文追溯', weight: 10, run: (state, _profile, integrity) => checkTraceability(state, integrity) },
  { id: 'audit', title: '自动化审计', weight: 10, run: (state, _profile, _integrity, verifyAudit) => checkAudit(state, verifyAudit) },
  { id: 'review', title: '独立评审', weight: 9, run: (state, profile) => checkReview(state, profile) },
  { id: 'domain', title: '领域适用性', weight: 7, run: (state, profile) => checkDomain(state, profile) },
  { id: 'monitoring', title: '发布后监测', weight: 8, run: (state) => checkMonitoring(state) },
  { id: 'release', title: '发布声明', weight: 6, run: (state) => checkRelease(state) },
  { id: 'integrity', title: '台账完整性', weight: 4, run: (state, _profile, integrity) => checkIntegrity(state, integrity) },
]

function gradeFor(score) {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 65) return 'C'
  return 'D'
}

function levelFor(score, monitoring, reviewChecks) {
  if (score >= 90 && monitoring === true && reviewChecks === true) return 'L4 可审计闭环'
  if (score >= 78) return 'L3 可复核研究'
  if (score >= 55) return 'L2 证据化草稿'
  if (score > 0) return 'L1 立项'
  return 'L0 空白'
}

export function evaluateLoop(state, options = {}) {
  const profile = getDomain(state && state.domain)
  const integrity = options.integrity || null
  const verifyAudit = typeof options.verifyAudit === 'function' ? options.verifyAudit : null
  const dimensions = DIMENSIONS.map((definition) => {
    const checks = definition.run(state, profile, integrity, verifyAudit)
    return dimension(definition.id, definition.title, definition.weight, checks)
  })
  const weighted = dimensions.reduce((acc, item) => acc + item.weight * item.score, 0)
  const totalWeight = dimensions.reduce((acc, item) => acc + item.weight, 0)
  const score = totalWeight ? Number(((weighted / totalWeight) * 100).toFixed(1)) : 0
  const monitoring = dimensions.find((item) => item.id === 'monitoring')
  const review = dimensions.find((item) => item.id === 'review')
  const audit = dimensions.find((item) => item.id === 'audit')
  const prerequisites = [
    {
      id: 'fresh_audit',
      ok: Boolean(audit && audit.score === 1),
      label: '新鲜、验签通过且无 blocking 的自动化审计',
    },
    {
      id: 'independent_review',
      ok: Boolean(review && review.score >= 0.8 && review.checks.find((item) => item.id === 'independent_people')?.ok),
      label: '两名独立评审人（领域项目还要覆盖两个角色）',
    },
    {
      id: 'monitoring_observations',
      ok: Boolean(
        monitoring &&
          monitoring.checks.find((item) => item.id === 'metrics')?.ok &&
          monitoring.checks.find((item) => item.id === 'observations')?.ok &&
          monitoring.checks.find((item) => item.id === 'alerts')?.ok &&
          monitoring.checks.find((item) => item.id === 'coverage')?.ok,
      ),
      label: '监测有指标、有观测、无未处理告警且每个信号都有指标覆盖',
    },
    {
      id: 'score_threshold',
      ok: score >= 85,
      label: '闭环成熟度 ≥85',
    },
  ]
  const rsiReady = prerequisites.every((item) => item.ok)
  const gaps = dimensions
    .flatMap((item) => item.gaps.map((gap) => ({ dimension: item.id, dimensionTitle: item.title, ...gap })))
    .sort((a, b) => {
      const wa = dimensions.find((item) => item.id === a.dimension)?.weight || 0
      const wb = dimensions.find((item) => item.id === b.dimension)?.weight || 0
      return wb - wa
    })
  const nextActions = gaps.slice(0, 6).map((item) => ({ dimension: item.dimension, action: item.fix || item.detail }))
  return {
    kind: 'research-loop',
    version: options.version || null,
    campaign: state.id || null,
    domain: state.domain || null,
    stage: state.stage || null,
    score,
    grade: gradeFor(score),
    level: levelFor(score, monitoring?.score === 1, review?.score >= 0.8),
    dimensions,
    gaps,
    nextActions,
    rsi: {
      ready: rsiReady,
      prerequisites,
      note: '这是“可自我改进闭环”的工程前提，不是智能水平或 AGI 测量；候选改动必须在同一评估器上重跑并与基线比较。',
    },
    basis: {
      sources: arr(state.sources).length,
      claims: arr(state.claims).length,
      runs: arr(state.runs).length,
      numbers: arr(state.numbers).length,
      reviews: arr(state.reviews).length,
      audits: arr(state.audits).length,
      events: Number((options.integrity && options.integrity.events) || state.seq || 0),
    },
    ts: new Date().toISOString(),
  }
}

/** Persist only what the report and panel need; the per-check evidence returns to the caller. */
export function compactEvaluation(evaluation) {
  if (!evaluation || typeof evaluation !== 'object') return evaluation
  const { dimensions, ...rest } = evaluation
  return {
    ...rest,
    dimensions: Array.isArray(dimensions)
      ? dimensions.map(({ id, title, weight, score, passed, total }) => ({ id, title, weight, score, passed, total }))
      : [],
  }
}

export function compactEvaluationHistory(evaluation) {
  if (!evaluation || typeof evaluation !== 'object') return evaluation
  return {
    id: evaluation.id,
    score: evaluation.score,
    grade: evaluation.grade,
    level: evaluation.level,
    delta: evaluation.delta ?? null,
    previousScore: evaluation.previousScore ?? null,
    rsiReady: Boolean(evaluation.rsi && evaluation.rsi.ready),
    ts: evaluation.ts,
    version: evaluation.version || null,
  }
}

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\|/gu, '\\|')
    .replace(/\r?\n/gu, ' ')
    .slice(0, 220)
}

export function renderLoopMarkdown(evaluation, state = null, { title = '研究闭环评估' } = {}) {
  const lines = [`## ${title}`, '']
  if (!evaluation) {
    lines.push('尚未运行闭环评估。')
    return lines.join('\n')
  }
  lines.push(`- 项目：**${escapeCell(state && state.title ? state.title : evaluation.campaign || '—')}**`)
  lines.push(`- 成熟度：**${evaluation.score}/100**（${evaluation.grade}）· ${evaluation.level}`)
  if (evaluation.previousScore !== null && evaluation.previousScore !== undefined) {
    const delta = evaluation.delta === null || evaluation.delta === undefined ? '' : `（${evaluation.delta >= 0 ? '+' : ''}${evaluation.delta}）`
    lines.push(`- 对比上次：${evaluation.previousScore}/100 → ${evaluation.score}/100 ${delta}`)
  }
  const baseline = state && state.loopBaseline
  if (baseline) {
    const delta = Number((evaluation.score - Number(baseline.score)).toFixed(1))
    lines.push(`- 基线：${baseline.score}/100；相对基线 ${delta >= 0 ? '+' : ''}${delta}`)
  }
  lines.push(`- 领域：${evaluation.domain || '通用流程'} · 阶段：${evaluation.stage || '—'}`)
  lines.push(`- 评估时间：${evaluation.ts}`)
  lines.push('')
  lines.push('| 维度 | 权重 | 通过 | 得分 |')
  lines.push('| --- | ---: | ---: | ---: |')
  for (const item of evaluation.dimensions) {
    lines.push(`| ${escapeCell(item.title)} (\`${item.id}\`) | ${item.weight} | ${item.passed}/${item.total} | ${Math.round(item.score * 100)}% |`)
  }
  lines.push('')
  if (evaluation.gaps.length) {
    lines.push('### 待补缺口（按维度权重排序）')
    lines.push('')
    for (const item of evaluation.gaps.slice(0, 20)) {
      lines.push(`- **${item.dimensionTitle}** · ${item.detail}${item.fix ? ` → ${item.fix}` : ''}`)
    }
    lines.push('')
  } else {
    lines.push('所有维度通过；仍需用同一评估器在改动后重跑并比较基线。')
    lines.push('')
  }
  lines.push('### 自我改进前提')
  lines.push('')
  for (const item of evaluation.rsi.prerequisites) {
    lines.push(`- ${item.ok ? '✅' : '⬜'} ${item.label}`)
  }
  lines.push('')
  lines.push(`> ${evaluation.rsi.note}`)
  lines.push('')
  lines.push('> 评分只检查工程可复核性，不判断科学结论、临床有效性、法律合规或投资建议是否正确。')
  return lines.join('\n')
}
