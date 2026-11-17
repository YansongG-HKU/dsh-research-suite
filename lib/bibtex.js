/**
 * BibTeX interoperability.
 *
 * Deliberately small and dependency-free: it parses ordinary `@article` /
 * `@misc` records (including nested braces and quoted values), imports the
 * fields the ledger understands, and renders a stable `references.bib`.
 * LaTeX macros are preserved verbatim; no attempt is made to expand `@string`.
 */

function stripOuterBraces(value) {
  let text = String(value || '').trim()
  while (text.startsWith('{') && text.endsWith('}')) {
    let depth = 0
    let wraps = true
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] === '{') depth += 1
      else if (text[i] === '}') {
        depth -= 1
        if (depth === 0 && i !== text.length - 1) {
          wraps = false
          break
        }
      }
    }
    if (!wraps) break
    text = text.slice(1, -1).trim()
  }
  return text
}

function readBalanced(input, start, open = '{', close = '}') {
  let depth = 1
  let i = start
  while (i < input.length) {
    const ch = input[i]
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === open) depth += 1
    else if (ch === close) {
      depth -= 1
      if (depth === 0) return { value: input.slice(start, i), end: i + 1 }
    }
    i += 1
  }
  return { value: input.slice(start), end: input.length }
}

function readFields(text) {
  const fields = {}
  let i = 0
  while (i < text.length) {
    while (i < text.length && /[\s,]/u.test(text[i])) i += 1
    if (i >= text.length) break
    const nameMatch = /^[A-Za-z][A-Za-z0-9_-]*/u.exec(text.slice(i))
    if (!nameMatch) {
      i += 1
      continue
    }
    const name = nameMatch[0].toLowerCase()
    i += nameMatch[0].length
    while (i < text.length && /\s/u.test(text[i])) i += 1
    if (text[i] !== '=') {
      // Malformed field: skip to the next comma so one bad field cannot
      // swallow the rest of the entry.
      const comma = text.indexOf(',', i)
      i = comma === -1 ? text.length : comma + 1
      continue
    }
    i += 1
    while (i < text.length && /\s/u.test(text[i])) i += 1
    let value = ''
    if (text[i] === '{') {
      const result = readBalanced(text, i + 1)
      value = result.value
      i = result.end
    } else if (text[i] === '"') {
      let j = i + 1
      let buffer = ''
      while (j < text.length) {
        if (text[j] === '\\' && j + 1 < text.length) {
          buffer += text[j] + text[j + 1]
          j += 2
          continue
        }
        if (text[j] === '"') break
        buffer += text[j]
        j += 1
      }
      value = buffer
      i = j + 1
    } else {
      const comma = text.indexOf(',', i)
      const end = comma === -1 ? text.length : comma
      value = text.slice(i, end)
      i = end
    }
    fields[name] = stripOuterBraces(value)
    while (i < text.length && /[\s,]/u.test(text[i])) i += 1
  }
  return fields
}

export function parseBibtex(text) {
  const input = String(text || '')
  const entries = []
  let cursor = 0
  while (cursor < input.length) {
    const at = input.indexOf('@', cursor)
    if (at === -1) break
    const header = /^@([A-Za-z]+)\s*([{(])/u.exec(input.slice(at))
    if (!header) {
      cursor = at + 1
      continue
    }
    const type = header[1].toLowerCase()
    if (type === 'comment' || type === 'string' || type === 'preamble') {
      cursor = at + header[0].length
      continue
    }
    const open = header[2]
    const close = open === '{' ? '}' : ')'
    const bodyStart = at + header[0].length
    const body = readBalanced(input, bodyStart, open, close)
    cursor = body.end
    const content = body.value
    let depth = 0
    let comma = -1
    for (let i = 0; i < content.length; i += 1) {
      const ch = content[i]
      if (ch === '{') depth += 1
      else if (ch === '}') depth -= 1
      else if (ch === ',' && depth === 0) {
        comma = i
        break
      }
    }
    if (comma === -1) continue
    const key = content.slice(0, comma).trim()
    if (!key) continue
    entries.push({ type, key, fields: readFields(content.slice(comma + 1)) })
  }
  return entries
}

export function sanitizeBibKey(value, fallback = 'ref') {
  const text = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^A-Za-z0-9:_-]+/gu, '')
  return text || fallback
}

function firstAuthorSurname(author) {
  const first = String(author || '').split(/\s+and\s+/u)[0] || ''
  if (!first) return 'anon'
  if (first.includes(',')) return first.split(',')[0].trim()
  const parts = first.trim().split(/\s+/u)
  return parts[parts.length - 1] || first
}

export function makeBibKey(source, used = new Set()) {
  const explicit = source && typeof source.bibtexKey === 'string' ? sanitizeBibKey(source.bibtexKey.trim(), '') : ''
  let base = explicit
  if (!base) {
    const surname = sanitizeBibKey(firstAuthorSurname(source && source.authors), 'anon').toLowerCase()
    const year = sanitizeBibKey(source && source.year, 'nd')
    const word = sanitizeBibKey(String((source && source.title) || '').split(/\s+/u)[0] || 'ref', 'ref').toLowerCase()
    base = `${surname}${year}${word}`
  }
  let candidate = base
  let n = 2
  while (used.has(candidate)) {
    candidate = `${base}${String.fromCharCode(96 + n)}`
    n += 1
  }
  used.add(candidate)
  return candidate
}

function entryType(source) {
  if (source && source.kind === 'paper') return 'article'
  if (source && source.kind === 'book') return 'book'
  return 'misc'
}

function escapeField(value) {
  return String(value || '').replace(/[{}]/gu, (ch) => `\\${ch}`)
}

export function bibtexFromSource(source, used = new Set()) {
  const key = makeBibKey(source, used)
  const fields = []
  const title = String(source.title || '').trim()
  if (title) fields.push(['title', title])
  const authors = Array.isArray(source.authors) ? source.authors.join(' and ') : String(source.authors || '').trim()
  if (authors) fields.push(['author', authors])
  if (source.year) fields.push(['year', source.year])
  if (source.journal) fields.push(['journal', source.journal])
  if (source.doi) fields.push(['doi', source.doi])
  if (source.url) fields.push(['url', source.url])
  if (source.kind) fields.push(['note', `kind: ${source.kind}`])
  const body = fields.map(([name, value]) => `  ${name} = {${escapeField(value)}}`).join(',\n')
  return `@${entryType(source)}{${key},\n${body}\n}`
}

export function renderBibtex(sources) {
  const used = new Set()
  const entries = (Array.isArray(sources) ? sources : []).map((source) => bibtexFromSource(source, used))
  if (entries.length === 0) return '% dsh-research-suite: no sources recorded yet\n'
  return `${entries.join('\n\n')}\n`
}

function reliabilityFor(kind) {
  if (kind === 'paper' || kind === 'preprint' || kind === 'dataset') return 'primary'
  if (kind === 'registry') return 'tertiary'
  return 'secondary'
}

export function sourceFromBibEntry(entry) {
  const fields = entry.fields || {}
  const year = Number(String(fields.year || '').slice(0, 4))
  const type = String(entry.type || '').toLowerCase()
  let kind = 'other'
  if (type === 'book') kind = 'book'
  else if (type === 'article' || type === 'inproceedings' || type === 'conference' || type === 'incollection') kind = 'paper'
  else if (type === 'techreport' || type === 'report') kind = 'report'
  else if (type === 'dataset') kind = 'dataset'
  else if (fields.eprint || fields.archiveprefix) kind = 'preprint'
  // `references.bib` writes the original ledger kind into note as
  // `kind: <value>` because BibTeX has no report/dataset entry type that all
  // consumers understand. Prefer it over the lossy type inference.
  const noteKind = /(?:^|;\s*)kind:\s*([a-z]+)/u.exec(String(fields.note || ''))?.[1]
  if (noteKind && ['paper', 'book', 'report', 'dataset', 'preprint', 'registry', 'other'].includes(noteKind)) {
    kind = noteKind
  }
  return {
    title: stripOuterBraces(fields.title || ''),
    authors: fields.author || '',
    year: Number.isFinite(year) && year > 0 ? year : null,
    journal: fields.journal || fields.booktitle || '',
    doi: fields.doi || '',
    url: fields.url || fields.howpublished || '',
    kind,
    reliability: reliabilityFor(kind),
    bibtexKey: entry.key,
    notes: fields.note || fields.abstract || '',
  }
}
