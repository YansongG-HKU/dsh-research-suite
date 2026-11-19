/**
 * Reviewer support: a compact review packet and a deterministic,
 * lexical entailment screen.
 *
 * The entailment screen is deliberately not sold as "semantic understanding".
 * It measures whether the words of a claim actually occur in the quote offered
 * as support, which catches copy-paste drift, unrelated citations and
 * quote-free assertions. A human reviewer still decides meaning; the screen
 * only makes the cheap failure visible before the reviewer spends time.
 */
import { claimRigor } from './rigor.js'
import { searchEntries } from './search.js'
import { sensitivityRows } from './sensitivity.js'
import { auditSubjectHash } from './subject.js'

const CITE_REF = /\[\[src:(S-\d{4})\]\]/gu

function arr(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []
}

function str(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function tokenSet(text) {
  const lower = String(text || '').toLowerCase()
  const latin = lower.match(/[a-z][a-z0-9_-]{2,}/gu) || []
  const chars = [...lower].filter((char) => /[\u4e00-\u9fff]/u.test(char))
  const bigrams = []
  for (let index = 0; index < chars.length - 1; index += 1) bigrams.push(chars[index] + chars[index + 1])
  return new Set([...latin, ...bigrams])
}

function overlap(left, right) {
  if (left.size === 0) return 0
  let shared = 0
  for (const token of left) if (right.has(token)) shared += 1
  return shared / left.size
}

const LATIN_NEGATION = /\b(?:not|no|never|without|none|neither|nor|cannot|can't|doesn't|don't|didn't|isn't|aren't|wasn't|weren't|hasn't|haven't)\b/iu
const CJK_NEGATION = /(?:不(?!同|仅|断|论|管|得|久|少|过)|未|无(?!关|论|疑)|没有|并非|不能|不会|不应|不含|未见|尚未|否认)/u

function hasNegation(text) {
  const value = String(text || '')
  return LATIN_NEGATION.test(value) || CJK_NEGATION.test(value)
}

function numbersIn(text) {
  const values = []
  for (const match of String(text || '').matchAll(/(?<![\w.])-?\d+(?:\.\d+)?%?/gu)) {
    const raw = match[0]
    const number = Number(raw.replace(/%$/u, ''))
    if (Number.isFinite(number)) values.push(number)
  }
  return [...new Set(values)]
}

function numericMismatch(claimText, quoteText) {
  const claimNumbers = numbersIn(claimText)
  const quoteNumbers = numbersIn(quoteText)
  if (claimNumbers.length === 0 || quoteNumbers.length === 0) return false
  const quoteSet = new Set(quoteNumbers)
  return claimNumbers.every((value) => !quoteSet.has(value))
}

/**
 * One row per supporting evidence item. Run/artifact evidence is numeric or
 * procedural, so it is marked `numeric` and not lexically compared.
 */
export function checkEntailment(state, { threshold = 0.2 } = {}) {
  const claims = new Map(arr(state.claims).map((claim) => [claim.id, claim]))
  const rows = []
  for (const evidence of arr(state.evidence)) {
    if (evidence.relation !== 'supports') continue
    const claim = claims.get(evidence.claim)
    if (!claim) continue
    const ref = String(evidence.ref || '')
    if (ref.startsWith('R-') || ref.startsWith('run:') || ref.startsWith('sha256:')) {
      rows.push({ evidence: evidence.id, claim: claim.id, ref, status: 'numeric', coverage: 1, reason: 'run/artifact evidence', flags: [] })
      continue
    }
    const quote = str(evidence.quote)
    if (!quote) {
      rows.push({ evidence: evidence.id, claim: claim.id, ref, status: 'no_quote', coverage: 0, reason: 'no quote', flags: [] })
      continue
    }
    const claimTokens = tokenSet(claim.statement)
    const quoteTokens = tokenSet(quote)
    if (quoteTokens.size < 3) {
      rows.push({
        evidence: evidence.id,
        claim: claim.id,
        ref,
        status: 'weak',
        coverage: 0,
        threshold,
        reason: 'quote too short to screen',
        flags: [],
      })
      continue
    }
    // Measure how much of the *quote* is anchored in the claim, not how much
    // of a long conjunctive claim one quote covers. A single result quote can
    // legitimately support one clause of a multi-part hypothesis.
    const coverage = Number(overlap(quoteTokens, claimTokens).toFixed(3))
    const flags = []
    const negationMismatch = hasNegation(claim.statement) !== hasNegation(quote)
    if (negationMismatch) flags.push('negation_mismatch')
    if (numericMismatch(claim.statement, quote)) flags.push('number_mismatch')
    const weak = coverage < threshold || negationMismatch
    rows.push({
      evidence: evidence.id,
      claim: claim.id,
      ref,
      status: weak ? 'weak' : 'entailed',
      coverage,
      threshold,
      flags,
      reason: negationMismatch
        ? 'claim and quote differ in negation polarity'
        : weak
          ? 'quote shares too few claim terms'
          : 'quote terms are anchored in the claim',
    })
  }
  const byClaim = new Map()
  for (const row of rows) {
    const current = byClaim.get(row.claim) || { strong: 0, weak: 0, numeric: 0, total: 0 }
    current.total += 1
    if (row.status === 'entailed' || row.status === 'numeric') current.strong += 1
    else if (row.status === 'weak' || row.status === 'no_quote') current.weak += 1
    byClaim.set(row.claim, current)
  }
  const unsupported = [...byClaim.entries()]
    .filter(([, counts]) => counts.total > 0 && counts.strong === 0)
    .map(([claim]) => claim)
  const comparable = rows.filter((row) => row.status !== 'numeric').length
  const weak = rows.filter((row) => row.status === 'weak' || row.status === 'no_quote')
  const flagged = rows.filter((row) => Array.isArray(row.flags) && row.flags.length > 0)
  return {
    rows,
    weak,
    flagged,
    unsupported,
    threshold,
    coverage: comparable === 0 ? 1 : Number(((comparable - weak.length) / comparable).toFixed(3)),
    note: 'Lexical screen only: it verifies that claim terms occur in the supporting quote, not that the quote logically entails the claim.',
  }
}

export function buildReviewPacket(state, { audit = null, integrity = null } = {}) {
  const claims = arr(state.claims).map((claim) => {
    const evidence = arr(state.evidence).filter((item) => item.claim === claim.id)
    const rigor = claimRigor(claim, evidence)
    return {
      id: claim.id,
      kind: claim.kind,
      status: claim.status,
      statement: claim.statement,
      falsifier: claim.falsifier,
      warrant: claim.warrant || '',
      counterEvidence: claim.counterEvidence || '',
      certainty: claim.certainty || '',
      confidence: claim.confidence,
      supports: rigor.supports,
      refutes: rigor.refutes,
      gaps: rigor.gaps.map((item) => item.code),
      evidence: evidence.map((item) => ({
        id: item.id,
        relation: item.relation,
        ref: item.ref,
        locator: item.locator,
        quote: item.quote,
      })),
    }
  })
  const cited = new Set(
    [...String((state.manuscript && state.manuscript.text) || '').matchAll(CITE_REF)].map((match) => match[1]),
  )
  const sources = arr(state.sources).map((source) => ({
    id: source.id,
    title: source.title,
    year: source.year,
    kind: source.kind,
    reliability: source.reliability,
    independence: source.independence || 'unknown',
    design: source.design || '',
    riskOfBias: source.riskOfBias || 'not-assessed',
    robNote: source.robNote || '',
    lineage: source.lineage || null,
    cited: cited.has(source.id),
    captured: Boolean(source.contentHash || source.contentArtifact),
  }))
  const numbers = arr(state.numbers).map((number) => ({
    id: number.id,
    name: number.name,
    value: number.value,
    unit: number.unit,
    uncertainty: number.uncertainty,
    trace: number.trace,
  }))
  const runs = arr(state.runs).map((run) => ({
    id: run.id,
    status: run.status,
    control: run.control || null,
    seed: run.seed,
    command: run.command,
    metrics: run.metrics,
    stdout: run.stdoutArtifact || null,
  }))
  const questions = [
    '主假设的 warrant 是否真的把证据和结论连起来，还是只是复述结论？',
    '反证检索记录了什么？没有反例和没有检索是两件事。',
    '确定性（certainty）与证据数量匹配吗？多条同源证据不能升级为高确定性。',
    '每个被引用来源是否独立？派生来源是否指向原始来源？',
    '偏倚风险 high / some-concerns 的具体理由和影响是否写清楚？',
    '预注册与当前分析是否一致？不一致是否有带理由的修订记录？',
    '数字能否从 run/来源重算？不确定性的口径是什么？',
    '负对照真的会让效应消失吗？它的输出在哪里？',
    '复现包是否包含精确命令、种子、环境锁和原始 stdout？',
    '检索协议是否写清了数据库、日期窗口和命中/筛选/纳入计数？哪些数据库没有覆盖？',
    '敏感性分析换过哪些设定？有没有一个合理设定会让结论反向？',
    '有哪些结论一旦新证据出现就会改变？谁负责发布后监测？',
  ]
  const packet = {
    campaign: state.id,
    title: state.title,
    stage: state.stage,
    domain: state.domain || null,
    subjectHash: auditSubjectHash(state),
    generatedAt: new Date().toISOString(),
    questions,
    claims,
    sources,
    search: searchEntries(state),
    sensitivity: sensitivityRows(state),
    numbers,
    runs,
    audit: audit
      ? { id: audit.id, ok: audit.ok, verdict: audit.verdict, counts: audit.counts, blocking: audit.blocking }
      : null,
    integrity: integrity
      ? { chainOk: integrity.chainOk, stateOk: integrity.stateOk, artifacts: integrity.artifacts, events: integrity.events }
      : null,
  }
  packet.markdown = renderReviewPacket(packet)
  return packet
}

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\|/gu, '\\|')
    .replace(/\r?\n/gu, ' ')
    .slice(0, 240)
}

export function renderReviewPacket(packet) {
  const lines = [
    `# 评审包 · ${packet.title || packet.campaign}`,
    '',
    `- 活动：${packet.campaign} · 阶段：${packet.stage} · 领域：${packet.domain || '通用'}`,
    `- 对象哈希：\`${packet.subjectHash}\``,
    `- 生成时间：${packet.generatedAt}`,
    '',
    '## 评审问题',
    '',
    ...packet.questions.map((question, index) => `${index + 1}. ${question}`),
    '',
    '## 断言与证据',
    '',
    '| id | 状态 | 断言 | 支持/反驳 | 确定性 | warrant | 缺口 |',
    '| --- | --- | --- | ---: | --- | --- | --- |',
  ]
  for (const claim of packet.claims) {
    lines.push(
      `| ${claim.id} | ${claim.status} | ${escapeCell(claim.statement)} | ${claim.supports}/${claim.refutes} | ${claim.certainty || '—'} | ${escapeCell(claim.warrant || '—')} | ${claim.gaps.join(', ') || '—'} |`,
    )
  }
  lines.push('', '## 来源独立性', '', '| id | 来源 | 可靠性 | 独立性 | 设计 | 偏倚 | 引用 |', '| --- | --- | --- | --- | --- | --- | --- |')
  for (const source of packet.sources) {
    lines.push(
      `| ${source.id} | ${escapeCell(source.title)} | ${source.reliability} | ${source.independence} | ${escapeCell(source.design || '—')} | ${source.riskOfBias} | ${source.cited ? '是' : '否'} |`,
    )
  }
  lines.push('', '## 检索协议', '', '| id | 类型 | 数据库 | 查询 | 命中/初筛/纳入 | 否证 |', '| --- | --- | --- | --- | --- | --- |')
  for (const entry of packet.search) {
    lines.push(
      `| ${entry.id} | ${entry.kind} | ${escapeCell(entry.database)} | ${escapeCell(entry.query)} | ${entry.hits ?? '—'}/${entry.screened ?? '—'}/${entry.included ?? '—'} | ${entry.disconfirming ? '是' : '否'} |`,
    )
  }
  lines.push('', '## 敏感性分析', '', '| id | 名称 | 方法 | 设定 | 结果 | 方向 | 追溯 |', '| --- | --- | --- | --- | --- | --- | --- |')
  for (const row of packet.sensitivity) {
    lines.push(
      `| ${row.id} | ${escapeCell(row.name)} | ${escapeCell(row.method)} | ${escapeCell(row.specification)} | ${escapeCell(row.result)} | ${row.direction} | ${row.trace ? `\`${escapeCell(row.trace)}\`` : '—'} |`,
    )
  }
  lines.push('', '## 数字与运行', '')
  for (const number of packet.numbers) {
    lines.push(`- ${number.id} · ${number.name}=${number.value} ${number.unit || ''}（${number.uncertainty || '无不确定性'}）← \`${number.trace}\``)
  }
  for (const run of packet.runs) {
    lines.push(`- ${run.id} · ${run.status}${run.control ? ` · ${run.control}` : ''} · seed=${run.seed} · \`${run.command}\``)
  }
  if (packet.audit) {
    lines.push(
      '',
      '## 最近自动化审查',
      '',
      `- ${packet.audit.id || '（未记录）'} · ok=${packet.audit.ok} · verdict=${packet.audit.verdict} · blocking=${(packet.audit.blocking || []).join(', ') || '0'}`,
    )
  }
  lines.push('', '> 评审包只汇总可核验记录；签名与哈希链由 review gate 单独校验。')
  return lines.join('\n')
}
