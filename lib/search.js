/**
 * Search protocol log (0.7).
 *
 * The suite deliberately does not run literature searches. It records what the
 * agent actually searched, so a reader can reproduce the query, the database,
 * the date window and the screening counts. That is the minimum PRISMA-style
 * information a systematic search needs; it is not a PRISMA compliance claim.
 */
import { SEARCH_KINDS } from './config.js'
import { utcnow } from './util.js'

function str(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function intOrNull(value) {
  if (value === undefined || value === null || value === '') return null
  const number = Number(value)
  return Number.isInteger(number) && number >= 0 ? number : NaN
}

export function searchEntryFrom(args = {}, id = 'Q-0001') {
  const query = str(args.query) || str(args.note)
  const requested = str(args.searchKind) || str(args.kind)
  const kind = SEARCH_KINDS.includes(requested)
    ? requested
    : args.disconfirming === true
      ? 'disconfirming'
      : 'database'
  const entry = {
    id,
    kind,
    database: str(args.database) || 'unspecified',
    query,
    dateFrom: str(args.dateFrom),
    dateTo: str(args.dateTo),
    hits: intOrNull(args.hits),
    screened: intOrNull(args.screened),
    included: intOrNull(args.included),
    disconfirming: args.disconfirming === true || kind === 'disconfirming',
    notes: str(args.notes),
    at: utcnow(),
  }
  const problems = validateSearchEntry(entry)
  if (problems.length > 0) {
    const error = new Error(problems.map((item) => item.detail).join('; '))
    error.code = 'invalid_input'
    error.detail = problems
    throw error
  }
  return entry
}

export function validateSearchEntry(entry) {
  const problems = []
  const row = entry && typeof entry === 'object' ? entry : {}
  const query = str(row.query)
  if (query.length < 3) {
    problems.push({ code: 'search_query_missing', detail: 'a search entry needs a query of at least 3 characters' })
  }
  if (query.length > 800) {
    problems.push({ code: 'search_query_too_long', detail: 'search query exceeds 800 characters' })
  }
  if (!SEARCH_KINDS.includes(row.kind)) {
    problems.push({ code: 'search_kind_invalid', detail: `search kind must be one of ${SEARCH_KINDS.join(', ')}` })
  }
  for (const key of ['hits', 'screened', 'included']) {
    if (row[key] === undefined || row[key] === null) continue
    if (!Number.isInteger(row[key]) || row[key] < 0) {
      problems.push({ code: 'search_count_invalid', detail: `${key} must be a non-negative integer` })
    }
  }
  if (Number.isInteger(row.hits) && Number.isInteger(row.screened) && row.screened > row.hits) {
    problems.push({ code: 'search_counts_order', detail: 'screened cannot exceed hits' })
  }
  if (Number.isInteger(row.hits) && Number.isInteger(row.included) && row.included > row.hits) {
    problems.push({ code: 'search_counts_order', detail: 'included cannot exceed hits' })
  }
  if (Number.isInteger(row.screened) && Number.isInteger(row.included) && row.included > row.screened) {
    problems.push({ code: 'search_counts_order', detail: 'included cannot exceed screened' })
  }
  if (str(row.dateFrom) && str(row.dateTo) && str(row.dateFrom) > str(row.dateTo)) {
    problems.push({ code: 'search_date_order', detail: 'dateFrom cannot be later than dateTo' })
  }
  return problems
}

export function legacySearchEntry(state) {
  const search = state && state.search && typeof state.search === 'object' ? state.search : null
  if (!search || search.disconfirming !== true) return null
  return {
    id: 'Q-legacy',
    kind: 'disconfirming',
    database: 'unspecified',
    query: str(search.query),
    dateFrom: '',
    dateTo: '',
    hits: null,
    screened: null,
    included: null,
    disconfirming: true,
    notes: 'recorded by the pre-0.7 disconfirming-search action',
    at: str(search.at),
    legacy: true,
  }
}

export function searchEntries(state) {
  const logged = Array.isArray(state && state.searchLog)
    ? state.searchLog.filter((item) => item && typeof item === 'object')
    : []
  if (logged.length > 0) return logged
  const legacy = legacySearchEntry(state)
  return legacy ? [legacy] : []
}

export function searchProtocol(state) {
  const entries = searchEntries(state)
  const problems = entries.flatMap((entry) =>
    validateSearchEntry(entry).map((problem) => ({ ...problem, id: entry.id })),
  )
  return { entries, problems, ok: entries.length > 0 && problems.length === 0 }
}

export function searchSummary(entries) {
  const rows = Array.isArray(entries) ? entries : []
  const total = (key) =>
    rows.reduce((sum, row) => sum + (Number.isInteger(row[key]) ? row[key] : 0), 0)
  return {
    searches: rows.length,
    hits: total('hits'),
    screened: total('screened'),
    included: total('included'),
    disconfirming: rows.filter((row) => row.disconfirming === true).length,
    missingCounts: rows.filter(
      (row) => !Number.isInteger(row.hits) || !Number.isInteger(row.screened) || !Number.isInteger(row.included),
    ).length,
  }
}

function cell(value) {
  return String(value ?? '')
    .replace(/\|/gu, '\\|')
    .replace(/\r?\n/gu, ' ')
    .slice(0, 240)
}

export function renderSearchMarkdown(state) {
  const entries = searchEntries(state)
  const summary = searchSummary(entries)
  const lines = [
    '# 检索协议',
    '',
    '> 检索由 agent 在外部工具中执行；本文件只登记可复核的查询、来源、日期窗口与筛选计数。',
    '> 它不是 PRISMA 合规声明，也不替代对数据库覆盖面的判断。',
    '',
    `- 检索记录：${summary.searches} 条（否证检索 ${summary.disconfirming} 条）`,
    `- 命中 / 初筛 / 纳入：${summary.hits} / ${summary.screened} / ${summary.included}`,
    summary.missingCounts > 0 ? `- 计数不完整：${summary.missingCounts} 条（审计会提示，不阻断流程）` : '- 计数完整',
    '',
  ]
  if (entries.length === 0) {
    lines.push('尚未登记检索。用 `rsx_campaign action:"searchLog"` 记录数据库、查询与筛选计数。', '')
    return lines.join('\n')
  }
  lines.push('| ID | 类型 | 数据库 | 查询 | 日期范围 | 命中 | 初筛 | 纳入 | 否证 | 备注 |')
  lines.push('| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |')
  for (const entry of entries) {
    lines.push(
      `| ${entry.id} | ${entry.kind} | ${cell(entry.database)} | ${cell(entry.query)} | ${cell([entry.dateFrom, entry.dateTo].filter(Boolean).join(' – ') || '—')} | ${entry.hits ?? '—'} | ${entry.screened ?? '—'} | ${entry.included ?? '—'} | ${entry.disconfirming ? '是' : '否'} | ${cell(entry.notes || '—')} |`,
    )
  }
  lines.push('')
  return lines.join('\n')
}
