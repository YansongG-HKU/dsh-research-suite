/**
 * Sensitivity / robustness records (0.7).
 *
 * One record describes one deliberate change to the analysis or data slice and
 * what happened to the conclusion. This is the "multiverse" habit reduced to a
 * checkable row: name the specification, report the result, classify the
 * direction, and trace the number back to a run or source when possible.
 */
import { SENSITIVITY_DIRECTIONS } from './config.js'
import { utcnow } from './util.js'

function str(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function sensitivityFrom(args = {}, id = 'Z-0001') {
  const row = {
    id,
    claim: str(args.claim),
    name: str(args.name),
    method: str(args.method),
    specification: str(args.specification),
    result: str(args.result),
    direction: str(args.direction),
    trace: str(args.trace),
    notes: str(args.notes),
    at: utcnow(),
  }
  const problems = validateSensitivity(row)
  if (problems.length > 0) {
    const error = new Error(problems.map((item) => item.detail).join('; '))
    error.code = 'invalid_input'
    error.detail = problems
    throw error
  }
  return row
}

export function validateSensitivity(row) {
  const problems = []
  const item = row && typeof row === 'object' ? row : {}
  if (str(item.name).length < 4) {
    problems.push({ code: 'sensitivity_name_missing', detail: 'sensitivity name needs at least 4 characters' })
  }
  if (str(item.method).length < 3) {
    problems.push({ code: 'sensitivity_method_missing', detail: 'sensitivity method needs at least 3 characters' })
  }
  if (str(item.specification).length < 8) {
    problems.push({ code: 'sensitivity_spec_missing', detail: 'sensitivity specification needs at least 8 characters' })
  }
  if (str(item.result).length < 1) {
    problems.push({ code: 'sensitivity_result_missing', detail: 'sensitivity needs a result' })
  }
  if (!SENSITIVITY_DIRECTIONS.includes(str(item.direction))) {
    problems.push({
      code: 'sensitivity_direction_invalid',
      detail: `direction must be one of ${SENSITIVITY_DIRECTIONS.join(', ')}`,
    })
  }
  return problems
}

export function sensitivityRows(state) {
  return Array.isArray(state && state.sensitivity)
    ? state.sensitivity.filter((item) => item && typeof item === 'object')
    : []
}

export function sensitivityRowProblems(state) {
  return sensitivityRows(state).flatMap((row) =>
    validateSensitivity(row).map((problem) => ({ ...problem, id: row.id })),
  )
}

export function sensitivityMarkdown(state) {
  const rows = sensitivityRows(state)
  const lines = [
    '# 敏感性分析',
    '',
    '> 每条记录一次“换一种合理设定后结论是否仍成立”。方向只描述本次分析的结果，不是对真实效应的裁决。',
    '',
  ]
  if (rows.length === 0) {
    lines.push('尚未登记敏感性分析。用 `rsx_claim action:"sensitivity"` 记录至少一条。', '')
    return lines.join('\n')
  }
  lines.push('| ID | 关联断言 | 名称 | 方法 | 设定 | 结果 | 方向 | 追溯 |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const row of rows) {
    const cells = [
      row.id,
      row.claim || '—',
      row.name,
      row.method,
      row.specification,
      row.result,
      row.direction,
      row.trace ? `\`${row.trace}\`` : '—',
    ].map((value) =>
      String(value ?? '')
        .replace(/\|/gu, '\\|')
        .replace(/\r?\n/gu, ' ')
        .slice(0, 240),
    )
    lines.push(`| ${cells.join(' | ')} |`)
  }
  lines.push('')
  return lines.join('\n')
}
