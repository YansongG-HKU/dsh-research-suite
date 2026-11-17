/** Small shared helpers: hashing, canonical JSON, safe IO. */
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, appendFileSync } from 'node:fs'
import { dirname } from 'node:path'

export function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex')
}

/** Stable stringify so the hash chain does not depend on key order. */
export function canon(value) {
  const walk = (node) => {
    if (node === null || typeof node !== 'object') return node
    if (Array.isArray(node)) return node.map(walk)
    const out = {}
    for (const key of Object.keys(node).sort()) {
      if (typeof node[key] === 'undefined') continue
      out[key] = walk(node[key])
    }
    return out
  }
  return JSON.stringify(walk(value ?? {}))
}

export function utcnow() {
  return new Date().toISOString()
}

export function randomHex(bytes = 4) {
  return randomBytes(bytes).toString('hex')
}

export function messageOf(error) {
  if (error instanceof Error) return error.message
  return String(error ?? 'unknown error')
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true })
  return path
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

export function writeJsonAtomic(file, value) {
  ensureDir(dirname(file))
  const tmp = `${file}.${randomHex(3)}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
  renameSync(tmp, file)
}

export function appendLine(file, line) {
  ensureDir(dirname(file))
  appendFileSync(file, line.endsWith('\n') ? line : `${line}\n`, 'utf8')
}

export function exists(path) {
  return existsSync(path)
}

export function slugify(value, fallback = 'item') {
  const text = String(value || '')
    .replace(/[\\/:*?"<>|]+/gu, ' ')
    .replace(/\s+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 48)
  return text || fallback
}

export function truncate(text, max) {
  const value = String(text ?? '')
  if (Buffer.byteLength(value, 'utf8') <= max) return { text: value, truncated: false }
  let cut = value.slice(0, max)
  while (Buffer.byteLength(cut, 'utf8') > max) cut = cut.slice(0, -1)
  return { text: cut, truncated: true }
}

export function asInt(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback
}

export function asNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function asString(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
}
