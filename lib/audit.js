/**
 * Automated reviewer.
 *
 * Claude Science's headline behaviour is a reviewer that checks every claim
 * against the execution record instead of trusting the prose. This module is
 * the local, deterministic version of that: citations must resolve to captured
 * sources, quotes must occur in the captured text, numbers must match the run
 * that produced them, figures must carry code and data provenance, and the
 * pre-registration must still describe the analysis that was actually run.
 *
 * Findings carry a severity. Only `blocking` findings stop the review gate;
 * `major` / `minor` / `info` are surfaced for the human reviewer instead of
 * being silently converted into pass/fail. The audit subject hash makes stale
 * reviews visible: edit a source after reviewing it and the gate asks for a
 * fresh audit.
 */
import { STAGE_ORDER } from './config.js'
import { numberMatchesTrace, orphanNumbers, preregTiming, resolveTrace } from './gates.js'
import { auditSubjectHash } from './subject.js'
import { domainChecks, getDomain } from './domains.js'
import {
  approvalProblems,
  claimRigor,
  expiredWaivers,
  isCoreSchema,
  isFeatureSchema,
  isProgramSchema,
  isStewardshipSchema,
  preregDrift,
  sourceRigor,
  waiverActive,
  waiverProblems,
} from './rigor.js'
import { checkEntailment } from './review.js'
import { searchProtocol } from './search.js'
import { sensitivityRowProblems, sensitivityRows } from './sensitivity.js'
import { programComplete } from './program.js'
import { stewardshipCompleteness } from './stewardship.js'
import { buildReproPackage } from './repro.js'

const NUM_REF = /\{\{N-(\d{4})\}\}/gu
const CITE_REF = /\[\[src:(S-\d{4})\]\]/gu

const SEVERITY_ORDER = { blocking: 0, major: 1, minor: 2, info: 3 }

function arr(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []
}

function str(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalize(text) {
  return String(text || '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase()
}

function add(findings, code, severity, title, detail, ref = '') {
  findings.push({ code, severity, title, detail: String(detail || ''), ref: String(ref || '') })
}

function sourceText(source, readArtifact) {
  const artifact = source.contentArtifact || source.contentHash
  if (!artifact || typeof readArtifact !== 'function') return null
  try {
    const text = readArtifact(artifact)
    return typeof text === 'string' ? text : null
  } catch {
    return null
  }
}

function quoteState(source, quote, readArtifact) {
  const text = sourceText(source, readArtifact)
  if (text === null) return 'unavailable'
  if (normalize(text).includes(normalize(quote))) return 'ok'
  return 'mismatch'
}

function checkIntegrity(state, integrity, findings) {
  if (!integrity) {
    add(findings, 'integrity_unchecked', 'major', '未校验事件链', '审查时没有拿到 verify() 结果，链与工件状态未知。')
    return
  }
  if (integrity.chainOk !== true) {
    add(
      findings,
      'chain_broken',
      'blocking',
      '事件链断裂',
      `哈希链在第 ${integrity.brokenSeq ?? '?'} 条事件处无法验证；先恢复 events.jsonl 再评审。`,
    )
  }
  if (integrity.stateOk === false) {
    add(
      findings,
      'state_tampered',
      'blocking',
      'state.json 与事件链不一致',
      `state.json 的 stateHash 无法验证；先恢复 state.json（${(integrity.stateProblems || []).map((item) => item.problem).join(', ') || 'state_hash_mismatch'}）。`,
    )
  }
  for (const problem of integrity.artifactProblems || []) {
    add(
      findings,
      'artifact_integrity',
      'blocking',
      '工件校验失败',
      `${problem.id}: ${problem.problem}`,
      problem.id,
    )
  }
}

function checkSources(state, findings, readArtifact, citedSourceIds) {
  const sources = arr(state.sources)
  if (sources.length === 0) {
    add(findings, 'sources_missing', 'blocking', '没有来源', '至少登记一条来源再进入评审。')
    return new Map()
  }
  const artifactIds = new Set(arr(state.artifacts).map((item) => item.id))
  const byId = new Map(sources.map((source) => [source.id, source]))
  const doiSeen = new Map()
  for (const source of sources) {
    if (str(source.contentHash) && !artifactIds.has(str(source.contentHash))) {
      add(
        findings,
        'source_content_missing',
        'blocking',
        '来源正文工件不存在',
        `${source.id} 的 contentHash=${source.contentHash} 不在工件台账中；先恢复正文再评审。`,
        source.id,
      )
    }
    if (source.retracted === true && citedSourceIds.has(source.id)) {
      add(findings, 'retracted_source_cited', 'blocking', '引用了撤稿来源', `${source.id} 被标记为 retracted，但稿件仍在引用它。`, source.id)
    }
    if (str(source.doi)) {
      const key = str(source.doi).toLowerCase()
      if (doiSeen.has(key)) {
        add(findings, 'duplicate_doi', 'minor', 'DOI 重复', `${source.id} 与 ${doiSeen.get(key)} 使用同一个 DOI ${source.doi}。`, source.id)
      } else {
        doiSeen.set(key, source.id)
      }
    }
    if (citedSourceIds.has(source.id)) {
      if (!str(source.contentHash)) {
        add(findings, 'citation_uncaptured', 'major', '引用没有全文捕获', `${source.id} 被稿件引用，但没有内容哈希；无法复核引文。`, source.id)
      }
      if (!str(source.url) && !str(source.doi)) {
        add(findings, 'citation_identifier_missing', 'minor', '缺少可定位标识', `${source.id} 既没有 URL 也没有 DOI。`, source.id)
      }
    }
    for (const gap of sourceRigor(source, byId)) {
      add(findings, gap.code, gap.severity, SOURCE_GAP_TITLE[gap.code] || '来源严谨性缺口', gap.detail, source.id)
    }
  }
  const independentPrimary = sources.filter(
    (source) => source.reliability === 'primary' && source.independence === 'independent',
  ).length
  if (sources.length > 0 && independentPrimary < 2) {
    add(
      findings,
      'source_independence_insufficient',
      'major',
      '独立原始来源不足',
      `只有 ${independentPrimary} 条 primary 来源声明独立；多条同源/派生来源不能当作独立重复验证。`,
    )
  }
  return byId
}

const SOURCE_GAP_TITLE = {
  source_independence: '原始来源未声明独立性',
  source_independence_invalid: '独立性取值非法',
  source_design: '原始来源缺少研究设计',
  source_rob: '原始来源未评估偏倚风险',
  source_rob_note: '偏倚风险缺少理由',
  source_rob_invalid: '偏倚风险取值非法',
  source_lineage_missing: '派生来源指向不存在',
  source_lineage_relation: '派生关系非法',
  source_capture_receipt: '捕获缺少时间回执',
}

const CLAIM_GAP_TITLE = {
  claim_warrant: '断言缺少 warrant',
  claim_counter_evidence: '断言缺少反向证据检索',
  claim_certainty: '断言缺少证据确定性',
  claim_contested_ignored: '反证未被处理',
  claim_without_support: '支持性断言没有证据',
  hypothesis_warrant: '主假设缺少 warrant',
}

function checkClaims(state, findings) {
  const claims = arr(state.claims)
  const evidence = arr(state.evidence)
  for (const claim of claims) {
    const rigor = claimRigor(claim, evidence)
    if (claim.status === 'proposed') {
      add(findings, 'claims_unresolved', 'blocking', '断言仍未定论', `${claim.id} 还是 proposed；评审前必须给出 supported/contested/refuted。`, claim.id)
    }
    for (const gap of rigor.gaps) {
      add(findings, gap.code, gap.severity, CLAIM_GAP_TITLE[gap.code] || '断言严谨性缺口', gap.detail, claim.id)
    }
    if (claim.status === 'refuted' && rigor.refutes === 0) {
      add(findings, 'claim_refuted_without_evidence', 'minor', '反驳结论没有证据', `${claim.id} 标为 refuted，但没有 refutes 证据行。`, claim.id)
    }
    if (claim.status && claim.status !== 'proposed' && !str(claim.reason)) {
      add(findings, 'claim_status_reason', 'minor', '状态变更缺少理由', `${claim.id} 的状态没有 reason。`, claim.id)
    }
    if (claim.kind === 'hypothesis') {
      if (rigor.supports < 2) {
        add(findings, 'hypothesis_support', 'major', '主假设支持不足', `${claim.id} 只有 ${rigor.supports} 条支持证据，评审期望至少 2 条。`, claim.id)
      }
      if (!str(claim.falsifier)) {
        add(findings, 'hypothesis_falsifier', 'major', '主假设缺少否证条件', `${claim.id} 没有 falsifier。`, claim.id)
      }
    }
  }
}

function checkEvidence(state, findings, sourceById, readArtifact) {
  const claims = new Set(arr(state.claims).map((item) => item.id))
  const runs = new Set(arr(state.runs).map((item) => item.id))
  const artifacts = new Set(arr(state.artifacts).map((item) => item.id))
  const seen = new Set()
  for (const evidence of arr(state.evidence)) {
    if (!claims.has(evidence.claim)) {
      add(findings, 'evidence_claim_missing', 'blocking', '证据指向不存在的断言', `${evidence.id || '?'} → ${evidence.claim || '?'}。`, evidence.id)
      continue
    }
    const ref = String(evidence.ref || '')
    const isSource = ref.startsWith('S-') || ref.startsWith('source:')
    const isRun = ref.startsWith('R-') || ref.startsWith('run:')
    const isArtifact = ref.startsWith('sha256:')
    if (!isSource && !isRun && !isArtifact) {
      add(findings, 'evidence_ref_invalid', 'minor', '证据引用格式异常', `${evidence.id || '?'} 的 ref=${evidence.ref}。`, evidence.id)
      continue
    }
    const sourceId = isSource ? ref.replace(/^source:/u, '') : ''
    const runId = ref.startsWith('run:') ? ref.slice(4) : ref
    if (isSource && !sourceById.has(sourceId)) {
      add(findings, 'evidence_source_missing', 'blocking', '证据来源不存在', `${evidence.id || '?'} → ${sourceId}。`, evidence.id)
      continue
    }
    if (isRun && !runs.has(runId)) {
      add(findings, 'evidence_run_missing', 'blocking', '证据运行不存在', `${evidence.id || '?'} → ${runId}。`, evidence.id)
      continue
    }
    if (isArtifact && !artifacts.has(ref)) {
      add(findings, 'evidence_artifact_missing', 'blocking', '证据工件不存在', `${evidence.id || '?'} → ${ref}。`, evidence.id)
      continue
    }
    if (evidence.relation && !['supports', 'refutes', 'context'].includes(evidence.relation)) {
      add(findings, 'evidence_relation_invalid', 'minor', '证据关系非法', `${evidence.id || '?'} relation=${evidence.relation}。`, evidence.id)
    }
    const key = `${evidence.claim}|${evidence.ref}|${evidence.relation}`
    if (seen.has(key)) {
      add(findings, 'evidence_duplicate', 'minor', '重复证据行', `${evidence.id || '?'} 与已有行完全相同。`, evidence.id)
    }
    seen.add(key)
    if (isSource) {
      const source = sourceById.get(sourceId)
      const quote = str(evidence.quote)
      const locator = str(evidence.locator)
      if (!quote && !locator) {
        add(findings, 'evidence_locator_missing', 'major', '证据没有摘录或定位', `${evidence.id || '?'} 没有 quote / locator，无法复核。`, evidence.id)
      } else if (quote) {
        const stateOfQuote = quoteState(source, quote, readArtifact)
        if (stateOfQuote === 'mismatch') {
          add(findings, 'quote_not_in_source', 'major', '摘录不在来源正文中', `${evidence.id || '?'} 的 quote 无法在 ${sourceId} 的捕获正文中找到。`, evidence.id)
        } else if (stateOfQuote === 'unavailable') {
          add(findings, 'quote_unverifiable', 'minor', '摘录无法自动验证', `${sourceId} 没有可读的捕获正文，quote 只能人工复核。`, evidence.id)
        }
      }
    }
  }
}

function checkNumbers(state, findings) {
  const numbers = arr(state.numbers)
  for (const number of numbers) {
    const resolved = resolveTrace(state, number.trace)
    if (!resolved.ok) {
      add(findings, 'number_trace_unresolved', 'blocking', '数字无法溯源', `${number.id}: ${resolved.reason}。`, number.id)
    } else if (!numberMatchesTrace(number, resolved)) {
      add(findings, 'number_trace_mismatch', 'blocking', '数字与运行记录不一致', `${number.id} 的值 ${number.value} 与 ${number.trace} 不符。`, number.id)
    }
    if (!str(number.uncertainty)) {
      add(findings, 'number_uncertainty', 'minor', '数字缺少不确定性', `${number.id} 没有 uncertainty。`, number.id)
    }
  }
  const manuscript = state.manuscript && str(state.manuscript.text)
  if (!manuscript) return
  const knownNumbers = new Set(numbers.map((item) => item.id))
  const numberRefs = [...manuscript.matchAll(NUM_REF)].map((match) => `N-${match[1]}`)
  for (const ref of new Set(numberRefs)) {
    if (!knownNumbers.has(ref)) {
      add(findings, 'number_ref_unknown', 'blocking', '稿件引用了不存在的数字', `${ref} 不在台账中。`, ref)
    }
  }
  for (const orphan of orphanNumbers(manuscript, knownNumbers, state.numbersAllowlist)) {
    add(findings, 'orphan_number', 'blocking', '稿件里有手写数字', `${orphan.value}（…${orphan.context}…）没有 {{N-xxxx}} 引用。`, orphan.value)
  }
}

function checkCitations(state, findings, sourceById) {
  const manuscript = state.manuscript && str(state.manuscript.text)
  if (!manuscript) return
  const refs = new Set([...manuscript.matchAll(CITE_REF)].map((match) => match[1]))
  for (const ref of refs) {
    if (!sourceById.has(ref)) {
      add(findings, 'citation_unknown', 'blocking', '稿件引用了不存在的来源', `${ref} 不在来源台账中。`, ref)
    }
  }
  if (refs.size === 0) {
    add(findings, 'citation_missing', 'blocking', '稿件没有引用来源', '至少用 [[src:S-0001]] 引用一条来源。')
  }
}

function checkFigures(state, findings) {
  const artifacts = new Set(arr(state.artifacts).map((item) => item.id))
  const runs = new Set(arr(state.runs).map((item) => item.id))
  const sources = new Set(arr(state.sources).map((item) => item.id))
  for (const figure of arr(state.figures)) {
    const missing = []
    if (!figure.artifact) missing.push('artifact')
    if (!figure.codeArtifact) missing.push('code')
    if (!figure.dataArtifact) missing.push('data')
    if (missing.length > 0) {
      add(findings, 'figure_provenance', 'blocking', '图缺少溯源', `${figure.id} 缺少 ${missing.join(' / ')}。`, figure.id)
      continue
    }
    for (const key of ['artifact', 'codeArtifact', 'dataArtifact', 'envArtifact']) {
      if (figure[key] && !artifacts.has(figure[key])) {
        add(findings, 'figure_artifact_missing', 'blocking', '图引用的工件不存在', `${figure.id} 的 ${key}=${figure[key]}。`, figure.id)
      }
    }
    if (figure.run && !runs.has(figure.run)) {
      add(findings, 'figure_run_missing', 'major', '图引用的运行不存在', `${figure.id} → ${figure.run}。`, figure.id)
    }
    if (figure.source && !sources.has(figure.source)) {
      add(findings, 'figure_source_missing', 'major', '图引用的来源不存在', `${figure.id} → ${figure.source}。`, figure.id)
    }
    if (!str(figure.caption)) add(findings, 'figure_caption_missing', 'minor', '图缺少说明', `${figure.id} 没有 caption。`, figure.id)
    if (!str(figure.description)) add(findings, 'figure_description_missing', 'minor', '图缺少通俗描述', `${figure.id} 没有 description。`, figure.id)
    if (!str(figure.env) && !figure.envArtifact) add(findings, 'figure_env_missing', 'minor', '图缺少环境记录', `${figure.id} 没有 env / envArtifact。`, figure.id)
  }
}

function checkPrereg(state, findings) {
  const prereg = state.prereg
  const stageIndex = STAGE_ORDER.indexOf(state.stage)
  if (!prereg) {
    if (stageIndex >= STAGE_ORDER.indexOf('design')) {
      add(findings, 'prereg_missing', 'major', '没有预注册', '运行前应写入预注册（metric / n / 分析计划 / 停止规则 / 种子 / 对照）。')
    }
    return
  }
  if (!str(prereg.metric)) add(findings, 'prereg_metric', 'major', '预注册缺少主指标', 'prereg.metric 为空。')
  if (!(Number(prereg.n) >= 1)) add(findings, 'prereg_n', 'major', '预注册缺少样本量', 'prereg.n 必须 ≥ 1。')
  if (!str(prereg.analysisPlan)) add(findings, 'prereg_analysis', 'major', '预注册缺少分析计划', 'prereg.analysisPlan 为空。')
  if (!str(prereg.stoppingRule)) add(findings, 'prereg_stopping', 'major', '预注册缺少停止规则', 'prereg.stoppingRule 为空。')
  if (prereg.seed === null || prereg.seed === '' || !Number.isFinite(Number(prereg.seed))) {
    add(findings, 'prereg_seed', 'major', '预注册缺少种子', 'prereg.seed 必须是有限数字。')
  }
  if (!Array.isArray(prereg.controls) || !prereg.controls.includes('negative')) {
    add(findings, 'prereg_negative_control', 'major', '预注册缺少负对照', 'controls 应包含 "negative"。')
  }
  if (!str(prereg.envLock)) add(findings, 'prereg_env', 'major', '预注册缺少环境锁', 'prereg.envLock 为空。')
  if (!str(prereg.alpha) || !str(prereg.power)) {
    add(findings, 'prereg_stats', 'minor', '预注册缺少统计参数', '登记 alpha / power / effect size，便于判断样本量是否合理。')
  }
  const drift = preregDrift(prereg)
  if (drift) {
    add(
      findings,
      drift.amended ? 'prereg_amended' : 'prereg_drift',
      drift.amended ? 'info' : 'major',
      drift.amended ? '预注册有带理由的修订' : '预注册在锁定后被修改',
      drift.amended
        ? `锁定哈希 ${drift.from.slice(0, 12)}… → 当前 ${drift.to.slice(0, 12)}…；修订理由：${drift.lastReason}`
        : `锁定哈希 ${drift.from.slice(0, 12)}… ≠ 当前 ${drift.to.slice(0, 12)}…，且没有修订记录。`,
    )
  }
  if (str(prereg.lockedAt)) {
    const late = arr(state.runs)
      .filter((run) => run.status === 'success' && str(run.ts) && String(run.ts) < String(prereg.lockedAt))
      .map((run) => run.id)
    if (late.length > 0) {
      add(
        findings,
        'prereg_after_execution',
        'major',
        '运行早于预注册锁定',
        `${late.join(', ')} 在预注册锁定前已执行；这不是预注册，最多算事后说明。`,
      )
    }
  }
  const hypothesis = arr(state.claims).find((item) => item.id === prereg.hypothesisId)
  if (hypothesis && str(hypothesis.metricName) && str(prereg.metric) && hypothesis.metricName !== prereg.metric) {
    add(
      findings,
      'prereg_metric_mismatch',
      'major',
      '预注册指标与假设不一致',
      `假设 ${hypothesis.id} 用 ${hypothesis.metricName}，预注册用 ${prereg.metric}。`,
      hypothesis.id,
    )
  }
  const successful = arr(state.runs).filter((item) => item.status === 'success')
  if (successful.length > 0 && prereg.seed !== null && prereg.seed !== '') {
    const wrong = successful.filter((item) => item.seed !== undefined && item.seed !== null && String(item.seed) !== String(prereg.seed))
    if (wrong.length > 0) {
      add(findings, 'prereg_seed_mismatch', 'major', '运行种子偏离预注册', `预注册 seed=${prereg.seed}，偏离的运行：${wrong.map((item) => item.id).join(', ')}。`)
    }
  }
}

function checkControls(state, findings) {
  const runs = arr(state.runs)
  const successes = runs.filter((item) => item.status === 'success')
  if (successes.length === 0) return
  const negatives = successes.filter((item) => item.control === 'negative')
  if (negatives.length === 0) {
    add(findings, 'negative_control_missing', 'major', '没有负对照运行', '至少记录一条 control:"negative" 的成功运行。')
    return
  }
  const primary = successes.filter((item) => item.control !== 'negative')
  for (const main of primary) {
    for (const negative of negatives) {
      const keys = Object.keys(main.metrics || {}).filter((key) => key in (negative.metrics || {}))
      if (keys.length === 0) continue
      const identical = keys.every((key) => Number(main.metrics[key]) === Number(negative.metrics[key]))
      if (identical) {
        add(
          findings,
          'negative_control_identical',
          'major',
          '负对照与主运行指标完全相同',
          `${main.id} 与 ${negative.id} 在 ${keys.join(', ')} 上一样，负对照可能没有真正生效。`,
          negative.id,
        )
      }
    }
  }
}

function checkExtractions(state, findings, sourceById, readArtifact) {
  const extractions = arr(state.extractions)
  const sources = arr(state.sources)
  if (extractions.length === 0) {
    if (state.templateId === 'lit-review') {
      add(findings, 'extraction_matrix_missing', 'major', '文献综述没有抽取矩阵', '用 rsx_extract 把论文按维度抽成矩阵，再写综述。')
    }
    return
  }
  const covered = new Set()
  for (const row of extractions) {
    if (!sourceById.has(row.source)) {
      add(findings, 'extraction_source_missing', 'blocking', '抽取行指向不存在的来源', `${row.id || '?'} → ${row.source || '?'}。`, row.id)
      continue
    }
    covered.add(row.source)
    if (!str(row.dimension)) add(findings, 'extraction_dimension', 'minor', '抽取行缺少维度', `${row.id || '?'} 没有 dimension。`, row.id)
    if (!str(row.value)) add(findings, 'extraction_value', 'minor', '抽取行缺少取值', `${row.id || '?'} 没有 value。`, row.id)
    if (str(row.quote)) {
      const source = sourceById.get(row.source)
      const status = quoteState(source, row.quote, readArtifact)
      if (status === 'mismatch') {
        add(findings, 'extraction_quote_mismatch', 'major', '抽取摘录不在来源正文中', `${row.id || '?'} 的 quote 无法在 ${row.source} 中找到。`, row.id)
      } else if (status === 'unavailable') {
        add(findings, 'extraction_quote_unverifiable', 'minor', '抽取摘录无法自动验证', `${row.source} 没有可读正文。`, row.id)
      }
    }
  }
  const target = Math.min(3, sources.length)
  if (covered.size < target) {
    add(findings, 'extraction_coverage', 'minor', '抽取矩阵覆盖不足', `已覆盖 ${covered.size}/${sources.length} 条来源，建议至少 ${target} 条。`)
  }
}

function checkDomain(state, findings) {
  if (!state.domain) return
  const profile = getDomain(state.domain)
  if (!profile) {
    add(findings, 'domain_profile', 'blocking', '领域档案不存在', `state.domain=${state.domain}，请用 rsx_domain 重新选择。`, state.domain)
    return
  }
  const currentIndex = STAGE_ORDER.indexOf(state.stage)
  for (const stage of STAGE_ORDER) {
    if (currentIndex >= 0 && STAGE_ORDER.indexOf(stage) > currentIndex) continue
    for (const row of domainChecks(state, stage)) {
      if (row.ok) continue
      const title = row.code.includes('_review_')
        ? '领域审查角色缺失'
        : row.code.endsWith('_monitoring')
          ? '发布后监测未登记'
          : '领域必填项未完成'
      add(findings, row.code, row.blocking === false ? 'major' : 'blocking', title, `${stage}: ${row.detail}`, row.code)
    }
  }
}

function checkReleaseReadiness(state, findings) {
  const declaration = state.declaration || {}
  if (!declaration.ai || !declaration.watermark) {
    add(findings, 'declaration_incomplete', 'major', 'AI 声明不完整', '需要 ai:true 与 watermark:true。')
  }
  if (!str(declaration.model)) add(findings, 'declaration_model', 'major', 'AI 声明缺少模型', 'declaration.model 为空。')
  if (!str(declaration.humanReviewer)) add(findings, 'declaration_reviewer', 'major', 'AI 声明缺少人工复核人', 'declaration.humanReviewer 为空。')
  const search = state.search || {}
  if (search.disconfirming !== true) add(findings, 'disconfirming_missing', 'major', '没有反例检索', '先做一次 disconfirming search。')
  const novelty = state.world && state.world.novelty
  if (!novelty || novelty.checked !== true) add(findings, 'novelty_missing', 'major', '没有查新', '在 world.novelty 记录最近的相关工作检查。')
  const dualUse = state.world && state.world.safety ? state.world.safety.dual_use : undefined
  if (dualUse !== 'pass') add(findings, 'dual_use_missing', 'major', '没有完成 dual-use 审查', '在 world.safety.dual_use 记录 pass。')
}

function checkSearchProtocol(state, findings) {
  if (!isFeatureSchema(state)) return
  const protocol = searchProtocol(state)
  if (protocol.entries.length === 0) {
    add(findings, 'search_protocol_missing', 'major', '没有检索协议', 'schema-3 项目至少需要一条带查询的检索记录（rsx_campaign action:"searchLog"）。')
    return
  }
  if (protocol.problems.length > 0) {
    add(
      findings,
      'search_protocol_invalid',
      'major',
      '检索记录无法复核',
      protocol.problems.map((item) => `${item.id}: ${item.code}`).join('; '),
    )
  }
  const incomplete = protocol.entries.filter(
    (entry) => !Number.isInteger(entry.hits) || !Number.isInteger(entry.screened) || !Number.isInteger(entry.included),
  )
  if (incomplete.length > 0) {
    add(
      findings,
      'search_counts_missing',
      'minor',
      '检索计数不完整',
      `${incomplete.map((entry) => entry.id).join(', ')} 缺少命中/初筛/纳入计数；没有计数就无法复现筛选流程。`,
    )
  }
}

function checkSensitivity(state, findings) {
  if (!isFeatureSchema(state)) return
  const rows = sensitivityRows(state)
  if (rows.length === 0) {
    add(findings, 'sensitivity_missing', 'major', '没有敏感性分析', 'schema-3 项目至少需要一条换设定后的稳健性记录（rsx_claim action:"sensitivity"）。')
    return
  }
  const problems = sensitivityRowProblems(state)
  if (problems.length > 0) {
    add(
      findings,
      'sensitivity_invalid',
      'major',
      '敏感性记录不完整',
      problems.map((item) => `${item.id}: ${item.code}`).join('; '),
    )
  }
  const untraced = rows.filter((row) => !str(row.trace))
  if (untraced.length > 0) {
    add(
      findings,
      'sensitivity_untraced',
      'minor',
      '敏感性结果没有追溯',
      `${untraced.map((row) => row.id).join(', ')} 是叙述式结果；能追到 run/source 时补 trace。`,
    )
  }
  const unresolved = rows.filter((row) => str(row.trace) && !resolveTrace(state, row.trace).ok)
  for (const row of unresolved) {
    add(
      findings,
      'sensitivity_trace_unresolved',
      'major',
      '敏感性追溯无法解析',
      `${row.id} 的 trace ${row.trace} 无法解析为 run 指标或来源。`,
      row.id,
    )
  }
}

function checkPreregTiming(state, findings) {
  if (!isFeatureSchema(state)) return
  const timing = preregTiming(state)
  if (!timing.ok) {
    add(findings, 'prereg_after_run', 'major', '预注册晚于首次运行', timing.detail)
  }
}

function checkClaimEvidenceLink(state, findings) {
  if (arr(state.claims).length === 0) return
  const screen = checkEntailment(state)
  for (const row of screen.weak) {
    if (Array.isArray(row.flags) && row.flags.includes('negation_mismatch')) continue
    add(
      findings,
      'claim_evidence_weak',
      'minor',
      '证据引文与断言词面不匹配',
      `${row.claim} 的 ${row.evidence}（${row.status}，覆盖率 ${row.coverage}）没有覆盖断言关键词；请人工确认是否真的支持。`,
      row.claim,
    )
  }
  for (const row of screen.flagged) {
    if (row.flags.includes('negation_mismatch')) {
      add(
        findings,
        'claim_evidence_negation',
        'major',
        '证据引文与断言否定极性相反',
        `${row.claim} 的 ${row.evidence} 在否定词上与断言不一致；词面重合不等于语义支持，人工必须复核。`,
        row.claim,
      )
    }
    if (row.flags.includes('number_mismatch')) {
      add(
        findings,
        'claim_evidence_number',
        'minor',
        '证据引文与断言数字不一致',
        `${row.claim} 的 ${row.evidence} 没有任何与断言相同的数字；确认数值口径或改用数字台账。`,
        row.claim,
      )
    }
  }
  if (screen.unsupported.length > 0) {
    add(
      findings,
      'claim_evidence_untraceable',
      'major',
      '断言只有弱支持',
      `${screen.unsupported.join(', ')} 的所有支持证据都没有通过词面覆盖筛查；需要更强的引文或改用 run 证据。`,
    )
  }
}

function checkWaivers(state, findings) {
  const problems = waiverProblems(state)
  for (const item of problems) {
    const protectedCode = item.problem === 'protected'
    add(
      findings,
      protectedCode ? 'waiver_protected' : 'waiver_invalid',
      item.problem === 'expired' ? 'major' : 'blocking',
      protectedCode ? '豁免试图关闭受保护校验' : '豁免记录不合法',
      `${item.code || '（缺 code）'} · ${item.problem}；豁免必须有理由、批准人、到期日，且不能覆盖完整性/签名/独立性声明。`,
      item.code,
    )
  }
  for (const waiver of arr(state.waivers)) {
    if (waiverProblems({ waivers: [waiver] }).length > 0) continue
    if (waiverActive(waiver)) {
      add(
        findings,
        'waiver_active',
        'info',
        '存在生效中的豁免',
        `${waiver.code} 由 ${waiver.approvedBy} 批准，至 ${waiver.expiresAt}：${waiver.reason}`,
        waiver.code,
      )
    }
  }
  for (const waiver of expiredWaivers(state)) {
    add(
      findings,
      'waiver_expired',
      'info',
      '豁免已到期',
      `${waiver.code} 已于 ${waiver.expiresAt} 到期；对应检查重新生效，需要修复或重新批准。`,
      waiver.code,
    )
  }
}

function checkApprovals(state, findings) {
  const problems = approvalProblems(state)
  for (const item of problems) {
    add(
      findings,
      item.code,
      'major',
      item.code === 'approval_stale' ? '人工批准已失效' : '人工批准记录不完整',
      `批准记录 ${item.approval && item.approval.id ? item.approval.id : '（未编号）'} 需要批准人、角色、至少 12 字的声明，并与最近一次审查的对象哈希一致。`,
    )
  }
  if (isCoreSchema(state) && STAGE_ORDER.indexOf(state.stage) >= STAGE_ORDER.indexOf('review') && arr(state.approvals).length === 0) {
    add(findings, 'human_approval_missing', 'major', '没有人工批准', '发布前需要 rsx_gate action:"approve" 记录一位人类批准者；自动化审查不能自我批准。')
  }
}

function checkContributions(state, findings) {
  if (!isCoreSchema(state)) return
  if (STAGE_ORDER.indexOf(state.stage) < STAGE_ORDER.indexOf('write')) return
  const declaration = state.declaration || {}
  const roles = arr(declaration.contributions)
  if (!roles.some((item) => item.actor === 'ai') || !roles.some((item) => item.actor === 'human')) {
    add(
      findings,
      'ai_contribution_missing',
      'major',
      'AI/人类贡献矩阵不完整',
      'declaration.contributions 至少需要一条 ai 与一条 human 角色记录（谁做了什么、谁负责）。',
    )
  }
}

function checkReproduction(state, findings) {
  const package_ = buildReproPackage(state)
  const successes = package_.runs
  if (successes.length === 0) return
  if (successes.some((run) => !str(run.command))) {
    add(findings, 'repro_command_missing', 'major', '复现包缺少命令', '至少一次成功运行没有记录精确命令。')
  }
  if (successes.some((run) => run.seed === null || run.seed === undefined)) {
    add(findings, 'repro_seed_missing', 'major', '复现包缺少种子', '至少一次成功运行没有记录随机种子。')
  }
  if (!str(package_.environment.envLock) && package_.environment.artifacts.length === 0) {
    add(findings, 'repro_env_missing', 'major', '复现包缺少环境锁', 'prereg.envLock 为空，也没有 environment 工件。')
  }
  if (!successes.some((run) => run.stdoutArtifact)) {
    add(findings, 'repro_stdout_missing', 'major', '复现包缺少原始输出', '至少一次成功运行应 attach 原始 stdout，便于重跑比对。')
  }
}

function checkStewardship(state, findings) {
  if (!isStewardshipSchema(state)) return
  const completeness = stewardshipCompleteness(state.stewardship)
  if (completeness.ok) return
  add(
    findings,
    'stewardship_incomplete',
    'major',
    '研究治理信息不完整',
    `schema-5 发布需要 FAIR 许可、数据/代码可用性、利益冲突、伦理与 CRediT 贡献者；缺少：${completeness.missing
      .map((item) => item.label)
      .join('、')}。`,
  )
}

function checkProgram(state, findings) {
  if (!isProgramSchema(state)) return
  const complete = programComplete(state)
  if (complete.ok) return
  const detail = complete.checks
    .filter((item) => !item.ok)
    .map((item) => `${item.code}: ${item.detail}`)
    .join('；')
  add(findings, 'program_incomplete', 'major', '研究程序不完整', `schema-4 需要计划、视角、自治循环、锦标赛、质量评分与矛盾台账；${detail}`)
}

/**
 * @param {object} state materialised campaign
 * @param {{integrity?: object, readArtifact?: (id: string) => string|null}} options
 */
export function runAudit(state, options = {}) {
  const findings = []
  const readArtifact = options.readArtifact
  const integrity = options.integrity
  checkIntegrity(state, integrity, findings)

  const manuscript = state.manuscript && str(state.manuscript.text)
  const citedSourceIds = new Set()
  if (manuscript) {
    for (const match of manuscript.matchAll(CITE_REF)) citedSourceIds.add(match[1])
  }
  const sourceById = checkSources(state, findings, readArtifact, citedSourceIds)
  checkClaims(state, findings)
  checkEvidence(state, findings, sourceById, readArtifact)
  checkNumbers(state, findings)
  checkCitations(state, findings, sourceById)
  checkFigures(state, findings)
  checkPrereg(state, findings)
  checkControls(state, findings)
  checkExtractions(state, findings, sourceById, readArtifact)
  checkClaimEvidenceLink(state, findings)
  checkSearchProtocol(state, findings)
  checkSensitivity(state, findings)
  checkPreregTiming(state, findings)
  checkWaivers(state, findings)
  checkApprovals(state, findings)
  checkContributions(state, findings)
  checkReproduction(state, findings)
  checkDomain(state, findings)
  checkProgram(state, findings)
  checkStewardship(state, findings)
  checkReleaseReadiness(state, findings)

  findings.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) || a.code.localeCompare(b.code))
  const counts = { blocking: 0, major: 0, minor: 0, info: 0 }
  for (const finding of findings) counts[finding.severity] = (counts[finding.severity] || 0) + 1
  const blocking = [...new Set(findings.filter((item) => item.severity === 'blocking').map((item) => item.code))]
  return {
    ok: blocking.length === 0,
    verdict: blocking.length === 0 ? (counts.major > 0 ? 'major' : 'accept') : 'block',
    findings,
    counts,
    blocking,
    subjectHash: auditSubjectHash(state),
    stateHash: integrity && typeof integrity.stateHash === 'string' ? integrity.stateHash : null,
    ts: new Date().toISOString(),
  }
}

const VERDICT_LABEL = {
  accept: '通过（无阻断、无主要问题）',
  major: '无阻断，但有需要人工确认的主要问题',
  block: '阻断：必须先修复',
}

export function renderAuditMarkdown(audit, { title = '自动化审查' } = {}) {
  if (!audit) return `## ${title}\n\n尚未运行自动化审查。调用 \`rsx_review action:"audit"\`。\n`
  const counts = audit.counts || {}
  const lines = [
    `## ${title}`,
    '',
    `- 结论：**${VERDICT_LABEL[audit.verdict] || audit.verdict}**`,
    `- 审查 ID：${audit.id || '（未记录）'}`,
    `- 审查时间：${audit.ts || '—'}`,
    `- 对象哈希：\`${audit.subjectHash || '—'}\``,
    `- 签名：${audit.signature ? `HMAC-SHA256 / ${audit.keyId || 'unknown key'}` : '未签名'}`,
    `- 计数：blocking ${counts.blocking || 0} · major ${counts.major || 0} · minor ${counts.minor || 0} · info ${counts.info || 0}`,
    '',
  ]
  if (!audit.findings || audit.findings.length === 0) {
    lines.push('未发现问题。', '')
    return lines.join('\n')
  }
  for (const severity of ['blocking', 'major', 'minor', 'info']) {
    const rows = (audit.findings || []).filter((item) => item.severity === severity)
    if (rows.length === 0) continue
    lines.push(`### ${severity}`, '', '| code | 问题 | 详情 | ref |', '| --- | --- | --- | --- |')
    for (const row of rows) {
      lines.push(`| \`${row.code}\` | ${row.title || ''} | ${String(row.detail || '').replace(/\|/gu, '\\|')} | ${row.ref || ''} |`)
    }
    lines.push('')
  }
  return lines.join('\n')
}
