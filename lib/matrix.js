/**
 * Literature matrix (Elicit-style): one row per source, one column per
 * extraction dimension, every cell optionally backed by an exact quote.
 * Pure functions so the report, panel and tests all render the same table.
 */

function arr(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []
}

function str(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function cellText(cell) {
  const values = (Array.isArray(cell) ? cell : [cell]).filter(Boolean).map((item) => str(item.value)).filter(Boolean)
  return values.join('; ')
}

function csvCell(value) {
  let text = String(value ?? '')
  // Spreadsheet formula injection: a cell beginning with = + - @ is executed
  // when the CSV is opened in Excel/Sheets. Keep the data visible but inert.
  if (/^[=+\-@\t\r]/u.test(text)) text = `'${text}`
  return /[",\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text
}

export function buildMatrix(state) {
  const sources = arr(state.sources)
  const extractions = arr(state.extractions)
  const dimensions = []
  const dimensionSet = new Set()
  for (const row of extractions) {
    const dimension = str(row.dimension)
    if (dimension && !dimensionSet.has(dimension)) {
      dimensionSet.add(dimension)
      dimensions.push(dimension)
    }
  }
  const bySource = new Map()
  for (const row of extractions) {
    const sourceId = str(row.source)
    if (!sourceId) continue
    if (!bySource.has(sourceId)) bySource.set(sourceId, new Map())
    const map = bySource.get(sourceId)
    const dimension = str(row.dimension)
    if (!dimension) continue
    if (!map.has(dimension)) map.set(dimension, [])
    map.get(dimension).push(row)
  }
  const rows = sources.map((source) => {
    const map = bySource.get(source.id) || new Map()
    const cells = Object.create(null)
    for (const dimension of dimensions) cells[dimension] = map.get(dimension) || []
    return {
      source: source.id,
      title: source.title || '',
      year: source.year || '',
      kind: source.kind || '',
      reliability: source.reliability || '',
      cells,
    }
  })
  const covered = rows.filter((row) => dimensions.some((dimension) => row.cells[dimension].length > 0)).length
  return {
    dimensions,
    rows,
    sources: sources.length,
    extractions: extractions.length,
    covered,
    coverage: sources.length === 0 ? 0 : covered / sources.length,
  }
}

function tableCell(value) {
  return String(value ?? '')
    .replace(/\|/gu, '\\|')
    .replace(/\r?\n/gu, ' ')
}

export function renderMatrixMarkdown(matrix, { title = '证据抽取矩阵' } = {}) {
  const data = matrix || { dimensions: [], rows: [] }
  const lines = [`## ${tableCell(title)}`, '', `- 维度：${data.dimensions.length} · 来源：${data.rows.length} · 已覆盖：${data.covered || 0}`, '']
  if (!data.dimensions || data.dimensions.length === 0) {
    lines.push('尚未记录抽取维度。用 `rsx_extract action:"add"` 添加第一行。', '')
    return lines.join('\n')
  }
  const headers = ['来源', '年份', ...data.dimensions].map(tableCell)
  lines.push(`| ${headers.join(' | ')} |`)
  lines.push(`| ${headers.map(() => '---').join(' | ')} |`)
  for (const row of data.rows) {
    const cells = row.cells || {}
    const values = [
      `${row.source} ${row.title || ''}`.trim(),
      row.year || '—',
      ...data.dimensions.map((dimension) => cellText(cells[dimension]) || '—'),
    ].map(tableCell)
    lines.push(`| ${values.join(' | ')} |`)
  }
  lines.push('')
  return lines.join('\n')
}

export function renderMatrixCsv(matrix) {
  const data = matrix || { dimensions: [], rows: [] }
  const header = ['source_id', 'title', 'year', 'kind', 'reliability', ...data.dimensions]
  const lines = [header.map(csvCell).join(',')]
  for (const row of data.rows) {
    const cells = row.cells || {}
    lines.push(
      [
        row.source,
        row.title,
        row.year,
        row.kind,
        row.reliability,
        ...data.dimensions.map((dimension) => cellText(cells[dimension])),
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return `${lines.join('\n')}\n`
}
