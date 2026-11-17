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
import { numberMatchesTrace, orphanNumbers, resolveTrace } from './gates.js'
import { auditSubjectHash } from './subject.js'

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
  }
  return byId
}

function checkClaims(state, findings) {
  const claims = arr(state.claims)
  const evidence = arr(state.evidence)
  for (const claim of claims) {
    const supports = evidence.filter((item) => item.claim === claim.id && item.relation === 'supports').length
    const refutes = evidence.filter((item) => item.claim === claim.id && item.relation === 'refutes').length
    if (claim.status === 'proposed') {
      add(findings, 'claims_unresolved', 'blocking', '断言仍未定论', `${claim.id} 还是 proposed；评审前必须给出 supported/contested/refuted。`, claim.id)
    }
    if (claim.status === 'supported' && supports === 0) {
      add(findings, 'claim_without_support', 'major', '支持性断言没有证据', `${claim.id} 标为 supported，但没有 supports 证据行。`, claim.id)
    }
    if (claim.status === 'refuted' && refutes === 0) {
      add(findings, 'claim_refuted_without_evidence', 'minor', '反驳结论没有证据', `${claim.id} 标为 refuted，但没有 refutes 证据行。`, claim.id)
    }
    if (claim.status && claim.status !== 'proposed' && !str(claim.reason)) {
      add(findings, 'claim_status_reason', 'minor', '状态变更缺少理由', `${claim.id} 的状态没有 reason。`, claim.id)
    }
    if (claim.kind === 'hypothesis') {
      if (supports < 2) {
        add(findings, 'hypothesis_support', 'major', '主假设支持不足', `${claim.id} 只有 ${supports} 条支持证据，评审期望至少 2 条。`, claim.id)
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
