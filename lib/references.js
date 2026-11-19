/**
 * Reference interchange for the evidence ledger (0.13).
 *
 * BibTeX remains the primary authoring format. This module adds the two
 * formats a real reference manager exports most often: CSL-JSON (Zotero's
 * native JSON) and RIS (Zotero, EndNote, Rayyan, most library catalogues).
 * It also renders a human-readable reference list for the report.
 *
 * Parsing is deliberately bounded and dependency-free. Provider text is
 * untrusted data: markup is stripped, fields are truncated, and no field is
 * executed or interpreted as a command.
 */
import { SOURCE_KINDS } from './config.js'
import { makeBibKey, parseBibtex, sanitizeBibKey, sourceFromBibEntry } from './bibtex.js'
import { cleanText, normalizeDoi } from './retrieval.js'

export const REFERENCE_FORMATS = Object.freeze(['bibtex', 'csl-json', 'ris'])
export const MAX_REFERENCE_ENTRIES = 100
const MAX_REFERENCE_BYTES = 4 * 1024 * 1024
const MAX_FIELD = 4_000

const CSL_KIND = Object.freeze({
  'article': 'paper',
  'article-journal': 'paper',
  'article-magazine': 'paper',
  'article-newspaper': 'paper',
  'paper-conference': 'paper',
  'book': 'book',
  'chapter': 'book',
  'collection': 'book',
  'monograph': 'book',
  'dataset': 'dataset',
  'manuscript': 'preprint',
  'preprint': 'preprint',
  'report': 'report',
  'standard': 'report',
  'techreport': 'report',
  'thesis': 'report',
  'post': 'news',
  'post-weblog': 'news',
  'webpage': 'news',
})

const KIND_CSL = Object.freeze({
  paper: 'article-journal',
  preprint: 'article',
  book: 'book',
  report: 'report',
  dataset: 'dataset',
  registry: 'report',
  news: 'webpage',
  other: 'document',
})

const RIS_KIND = Object.freeze({
  JOUR: 'paper',
  EJOUR: 'paper',
  CONF: 'paper',
  CPAPER: 'paper',
  BOOK: 'book',
  CHAP: 'book',
  EBOOK: 'book',
  RPRT: 'report',
  DATA: 'dataset',
  UNPB: 'preprint',
  NEWS: 'news',
  WEB: 'news',
  GEN: 'other',
})

const KIND_RIS = Object.freeze({
  paper: 'JOUR',
  preprint: 'UNPB',
  book: 'BOOK',
  report: 'RPRT',
  dataset: 'DATA',
  registry: 'RPRT',
  news: 'NEWS',
  other: 'GEN',
})

function str(value, max = MAX_FIELD) {
  if (value === null || value === undefined) return ''
  const out = cleanText(value, max)
  return out.trim()
}

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value
}

function boundedYear(value) {
  const text = String(value ?? '').match(/(?:18|19|20|21)\d{2}/u)
  if (!text) return null
  const year = Number(text[0])
  return year >= 1800 && year <= 3000 ? year : null
}

function yearFromCsl(item) {
  const issued = item && (item.issued || item['published-print'] || item['published-online'] || item['original-date'])
  if (issued && typeof issued === 'object' && !Array.isArray(issued)) {
    if (Array.isArray(issued['date-parts']) && Array.isArray(issued['date-parts'][0])) {
      const year = boundedYear(issued['date-parts'][0][0])
      if (year) return year
    }
    if (issued.raw !== undefined) return boundedYear(issued.raw)
    if (issued['date-parts'] !== undefined) return boundedYear(JSON.stringify(issued['date-parts']))
  }
  return boundedYear(issued)
}

function authorTextFromCsl(value) {
  if (!Array.isArray(value)) return ''
  const names = []
  for (const item of value) {
    if (typeof item === 'string') {
      const name = str(item, 160)
      if (name) names.push(name)
      continue
    }
    if (!item || typeof item !== 'object') continue
    if (item.literal) {
      const name = str(item.literal, 160)
      if (name) names.push(name)
      continue
    }
    const family = str(item.family, 160)
    const given = str(item.given, 160)
    if (family && given) names.push(`${family}, ${given}`)
    else if (family) names.push(family)
    else if (given) names.push(given)
  }
  return names.slice(0, 200).join(' and ')
}

function kindFromCsl(type) {
  const key = String(type || '').toLowerCase()
  return CSL_KIND[key] || 'other'
}

function reliabilityFor(kind) {
  if (kind === 'paper' || kind === 'preprint' || kind === 'dataset') return 'primary'
  if (kind === 'registry') return 'tertiary'
  return 'secondary'
}

/** Convert one CSL-JSON item to the source fields understood by sourceAdd. */
export function sourceFromCslItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const title = str(firstValue(item.title), 500)
  if (!title) return null
  const doi = normalizeDoi(item.DOI || item.doi)
  const kind = kindFromCsl(item.type)
  const journal = str(firstValue(item['container-title']) || firstValue(item['collection-title']) || item.publisher, 300)
  const authors = authorTextFromCsl(item.author || item.editor)
  const abstract = str(item.abstract)
  const note = str(item.note)
  const notes = [abstract, note].filter(Boolean).join('\n\n').slice(0, MAX_FIELD)
  const explicitKey = str(item['citation-key'], 100)
  return {
    title,
    authors,
    year: yearFromCsl(item),
    journal,
    doi,
    url: str(firstValue(item.URL) || item.url, 1_000),
    kind,
    reliability: reliabilityFor(kind),
    bibtexKey: explicitKey ? sanitizeBibKey(explicitKey, '') : '',
    notes,
  }
}

/** Parse a CSL-JSON array or a Zotero-style `{ items: [...] }` object. */
export function parseCslJson(text) {
  let payload
  try {
    payload = JSON.parse(String(text || ''))
  } catch (error) {
    const wrapped = new Error(`invalid CSL-JSON: ${error.message}`)
    wrapped.code = 'invalid_input'
    throw wrapped
  }
  const rows = Array.isArray(payload) ? payload : payload && Array.isArray(payload.items) ? payload.items : null
  if (!rows) throw Object.assign(new Error('CSL-JSON must be an array or an object with an items array'), { code: 'invalid_input' })
  return rows.map(sourceFromCslItem).filter(Boolean)
}

function risRecords(text) {
  const lines = String(text || '').replace(/\r\n?/gu, '\n').split('\n')
  const records = []
  let current = null
  let lastTag = ''
  for (const line of lines) {
    const match = /^([A-Z0-9]{2})\s{1,}-\s?(.*)$/u.exec(line)
    if (match) {
      const tag = match[1]
      const value = match[2] || ''
      if (tag === 'TY') {
        if (current) records.push(current)
        current = { TY: [value.trim()] }
      } else if (current && tag === 'ER') {
        records.push(current)
        current = null
      } else if (current) {
        if (!current[tag]) current[tag] = []
        current[tag].push(value.trim())
      }
      lastTag = tag
      continue
    }
    // Continuation lines are folded into the previous field.
    if (current && lastTag && line.trim()) {
      const bucket = current[lastTag]
      if (bucket && bucket.length) bucket[bucket.length - 1] += ` ${line.trim()}`
    }
  }
  if (current) records.push(current)
  return records
}

function kindFromRis(type) {
  const key = String(type || '').toUpperCase()
  return RIS_KIND[key] || 'other'
}

/** Convert one RIS record (tag -> string[]) to source fields. */
export function sourceFromRisRecord(record) {
  if (!record || typeof record !== 'object') return null
  const title = str(firstValue(record.TI || record.T1 || record.CT), 500)
  if (!title) return null
  const type = firstValue(record.TY)
  const kind = kindFromRis(type)
  const authors = (record.AU || record.A1 || [])
    .map((value) => str(value, 160))
    .filter(Boolean)
    .slice(0, 200)
    .join(' and ')
  const journal = str(firstValue(record.JO || record.T2 || record.JA || record.JF || record.PB), 300)
  const doi = normalizeDoi(firstValue(record.DO))
  const notes = str(firstValue(record.AB || record.N2 || record.N1))
  return {
    title,
    authors,
    year: boundedYear(firstValue(record.PY || record.Y1)),
    journal,
    doi,
    url: str(firstValue(record.UR || record.L2), 1_000),
    kind,
    reliability: reliabilityFor(kind),
    bibtexKey: sanitizeBibKey(firstValue(record.ID) || '', ''),
    notes,
  }
}

export function parseRis(text) {
  return risRecords(text).map(sourceFromRisRecord).filter(Boolean)
}

/** Detect the format from a pasted export; explicit format wins. */
export function detectReferenceFormat(text) {
  const input = String(text || '').replace(/^\uFEFF/u, '').trim()
  if (!input) return ''
  if (/^[[{]/u.test(input)) return 'csl-json'
  if (/^(?:TY|ER)\s{1,}-/mu.test(input)) return 'ris'
  if (/^@[A-Za-z]+\s*[{(]/mu.test(input)) return 'bibtex'
  return ''
}

export function normalizeReferenceFormat(value, fallback = 'auto') {
  const format = String(value || '').toLowerCase()
  if (format === 'csl' || format === 'csljson' || format === 'csl-json' || format === 'json') return 'csl-json'
  if (format === 'bib' || format === 'bibtex') return 'bibtex'
  if (format === 'ris') return 'ris'
  return fallback
}

/**
 * Parse a pasted export. `format:"auto"` is the default so a Zotero CSL-JSON
 * export, an RIS file and a BibTeX file can all use the same action.
 */
export function parseReferences(text, format = 'auto') {
  const input = String(text || '').replace(/^\uFEFF/u, '')
  if (Buffer.byteLength(input, 'utf8') > MAX_REFERENCE_BYTES) {
    throw Object.assign(new Error(`reference import is larger than ${MAX_REFERENCE_BYTES} bytes`), {
      code: 'too_large',
    })
  }
  const explicit = normalizeReferenceFormat(format, 'auto')
  const detected = explicit === 'auto' ? detectReferenceFormat(input) : explicit
  if (!detected) {
    throw Object.assign(new Error('could not detect reference format; use format:"bibtex", "csl-json" or "ris"'), {
      code: 'invalid_input',
    })
  }
  if (detected === 'bibtex') {
    const entries = parseBibtex(input).map(sourceFromBibEntry).filter((entry) => entry.title)
    return { format: 'bibtex', entries }
  }
  if (detected === 'csl-json') return { format: 'csl-json', entries: parseCslJson(input) }
  return { format: 'ris', entries: parseRis(input) }
}

function splitAuthors(value) {
  return String(value || '')
    .split(/\s+and\s+/u)
    .map((item) => item.trim())
    .filter(Boolean)
}

function cslAuthorList(value) {
  return splitAuthors(value)
    .map((name) => {
      const text = str(name, 160)
      if (!text) return null
      if (text.includes(',')) {
        const comma = text.indexOf(',')
        const family = text.slice(0, comma).trim()
        const given = text.slice(comma + 1).trim()
        return family ? { family, ...(given ? { given } : {}) } : null
      }
      const parts = text.split(/\s+/u)
      if (parts.length === 2) return { family: parts[1], given: parts[0] }
      return { literal: text }
    })
    .filter(Boolean)
}

function cslType(source) {
  const kind = String(source && source.kind)
  if (kind === 'paper' && !str(source.journal)) return 'article'
  return KIND_CSL[kind] || 'document'
}

/** Render CSL-JSON that Zotero and CSL processors can consume directly. */
export function renderCslJson(sources) {
  const used = new Set()
  const items = (Array.isArray(sources) ? sources : []).map((source) => {
    const item = {
      id: String(source.id || ''),
      type: cslType(source),
      title: str(source.title, 1_000),
      'citation-key': makeBibKey(source, used),
    }
    const authors = cslAuthorList(source.authors)
    if (authors.length) item.author = authors
    if (Number.isInteger(source.year)) item.issued = { 'date-parts': [[source.year]] }
    if (source.journal) {
      const venue = str(source.journal, 500)
      if (source.kind === 'book' || source.kind === 'report' || source.kind === 'dataset') item.publisher = venue
      else item['container-title'] = venue
    }
    if (source.doi) item.DOI = normalizeDoi(source.doi)
    if (source.url) item.URL = str(source.url, 1_000)
    if (source.kind === 'preprint') item.genre = 'preprint'
    if (source.notes) item.note = str(source.notes, MAX_FIELD)
    return item
  })
  return `${JSON.stringify(items, null, 2)}\n`
}

function risType(source) {
  return KIND_RIS[String(source && source.kind)] || 'GEN'
}

/** Render an RIS file with one record per source. */
export function renderRis(sources) {
  const used = new Set()
  const records = (Array.isArray(sources) ? sources : []).map((source) => {
    const lines = [`TY  - ${risType(source)}`, `TI  - ${str(source.title, 1_000)}`]
    for (const author of splitAuthors(source.authors)) lines.push(`AU  - ${str(author, 160)}`)
    if (Number.isInteger(source.year)) lines.push(`PY  - ${source.year}`)
    if (source.journal) {
      const venueTag = source.kind === 'book' || source.kind === 'report' || source.kind === 'dataset' ? 'PB' : 'JO'
      lines.push(`${venueTag}  - ${str(source.journal, 500)}`)
    }
    if (source.doi) lines.push(`DO  - ${normalizeDoi(source.doi)}`)
    if (source.url) lines.push(`UR  - ${str(source.url, 1_000)}`)
    if (source.notes) lines.push(`N1  - ${str(source.notes, MAX_FIELD).replace(/\s+/gu, ' ')}`)
    lines.push(`ID  - ${makeBibKey(source, used)}`, 'ER  - ', '')
    return lines.join('\n')
  })
  return records.length ? `${records.join('\n')}\n` : ''
}

/** Cited ledger ids in the manuscript, plus the uncited count. */
export function citationCoverage(state) {
  const text = state && state.manuscript && typeof state.manuscript.text === 'string' ? state.manuscript.text : ''
  const cited = new Set([...text.matchAll(/\[\[src:(S-\d{4})\]\]/gu)].map((match) => match[1]))
  const sources = state && Array.isArray(state.sources) ? state.sources : []
  return {
    cited,
    total: sources.length,
    citedCount: sources.filter((source) => cited.has(source.id)).length,
    uncited: sources.filter((source) => !cited.has(source.id)).map((source) => source.id),
    hasManuscript: text.trim().length > 0,
  }
}

/** Map a normalized rsx_search candidate to rsx_source add/import fields. */
export function sourceDraftFromCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return null
  const title = str(candidate.title, 500)
  if (!title) return null
  const authors = Array.isArray(candidate.authors) ? candidate.authors.join(' and ') : str(candidate.authors, 4_000)
  return {
    title,
    authors,
    year: boundedYear(candidate.year),
    journal: str(candidate.venue || candidate.journal, 300),
    doi: normalizeDoi(candidate.doi),
    url: str(candidate.url, 1_000),
    kind: SOURCE_KINDS.includes(candidate.kind) ? candidate.kind : 'other',
    reliability: reliabilityFor(candidate.kind),
    notes: str(candidate.abstract, MAX_FIELD),
  }
}

function referenceLine(source) {
  const authors = String(source.authors || '').replace(/\s+and\s+/gu, '; ') || '—'
  const year = Number.isInteger(source.year) ? source.year : 'n.d.'
  const title = String(source.title || '—')
  const journal = source.journal
    ? source.kind === 'book' || source.kind === 'report' || source.kind === 'dataset'
      ? ` ${String(source.journal)}.`
      : ` *${String(source.journal)}*.`
    : ''
  const link = source.doi
    ? ` https://doi.org/${normalizeDoi(source.doi)}`
    : source.url
      ? ` ${source.url}`
      : ''
  return `${authors} (${year}). ${title}.${journal}${link}`
}

/** Human-readable reference list for REPORT.md. */
export function renderReferencesMarkdown(state) {
  const sources = state && Array.isArray(state.sources) ? state.sources : []
  const coverage = citationCoverage(state)
  const lines = ['## 17. 参考文献', '']
  if (!sources.length) {
    lines.push('台账尚无来源。先用 `rsx_source action:"add"` 或 `action:"import"` 登记题录。', '')
    return lines.join('\n')
  }
  lines.push(
    `台账 ${coverage.total} 条；手稿引用 ${coverage.citedCount} 条；未引用 ${coverage.uncited.length} 条。引用以 \`[[src:S-0001]]\` 解析，未引用来源仍保留在台账中。`,
  )
  lines.push('')
  sources.forEach((source, index) => {
    const marker = coverage.hasManuscript && !coverage.cited.has(source.id) ? '（手稿未引用）' : ''
    lines.push(`${index + 1}. **[${source.id}]** ${referenceLine(source)}${marker}`)
  })
  lines.push('')
  return lines.join('\n')
}
