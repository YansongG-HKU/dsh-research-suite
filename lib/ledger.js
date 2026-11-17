/**
 * Campaign store: append-only hash-chained events + materialised state +
 * content-addressed artifacts. Everything is local, no native dependencies.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { initBudget } from './budget.js'
import { LIMITS } from './config.js'
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

const GENESIS = '0'.repeat(64)

function emptyState({ id, title, question, scope, success, tier, templateId }) {
  return {
    version: 1,
    id,
    title: title || question || '未命名研究',
    question: question || '',
    scope: scope || '',
    success: success || '',
    tier: tier || 'M',
    templateId: templateId || null,
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
    artifacts: [],
    gates: [],
    budget: initBudget(tier || 'M'),
  }
}

export class ResearchStore {
  constructor({ dir, log } = {}) {
    this.dir = dir
    this.log = log || { info() {}, warn() {} }
    this.cache = new Map()
    this.index = null
    this.settingsData = null
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

  saveIndex() {
    writeJsonAtomic(this.indexFile(), this.index)
  }

  settings() {
    return { ...this.settingsData }
  }

  saveSettings(patch = {}) {
    this.settingsData = { ...this.settingsData, ...patch, version: 1 }
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

  create({ title, question, scope, success, tier, templateId } = {}) {
    if (this.index.campaigns.length >= 200) {
      throw Object.assign(new Error('campaign limit reached (200)'), { code: 'too_many' })
    }
    const id = `rs-${randomHex(4)}`
    ensureDir(this.dirFor(id))
    ensureDir(this.artifactsDir(id))
    const state = emptyState({ id, title, question, scope, success, tier, templateId })
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

  save(state, { makeCurrent = false } = {}) {
    state.updatedAt = utcnow()
    writeJsonAtomic(this.stateFile(state.id), state)
    this.syncIndex(state, { makeCurrent })
    return state
  }

  emit(state, kind, actor = 'agent', payload = {}) {
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
      let info
      try {
        info = statSync(source)
      } catch (error) {
        throw Object.assign(new Error(`artifact source not found: ${source}`), { code: 'not_found', cause: error })
      }
      if (!info.isFile()) {
        throw Object.assign(new Error(`artifact source is not a file: ${source}`), { code: 'invalid_input' })
      }
      // Check the size before reading so an oversized file never lands in memory.
      if (info.size > LIMITS.maxArtifactBytes) {
        throw Object.assign(new Error('artifact exceeds 64 MB'), { code: 'too_large' })
      }
      bytes = readFileSync(source)
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

  artifactText(campaignId, artifactId) {
    const file = this.artifactPath(campaignId, artifactId)
    if (!existsSync(file)) return null
    try {
      return readFileSync(file, 'utf8')
    } catch {
      return null
    }
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
      let path
      try {
        path = this.artifactPath(state.id, artifactId)
      } catch {
        artifactProblems.push({ id: String(artifactId), problem: 'invalid_id' })
        continue
      }
      let bytes
      try {
        if (!existsSync(path)) {
          artifactProblems.push({ id: artifactId, problem: 'missing' })
          continue
        }
        bytes = readFileSync(path)
      } catch {
        artifactProblems.push({ id: artifactId, problem: 'unreadable' })
        continue
      }
      if (`sha256:${sha256Hex(bytes)}` !== canonical) artifactProblems.push({ id: artifactId, problem: 'hash_mismatch' })
      else if (bytes.length !== item.bytes) artifactProblems.push({ id: artifactId, problem: 'size_mismatch' })
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
}
