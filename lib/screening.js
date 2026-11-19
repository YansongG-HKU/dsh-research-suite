/**
 * Candidate-level screening and PRISMA 2020 flow data (0.14).
 *
 * A candidate is a search record, not yet a source. It keeps three separate
 * decisions (title, abstract, full text), an exclusion reason code, an optional
 * link to a retained candidate for duplicates, and an optional source id once
 * the record enters the evidence ledger. This module is pure: it never writes
 * the ledger and never parses a PDF.
 */
import { EXCLUSION_REASONS, LIMITS, SCREENING_DECISIONS, SCREENING_STAGES } from './config.js'
import { truncate, utcnow } from './util.js'
import { searchEntries, searchSummary } from './search.js'

export const STAGE_FIELDS = Object.freeze({
  title: 'title',
  abstract: 'abstract',
  'full-text': 'fullText',
})

export const STAGE_LABELS = Object.freeze({
  title: '标题',
  abstract: '摘要',
  'full-text': '全文',
})

const REASON_LABELS = Object.freeze({
  'not-relevant': '不相关',
  'wrong-population': '人群不符',
  'wrong-intervention': '干预不符',
  'wrong-comparator': '对照不符',
  'wrong-outcome': '结局不符',
  'wrong-design': '设计不符',
  'not-peer-reviewed': '非同行评议',
  duplicate: '重复记录',
  'not-retrieved': '全文不可得',
  'insufficient-data': '数据不足',
  other: '其他',
})

function str(value, max = 4_000) {
  return truncate(typeof value === 'string' ? value.trim() : '', max).text
}

function invalid(message, detail) {
  const error = new Error(message)
  error.code = 'invalid_input'
  if (detail !== undefined) error.detail = detail
  return error
}

function normalizeDecision(row) {
  if (!row || typeof row !== 'object') return null
  if (!SCREENING_DECISIONS.includes(row.decision)) return null
  return {
    decision: row.decision,
    reason: EXCLUSION_REASONS.includes(row.reason) ? row.reason : '',
    note: str(row.note, 2_000),
    reviewer: str(row.reviewer, 120),
    at: str(row.at, 40),
  }
}

function normalizeCandidate(row) {
  if (!row || typeof row !== 'object') return null
  const id = String(row.id || '')
  if (!/^R-\d{4,}$/u.test(id)) return null
  const decisions = row.decisions && typeof row.decisions === 'object' ? row.decisions : {}
  return {
    id,
    title: str(row.title, 500),
    doi: str(row.doi, 200),
    year: Number.isInteger(row.year) && row.year > 0 && row.year < 3000 ? row.year : null,
    source: str(row.source, 20),
    duplicateOf: str(row.duplicateOf, 20),
    decisions: {
      title: normalizeDecision(decisions.title),
      abstract: normalizeDecision(decisions.abstract),
      fullText: normalizeDecision(decisions.fullText),
    },
    createdAt: str(row.createdAt, 40),
    updatedAt: str(row.updatedAt, 40),
  }
}

/** Normalize a state field without mutating the state. */
export function normalizeScreening(state) {
  const raw = state && state.screening && typeof state.screening === 'object' ? state.screening : {}
  const rows = Array.isArray(raw.candidates) ? raw.candidates : []
  const seen = new Set()
  const candidates = []
  for (const row of rows) {
    const normalized = normalizeCandidate(row)
    if (!normalized || seen.has(normalized.id)) continue
    seen.add(normalized.id)
    candidates.push(normalized)
  }
  return { candidates }
}

/** A JSON-safe candidate with a derived `duplicate` flag. */
export function publicCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return null
  return {
    id: candidate.id,
    title: candidate.title || '',
    doi: candidate.doi || '',
    year: candidate.year ?? null,
    source: candidate.source || '',
    duplicateOf: candidate.duplicateOf || '',
    duplicate: Boolean(candidate.duplicateOf),
    decisions: {
      title: candidate.decisions && candidate.decisions.title ? { ...candidate.decisions.title } : null,
      abstract: candidate.decisions && candidate.decisions.abstract ? { ...candidate.decisions.abstract } : null,
      fullText: candidate.decisions && candidate.decisions.fullText ? { ...candidate.decisions.fullText } : null,
    },
    createdAt: candidate.createdAt || '',
    updatedAt: candidate.updatedAt || '',
  }
}

/** Apply one stage decision in place. Throws `invalid_input` for bad values. */
export function applyScreeningDecision(candidate, args = {}) {
  if (!candidate || typeof candidate !== 'object') throw invalid('a candidate is required')
  if (candidate.duplicateOf) {
    throw invalid(`candidate ${candidate.id} is a duplicate and was removed before screening; record the decision on ${candidate.duplicateOf}`)
  }
  const stage = str(args.stage, 40)
  const field = STAGE_FIELDS[stage]
  if (!field) throw invalid(`stage must be one of ${SCREENING_STAGES.join(', ')}`)
  const decision = str(args.decision, 40)
  if (!SCREENING_DECISIONS.includes(decision)) {
    throw invalid(`decision must be one of ${SCREENING_DECISIONS.join(', ')}`)
  }
  const reason = str(args.reason, 80)
  if (decision === 'exclude' && !reason) {
    throw invalid('an exclude decision needs a reason code', { reasons: EXCLUSION_REASONS })
  }
  if (reason && !EXCLUSION_REASONS.includes(reason)) {
    throw invalid(`reason must be one of ${EXCLUSION_REASONS.join(', ')}`)
  }
  if (reason === 'not-retrieved' && stage !== 'full-text') {
    throw invalid('not-retrieved is only valid at the full-text stage')
  }
  if (stage === 'full-text' && reason === 'not-retrieved' && decision !== 'exclude') {
    throw invalid('not-retrieved requires decision:"exclude" at the full-text stage')
  }
  if (stage === 'full-text') {
    const title = decisionOf(candidate, 'title')
    const abstract = decisionOf(candidate, 'abstract')
    if (!title || title.decision !== 'include' || !abstract || abstract.decision !== 'include') {
      throw invalid('a full-text decision requires title and abstract decisions with decision:"include"')
    }
  }
  const at = utcnow()
  candidate.decisions = candidate.decisions && typeof candidate.decisions === 'object'
    ? candidate.decisions
    : { title: null, abstract: null, fullText: null }
  candidate.decisions[field] = {
    decision,
    reason: decision === 'exclude' ? reason : '',
    note: str(args.notes, 2_000),
    reviewer: str(args.reviewer, 120) || 'agent',
    at,
  }
  candidate.updatedAt = at
  return candidate.decisions[field]
}

/**
 * Clear every decision after `stage`. Called when a title/abstract decision is
 * no longer include, because a later-stage decision would otherwise remain in
 * the record while being ineligible. Returns the cleared field names.
 */
export function clearDownstreamDecisions(candidate, stage) {
  if (!candidate || typeof candidate !== 'object') throw invalid('a candidate is required')
  if (candidate.duplicateOf) throw invalid(`candidate ${candidate.id} is a duplicate and has no screening decisions`)
  const index = SCREENING_STAGES.indexOf(str(stage, 40))
  if (index < 0) throw invalid(`stage must be one of ${SCREENING_STAGES.join(', ')}`)
  const decisions = candidate.decisions && typeof candidate.decisions === 'object' ? candidate.decisions : {}
  const cleared = []
  for (const next of SCREENING_STAGES.slice(index + 1)) {
    const field = STAGE_FIELDS[next]
    if (decisions[field]) {
      decisions[field] = null
      cleared.push(field)
    }
  }
  if (cleared.length > 0) candidate.updatedAt = utcnow()
  return cleared
}

function decisionOf(record, field) {
  return record.decisions && record.decisions[field] ? record.decisions[field] : null
}

function countReasons(records, field) {
  const reasons = {}
  for (const record of records) {
    const decision = decisionOf(record, field)
    if (!decision || decision.decision !== 'exclude' || !decision.reason) continue
    reasons[decision.reason] = (reasons[decision.reason] || 0) + 1
  }
  return reasons
}

function stageStats(records, field) {
  const stats = { decided: 0, include: 0, exclude: 0, maybe: 0, missing: 0, reasons: countReasons(records, field) }
  for (const record of records) {
    const decision = decisionOf(record, field)
    if (!decision) {
      stats.missing += 1
      continue
    }
    stats.decided += 1
    if (decision.decision === 'include') stats.include += 1
    else if (decision.decision === 'exclude') stats.exclude += 1
    else stats.maybe += 1
  }
  return stats
}

function node(id, label, count) {
  return { id, label, count }
}

/**
 * Build the full PRISMA data object. `counts` is deliberately redundant with
 * `flow.nodes` so a consumer can use either without recomputing.
 */
export function buildPrisma(state) {
  const rawCandidates = state && state.screening && Array.isArray(state.screening.candidates)
    ? state.screening.candidates
    : []
  const candidates = normalizeScreening(state).candidates
  const malformedCandidates = Math.max(0, rawCandidates.length - candidates.length)
  const records = candidates.map(publicCandidate)
  const duplicates = records.filter((record) => record.duplicate)
  const retained = records.filter((record) => !record.duplicate)
  const byId = new Map(records.map((record) => [record.id, record]))
  const sourceIds = new Set((Array.isArray(state && state.sources) ? state.sources : []).map((source) => source.id))

  const titleDecided = retained.filter((record) => decisionOf(record, 'title'))
  const abstractDecided = retained.filter((record) => decisionOf(record, 'abstract'))
  const titleExcluded = retained.filter((record) => {
    const decision = decisionOf(record, 'title')
    return decision && decision.decision === 'exclude'
  })
  const abstractExcluded = retained.filter((record) => {
    const decision = decisionOf(record, 'abstract')
    return decision && decision.decision === 'exclude'
  })
  const excludedScreening = new Set([...titleExcluded, ...abstractExcluded].map((record) => record.id))
  const sought = retained.filter((record) => {
    const title = decisionOf(record, 'title')
    const abstract = decisionOf(record, 'abstract')
    return title && title.decision === 'include' && abstract && abstract.decision === 'include'
  })
  const notRetrieved = sought.filter((record) => {
    const decision = decisionOf(record, 'fullText')
    return decision && decision.decision === 'exclude' && decision.reason === 'not-retrieved'
  })
  const assessed = sought.filter((record) => {
    const decision = decisionOf(record, 'fullText')
    if (!decision) return false
    if (decision.decision === 'maybe') return false
    if (decision.decision === 'exclude' && decision.reason === 'not-retrieved') return false
    return true
  })
  const fullTextExcluded = assessed.filter((record) => decisionOf(record, 'fullText').decision === 'exclude')
  const included = assessed.filter((record) => decisionOf(record, 'fullText').decision === 'include')
  const pendingScreening = retained.filter((record) => {
    if (excludedScreening.has(record.id)) return false
    if (sought.some((item) => item.id === record.id)) return false
    return true
  })
  const pendingFullText = sought.filter((record) => {
    if (included.some((item) => item.id === record.id)) return false
    if (fullTextExcluded.some((item) => item.id === record.id)) return false
    if (notRetrieved.some((item) => item.id === record.id)) return false
    return true
  })
  const pendingIds = [...new Set([...pendingScreening, ...pendingFullText].map((record) => record.id))]

  const counts = {
    recordsIdentified: records.length,
    duplicatesRemoved: duplicates.length,
    recordsAfterDuplicates: retained.length,
    titleAbstractScreened: retained.filter((record) => decisionOf(record, 'title') || decisionOf(record, 'abstract')).length,
    titleAbstractExcluded: excludedScreening.size,
    reportsSought: sought.length,
    reportsNotRetrieved: notRetrieved.length,
    reportsAssessed: assessed.length,
    fullTextExcluded: fullTextExcluded.length,
    studiesIncluded: included.length,
    pending: pendingIds.length,
    pendingScreening: pendingScreening.length,
    pendingFullText: pendingFullText.length,
  }

  const abstractEligible = retained.filter((record) => {
    const title = decisionOf(record, 'title')
    return title && title.decision !== 'exclude'
  })
  const stages = {
    title: stageStats(retained, 'title'),
    abstract: stageStats(abstractEligible, 'abstract'),
    fullText: stageStats(sought, 'fullText'),
  }

  const warnings = []
  if (malformedCandidates > 0) {
    warnings.push({
      code: 'invalid_candidates',
      detail: `${malformedCandidates} candidate row(s) were omitted because their id was invalid or duplicated`,
    })
  }
  if (records.length === 0) {
    warnings.push({ code: 'no_candidates', detail: 'no candidate records have been screened' })
  }
  for (const duplicate of duplicates) {
    const target = byId.get(duplicate.duplicateOf)
    if (!target) {
      warnings.push({ code: 'orphan_duplicate', detail: `${duplicate.id} points at an unknown retained candidate` })
    } else if (target.duplicate) {
      warnings.push({ code: 'duplicate_of_duplicate', detail: `${duplicate.id} points at ${target.id}, which is itself a duplicate` })
    }
    if (decisionOf(duplicate, 'title') || decisionOf(duplicate, 'abstract') || decisionOf(duplicate, 'fullText')) {
      warnings.push({ code: 'duplicate_decided', detail: `${duplicate.id} is a duplicate but also has a screening decision` })
    }
  }
  for (const record of retained) {
    const titleDecision = decisionOf(record, 'title')
    if (decisionOf(record, 'abstract') && !titleDecision) {
      warnings.push({ code: 'decision_out_of_order', detail: `${record.id} has an abstract decision before a title decision` })
    }
    if (decisionOf(record, 'fullText') && !sought.some((item) => item.id === record.id)) {
      warnings.push({ code: 'decision_out_of_order', detail: `${record.id} has a full-text decision before title and abstract inclusion` })
    }
    if (
      titleDecision &&
      titleDecision.decision === 'exclude' &&
      (decisionOf(record, 'abstract') || decisionOf(record, 'fullText'))
    ) {
      warnings.push({ code: 'decision_after_exclusion', detail: `${record.id} has later-stage decisions after a title exclusion` })
    }
    if (included.some((item) => item.id === record.id) && !record.source) {
      warnings.push({ code: 'included_without_source', detail: `${record.id} is included but is not linked to a source` })
    }
    if (record.source && !sourceIds.has(record.source)) {
      warnings.push({ code: 'missing_source', detail: `${record.id} points at ${record.source}, which is not in the ledger` })
    }
  }
  const search = searchSummary(searchEntries(state))
  if (records.length > 0 && search.searches === 0) {
    warnings.push({ code: 'no_search_log', detail: 'candidates exist but no search protocol entry was recorded' })
  }
  if (pendingIds.length > 0) {
    warnings.push({ code: 'screening_pending', detail: `${pendingIds.length} candidate(s) still need a final screening decision` })
  }
  const inconsistentCodes = [...new Set(
    warnings
      .map((warning) => warning.code)
      .filter((code) => ['invalid_candidates', 'decision_out_of_order', 'decision_after_exclusion', 'duplicate_decided', 'orphan_duplicate', 'duplicate_of_duplicate'].includes(code)),
  )]
  const consistency = { ok: inconsistentCodes.length === 0, codes: inconsistentCodes }

  const flow = {
    nodes: [
      node('records-identified', 'Records identified', counts.recordsIdentified),
      node('duplicates-removed', 'Duplicates removed', counts.duplicatesRemoved),
      node('records-screened', 'Records screened', counts.titleAbstractScreened),
      node('records-excluded', 'Records excluded at title/abstract', counts.titleAbstractExcluded),
      node('reports-sought', 'Reports sought for retrieval', counts.reportsSought),
      node('reports-not-retrieved', 'Reports not retrieved', counts.reportsNotRetrieved),
      node('reports-assessed', 'Reports assessed for eligibility', counts.reportsAssessed),
      node('reports-excluded', 'Reports excluded at full text', counts.fullTextExcluded),
      node('studies-included', 'Studies included', counts.studiesIncluded),
    ],
    edges: [
      { from: 'records-identified', to: 'duplicates-removed' },
      { from: 'records-identified', to: 'records-screened' },
      { from: 'records-screened', to: 'records-excluded' },
      { from: 'records-screened', to: 'reports-sought' },
      { from: 'reports-sought', to: 'reports-not-retrieved' },
      { from: 'reports-sought', to: 'reports-assessed' },
      { from: 'reports-assessed', to: 'reports-excluded' },
      { from: 'reports-assessed', to: 'studies-included' },
    ],
  }

  return {
    standard: 'PRISMA 2020',
    scope: 'flow counts from recorded candidate decisions; not a PRISMA compliance certification',
    campaign: state && state.id ? state.id : '',
    title: state && state.title ? state.title : '',
    generatedAt: utcnow(),
    complete: records.length > 0 && pendingIds.length === 0 && consistency.ok,
    consistency,
    counts,
    stages,
    exclusionReasons: {
      title: stages.title.reasons,
      abstract: stages.abstract.reasons,
      fullText: stages.fullText.reasons,
    },
    duplicates: {
      removed: duplicates.length,
      pairs: duplicates.map((record) => ({ id: record.id, duplicateOf: record.duplicateOf || '' })),
    },
    pending: {
      total: pendingIds.length,
      screening: pendingScreening.length,
      fullText: pendingFullText.length,
      candidateIds: pendingIds,
    },
    included: {
      studies: included.length,
      candidateIds: included.map((record) => record.id),
    },
    search,
    flow,
    warnings,
    records,
  }
}

function table(headers, rows) {
  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
  ]
  for (const row of rows) lines.push(`| ${row.join(' | ')} |`)
  return lines.join('\n')
}

function cell(value, max = 160) {
  return String(value ?? '')
    .replace(/\|/gu, '\\|')
    .replace(/\r?\n/gu, ' ')
    .slice(0, max)
}

export function exclusionReasonLabel(code) {
  return REASON_LABELS[code] || String(code || '—')
}

function decisionCell(decision) {
  if (!decision) return '—'
  return decision.decision === 'exclude'
    ? `exclude (${decision.reason || 'no-reason'})`
    : decision.decision
}

/** Human-readable PRISMA report, also embedded in REPORT.md. */
export function renderPrismaMarkdown(prisma, options = {}) {
  const level = Math.max(1, Number(options.level) || 1)
  const title = options.title || 'PRISMA 2020 流程图数据'
  const h = (depth, text) => `${'#'.repeat(depth)} ${text}`
  const counts = prisma.counts || {}
  const records = Array.isArray(prisma.records) ? prisma.records : []
  const consistency = prisma.consistency || { ok: true, codes: [] }
  const lines = [
    h(level, title),
    '',
    `> 由候选级筛选记录生成；标准为 ${prisma.standard || 'PRISMA 2020'}。计数可复核，但不构成 PRISMA 合规声明。`,
    `> 项目：${prisma.campaign || '—'} ｜ 生成时间：${prisma.generatedAt || '—'} ｜ 完整：${prisma.complete ? '是' : '否'} ｜ 数据一致：${consistency.ok ? '是' : '否'}`,
    '',
  ]

  lines.push(h(level + 1, '流量计数'))
  lines.push('')
  lines.push(
    table(
      ['阶段', '计数'],
      [
        ['识别记录', counts.recordsIdentified ?? 0],
        ['移除重复', counts.duplicatesRemoved ?? 0],
        ['去重后记录', counts.recordsAfterDuplicates ?? 0],
        ['标题/摘要已筛', counts.titleAbstractScreened ?? 0],
        ['标题/摘要排除', counts.titleAbstractExcluded ?? 0],
        ['寻求全文', counts.reportsSought ?? 0],
        ['全文不可得', counts.reportsNotRetrieved ?? 0],
        ['全文评估', counts.reportsAssessed ?? 0],
        ['全文排除', counts.fullTextExcluded ?? 0],
        ['纳入研究', counts.studiesIncluded ?? 0],
        ['待处理', counts.pending ?? 0],
      ],
    ),
  )
  lines.push('')

  lines.push(h(level + 1, '三阶段决策'))
  lines.push('')
  const stageRows = SCREENING_STAGES.map((stage) => {
    const field = STAGE_FIELDS[stage]
    const stats = prisma.stages && prisma.stages[field] ? prisma.stages[field] : {}
    return [
      STAGE_LABELS[stage],
      stats.decided ?? 0,
      stats.include ?? 0,
      stats.exclude ?? 0,
      stats.maybe ?? 0,
      stats.missing ?? 0,
    ]
  })
  lines.push(table(['阶段', '已决策', 'include', 'exclude', 'maybe', '未决策'], stageRows))
  lines.push('')

  lines.push(h(level + 1, '排除理由'))
  lines.push('')
  const reasonRows = []
  for (const stage of SCREENING_STAGES) {
    const field = STAGE_FIELDS[stage]
    const reasons = prisma.stages && prisma.stages[field] ? prisma.stages[field].reasons || {} : {}
    for (const [code, count] of Object.entries(reasons)) {
      reasonRows.push([STAGE_LABELS[stage], code, exclusionReasonLabel(code), count])
    }
  }
  lines.push(reasonRows.length ? table(['阶段', '代码', '理由', '计数'], reasonRows) : '没有排除记录。')
  lines.push('')

  lines.push(h(level + 1, 'Mermaid 流程图'))
  lines.push('')
  lines.push('```mermaid')
  lines.push('flowchart TD')
  for (const item of prisma.flow && Array.isArray(prisma.flow.nodes) ? prisma.flow.nodes : []) {
    lines.push(`  ${item.id.replace(/-/gu, '_')}["${item.label}<br/>n = ${item.count}"]`)
  }
  for (const edge of prisma.flow && Array.isArray(prisma.flow.edges) ? prisma.flow.edges : []) {
    lines.push(`  ${edge.from.replace(/-/gu, '_')} --> ${edge.to.replace(/-/gu, '_')}`)
  }
  lines.push('```')
  lines.push('')

  lines.push(h(level + 1, '候选明细'))
  lines.push('')
  if (!records.length) {
    lines.push('尚无候选记录。用 `rsx_source action:"screen"` 逐条记录标题/摘要/全文决策。')
    lines.push('')
  } else {
    lines.push(
      table(
        ['ID', '标题', '重复', '标题', '摘要', '全文', '来源'],
        records.map((record) => [
          record.id,
          cell(record.title, 80) || '—',
          record.duplicate ? `→ ${record.duplicateOf || '?'}` : '否',
          decisionCell(record.decisions && record.decisions.title),
          decisionCell(record.decisions && record.decisions.abstract),
          decisionCell(record.decisions && record.decisions.fullText),
          record.source || '—',
        ]),
      ),
    )
    lines.push('')
  }

  if (Array.isArray(prisma.warnings) && prisma.warnings.length) {
    lines.push(h(level + 1, '数据提示'))
    lines.push('')
    for (const warning of prisma.warnings) lines.push(`- \`${warning.code}\`：${warning.detail}`)
    lines.push('')
  }
  return lines.join('\n')
}

function csvCell(value) {
  const text = String(value ?? '').replace(/\r\n|[\r\n]/gu, ' ')
  const safe = /^\s*[=+\-@]/u.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/gu, '""')}"`
}

/** Candidate-level CSV for Excel/Rayyan-style review logs. */
export function renderPrismaCsv(prisma) {
  const header = [
    'candidateId',
    'title',
    'doi',
    'year',
    'source',
    'duplicateOf',
    'duplicate',
    'titleDecision',
    'titleReason',
    'titleNote',
    'titleReviewer',
    'titleAt',
    'abstractDecision',
    'abstractReason',
    'abstractNote',
    'abstractReviewer',
    'abstractAt',
    'fullTextDecision',
    'fullTextReason',
    'fullTextNote',
    'fullTextReviewer',
    'fullTextAt',
  ]
  const rows = [header.join(',')]
  for (const record of Array.isArray(prisma.records) ? prisma.records : []) {
    const decisions = record.decisions || {}
    const title = decisions.title || {}
    const abstract = decisions.abstract || {}
    const fullText = decisions.fullText || {}
    rows.push(
      [
        record.id,
        record.title,
        record.doi,
        record.year ?? '',
        record.source,
        record.duplicateOf,
        record.duplicate ? 'true' : 'false',
        title.decision || '',
        title.reason || '',
        title.note || '',
        title.reviewer || '',
        title.at || '',
        abstract.decision || '',
        abstract.reason || '',
        abstract.note || '',
        abstract.reviewer || '',
        abstract.at || '',
        fullText.decision || '',
        fullText.reason || '',
        fullText.note || '',
        fullText.reviewer || '',
        fullText.at || '',
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return `${rows.join('\n')}\n`
}

/** Guard used by the service; keeps the cap in one place. */
export function assertScreeningCapacity(candidates) {
  if (Array.isArray(candidates) && candidates.length >= LIMITS.maxScreeningCandidates) {
    const error = new Error(`at most ${LIMITS.maxScreeningCandidates} screening candidates per campaign`)
    error.code = 'too_many'
    throw error
  }
}
