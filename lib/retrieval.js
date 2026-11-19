/**
 * Live literature metadata retrieval.
 *
 * Two public, key-free APIs are queried on the host: OpenAlex and Crossref.
 * The module is deliberately read-only: it returns normalized candidates for
 * the agent to inspect and register with `rsx_source`; it never writes the
 * ledger, never downloads full text and never executes anything from a result.
 *
 * All provider text is untrusted data. Titles, abstracts and author lists are
 * bounded and cleaned before they reach the model.
 */
import { VERSION } from './config.js'
import { messageOf } from './util.js'

export const RETRIEVAL_PROVIDERS = Object.freeze(['openalex', 'crossref'])
const PROVIDER_LABEL = Object.freeze({ both: 'openalex+crossref' })
const MAX_QUERY_CHARS = 500
const MAX_TITLE_CHARS = 400
const MAX_ABSTRACT_CHARS = 2_000
const MAX_AUTHORS = 12
const MAX_LIMIT = 20
const MAX_TIMEOUT_MS = 15_000
const MIN_TIMEOUT_MS = 1_000
const MAX_PROVIDER_BYTES = 4 * 1024 * 1024

function retrievalError(code, message, detail) {
  const error = new Error(message)
  error.code = code
  if (detail !== undefined) error.detail = detail
  return error
}

function text(value, max = 0) {
  if (value === null || value === undefined) return ''
  const out = String(value).replace(/\s+/gu, ' ').trim()
  return max > 0 ? out.slice(0, max) : out
}

const ENTITIES = Object.freeze({
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
})

/** Strip markup/entities from provider text; it is data, not instructions. */
export function cleanText(value, max = 0) {
  let out = String(value ?? '')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/giu, (match, entity) => {
      const key = String(entity).toLowerCase()
      if (key.startsWith('#x')) return safeCodePoint(Number.parseInt(key.slice(2), 16), match)
      if (key.startsWith('#')) return safeCodePoint(Number.parseInt(key.slice(1), 10), match)
      return ENTITIES[key] ?? match
    })
    .replace(/\s+/gu, ' ')
    .trim()
  if (max > 0) out = out.slice(0, max)
  return out
}

function safeCodePoint(code, fallback) {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return fallback
  try {
    return String.fromCodePoint(code)
  } catch {
    return fallback
  }
}

/** A DOI is case-insensitive; keep the canonical 10.x/suffix form. */
export function normalizeDoi(value) {
  const raw = text(value, 300)
  if (!raw) return ''
  const stripped = raw
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, '')
    .replace(/^doi:\s*/iu, '')
    .replace(/[.,;:]+$/u, '')
  return stripped ? stripped.toLowerCase() : ''
}

export function normalizeTitle(value) {
  return cleanText(value, MAX_TITLE_CHARS)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 240)
}

function yearOf(value) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1800 || number > 3000) return null
  return number
}

function authorList(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') return cleanText(item, 120)
      if (!item || typeof item !== 'object') return ''
      const name = [item.given, item.family].filter(Boolean).join(' ')
      return cleanText(name || item.name || item.display_name || '', 120)
    })
    .filter(Boolean)
    .slice(0, MAX_AUTHORS)
}

function mapOpenAlexKind(type) {
  switch (text(type).toLowerCase()) {
    case 'preprint':
      return 'preprint'
    case 'dataset':
      return 'dataset'
    case 'book':
    case 'book-chapter':
      return 'book'
    case 'report':
      return 'report'
    case 'article':
    case 'review':
    case 'proceedings-article':
      return 'paper'
    default:
      return 'other'
  }
}

function mapCrossrefKind(type) {
  switch (text(type).toLowerCase()) {
    case 'journal-article':
    case 'proceedings-article':
      return 'paper'
    case 'posted-content':
      return 'preprint'
    case 'dataset':
      return 'dataset'
    case 'book':
    case 'book-chapter':
    case 'monograph':
      return 'book'
    case 'report':
      return 'report'
    default:
      return 'other'
  }
}

/** Rebuild the abstract OpenAlex stores as an inverted index. */
export function abstractFromInvertedIndex(index) {
  if (!index || typeof index !== 'object' || Array.isArray(index)) return ''
  const words = []
  for (const [word, positions] of Object.entries(index)) {
    const token = cleanText(word, 80)
    if (!token) continue
    if (Array.isArray(positions)) {
      for (const position of positions) {
        const at = Number(position)
        if (Number.isInteger(at) && at >= 0 && at <= 100000) words.push([at, token])
      }
    }
  }
  words.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]))
  return words.map(([, word]) => word).join(' ').slice(0, MAX_ABSTRACT_CHARS)
}

function candidateBase(provider) {
  return {
    provider,
    providers: [provider],
    providerIds: {},
    title: '',
    year: null,
    doi: '',
    url: '',
    authors: [],
    venue: '',
    abstract: '',
    citations: 0,
    kind: 'other',
  }
}

/** Normalize one OpenAlex `results[]` item. */
export function candidateFromOpenAlex(item) {
  if (!item || typeof item !== 'object') return null
  const title = cleanText(item.display_name || item.title, MAX_TITLE_CHARS)
  if (!title) return null
  const doi = normalizeDoi(item.doi)
  const source = item.primary_location?.source
  const candidate = candidateBase('openalex')
  candidate.providerIds.openalex = text(item.id, 300)
  candidate.title = title
  candidate.year = yearOf(item.publication_year)
  candidate.doi = doi
  candidate.url = doi
    ? `https://doi.org/${doi}`
    : text(item.primary_location?.landing_page_url || item.id, 500)
  candidate.authors = authorList(
    (Array.isArray(item.authorships) ? item.authorships : []).map((entry) => entry?.author || entry),
  )
  candidate.venue = cleanText(source?.display_name || source?.host_organization_name || '', 240)
  candidate.abstract = cleanText(abstractFromInvertedIndex(item.abstract_inverted_index), MAX_ABSTRACT_CHARS)
  candidate.citations = Math.max(0, Number(item.cited_by_count) || 0)
  candidate.kind = mapOpenAlexKind(item.type)
  return candidate
}

/** Normalize one Crossref `message.items[]` item. */
export function candidateFromCrossref(item) {
  if (!item || typeof item !== 'object') return null
  const title = cleanText(Array.isArray(item.title) ? item.title[0] : item.title, MAX_TITLE_CHARS)
  if (!title) return null
  const doi = normalizeDoi(item.DOI)
  const candidate = candidateBase('crossref')
  candidate.providerIds.crossref = doi || text(item.URL, 300)
  candidate.title = title
  const issued = item.issued?.['date-parts']?.[0]?.[0] ?? item.published?.['date-parts']?.[0]?.[0]
  candidate.year = yearOf(issued)
  candidate.doi = doi
  candidate.url = text(item.URL, 500) || (doi ? `https://doi.org/${doi}` : '')
  candidate.authors = authorList(Array.isArray(item.author) ? item.author : [])
  candidate.venue = cleanText(
    (Array.isArray(item['container-title']) ? item['container-title'][0] : '') || item.publisher || '',
    240,
  )
  candidate.abstract = cleanText(item.abstract, MAX_ABSTRACT_CHARS)
  candidate.citations = Math.max(0, Number(item['is-referenced-by-count']) || 0)
  candidate.kind = mapCrossrefKind(item.type)
  return candidate
}

export function parseOpenAlex(payload, options = {}) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.results)) {
    throw retrievalError('retrieval_failed', 'OpenAlex payload is missing a results array', { provider: 'openalex' })
  }
  const limit = boundedLimit(options.limit)
  return payload.results
    .map(candidateFromOpenAlex)
    .filter(Boolean)
    .slice(0, limit)
}

export function parseCrossref(payload, options = {}) {
  if (!payload || typeof payload !== 'object' || !payload.message || !Array.isArray(payload.message.items)) {
    throw retrievalError('retrieval_failed', 'Crossref payload is missing message.items', { provider: 'crossref' })
  }
  const limit = boundedLimit(options.limit)
  return payload.message.items
    .map(candidateFromCrossref)
    .filter(Boolean)
    .slice(0, limit)
}

function boundedLimit(value) {
  const number = Number(value)
  if (!Number.isInteger(number)) return 10
  return Math.min(MAX_LIMIT, Math.max(1, number))
}

function mergeInto(base, incoming) {
  base.providers = [...new Set([...(base.providers || []), ...(incoming.providers || [])])]
  base.providerIds = { ...(base.providerIds || {}), ...(incoming.providerIds || {}) }
  if (!base.year && incoming.year) base.year = incoming.year
  if (!base.url && incoming.url) base.url = incoming.url
  if (!base.venue && incoming.venue) base.venue = incoming.venue
  if ((incoming.abstract || '').length > (base.abstract || '').length) base.abstract = incoming.abstract
  if ((incoming.authors || []).length > (base.authors || []).length) base.authors = incoming.authors
  if ((incoming.citations || 0) > (base.citations || 0)) base.citations = incoming.citations
  if (base.kind === 'other' && incoming.kind && incoming.kind !== 'other') base.kind = incoming.kind
}

/**
 * Merge provider rows by DOI (case-insensitive) or normalized title+year.
 * The first occurrence keeps its order; richer fields from later rows fill gaps.
 */
export function mergeCandidates(rows) {
  const byKey = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object') continue
    const title = text(row.title, MAX_TITLE_CHARS)
    if (!title) continue
    const doi = normalizeDoi(row.doi)
    const key = doi ? `doi:${doi}` : `title:${normalizeTitle(title)}|${row.year || ''}`
    const existing = byKey.get(key)
    if (existing) mergeInto(existing, row)
    else byKey.set(key, { ...row, title, doi })
  }
  return [...byKey.values()]
}

function normalizeProvider(value) {
  if (value === undefined || value === null || value === '') return 'both'
  const provider = String(value).trim().toLowerCase()
  if (provider !== 'both' && !RETRIEVAL_PROVIDERS.includes(provider)) {
    throw retrievalError('invalid_input', `provider must be both, openalex or crossref; got ${value}`)
  }
  return provider
}

function normalizeYear(value, label) {
  if (value === undefined || value === null || value === '') return null
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1800 || number > 3000) {
    throw retrievalError('invalid_input', `${label} must be an integer between 1800 and 3000`)
  }
  return number
}

export function normalizeSearchOptions(options = {}) {
  const query = text(options.query, MAX_QUERY_CHARS)
  if (!query) throw retrievalError('invalid_input', 'query must be a non-empty string')
  if (String(options.query ?? '').trim().length > MAX_QUERY_CHARS) {
    throw retrievalError('invalid_input', `query must be at most ${MAX_QUERY_CHARS} characters`)
  }
  const provider = normalizeProvider(options.provider)
  const limit = boundedLimit(options.limit)
  const yearFrom = normalizeYear(options.yearFrom, 'yearFrom')
  const yearTo = normalizeYear(options.yearTo, 'yearTo')
  if (yearFrom && yearTo && yearFrom > yearTo) {
    throw retrievalError('invalid_input', 'yearFrom must not be after yearTo')
  }
  const timeoutMs = Math.min(
    MAX_TIMEOUT_MS,
    Math.max(MIN_TIMEOUT_MS, Number.isInteger(Number(options.timeoutMs)) ? Number(options.timeoutMs) : 8_000),
  )
  return { query, provider, limit, yearFrom, yearTo, timeoutMs }
}

function providerList(provider) {
  return provider === 'both' ? [...RETRIEVAL_PROVIDERS] : [provider]
}

function buildUrl(provider, options) {
  if (provider === 'openalex') {
    const params = new URLSearchParams({
      search: options.query,
      'per-page': String(options.limit),
    })
    const filters = []
    if (options.yearFrom) filters.push(`from_publication_date:${options.yearFrom}-01-01`)
    if (options.yearTo) filters.push(`to_publication_date:${options.yearTo}-12-31`)
    if (filters.length) params.set('filter', filters.join(','))
    return `https://api.openalex.org/works?${params.toString()}`
  }
  const params = new URLSearchParams({
    'query.bibliographic': options.query,
    rows: String(options.limit),
  })
  const filters = []
  if (options.yearFrom) filters.push(`from-pub-date:${options.yearFrom}-01-01`)
  if (options.yearTo) filters.push(`until-pub-date:${options.yearTo}-12-31`)
  if (filters.length) params.set('filter', filters.join(','))
  return `https://api.crossref.org/works?${params.toString()}`
}

async function readResponseJson(provider, response) {
  const declared = Number(response.headers?.get?.('content-length'))
  if (Number.isFinite(declared) && declared > MAX_PROVIDER_BYTES) {
    throw retrievalError('retrieval_failed', `${provider} response is too large (${declared} bytes)`, {
      provider,
      maxBytes: MAX_PROVIDER_BYTES,
    })
  }
  if (typeof response.text === 'function') {
    let body
    try {
      body = await response.text()
    } catch (error) {
      throw retrievalError('retrieval_failed', `${provider} response body could not be read: ${messageOf(error)}`, {
        provider,
      })
    }
    if (Buffer.byteLength(body, 'utf8') > MAX_PROVIDER_BYTES) {
      throw retrievalError('retrieval_failed', `${provider} response exceeded ${MAX_PROVIDER_BYTES} bytes`, {
        provider,
        maxBytes: MAX_PROVIDER_BYTES,
      })
    }
    try {
      return JSON.parse(body)
    } catch (error) {
      throw retrievalError('retrieval_failed', `${provider} returned invalid JSON: ${messageOf(error)}`, {
        provider,
      })
    }
  }
  try {
    return await response.json()
  } catch (error) {
    throw retrievalError('retrieval_failed', `${provider} returned invalid JSON: ${messageOf(error)}`, {
      provider,
    })
  }
}

async function requestJson(provider, url, options) {
  const fetchImpl = options.fetchImpl || globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw retrievalError('retrieval_failed', 'this host has no fetch implementation', { provider })
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs)
  if (typeof timer.unref === 'function') timer.unref()
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': `dsh-research-suite/${VERSION} (literature metadata retrieval)`,
      },
    })
    if (!response || typeof response !== 'object') {
      throw retrievalError('retrieval_failed', `${provider} returned no response object`, { provider })
    }
    if (response.ok !== true) {
      throw retrievalError('retrieval_failed', `${provider} returned HTTP ${response.status ?? 'error'}`, {
        provider,
        status: response.status ?? null,
      })
    }
    return await readResponseJson(provider, response)
  } catch (error) {
    if (error?.code) throw error
    if (error?.name === 'AbortError' || controller.signal.aborted) {
      throw retrievalError('retrieval_timeout', `${provider} timed out after ${options.timeoutMs} ms`, {
        provider,
        timeoutMs: options.timeoutMs,
      })
    }
    throw retrievalError('retrieval_failed', `${provider} request failed: ${messageOf(error)}`, { provider })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Query one or both providers and return normalized, de-duplicated candidates.
 * A single provider failing is a warning; only all providers failing is an error.
 */
export async function searchLiterature(options = {}) {
  const normalized = normalizeSearchOptions(options)
  const started = Date.now()
  const providers = providerList(normalized.provider)
  const rows = []
  const warnings = []
  const counts = {}
  for (const provider of providers) {
    const url = buildUrl(provider, normalized)
    try {
      const payload = await requestJson(provider, url, { ...normalized, fetchImpl: options.fetchImpl })
      const parsed = provider === 'openalex' ? parseOpenAlex(payload, { limit: normalized.limit }) : parseCrossref(payload, { limit: normalized.limit })
      counts[provider] = parsed.length
      rows.push(...parsed)
    } catch (error) {
      counts[provider] = 0
      warnings.push({
        provider,
        code: typeof error?.code === 'string' ? error.code : 'retrieval_failed',
        message: messageOf(error),
      })
    }
  }
  if (rows.length === 0 && warnings.length === providers.length) {
    if (providers.length === 1) {
      const warning = warnings[0]
      throw retrievalError(warning.code, warning.message, {
        provider: warning.provider,
        warnings,
      })
    }
    throw retrievalError('retrieval_failed', 'all literature providers failed', {
      provider: normalized.provider,
      warnings,
    })
  }
  const candidates = mergeCandidates(rows).slice(0, normalized.limit)
  return {
    ok: true,
    query: normalized.query,
    provider: normalized.provider,
    providers: [...providers],
    limit: normalized.limit,
    yearFrom: normalized.yearFrom,
    yearTo: normalized.yearTo,
    candidates,
    counts,
    warnings,
    elapsedMs: Date.now() - started,
  }
}

/** Validate and normalize a DOI before a single-record lookup. */
function lookupDoiInput(value) {
  const doi = normalizeDoi(value)
  if (!doi) throw retrievalError('invalid_input', 'doi must be a non-empty DOI')
  if (!/^10\.\d{4,9}\/[^\s]+$/u.test(doi)) {
    throw retrievalError('invalid_input', `doi is not a canonical DOI: ${value}`)
  }
  return doi
}

function lookupTimeout(value) {
  return Math.min(
    MAX_TIMEOUT_MS,
    Math.max(MIN_TIMEOUT_MS, Number.isInteger(Number(value)) ? Number(value) : MAX_TIMEOUT_MS),
  )
}

/**
 * Resolve one DOI through Crossref. This is the precise companion to search:
 * a researcher who already has a DOI should not have to copy title/authors by
 * hand. Read-only, bounded and independent from the ledger.
 */
export async function lookupDoi(value, options = {}) {
  const doi = lookupDoiInput(value)
  const started = Date.now()
  const timeoutMs = lookupTimeout(options.timeoutMs)
  let payload
  try {
    payload = await requestJson('crossref', `https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      timeoutMs,
      fetchImpl: options.fetchImpl,
    })
  } catch (error) {
    if (error?.detail?.status === 404) {
      const missing = new Error(`DOI not found: ${doi}`)
      missing.code = 'not_found'
      missing.detail = { doi, provider: 'crossref', status: 404 }
      throw missing
    }
    throw error
  }
  const item = payload && payload.message
  if (!item || typeof item !== 'object') {
    throw retrievalError('retrieval_failed', 'Crossref returned no work message for the DOI', { doi, provider: 'crossref' })
  }
  const candidate = candidateFromCrossref(item)
  if (!candidate) {
    throw retrievalError('retrieval_failed', 'Crossref returned a work without a usable title', { doi, provider: 'crossref' })
  }
  if (candidate.doi && candidate.doi !== doi) {
    throw retrievalError('retrieval_failed', 'Crossref returned a different DOI', {
      doi,
      provider: 'crossref',
      returned: candidate.doi,
    })
  }
  return {
    ok: true,
    doi,
    provider: 'crossref',
    candidate,
    elapsedMs: Date.now() - started,
  }
}

export const RETRIEVAL_LIMITS = Object.freeze({
  maxQueryChars: MAX_QUERY_CHARS,
  maxLimit: MAX_LIMIT,
  minTimeoutMs: MIN_TIMEOUT_MS,
  maxTimeoutMs: MAX_TIMEOUT_MS,
  maxAbstractChars: MAX_ABSTRACT_CHARS,
  maxProviderBytes: MAX_PROVIDER_BYTES,
})
