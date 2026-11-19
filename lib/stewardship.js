/**
 * Research stewardship: the FAIR / CRediT fields that make a released package
 * reusable by someone who did not build it. These are deliberately separate
 * from the AI-contribution declaration: one says who did what, the other says
 * under which terms the data, code and text may be reused.
 */

export const CREDIT_ROLES = Object.freeze([
  'conceptualization',
  'data-curation',
  'formal-analysis',
  'funding-acquisition',
  'investigation',
  'methodology',
  'project-administration',
  'resources',
  'software',
  'supervision',
  'validation',
  'visualization',
  'writing-original-draft',
  'writing-review-editing',
])

const TEXT_LIMITS = Object.freeze({
  license: 200,
  licenseUrl: 500,
  dataAvailability: 2000,
  codeAvailability: 2000,
  competingInterests: 2000,
  ethics: 2000,
})

const REQUIRED_FIELDS = Object.freeze([
  { field: 'license', label: '许可协议', en: 'License', min: 2 },
  { field: 'dataAvailability', label: '数据可用性', en: 'Data availability', min: 8 },
  { field: 'codeAvailability', label: '代码可用性', en: 'Code availability', min: 3 },
  { field: 'competingInterests', label: '利益冲突', en: 'Competing interests', min: 4 },
  { field: 'ethics', label: '伦理与合规', en: 'Ethics', min: 4 },
])

const ALLOWED_KEYS = new Set([
  'license',
  'licenseUrl',
  'dataAvailability',
  'codeAvailability',
  'funding',
  'competingInterests',
  'ethics',
  'keywords',
  'contributors',
])

export const STEWARDSHIP_KEYS = Object.freeze([...ALLOWED_KEYS])

function inputError(message, detail) {
  const error = new Error(message)
  error.code = 'invalid_input'
  if (detail !== undefined) error.detail = detail
  return error
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function list(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value.trim()) {
    return value.split(/[,，\n]/u).map((item) => item.trim()).filter(Boolean)
  }
  return []
}

function uniqueText(values) {
  const seen = new Set()
  const out = []
  for (const value of values) {
    const item = text(value)
    if (!item) continue
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

export function defaultStewardship() {
  return {
    license: '',
    licenseUrl: '',
    dataAvailability: '',
    codeAvailability: '',
    funding: [],
    competingInterests: '',
    ethics: '',
    keywords: [],
    contributors: [],
  }
}

/**
 * Lenient read-side normalisation for old states. It never throws: a malformed
 * hand-edited value becomes an empty field, which the completeness check then
 * reports instead of breaking the whole campaign.
 */
export function normalizeStewardship(value) {
  const source = value && typeof value === 'object' ? value : {}
  const defaults = defaultStewardship()
  const out = { ...defaults }
  for (const key of Object.keys(TEXT_LIMITS)) {
    out[key] = text(source[key]).slice(0, TEXT_LIMITS[key])
  }
  out.funding = uniqueText(list(source.funding)).slice(0, 20).map((item) => item.slice(0, 200))
  out.keywords = uniqueText(list(source.keywords)).slice(0, 20).map((item) => item.slice(0, 40))
  out.contributors = (Array.isArray(source.contributors) ? source.contributors : [])
    .filter((row) => row && typeof row === 'object')
    .slice(0, 50)
    .map((row) => ({
      name: text(row.name).slice(0, 200),
      roles: uniqueText(list(row.roles).filter((role) => CREDIT_ROLES.includes(text(role)))),
      orcid: normalizeOrcid(text(row.orcid)),
      affiliation: text(row.affiliation).slice(0, 200),
    }))
    .filter((row) => row.name)
  return out
}

function normalizeOrcid(value) {
  const raw = text(value)
  if (!raw) return ''
  const match = /(?:https?:\/\/orcid\.org\/)?(\d{4}-\d{4}-\d{4}-\d{3}[\dX])/iu.exec(raw)
  return match ? match[1].toUpperCase() : raw.slice(0, 40)
}

function boundedText(patch, key, current) {
  if (patch[key] === undefined) return current
  if (typeof patch[key] !== 'string') throw inputError(`${key} must be a string`)
  const value = patch[key].trim()
  if (value.length > TEXT_LIMITS[key]) {
    throw inputError(`${key} exceeds ${TEXT_LIMITS[key]} characters`, { field: key, max: TEXT_LIMITS[key] })
  }
  return value
}

function validateContributors(value) {
  const rows = list(value)
  if (rows.length > 50) throw inputError('contributors exceeds 50 entries', { field: 'contributors', max: 50 })
  const seen = new Set()
  return rows.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw inputError(`contributors[${index}] must be an object`)
    }
    const name = text(row.name)
    if (!name) throw inputError(`contributors[${index}].name is required`, { field: `contributors[${index}].name` })
    if (name.length > 200) throw inputError(`contributors[${index}].name exceeds 200 characters`)
    const key = name.toLowerCase()
    if (seen.has(key)) throw inputError(`duplicate contributor: ${name}`, { field: `contributors[${index}].name` })
    seen.add(key)
    const roles = uniqueText(list(row.roles)).map((role) => role.toLowerCase())
    if (roles.length === 0) {
      throw inputError(`contributors[${index}] needs at least one CRediT role`, {
        field: `contributors[${index}].roles`,
        allowed: CREDIT_ROLES,
      })
    }
    const invalid = roles.filter((role) => !CREDIT_ROLES.includes(role))
    if (invalid.length) {
      throw inputError(`unknown CRediT role: ${invalid.join(', ')}`, {
        field: `contributors[${index}].roles`,
        allowed: CREDIT_ROLES,
      })
    }
    const orcid = normalizeOrcid(text(row.orcid))
    if (orcid && !/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/u.test(orcid)) {
      throw inputError(`contributors[${index}].orcid is not a valid ORCID iD`, { field: `contributors[${index}].orcid` })
    }
    return {
      name,
      roles,
      orcid,
      affiliation: text(row.affiliation).slice(0, 200),
    }
  })
}

/**
 * Strict merge for a mutation. Unknown keys are rejected so a typo cannot
 * silently create an empty governance record that then blocks release.
 */
export function mergeStewardship(current, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw inputError('stewardship patch must be an object')
  }
  const unknown = Object.keys(patch).filter((key) => !ALLOWED_KEYS.has(key))
  if (unknown.length) throw inputError(`unknown stewardship field: ${unknown.join(', ')}`, { allowed: [...ALLOWED_KEYS] })
  const base = normalizeStewardship(current)
  const out = { ...base }
  for (const key of Object.keys(TEXT_LIMITS)) out[key] = boundedText(patch, key, base[key])
  if (patch.licenseUrl !== undefined && out.licenseUrl && !/^https?:\/\//iu.test(out.licenseUrl)) {
    throw inputError('licenseUrl must start with http:// or https://', { field: 'licenseUrl' })
  }
  if (patch.funding !== undefined) {
    out.funding = uniqueText(list(patch.funding)).slice(0, 20).map((item) => item.slice(0, 200))
    if (list(patch.funding).length > 20) throw inputError('funding exceeds 20 entries', { field: 'funding', max: 20 })
  }
  if (patch.keywords !== undefined) {
    out.keywords = uniqueText(list(patch.keywords)).slice(0, 20).map((item) => item.slice(0, 40))
    if (list(patch.keywords).length > 20) throw inputError('keywords exceeds 20 entries', { field: 'keywords', max: 20 })
  }
  if (patch.contributors !== undefined) out.contributors = validateContributors(patch.contributors)
  return out
}

export function stewardshipCompleteness(value) {
  const data = normalizeStewardship(value)
  const missing = []
  for (const field of REQUIRED_FIELDS) {
    const length = text(data[field.field]).length
    if (length < field.min) {
      missing.push({
        field: field.field,
        label: field.label,
        en: field.en,
        min: field.min,
        current: length,
      })
    }
  }
  const contributors = data.contributors || []
  if (contributors.length === 0) {
    missing.push({ field: 'contributors', label: '贡献者与 CRediT 角色', en: 'Contributors and CRediT roles', min: 1, current: 0 })
  } else if (!contributors.some((row) => row.roles && row.roles.length > 0)) {
    missing.push({ field: 'contributors.roles', label: '至少一名贡献者的角色', en: 'At least one contributor role', min: 1, current: 0 })
  }
  const present = REQUIRED_FIELDS.length + 1 - missing.length
  return {
    ok: missing.length === 0,
    required: REQUIRED_FIELDS.length + 1,
    present: Math.max(0, present),
    percent: Math.round((Math.max(0, present) / (REQUIRED_FIELDS.length + 1)) * 100),
    missing,
    missingFields: missing.map((item) => item.field),
    contributors: contributors.length,
    keywords: data.keywords.length,
  }
}

export function stewardshipSummary(value) {
  const data = normalizeStewardship(value)
  return {
    license: data.license,
    licenseUrl: data.licenseUrl,
    dataAvailability: data.dataAvailability,
    codeAvailability: data.codeAvailability,
    funding: data.funding,
    competingInterests: data.competingInterests,
    ethics: data.ethics,
    keywords: data.keywords,
    contributors: data.contributors,
    completeness: stewardshipCompleteness(data),
  }
}

function mdCell(value) {
  return String(value || '').replace(/\|/gu, '\\|').replace(/\n/gu, ' ')
}

/**
 * Report section, without the standalone document header. Keeping this in the
 * same module means REPORT.md and STEWARDSHIP.md cannot drift apart.
 */
export function renderStewardshipSection(state) {
  const data = normalizeStewardship(state && state.stewardship)
  const completeness = stewardshipCompleteness(data)
  const lines = [
    '## 12.1 研究治理与贡献（FAIR / CRediT）',
    '',
    `- 完整性：${completeness.percent}%${completeness.ok ? '（发布要求已满足）' : `（缺少 ${completeness.missing.length} 项）`}`,
    `- **许可协议**：${data.license || '未填写'}${data.licenseUrl ? `（${data.licenseUrl}）` : ''}`,
    `- **数据可用性**：${data.dataAvailability || '未填写'}`,
    `- **代码可用性**：${data.codeAvailability || '未填写'}`,
    `- **利益冲突**：${data.competingInterests || '未填写'}`,
    `- **伦理与合规**：${data.ethics || '未填写'}`,
    `- **资助**：${data.funding.length ? data.funding.join('；') : '无登记'}`,
    `- **关键词**：${data.keywords.length ? data.keywords.join('；') : '未填写'}`,
    '',
  ]
  if (data.contributors.length === 0) {
    lines.push('贡献者尚未登记。', '')
  } else {
    lines.push('| 贡献者 | CRediT 角色 | 机构 | ORCID |', '| --- | --- | --- | --- |')
    for (const row of data.contributors) {
      lines.push(
        `| ${mdCell(row.name)} | ${mdCell(row.roles.join(', '))} | ${mdCell(row.affiliation)} | ${mdCell(row.orcid)} |`,
      )
    }
    lines.push('')
  }
  if (!completeness.ok) {
    lines.push(`未完成：${completeness.missing.map((item) => item.label).join('、')}。`, '')
  }
  return lines.join('\n')
}

/**
 * Standalone STEWARDSHIP.md. It is written into both the standalone export
 * folder and BUNDLE.zip so the governance record travels with the artefacts,
 * not only inside campaign.json.
 */
export function renderStewardshipMarkdown(state) {
  const data = normalizeStewardship(state && state.stewardship)
  const completeness = stewardshipCompleteness(data)
  const lines = [
    '# 研究治理与贡献声明',
    '',
    `- 项目：${state && state.title ? state.title : '—'}（${state && state.id ? state.id : '—'}）`,
    `- 生成时间：${new Date().toISOString()}`,
    `- 完整性：${completeness.percent}%${completeness.ok ? '（发布要求已满足）' : `（缺少 ${completeness.missing.length} 项）`}`,
    '',
    '## FAIR 与发表声明',
    '',
    `- **许可协议**：${data.license || '未填写'}${data.licenseUrl ? `（${data.licenseUrl}）` : ''}`,
    `- **数据可用性**：${data.dataAvailability || '未填写'}`,
    `- **代码可用性**：${data.codeAvailability || '未填写'}`,
    `- **利益冲突**：${data.competingInterests || '未填写'}`,
    `- **伦理与合规**：${data.ethics || '未填写'}`,
    `- **资助**：${data.funding.length ? data.funding.join('；') : '无登记'}`,
    `- **关键词**：${data.keywords.length ? data.keywords.join('；') : '未填写'}`,
    '',
    '## CRediT 贡献矩阵',
    '',
  ]
  if (data.contributors.length === 0) {
    lines.push('| 姓名 | 角色 | 机构 | ORCID |', '| --- | --- | --- | --- |', '| — | 未登记 | — | — |')
  } else {
    lines.push('| 姓名 | 角色 | 机构 | ORCID |', '| --- | --- | --- | --- |')
    for (const row of data.contributors) {
      lines.push(
        `| ${mdCell(row.name)} | ${mdCell(row.roles.join(', '))} | ${mdCell(row.affiliation)} | ${mdCell(row.orcid)} |`,
      )
    }
  }
  lines.push(
    '',
    '> 许可与可用性声明在发布时由人类批准者确认；CRediT 角色登记分工，不转移责任。',
    '> 本文件由 dsh-research-suite 从其结构化台账生成，生成时间不代表核验。',
    '',
  )
  if (!completeness.ok) {
    lines.push('## 未完成项', '')
    for (const item of completeness.missing) {
      lines.push(`- ${item.label}（至少 ${item.min} 个字符或条目，当前 ${item.current}）`)
    }
    lines.push('')
  }
  return lines.join('\n')
}
