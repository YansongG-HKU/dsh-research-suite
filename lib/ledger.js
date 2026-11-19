/**
 * Campaign store: append-only hash-chained events + materialised state +
 * content-addressed artifacts. Everything is local, no native dependencies.
 */
import {
  closeSync,
  existsSync,
  fstatSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { join } from 'node:path'

import { initBudget } from './budget.js'
import { defaultMonitoring } from './monitor.js'
import { defaultStewardship } from './stewardship.js'
import { SCHEMA_VERSION, LIMITS } from './config.js'
import { loadSigningKey, signAudit, verifyAuditSignature } from './signing.js'
import {
  appendLine,
  canon,
  ensureDir,
  randomHex,
  readJson,
  sha256Hex,
  utcnow,
  writeJsonAtomic,
} from './util.js'
import { writeZip } from './zip.js'

const GENESIS = '0'.repeat(64)
const LOCK_TIMEOUT_MS = 5000
const LOCK_STALE_MS = 30000

/**
 * Digest of the materialised state. The event tail (`seq` / `lastHash`) is
 * part of the payload, so editing state.json without appending an event is
 * visible even when the event chain itself still verifies. `stateHash` is
 * excluded because a digest cannot include itself.
 */
function stateDigest(state) {
  const copy = {}
  for (const [key, value] of Object.entries(state || {})) {
    if (key === 'stateHash' || key === 'stateHashVersion') continue
    copy[key] = value
  }
  return sha256Hex(canon(copy))
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function coded(code, message, detail) {
  const error = new Error(message)
  error.code = code
  if (detail !== undefined) error.detail = detail
  return error
}

function emptyState({ id, title, question, scope, success, tier, templateId, domain, domainData }) {
  return {
    version: 1,
    schema: SCHEMA_VERSION,
    id,
    title: title || question || '未命名研究',
    question: question || '',
    scope: scope || '',
    success: success || '',
    tier: tier || 'M',
    templateId: templateId || null,
    domain: domain || null,
    domainData: domainData && typeof domainData === 'object' ? domainData : {},
    monitoring: { ...defaultMonitoring(), updatedAt: utcnow() },
    stewardship: defaultStewardship(),
    migrations: [],
    stage: 'scoping',
    createdAt: utcnow(),
    updatedAt: utcnow(),
    archived: false,
    seq: 0,
    lastHash: GENESIS,
    prereg: null,
    manuscript: null,
    declaration: null,
    numbersAllowlist: '1,2,3',
    search: {},
    searchLog: [],
    screening: { candidates: [] },
    sensitivity: [],
    plan: { objective: '', questions: [], updatedAt: null },
    perspectives: [],
    autonomy: {},
    cycles: [],
    tournament: { matches: [] },
    quality: { rows: [] },
    contradictions: [],
    world: {},
    sources: [],
    claims: [],
    evidence: [],
    runs: [],
    numbers: [],
    figures: [],
    reviews: [],
    extractions: [],
    audits: [],
    loopBaseline: null,
    loopEvaluation: null,
    loopEvaluations: [],
    loop: { status: 'idle', pauseId: null, pausedAt: null, lastCheckAt: null, lastStatus: null },
    loopPauses: [],
    artifacts: [],
    gates: [],
    waivers: [],
    approvals: [],
    costs: [],
    budget: initBudget(tier || 'M'),
  }
}

export class ResearchStore {
  constructor({ dir, log, lockTimeoutMs, lockStaleMs, hooks } = {}) {
    this.dir = dir
    this.log = log || { info() {}, warn() {} }
    this.cache = new Map()
    this.index = null
    this.settingsData = null
    this.signing = null
    this.hooks = hooks || {}
    this.lockTimeoutMs = Number.isFinite(lockTimeoutMs) ? Math.max(1, lockTimeoutMs) : LOCK_TIMEOUT_MS
    this.lockStaleMs = Number.isFinite(lockStaleMs) ? Math.max(1, lockStaleMs) : LOCK_STALE_MS
  }

  init() {
    ensureDir(this.dir)
    ensureDir(this.campaignsDir())
    this.index = readJson(this.indexFile(), null) || { version: 1, current: null, campaigns: [] }
    if (!Array.isArray(this.index.campaigns)) this.index.campaigns = []
    this.settingsData = readJson(this.settingsFile(), null) || { version: 1 }
    return this
  }

  indexFile() {
    return join(this.dir, 'index.json')
  }

  settingsFile() {
    return join(this.dir, 'settings.json')
  }

  campaignsDir() {
    return join(this.dir, 'campaigns')
  }

  dirFor(id) {
    if (!/^rs-[0-9a-f]{8}$/u.test(String(id))) {
      throw Object.assign(new Error(`invalid campaign id: ${id}`), { code: 'invalid_input' })
    }
    return join(this.campaignsDir(), id)
  }

  eventsFile(id) {
    return join(this.dirFor(id), 'events.jsonl')
  }

  stateFile(id) {
    return join(this.dirFor(id), 'state.json')
  }

  artifactsDir(id) {
    return join(this.dirFor(id), 'artifacts')
  }

  exportsDir(id) {
    return join(this.dirFor(id), 'exports')
  }

  /** Migration backups live outside exports so a release package stays clean. */
  backupsDir(id) {
    return join(this.dirFor(id), 'backups')
  }

  backupFile(id, name) {
    if (!/^backup-[0-9A-Za-z._-]+\.zip$/u.test(String(name))) {
      throw coded('invalid_input', `invalid backup name: ${name}`)
    }
    return join(this.backupsDir(id), name)
  }

  /**
   * Campaign directories are the source of truth; index.json is a cache. This
   * lets doctor detect a stale index and reindex rebuild it without reading
   * every campaign into memory twice.
   */
  listCampaignDirs() {
    let entries = []
    try {
      entries = readdirSync(this.campaignsDir(), { withFileTypes: true })
    } catch (error) {
      if (error && error.code === 'ENOENT') return []
      throw error
    }
    return entries
      .filter((entry) => entry.isDirectory() && /^rs-[0-9a-f]{8}$/u.test(entry.name))
      .map((entry) => entry.name)
      .sort()
  }

  indexIntegrity() {
    const dirs = this.listCampaignDirs()
    const ids = this.index.campaigns.map((row) => String(row && row.id))
    const counts = new Map()
    for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1)
    const duplicates = [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id)
    const indexed = new Set(ids)
    const dirSet = new Set(dirs)
    const missing = dirs.filter((id) => !indexed.has(id))
    const orphan = [...indexed].filter((id) => !dirSet.has(id))
    const current = this.index.current || null
    return {
      ok: duplicates.length === 0 && missing.length === 0 && orphan.length === 0 && (!current || indexed.has(current)),
      dirs: dirs.length,
      indexed: ids.length,
      duplicated: duplicates,
      missing,
      orphan,
      current,
      currentMissing: Boolean(current && !indexed.has(current)),
    }
  }

  rebuildIndex(rows, current = null) {
    if (!Array.isArray(rows)) throw coded('invalid_input', 'index rows must be an array')
    const byId = new Map()
    for (const row of rows) {
      if (!row || !/^rs-[0-9a-f]{8}$/u.test(String(row.id))) {
        throw coded('invalid_input', `invalid index row: ${JSON.stringify(row)}`)
      }
      byId.set(row.id, row)
    }
    this.index = {
      version: 1,
      current: current && byId.has(current) ? current : (byId.keys().next().value || null),
      campaigns: [...byId.values()].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))),
    }
    this.saveIndex()
    return this.index
  }

  /**
   * Back up the state + event chain before a migration. Artifacts are
   * content-addressed and untouched by a schema migration, so they are not
   * copied: the manifest records the count and the export command remains the
   * full-package path. Retention is bounded so repeated failed migrations do
   * not fill the disk.
   */
  backup(id, { reason = 'manual' } = {}) {
    return this.withLock(id, () => {
      const state = this.get(id)
      const eventsPath = this.eventsFile(id)
      const events = existsSync(eventsPath) ? readFileSync(eventsPath) : Buffer.from('')
      const createdAt = utcnow()
      const stamp = createdAt.replace(/[:.]/gu, '-').replace(/Z$/u, '')
      const file = this.backupFile(id, `backup-${stamp}-${randomHex(3)}.zip`)
      ensureDir(this.backupsDir(id))
      const manifest = {
        kind: 'dsh-research-suite-backup',
        version: 1,
        campaign: id,
        title: state.title,
        schema: Number(state.schema) || 1,
        seq: Number(state.seq) || 0,
        lastHash: state.lastHash || null,
        createdAt,
        reason: String(reason || 'manual').slice(0, 120),
        artifacts: {
          count: Array.isArray(state.artifacts) ? state.artifacts.length : 0,
          included: false,
          note: 'content-addressed artifacts are immutable and not copied into a state backup',
        },
      }
      const stateJson = JSON.stringify(state, null, 2)
      const entries = [
        { name: 'manifest.json', data: JSON.stringify(manifest, null, 2) },
        { name: 'state.json', data: stateJson },
        { name: 'events.jsonl', data: events },
      ]
      const zip = writeZip(file, entries)
      const bytes = statSync(file).size
      const backup = {
        path: file,
        name: file.split(/[\\/]/u).pop(),
        bytes,
        sha256: sha256Hex(readFileSync(file)),
        createdAt,
        manifest,
        zip,
      }
      const pruned = this.pruneBackups(id)
      return { ...backup, pruned }
    })
  }

  listBackups(id) {
    let entries = []
    try {
      entries = readdirSync(this.backupsDir(id), { withFileTypes: true })
    } catch (error) {
      if (error && error.code === 'ENOENT') return []
      throw error
    }
    return entries
      .filter((entry) => entry.isFile() && /^backup-[0-9A-Za-z._-]+\.zip$/u.test(entry.name))
      .map((entry) => {
        const file = join(this.backupsDir(id), entry.name)
        const info = statSync(file)
        return { name: entry.name, path: file, bytes: info.size, modifiedAt: info.mtime.toISOString() }
      })
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
  }

  pruneBackups(id, keep = LIMITS.maxBackups) {
    const list = this.listBackups(id)
    const removed = []
    for (const item of list.slice(Math.max(0, keep))) {
      try {
        unlinkSync(item.path)
        removed.push(item.name)
      } catch (error) {
        if (!error || error.code !== 'ENOENT') throw error
      }
    }
    return removed
  }

  lockFile(id) {
    return join(this.dirFor(id), '.write.lock')
  }

  /**
   * Cross-process advisory lock for one campaign. `wx` is atomic on the local
   * filesystems this plugin targets; a lock left by a crashed process is
   * reclaimed only after `lockStaleMs`, so a busy writer is never stolen from
   * during a normal operation.
   */
  acquireLock(id) {
    const file = this.lockFile(id)
    ensureDir(this.dirFor(id))
    const token = randomHex(12)
    const deadline = Date.now() + this.lockTimeoutMs
    for (;;) {
      try {
        const fd = openSync(file, 'wx', 0o600)
        try {
          writeSync(fd, JSON.stringify({ pid: process.pid, host: 'local', token, ts: utcnow() }))
        } finally {
          closeSync(fd)
        }
        return token
      } catch (error) {
        if (!error || error.code !== 'EEXIST') throw error
        let stale = false
        try {
          const info = statSync(file)
          stale = Number.isFinite(info.mtimeMs) && Date.now() - info.mtimeMs > this.lockStaleMs
        } catch (statError) {
          if (statError && statError.code === 'ENOENT') continue
          throw statError
        }
        if (stale) {
          try {
            unlinkSync(file)
          } catch (unlinkError) {
            if (unlinkError && unlinkError.code !== 'ENOENT') throw unlinkError
          }
          continue
        }
        if (Date.now() >= deadline) {
          throw coded('locked', `campaign ${id} is locked by another writer`, { id, lock: file })
        }
        sleepSync(10)
      }
    }
  }

  releaseLock(id, token) {
    const file = this.lockFile(id)
    try {
      const held = JSON.parse(readFileSync(file, 'utf8'))
      if (held && held.token !== token) return false
      unlinkSync(file)
      return true
    } catch (error) {
      if (error && error.code === 'ENOENT') return false
      throw error
    }
  }

  withLock(id, fn) {
    const token = this.acquireLock(id)
    try {
      return fn()
    } finally {
      this.releaseLock(id, token)
    }
  }

  signingKey() {
    if (!this.signing) this.signing = loadSigningKey(this.dir)
    return this.signing
  }

  signAudit(audit) {
    return { ...audit, ...signAudit(audit, this.signingKey()) }
  }

  verifyAudit(audit) {
    return verifyAuditSignature(audit, this.signingKey())
  }

  saveIndex() {
    writeJsonAtomic(this.indexFile(), this.index)
  }

  settings() {
    // `allowExec` was a 1.0 UI toggle with no execution path behind it. Drop it
    // from the public view so the panel cannot advertise a permission it lacks.
    const { allowExec: _legacy, ...visible } = this.settingsData || {}
    return { ...visible }
  }

  saveSettings(patch = {}) {
    const { allowExec: _legacy, ...current } = this.settingsData || {}
    this.settingsData = { ...current, ...patch, version: 1 }
    writeJsonAtomic(this.settingsFile(), this.settingsData)
    return this.settings()
  }

  current() {
    return this.index.current || null
  }

  setCurrent(id) {
    this.get(id)
    this.index.current = id
    this.saveIndex()
    return this.get(id)
  }

  listCampaigns({ includeArchived = false } = {}) {
    return this.index.campaigns
      .filter((row) => includeArchived || !row.archived)
      .slice()
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .map((row) => ({ ...row, counts: { extractions: 0, audits: 0, artifacts: 0, ...(row.counts || {}) } }))
  }

  summaryOf(state) {
    return {
      id: state.id,
      title: state.title,
      stage: state.stage,
      tier: state.tier,
      templateId: state.templateId,
      domain: state.domain || null,
      archived: state.archived === true,
      updatedAt: state.updatedAt,
      createdAt: state.createdAt,
      counts: {
        sources: state.sources.length,
        claims: state.claims.length,
        evidence: state.evidence.length,
        runs: state.runs.length,
        numbers: state.numbers.length,
        figures: state.figures.length,
        reviews: state.reviews.length,
        extractions: (state.extractions || []).length,
        audits: (state.audits || []).length,
        artifacts: (state.artifacts || []).length,
        planQuestions: (state.plan && Array.isArray(state.plan.questions) ? state.plan.questions : []).length,
        perspectives: (state.perspectives || []).length,
        cycles: (state.cycles || []).length,
        matches: (state.tournament && Array.isArray(state.tournament.matches) ? state.tournament.matches : []).length,
        quality: (state.quality && Array.isArray(state.quality.rows) ? state.quality.rows : []).length,
        contradictions: (state.contradictions || []).length,
      },
    }
  }

  syncIndex(state, { makeCurrent = false } = {}) {
    const row = this.summaryOf(state)
    const rest = this.index.campaigns.filter((item) => item.id !== state.id)
    this.index.campaigns = [row, ...rest]
    if (makeCurrent || !this.index.current) this.index.current = state.id
    this.saveIndex()
    return row
  }

  create({ title, question, scope, success, tier, templateId, domain, domainData } = {}) {
    if (this.index.campaigns.length >= LIMITS.maxCampaigns) {
      throw Object.assign(new Error(`campaign limit reached (${LIMITS.maxCampaigns})`), { code: 'too_many' })
    }
    const id = `rs-${randomHex(4)}`
    ensureDir(this.dirFor(id))
    ensureDir(this.artifactsDir(id))
    const state = emptyState({ id, title, question, scope, success, tier, templateId, domain, domainData })
    this.cache.set(id, state)
    this.emit(state, 'campaign.created', 'agent', {
      title: state.title,
      question: state.question,
      tier: state.tier,
      templateId: state.templateId,
    })
    this.save(state, { makeCurrent: true })
    return state
  }

  get(id) {
    const key = String(id || '')
    if (!key) throw Object.assign(new Error('campaign id is required'), { code: 'invalid_input' })
    if (this.cache.has(key)) return this.cache.get(key)
    if (!existsSync(this.stateFile(key))) {
      throw Object.assign(new Error(`campaign not found: ${key}`), { code: 'not_found' })
    }
    const state = readJson(this.stateFile(key), null)
    if (!state) throw Object.assign(new Error(`campaign not found: ${key}`), { code: 'not_found' })
    this.cache.set(key, state)
    return state
  }

  /**
   * A disk state is safe to extend when it is a prefix of the in-memory chain
   * and the anchor event still hashes to `disk.lastHash`. This covers the
   * normal "append several events, then save once" pattern while still
   * rejecting a second process that has moved the campaign forward.
   */
  diskStateIsPrefix(state, disk) {
    if (!disk || !Number.isFinite(Number(disk.seq))) return true
    if (!Number.isFinite(Number(state.seq))) return true
    const diskSeq = Number(disk.seq)
    const stateSeq = Number(state.seq || 0)
    if (diskSeq > stateSeq) return false
    if (diskSeq === 0) return true
    const events = this.events(state)
    const anchor = events[diskSeq - 1]
    if (!anchor || anchor.hash !== disk.lastHash) return false
    if (disk.stateHash && state.stateHash && disk.stateHash !== state.stateHash) return false
    return true
  }

  save(state, { makeCurrent = false } = {}) {
    return this.withLock(state.id, () => {
      const disk = readJson(this.stateFile(state.id), null)
      if (!this.diskStateIsPrefix(state, disk)) {
        throw coded('stale_state', 'the campaign changed since it was loaded; reload it', {
          diskSeq: disk ? Number(disk.seq) : null,
          stateSeq: Number(state.seq || 0),
        })
      }
      state.updatedAt = utcnow()
      state.stateHashVersion = 1
      state.stateHash = stateDigest(state)
      writeJsonAtomic(this.stateFile(state.id), state)
      this.syncIndex(state, { makeCurrent })
      return state
    })
  }

  emit(state, kind, actor = 'agent', payload = {}) {
    return this.withLock(state.id, () => {
      const disk = readJson(this.stateFile(state.id), null)
      if (!this.diskStateIsPrefix(state, disk)) {
        throw coded('stale_state', 'the campaign has newer events; reload it before appending', {
          diskSeq: disk ? Number(disk.seq) : null,
          stateSeq: Number(state.seq || 0),
        })
      }
      const ts = utcnow()
      const body = canon(payload)
      const prev = state.lastHash || GENESIS
      const hash = sha256Hex(`${prev}|${ts}|${kind}|${actor}|${body}`)
      const event = { seq: (state.seq || 0) + 1, ts, kind, actor, payload, prev, hash }
      appendLine(this.eventsFile(state.id), JSON.stringify(event))
      state.seq = event.seq
      state.lastHash = hash
      state.updatedAt = ts
      return event
    })
  }

  events(state) {
    const file = this.eventsFile(state.id)
    if (!existsSync(file)) return []
    return readFileSync(file, 'utf8')
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line)
        } catch {
          return null
        }
      })
      .filter(Boolean)
  }

  addArtifact(state, source, role = 'file', extra = {}) {
    if (!state || typeof state !== 'object' || typeof state.id !== 'string') {
      throw Object.assign(new Error('artifact needs a campaign state'), { code: 'invalid_input' })
    }
    let bytes
    if (Buffer.isBuffer(source)) {
      bytes = source
    } else if (typeof source === 'string' && source.length > 0) {
      let fd
      try {
        fd = openSync(source, 'r')
      } catch (error) {
        throw Object.assign(new Error(`artifact source not found: ${source}`), { code: 'not_found', cause: error })
      }
      try {
        const info = fstatSync(fd)
        if (!info.isFile()) {
          throw Object.assign(new Error(`artifact source is not a file: ${source}`), { code: 'invalid_input' })
        }
        // Check the size on the open handle, not on a path that could be
        // swapped between stat and read, so an oversized file never lands in
        // memory and a replaced path cannot bypass the cap.
        if (info.size > LIMITS.maxArtifactBytes) {
          throw Object.assign(new Error('artifact exceeds 64 MB'), { code: 'too_large' })
        }
        bytes = readFileSync(fd)
        const after = fstatSync(fd)
        if (bytes.length > LIMITS.maxArtifactBytes || after.size > LIMITS.maxArtifactBytes) {
          throw Object.assign(new Error('artifact exceeds 64 MB'), { code: 'too_large' })
        }
      } finally {
        closeSync(fd)
      }
    } else {
      throw Object.assign(new Error('artifact source must be a Buffer or a file path'), { code: 'invalid_input' })
    }
    if (bytes.length > LIMITS.maxArtifactBytes) {
      throw Object.assign(new Error('artifact exceeds 64 MB'), { code: 'too_large' })
    }
    const hex = sha256Hex(bytes)
    const id = `sha256:${hex}`
    ensureDir(this.artifactsDir(state.id))
    const target = this.artifactPath(state.id, id)
    if (existsSync(target)) {
      // A valid duplicate is left untouched. A corrupted file at the same
      // content address is repaired, so the path keeps meaning what it says.
      const existing = readFileSync(target)
      if (!existing.equals(bytes)) writeFileSync(target, bytes)
    } else {
      writeFileSync(target, bytes)
    }
    const artifacts = Array.isArray(state.artifacts) ? state.artifacts : (state.artifacts = [])
    const known = artifacts.find((item) => item && item.id === id)
    if (!known) artifacts.push({ id, bytes: bytes.length, role, ts: utcnow(), ...extra })
    return { id, bytes: bytes.length, role: known ? known.role : role }
  }

  artifactPath(id, artifactId) {
    if (typeof artifactId !== 'string' || artifactId.length === 0) {
      throw Object.assign(new Error(`invalid artifact id: ${String(artifactId)}`), { code: 'invalid_input' })
    }
    const hex = artifactId.startsWith('sha256:') ? artifactId.slice(7) : artifactId
    if (!/^[0-9a-f]{64}$/u.test(hex)) {
      throw Object.assign(new Error(`invalid artifact id: ${artifactId}`), { code: 'invalid_input' })
    }
    return join(this.artifactsDir(id), hex)
  }

  /**
   * Read an artifact through one open handle. The size and hash are checked on
   * that handle, then the path is re-statted: a rename-based replacement
   * between open and read is reported as `artifact_changed` instead of being
   * silently returned as valid content.
   */
  readArtifactBytes(campaignId, artifactId, options = {}) {
    const file = this.artifactPath(campaignId, artifactId)
    let fd
    try {
      fd = openSync(file, 'r')
    } catch (error) {
      if (error && error.code === 'ENOENT') return null
      throw error
    }
    try {
      if (typeof this.hooks.beforeArtifactRead === 'function') this.hooks.beforeArtifactRead(file)
      const before = fstatSync(fd)
      if (!before.isFile()) throw coded('invalid_input', `artifact is not a regular file: ${artifactId}`)
      const maxBytes = Math.min(options.maxBytes ?? LIMITS.maxArtifactBytes, LIMITS.maxArtifactBytes)
      if (before.size > maxBytes) throw coded('too_large', `artifact exceeds ${maxBytes} bytes`)
      const bytes = Buffer.allocUnsafe(before.size)
      let offset = 0
      while (offset < bytes.length) {
        const count = readSync(fd, bytes, offset, bytes.length - offset, offset)
        if (count === 0) throw coded('artifact_changed', 'artifact shrank while reading', { id: artifactId })
        offset += count
      }
      const after = fstatSync(fd)
      if (after.size !== before.size) throw coded('artifact_changed', 'artifact size changed while reading', { id: artifactId })
      const expected = options.expectedHash
        ? String(options.expectedHash).startsWith('sha256:')
          ? String(options.expectedHash)
          : `sha256:${options.expectedHash}`
        : null
      const actual = `sha256:${sha256Hex(bytes)}`
      if (expected && actual !== expected) {
        throw coded('artifact_hash_mismatch', `artifact content does not match ${expected}`, {
          id: artifactId,
          expected,
          actual,
        })
      }
      let current
      try {
        current = statSync(file)
      } catch (error) {
        if (error && error.code === 'ENOENT') throw coded('artifact_changed', 'artifact disappeared while reading')
        throw error
      }
      if (current.dev !== before.dev || current.ino !== before.ino || current.size !== after.size) {
        throw coded('artifact_changed', 'artifact path was replaced while reading', { id: artifactId })
      }
      return bytes
    } finally {
      closeSync(fd)
    }
  }

  artifactText(campaignId, artifactId) {
    const bytes = this.readArtifactBytes(campaignId, artifactId, { expectedHash: artifactId })
    return bytes === null ? null : bytes.toString('utf8')
  }

  verify(id) {
    const state = this.get(id)
    const problems = []
    let chainOk = true
    let brokenSeq = null
    let prev = GENESIS
    let seq = 0
    const events = this.events(state)
    for (const event of events) {
      seq += 1
      const expected = sha256Hex(`${prev}|${event.ts}|${event.kind}|${event.actor}|${canon(event.payload)}`)
      if (event.seq !== seq || event.prev !== prev || event.hash !== expected) {
        chainOk = false
        brokenSeq = event.seq ?? seq
        break
      }
      prev = event.hash
    }
    if (chainOk) {
      // The materialised state may carry the expected tail: this detects a
      // truncated or appended events file that is still internally consistent.
      // Older states without these fields fall back to chain-only verification.
      const anchored = Number.isFinite(Number(state.seq))
      const expectedEvents = anchored ? Number(state.seq) : seq
      if (anchored && expectedEvents !== seq) {
        chainOk = false
        brokenSeq = Math.min(expectedEvents, seq) + 1
      } else if (typeof state.lastHash === 'string' && state.lastHash !== prev) {
        chainOk = false
        brokenSeq = Math.max(seq, 1)
      }
    }
    const stateProblems = []
    let stateOk = null
    const stateHash = typeof state.stateHash === 'string' ? state.stateHash : null
    if (stateHash) {
      const actual = stateDigest(state)
      stateOk = actual === stateHash
      if (!stateOk) stateProblems.push({ problem: 'state_hash_mismatch', expected: stateHash, actual })
    }
    const artifactProblems = []
    const known = new Set()
    for (const item of state.artifacts || []) {
      if (item && typeof item === 'object' && typeof item.id === 'string') {
        known.add(item.id)
        known.add(item.id.startsWith('sha256:') ? item.id.slice(7) : `sha256:${item.id}`)
      }
    }
    for (const item of state.artifacts || []) {
      const artifactId = item && typeof item === 'object' && typeof item.id === 'string' ? item.id : null
      const canonical = artifactId && !artifactId.startsWith('sha256:') ? `sha256:${artifactId}` : artifactId
      let bytes
      try {
        bytes = this.readArtifactBytes(state.id, artifactId, { expectedHash: canonical })
      } catch (error) {
        if (error && error.code === 'invalid_input') {
          artifactProblems.push({ id: String(artifactId), problem: 'invalid_id' })
        } else if (error && error.code === 'artifact_hash_mismatch') {
          artifactProblems.push({ id: artifactId, problem: 'hash_mismatch' })
        } else if (error && error.code === 'artifact_changed') {
          artifactProblems.push({ id: artifactId, problem: 'changed_during_read' })
        } else {
          artifactProblems.push({ id: artifactId, problem: 'unreadable' })
        }
        continue
      }
      if (bytes === null) {
        artifactProblems.push({ id: artifactId, problem: 'missing' })
        continue
      }
      if (bytes.length !== item.bytes) artifactProblems.push({ id: artifactId, problem: 'size_mismatch' })
    }

    // Reconcile the directory with the registry. A file with a valid content
    // address but no row is a missing entry; anything else is an orphan file.
    let entries = []
    try {
      entries = readdirSync(this.artifactsDir(state.id), { withFileTypes: true })
    } catch (error) {
      if (error.code !== 'ENOENT') problems.push({ problem: 'artifacts_dir_unreadable', code: error.code || null })
    }
    const unregistered = []
    for (const entry of entries) {
      const name = entry.name
      const address = /^[0-9a-f]{64}$/u.test(name) ? `sha256:${name}` : null
      if (address ? known.has(address) : known.has(name)) continue
      if (!entry.isFile()) {
        unregistered.push({ id: name, problem: 'orphan_file' })
      } else if (address) {
        unregistered.push({ id: address, problem: 'missing_entry' })
      } else {
        unregistered.push({ id: name, problem: 'orphan_file' })
      }
    }
    unregistered.sort((a, b) => a.id.localeCompare(b.id) || a.problem.localeCompare(b.problem))
    artifactProblems.push(...unregistered)
    return {
      campaign: state.id,
      chainOk,
      brokenSeq,
      events: seq,
      artifacts: (state.artifacts || []).length,
      artifactProblems,
      stateHash,
      stateOk,
      stateProblems,
      problems,
    }
  }

  archive(id) {
    const state = this.get(id)
    state.archived = true
    this.emit(state, 'campaign.archived', 'agent', {})
    this.save(state)
    if (this.index.current === id) {
      const next = this.listCampaigns()[0]
      this.index.current = next ? next.id : null
      this.saveIndex()
    }
    return state
  }

  /**
   * Archive is reversible: the campaign keeps its full ledger and can be
   * restored to the active list. It becomes current only when no other active
   * campaign is selected, so restore never steals the operator's selection.
   */
  unarchive(id) {
    const state = this.get(id)
    if (state.archived !== true) return state
    state.archived = false
    this.emit(state, 'campaign.unarchived', 'agent', {})
    this.save(state, { makeCurrent: !this.index.current || this.index.current === id })
    return state
  }
}
