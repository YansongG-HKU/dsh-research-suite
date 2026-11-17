/**
 * Research service: the single source of truth shared by the agent tools and
 * the panel routes. Every mutation emits a hash-chained event and persists the
 * materialised state.
 */
import { copyFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { CLAIM_STATUSES, ARTIFACT_ROLES, LIMITS, RELATIONS, RELIABILITY, SOURCE_KINDS, STAGE_ORDER, TIERS, VERSION } from './config.js'
import { budgetSummary, chargeBudget, initBudget } from './budget.js'
import { checkGate, numberMatchesTrace, resolveTrace } from './gates.js'
import { applyTemplate, getTemplate, listTemplates } from './templates.js'
import { renderDeclaration, renderReport } from './report.js'
import { renderAuditMarkdown, runAudit } from './audit.js'
import { auditSubjectHash } from './subject.js'
import { buildMatrix, renderMatrixCsv, renderMatrixMarkdown } from './matrix.js'
import { buildProvenance, buildRoCrate } from './provenance.js'
import { parseBibtex, renderBibtex, sourceFromBibEntry } from './bibtex.js'
import { asInt, asNumber, asString, ensureDir, randomHex, sha256Hex, truncate, utcnow } from './util.js'
import { writeZip } from './zip.js'

function codedError(code, message, detail) {
  const error = new Error(message)
  error.code = code
  if (detail !== undefined) error.detail = detail
  return error
}

function nextId(state, prefix) {
  const lists = {
    S: state.sources,
    C: state.claims,
    E: state.evidence,
    N: state.numbers,
    F: state.figures,
    V: state.reviews,
    X: state.extractions,
    A: state.audits,
  }
  const list = lists[prefix] || []
  const max = list.reduce((acc, item) => {
    const num = Number(String(item.id).slice(2))
    return Number.isFinite(num) ? Math.max(acc, num) : acc
  }, 0)
  return `${prefix}-${String(max + 1).padStart(4, '0')}`
}

function publicState(state) {
  const { events, ...rest } = state
  return {
    ...rest,
    manuscript: state.manuscript
      ? {
          chars: state.manuscript.chars,
          artifact: state.manuscript.artifact,
          updatedAt: state.manuscript.updatedAt,
          preview: String(state.manuscript.text || '').slice(0, 400),
        }
      : null,
  }
}

export class ResearchService {
  constructor({ store, config, log }) {
    this.store = store
    this.config = config
    this.log = log || { info() {}, warn() {} }
  }

  campaigns() {
    return this.store.listCampaigns()
  }

  state() {
    return {
      version: 1,
      plugin: 'dsh-research-suite',
      current: this.store.current(),
      campaigns: this.campaigns(),
      dataDir: this.store.dir,
      settings: this.store.settings(),
      defaults: { tier: this.config.defaultTier, language: this.config.language },
    }
  }

  resolve(campaign) {
    const id = asString(campaign) || this.store.current()
    if (!id) {
      throw codedError('no_campaign', 'No campaign is selected. Create one with rsx_campaign action:"create" or apply a template.', {
        candidates: this.campaigns().map((item) => item.id),
      })
    }
    return id
  }

  /** Every gate invocation verifies the audit signature with the local key. */
  gateResult(state, stage, integrity) {
    return checkGate(state, stage, {
      integrity,
      verifyAudit: (audit) => this.store.verifyAudit(audit),
    })
  }

  get(campaign) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const integrity = this.store.verify(id)
    return {
      state: publicState(state),
      integrity,
      gate: this.gateResult(state, state.stage, integrity),
      budget: budgetSummary(state),
    }
  }

  select(campaign) {
    const id = this.resolve(campaign)
    this.store.setCurrent(id)
    return { campaign: this.store.summaryOf(this.store.get(id)) }
  }

  create(args = {}) {
    const question = asString(args.question)
    const title = asString(args.title) || (question ? question.slice(0, 48) : '未命名研究')
    const tier = TIERS[args.tier] ? args.tier : this.config.defaultTier
    const state = this.store.create({
      title,
      question,
      scope: asString(args.scope),
      success: asString(args.success),
      tier,
      templateId: asString(args.templateId) || null,
    })
    return {
      campaign: this.store.summaryOf(state),
      dir: this.store.dirFor(state.id),
      next: 'Fill question/scope/success, then rsx_gate action:"check" for scoping.',
    }
  }

  update(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const patch = {}
    for (const key of ['title', 'question', 'scope', 'success']) {
      if (typeof args[key] === 'string') patch[key] = args[key].trim()
    }
    if (typeof args.numbersAllowlist === 'string' && /^[0-9.,\s]+$/u.test(args.numbersAllowlist)) {
      patch.numbersAllowlist = args.numbersAllowlist
    }
    if (typeof args.tier === 'string') {
      if (!TIERS[args.tier]) throw codedError('invalid_input', `unknown tier: ${args.tier}`)
      const used = Object.values(state.budget?.stages || {}).reduce((acc, row) => acc + row.tokensUsed + row.secondsUsed, 0)
      if (used > 0 && args.tier !== state.tier) {
        throw codedError('budget_in_use', 'cannot change tier after budget was charged; start a new campaign instead')
      }
      patch.tier = args.tier
      state.budget = initBudget(args.tier)
    }
    Object.assign(state, patch)
    this.store.emit(state, 'campaign.updated', 'agent', patch)
    this.store.save(state)
    return { campaign: this.store.summaryOf(state), changed: Object.keys(patch) }
  }

  world(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const action = asString(args.action, 'set')
    const kind = asString(args.kind)
    const key = asString(args.key)
    if (action === 'list') return { world: state.world }
    if (action === 'get') {
      if (!kind) return { world: state.world }
      return { value: key ? state.world[kind]?.[key] : state.world[kind] }
    }
    if (!kind || !key) throw codedError('invalid_input', 'world set needs kind and key')
    let value = args.value
    if (kind === 'novelty' && typeof value === 'string') value = { checked: true, nearest: value }
    if (value === undefined) throw codedError('invalid_input', 'world set needs value')
    if (!state.world[kind] || typeof state.world[kind] !== 'object') state.world[kind] = {}
    state.world[kind][key] = value
    this.store.emit(state, 'world.set', 'agent', { kind, key, value })
    this.store.save(state)
    return { world: state.world }
  }

  search(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const query = asString(args.query) || asString(args.note)
    if (args.disconfirming !== true) {
      throw codedError('invalid_input', 'this action records a disconfirming search; pass disconfirming:true')
    }
    state.search = { ...state.search, disconfirming: true, query, at: utcnow() }
    this.store.emit(state, 'search.disconfirming', 'agent', { query })
    this.store.save(state)
    return { search: state.search }
  }

  prereg(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const spec = args.spec && typeof args.spec === 'object' ? args.spec : args
    const prereg = {
      hypothesisId: asString(spec.hypothesisId) || (state.claims.find((item) => item.kind === 'hypothesis') || {}).id || '',
      metric: asString(spec.metric),
      n: asInt(spec.n, 0),
      analysisPlan: asString(spec.analysisPlan),
      stoppingRule: asString(spec.stoppingRule),
      seed: spec.seed === 0 ? 0 : asInt(spec.seed, NaN),
      controls: Array.isArray(spec.controls) ? spec.controls.map(String) : [],
      envLock: asString(spec.envLock),
      lockedAt: utcnow(),
    }
    if (!Number.isFinite(prereg.seed)) prereg.seed = null
    state.prereg = prereg
    this.store.emit(state, 'prereg.locked', 'agent', prereg)
    this.store.save(state)
    const gate = this.gateResult(state, 'design')
    return { prereg, gate }
  }

  budget(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const action = asString(args.action, 'get')
    if (action === 'tier') {
      const tier = asString(args.tier)
      if (!TIERS[tier]) throw codedError('invalid_input', `unknown tier: ${tier}`)
      state.tier = tier
      state.budget = initBudget(tier)
      this.store.emit(state, 'budget.tier', 'agent', { tier })
      this.store.save(state)
      return { budget: budgetSummary(state) }
    }
    if (action === 'charge') {
      const stage = asString(args.stage) || state.stage
      const row = chargeBudget(state, stage, { tokens: asInt(args.tokens), seconds: asInt(args.seconds) })
      this.store.emit(state, 'budget.charged', 'agent', { stage, tokens: asInt(args.tokens), seconds: asInt(args.seconds) })
      this.store.save(state)
      return { stage, row, budget: budgetSummary(state) }
    }
    return { budget: budgetSummary(state) }
  }

  archive(campaign) {
    const id = this.resolve(campaign)
    const state = this.store.archive(id)
    return { campaign: this.store.summaryOf(state) }
  }

  sourceAdd(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    let bib = null
    if (typeof args.bibtex === 'string' && args.bibtex.trim()) {
      const parsed = parseBibtex(args.bibtex)
      if (parsed.length === 0) throw codedError('invalid_input', 'bibtex contains no parsable entry')
      bib = sourceFromBibEntry(parsed[0])
    }
    const title = asString(args.title) || asString(bib && bib.title)
    if (!title) throw codedError('invalid_input', 'source title is required')
    let content = ''
    if (typeof args.content === 'string' && args.content.trim()) content = args.content
    else if (asString(args.path)) {
      const path = asString(args.path)
      if (!existsSync(path)) throw codedError('not_found', `source file not found: ${path}`)
      const info = statSync(path)
      if (!info.isFile()) throw codedError('invalid_input', `source path is not a file: ${path}`)
      if (info.size > LIMITS.maxArtifactBytes) throw codedError('too_large', 'source capture exceeds 64 MB')
      content = readFileSync(path, 'utf8')
    }
    const authors = Array.isArray(args.authors)
      ? args.authors.map(String).join(' and ')
      : asString(args.authors) || asString(bib && bib.authors)
    const doi = asString(args.doi) || asString(bib && bib.doi)
    const source = {
      id: nextId(state, 'S'),
      title,
      url: asString(args.url) || asString(bib && bib.url),
      year: asInt(args.year, 0) || asInt(bib && bib.year, 0) || null,
      kind: SOURCE_KINDS.includes(args.kind) ? args.kind : bib && SOURCE_KINDS.includes(bib.kind) ? bib.kind : 'paper',
      reliability: RELIABILITY.includes(args.reliability)
        ? args.reliability
        : bib && RELIABILITY.includes(bib.reliability)
          ? bib.reliability
          : 'secondary',
      authors,
      journal: asString(args.journal) || asString(bib && bib.journal),
      doi: doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, ''),
      bibtexKey: asString(args.bibtexKey) || asString(bib && bib.bibtexKey),
      locator: asString(args.locator),
      notes: asString(args.notes) || asString(bib && bib.notes),
      retracted: args.retracted === true,
      contentHash: '',
      contentArtifact: null,
      preview: content ? content.slice(0, 300) : '',
      addedAt: utcnow(),
    }
    if (content) {
      const artifact = this.store.addArtifact(state, Buffer.from(content, 'utf8'), 'source', { label: title })
      source.contentHash = artifact.id
      source.contentArtifact = artifact.id
    }
    state.sources.push(source)
    this.store.emit(state, 'source.added', 'agent', {
      id: source.id,
      title,
      year: source.year,
      kind: source.kind,
      reliability: source.reliability,
      url: source.url,
      doi: source.doi,
      contentHash: source.contentHash,
    })
    this.store.save(state)
    return {
      source: { ...source, preview: truncate(source.preview, 200).text },
      counts: { sources: state.sources.length },
    }
  }

  sourceImportBibtex(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const entries = parseBibtex(asString(args.bibtex))
    if (entries.length === 0) throw codedError('invalid_input', 'no parsable BibTeX entries')
    if (entries.length > LIMITS.maxBibtexEntries) {
      throw codedError('too_many', `at most ${LIMITS.maxBibtexEntries} BibTeX entries per import`)
    }
    const existingDoi = new Set(state.sources.map((item) => String(item.doi || '').toLowerCase()).filter(Boolean))
    const existingTitle = new Set(state.sources.map((item) => String(item.title || '').trim().toLowerCase()).filter(Boolean))
    const imported = []
    const items = []
    const skipped = []
    for (const entry of entries) {
      const fields = sourceFromBibEntry(entry)
      const titleKey = String(fields.title || '').trim().toLowerCase()
      const doiKey = String(fields.doi || '').toLowerCase()
      if (!fields.title) {
        skipped.push({ key: entry.key, reason: 'missing_title' })
        continue
      }
      if ((doiKey && existingDoi.has(doiKey)) || (!doiKey && titleKey && existingTitle.has(titleKey))) {
        skipped.push({ key: entry.key, reason: 'duplicate' })
        continue
      }
      const result = this.sourceAdd(id, {
        ...fields,
        reliability: asString(args.reliability) || fields.reliability || 'secondary',
      })
      imported.push(result.source.id)
      items.push({
        id: result.source.id,
        title: result.source.title,
        kind: result.source.kind,
        reliability: result.source.reliability,
        year: result.source.year,
        doi: result.source.doi,
      })
      if (doiKey) existingDoi.add(doiKey)
      if (titleKey) existingTitle.add(titleKey)
    }
    if (imported.length > 0) {
      const fresh = this.store.get(id)
      this.store.emit(fresh, 'bibtex.imported', 'agent', { imported: imported.length, skipped: skipped.length })
      this.store.save(fresh)
    }
    return { imported, items, skipped, counts: { sources: this.store.get(id).sources.length } }
  }

  sourceBibtex(campaign) {
    const state = this.store.get(this.resolve(campaign))
    return { bibtex: renderBibtex(state.sources), sources: state.sources.length }
  }

  claimAdd(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const statement = asString(args.statement)
    if (statement.length < 8) throw codedError('invalid_input', 'statement must be at least 8 characters')
    const kind = ['claim', 'hypothesis', 'question'].includes(args.kind) ? args.kind : 'claim'
    const claim = {
      id: nextId(state, 'C'),
      kind,
      statement,
      status: 'proposed',
      confidence: args.confidence === undefined ? null : asNumber(args.confidence, 0),
      falsifier: asString(args.falsifier),
      killCriterion: asString(args.killCriterion),
      predicted: asString(args.predicted),
      metricName: asString(args.metricName),
      metricUnit: asString(args.metricUnit),
      parent: asString(args.parent),
      createdAt: utcnow(),
      updatedAt: utcnow(),
    }
    state.claims.push(claim)
    this.store.emit(state, 'claim.added', 'agent', { id: claim.id, kind, statement })
    this.store.save(state)
    const missing = []
    if (kind === 'hypothesis') {
      for (const key of ['falsifier', 'killCriterion', 'predicted', 'metricName', 'metricUnit']) {
        if (!claim[key]) missing.push(key)
      }
    }
    return { claim, missing, counts: { claims: state.claims.length } }
  }

  claimStatus(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const claimId = asString(args.claim) || asString(args.id)
    const claim = state.claims.find((item) => item.id === claimId)
    if (!claim) throw codedError('not_found', `claim not found: ${claimId}`)
    const status = asString(args.status)
    if (!CLAIM_STATUSES.includes(status)) throw codedError('invalid_input', `status must be one of ${CLAIM_STATUSES.join(', ')}`)
    claim.status = status
    claim.updatedAt = utcnow()
    if (asString(args.reason)) claim.reason = asString(args.reason)
    this.store.emit(state, 'claim.status', 'agent', { id: claim.id, status, reason: asString(args.reason) })
    this.store.save(state)
    return { claim }
  }

  evidenceAdd(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const claimId = asString(args.claim)
    const claim = state.claims.find((item) => item.id === claimId)
    if (!claim) throw codedError('not_found', `claim not found: ${claimId}`)
    const relation = RELATIONS.includes(args.relation) ? args.relation : 'supports'
    const ref = asString(args.ref)
    if (!ref) throw codedError('invalid_input', 'ref is required (S-0001, R-xxxxxxxxxx or sha256:…)')
    const valid = /^S-\d{4}$/u.test(ref)
      ? state.sources.some((item) => item.id === ref)
      : /^R-[0-9a-f]{10}$/u.test(ref)
        ? state.runs.some((item) => item.id === ref)
        : /^sha256:[0-9a-f]{64}$/u.test(ref)
          ? state.artifacts.some((item) => item.id === ref)
          : false
    if (!valid) throw codedError('not_found', `evidence ref does not resolve in this campaign: ${ref}`)
    const evidence = {
      id: nextId(state, 'E'),
      claim: claimId,
      relation,
      ref,
      locator: asString(args.locator),
      quote: asString(args.quote),
      addedAt: utcnow(),
    }
    state.evidence.push(evidence)
    this.store.emit(state, 'evidence.added', 'agent', evidence)
    this.store.save(state)
    return { evidence, counts: { evidence: state.evidence.length } }
  }

  runRecord(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const status = ['success', 'failed', 'skipped'].includes(args.status) ? args.status : 'success'
    const command = asString(args.command)
    if (status !== 'skipped' && !command) throw codedError('invalid_input', 'command is required for a real run')
    let metrics = {}
    if (args.metrics && typeof args.metrics === 'object' && !Array.isArray(args.metrics)) metrics = args.metrics
    else if (typeof args.metrics === 'string' && args.metrics.trim()) {
      try {
        metrics = JSON.parse(args.metrics)
      } catch {
        throw codedError('invalid_input', 'metrics must be a JSON object or JSON string')
      }
    }
    let runId = `R-${randomHex(5)}`
    while (state.runs.some((item) => item.id === runId)) runId = `R-${randomHex(5)}`
    const run = {
      id: runId,
      stage: STAGE_ORDER.includes(args.stage) ? args.stage : state.stage,
      command,
      status,
      exitCode: Number.isFinite(Number(args.exitCode)) ? Number(args.exitCode) : status === 'success' ? 0 : 1,
      seed: args.seed === undefined || args.seed === '' ? null : asInt(args.seed, 0),
      control: asString(args.control) || null,
      metrics,
      stdoutArtifact: null,
      note: asString(args.note),
      ts: utcnow(),
    }
    const stdoutPath = asString(args.stdoutPath)
    if (stdoutPath) {
      if (!existsSync(stdoutPath)) throw codedError('not_found', `stdout file not found: ${stdoutPath}`)
      run.stdoutArtifact = this.store.addArtifact(state, stdoutPath, 'stdout', { label: runId }).id
    }
    state.runs.push(run)
    this.store.emit(state, 'run.recorded', 'agent', {
      id: run.id,
      stage: run.stage,
      status: run.status,
      seed: run.seed,
      control: run.control,
      metrics: run.metrics,
    })
    this.store.save(state)
    return { run, counts: { runs: state.runs.length }, next: 'Register numbers from this run with rsx_number trace:"run:' + run.id + '#metric".' }
  }

  numberAdd(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const name = asString(args.name)
    if (!name) throw codedError('invalid_input', 'number name is required')
    const value = asNumber(args.value, NaN)
    if (!Number.isFinite(value)) throw codedError('invalid_input', 'value must be numeric')
    const trace = asString(args.trace)
    const resolved = resolveTrace(state, trace)
    if (!resolved.ok) throw codedError('trace_unresolved', resolved.reason, { trace })
    const number = {
      id: nextId(state, 'N'),
      name,
      value,
      unit: asString(args.unit),
      uncertainty: asString(args.uncertainty) || (args.uncertainty !== undefined && args.uncertainty !== null ? String(args.uncertainty) : ''),
      trace,
      note: asString(args.note),
      addedAt: utcnow(),
    }
    if (!numberMatchesTrace(number, resolved)) {
      throw codedError('trace_mismatch', `value ${value} does not match ${trace} (${resolved.value})`)
    }
    state.numbers.push(number)
    this.store.emit(state, 'number.added', 'agent', number)
    this.store.save(state)
    return {
      number,
      markdown: `{{${number.id}}}`,
      counts: { numbers: state.numbers.length },
    }
  }

  artifactAdd(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const role = ARTIFACT_ROLES.includes(args.role) ? args.role : 'file'
    const label = asString(args.label) || asString(args.title) || role
    const description = asString(args.description)
    const mime = asString(args.mime)
    const knownIds = new Set((state.artifacts || []).map((item) => item.id))
    let artifact
    if (asString(args.path)) {
      const path = asString(args.path)
      if (!existsSync(path)) throw codedError('not_found', `artifact file not found: ${path}`)
      const info = statSync(path)
      if (info.size > LIMITS.maxArtifactBytes) throw codedError('too_large', 'artifact exceeds 64 MB')
      artifact = this.store.addArtifact(state, path, role, { label, description, mime })
    } else if (typeof args.content === 'string' && args.content.length > 0) {
      const bytes = Buffer.from(args.content, 'utf8')
      if (bytes.length > LIMITS.maxArtifactBytes) throw codedError('too_large', 'artifact exceeds 64 MB')
      artifact = this.store.addArtifact(state, bytes, role, { label, description, mime })
    } else {
      throw codedError('invalid_input', 'artifact needs path or non-empty content')
    }
    const existing = state.artifacts.find((item) => item.id === artifact.id)
    const duplicate = knownIds.has(artifact.id)
    if (duplicate && existing) {
      existing.label = label || existing.label
      existing.description = description || existing.description
      existing.mime = mime || existing.mime
      this.store.emit(state, 'artifact.annotated', 'agent', { id: existing.id, role: existing.role, label: existing.label })
      this.store.save(state)
      return { artifact: existing, duplicate: true, counts: { artifacts: state.artifacts.length } }
    }
    this.store.emit(state, 'artifact.added', 'agent', { id: artifact.id, role, bytes: artifact.bytes, label })
    this.store.save(state)
    return { artifact: existing || artifact, duplicate: false, counts: { artifacts: state.artifacts.length } }
  }

  artifactList(campaign, args = {}) {
    const state = this.store.get(this.resolve(campaign))
    const role = asString(args.role)
    const items = (state.artifacts || []).filter((item) => !role || item.role === role)
    return {
      artifacts: items,
      counts: {
        artifacts: (state.artifacts || []).length,
        bytes: (state.artifacts || []).reduce((acc, item) => acc + (Number(item.bytes) || 0), 0),
      },
    }
  }

  artifactGet(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const wanted = asString(args.artifact) || asString(args.id)
    const found = (state.artifacts || []).find((item) => item.id === wanted || item.id === `sha256:${wanted}`)
    if (!found) throw codedError('not_found', `artifact not found: ${wanted}`)
    let preview = ''
    try {
      preview = String(this.store.artifactText(id, found.id) || '').slice(0, 500)
    } catch {
      preview = ''
    }
    return { artifact: found, preview }
  }

  figureAttach(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const resolve = (value, role, fallbackLabel) => {
      const ref = asString(value)
      if (!ref) return null
      const direct = (state.artifacts || []).find((item) => item.id === ref || item.id === `sha256:${ref}`)
      if (direct) return direct.id
      if (/^[0-9a-f]{64}$/u.test(ref) || /^sha256:[0-9a-f]{64}$/u.test(ref)) {
        throw codedError('not_found', `artifact is not registered: ${ref}`)
      }
      if (existsSync(ref)) {
        return this.store.addArtifact(state, ref, role, { label: fallbackLabel || role }).id
      }
      throw codedError('not_found', `figure ${role} not found: ${ref}`)
    }
    const artifact = resolve(args.artifact || args.path, 'figure', asString(args.title) || 'figure')
    if (!artifact) throw codedError('invalid_input', 'artifact (sha256:…) or path is required')
    const codeArtifact = resolve(args.codeArtifact || args.codePath, 'code', `${asString(args.title) || 'figure'} code`)
    const dataArtifact = resolve(args.dataArtifact || args.dataPath, 'dataset', `${asString(args.title) || 'figure'} data`)
    const envArtifact = resolve(args.envArtifact || args.envPath, 'environment', `${asString(args.title) || 'figure'} environment`)
    const run = asString(args.run)
    if (run && !(state.runs || []).some((item) => item.id === run)) {
      throw codedError('not_found', `run not found: ${run}`)
    }
    const source = asString(args.source)
    if (source && !(state.sources || []).some((item) => item.id === source)) {
      throw codedError('not_found', `source not found: ${source}`)
    }
    const figure = {
      id: nextId(state, 'F'),
      title: asString(args.title) || '未命名图',
      artifact,
      codeArtifact,
      dataArtifact,
      envArtifact,
      caption: asString(args.caption),
      description: asString(args.description),
      env: asString(args.env),
      run: run || null,
      source: source || null,
      createdBy: asString(args.createdBy) || 'agent',
      ts: utcnow(),
    }
    state.figures.push(figure)
    this.store.emit(state, 'figure.attached', 'agent', figure)
    this.store.save(state)
    return {
      figure,
      provenanceOk: Boolean(figure.artifact && figure.codeArtifact && figure.dataArtifact),
      complete: Boolean(figure.artifact && figure.codeArtifact && figure.dataArtifact && (figure.env || figure.envArtifact) && figure.description),
      next: 'A release-quality figure needs figure + code + data; add env / description for full provenance.',
    }
  }

  figureList(campaign) {
    const state = this.store.get(this.resolve(campaign))
    return { figures: state.figures || [], counts: { figures: (state.figures || []).length } }
  }

  extractionAdd(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    if (!Array.isArray(state.extractions)) state.extractions = []
    if (state.extractions.length >= LIMITS.maxExtractions) {
      throw codedError('too_many', `at most ${LIMITS.maxExtractions} extraction rows`)
    }
    const sourceId = asString(args.source) || asString(args.ref)
    if (!state.sources.some((item) => item.id === sourceId)) {
      throw codedError('not_found', `source not found: ${sourceId}`)
    }
    const dimension = asString(args.dimension) || asString(args.field)
    const value =
      typeof args.value === 'string'
        ? args.value.trim()
        : args.value === undefined || args.value === null
          ? ''
          : String(args.value).trim()
    if (!dimension) throw codedError('invalid_input', 'dimension is required')
    if (!value) throw codedError('invalid_input', 'value is required')
    const row = {
      id: nextId(state, 'X'),
      source: sourceId,
      dimension,
      value,
      quote: asString(args.quote),
      locator: asString(args.locator),
      confidence: args.confidence === undefined ? null : asNumber(args.confidence, 0),
      notes: asString(args.notes),
      addedAt: utcnow(),
    }
    state.extractions.push(row)
    this.store.emit(state, 'extraction.added', 'agent', row)
    this.store.save(state)
    return { extraction: row, counts: { extractions: state.extractions.length }, matrix: buildMatrix(state) }
  }

  extractionList(campaign, args = {}) {
    const state = this.store.get(this.resolve(campaign))
    const source = asString(args.source)
    const dimension = asString(args.dimension)
    const extractions = (state.extractions || []).filter(
      (row) => (!source || row.source === source) && (!dimension || row.dimension === dimension),
    )
    return { extractions, counts: { extractions: extractions.length } }
  }

  matrix(campaign) {
    const state = this.store.get(this.resolve(campaign))
    const matrix = buildMatrix(state)
    return { matrix, markdown: renderMatrixMarkdown(matrix), csv: renderMatrixCsv(matrix) }
  }

  audit(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const integrity = this.store.verify(id)
    const result = runAudit(state, {
      integrity,
      readArtifact: (artifactId) => this.store.artifactText(id, artifactId),
    })
    if (args.record === false) {
      return { audit: { ...result, id: null, recorded: false }, matrix: buildMatrix(state) }
    }
    if (!Array.isArray(state.audits)) state.audits = []
    const audit = this.store.signAudit({
      id: nextId(state, 'A'),
      ok: result.ok,
      verdict: result.verdict,
      findings: result.findings,
      counts: result.counts,
      blocking: result.blocking,
      subjectHash: result.subjectHash,
      stateHash: result.stateHash || integrity.stateHash || null,
      ts: result.ts,
    })
    state.audits.push(audit)
    this.store.emit(state, 'audit.recorded', 'agent', {
      id: audit.id,
      ok: audit.ok,
      verdict: audit.verdict,
      counts: audit.counts,
      subjectHash: audit.subjectHash,
      stateHash: audit.stateHash,
      keyId: audit.keyId,
      signature: audit.signature,
    })
    this.store.save(state)
    return { audit, signature: this.store.verifyAudit(audit), matrix: buildMatrix(state), stale: false }
  }

  auditList(campaign) {
    const state = this.store.get(this.resolve(campaign))
    return {
      audits: (state.audits || []).map((item) => ({
        id: item.id,
        ok: item.ok,
        verdict: item.verdict,
        counts: item.counts,
        ts: item.ts,
        subjectHash: item.subjectHash,
        keyId: item.keyId || null,
        signature: item.signature ? this.store.verifyAudit(item) : { ok: false, reason: 'unsigned', keyId: null },
        fresh: item.subjectHash === auditSubjectHash(state),
      })),
    }
  }

  auditView(campaign) {
    const state = this.store.get(this.resolve(campaign))
    const latest = (state.audits || [])[(state.audits || []).length - 1] || null
    return {
      audit: latest,
      fresh: latest ? latest.subjectHash === auditSubjectHash(state) : false,
      signature: latest ? this.store.verifyAudit(latest) : null,
      markdown: renderAuditMarkdown(latest),
      matrix: buildMatrix(state),
      audits: (state.audits || []).length,
    }
  }

  provenance(campaign) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const integrity = this.store.verify(id)
    return {
      provenance: buildProvenance(state, { integrity, version: VERSION }),
      roCrate: buildRoCrate(state, { integrity, version: VERSION }),
    }
  }

  manuscript(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    let text = typeof args.text === 'string' ? args.text : ''
    if (!text && asString(args.path)) {
      const path = asString(args.path)
      if (!existsSync(path)) throw codedError('not_found', `manuscript file not found: ${path}`)
      if (statSync(path).size > LIMITS.maxManuscriptBytes) throw codedError('too_large', 'manuscript exceeds 2 MB')
      text = readFileSync(path, 'utf8')
    }
    if (!text.trim()) throw codedError('invalid_input', 'text or path is required')
    const artifact = this.store.addArtifact(state, Buffer.from(text, 'utf8'), 'manuscript', { label: 'manuscript' })
    state.manuscript = {
      text,
      chars: text.length,
      artifact: artifact.id,
      title: asString(args.title) || state.title,
      updatedAt: utcnow(),
    }
    this.store.emit(state, 'manuscript.set', 'agent', { chars: text.length, artifact: artifact.id })
    this.store.save(state)
    return {
      manuscript: { chars: text.length, artifact: artifact.id },
      gate: this.gateResult(state, 'write', this.store.verify(id)),
    }
  }

  gate(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const action = asString(args.action, 'check')

    if (action === 'history') {
      return { gates: state.gates, current: state.stage }
    }

    if (action === 'review') {
      const review = {
        id: nextId(state, 'V'),
        reviewer: asString(args.reviewer) || 'anonymous reviewer',
        adversarial: args.adversarial === true,
        verdict: ['accept', 'minor', 'major', 'reject'].includes(args.verdict) ? args.verdict : 'minor',
        issues: Array.isArray(args.issues)
          ? args.issues.map((issue) => ({
              severity: ['blocking', 'major', 'minor'].includes(issue?.severity) ? issue.severity : 'minor',
              title: asString(issue?.title) || asString(issue?.detail) || 'issue',
              detail: asString(issue?.detail),
              resolved: issue?.resolved === true,
            }))
          : [],
        notes: asString(args.notes),
        ts: utcnow(),
      }
      state.reviews.push(review)
      this.store.emit(state, 'review.added', 'agent', review)
      this.store.save(state)
      return { review, gate: this.gateResult(state, 'review', this.store.verify(id)) }
    }

    if (action === 'back') {
      const target = asString(args.stage) || asString(args.to)
      if (!STAGE_ORDER.includes(target)) throw codedError('invalid_input', `unknown stage: ${target}`)
      const fromIndex = STAGE_ORDER.indexOf(state.stage)
      const toIndex = STAGE_ORDER.indexOf(target)
      if (toIndex >= fromIndex) throw codedError('invalid_input', `can only go back: current ${state.stage}, target ${target}`)
      const from = state.stage
      state.stage = target
      this.store.emit(state, 'stage.back', 'agent', { from, to: target, reason: asString(args.reason) })
      this.store.save(state)
      return { stage: state.stage, from, reason: asString(args.reason) }
    }

    if (action === 'advance') {
      const stage = state.stage
      const integrity = this.store.verify(id)
      const result = this.gateResult(state, stage, integrity)
      this.recordGate(state, result)
      if (!result.ok) {
        this.store.save(state)
        throw codedError('gate_blocked', `stage ${stage} is blocked: ${result.blocking.join(', ')}`, result)
      }
      if (stage === 'release') {
        state.releasedAt = utcnow()
        this.store.emit(state, 'campaign.released', 'agent', { campaign: id })
        this.store.save(state)
        return { released: true, stage, gate: result }
      }
      const next = STAGE_ORDER[STAGE_ORDER.indexOf(stage) + 1]
      state.stage = next
      this.store.emit(state, 'stage.advanced', 'agent', { from: stage, to: next })
      this.store.save(state)
      return { stage: state.stage, previous: stage, gate: result }
    }

    const stage = STAGE_ORDER.includes(args.stage) ? args.stage : state.stage
    const integrity = this.store.verify(id)
    const result = this.gateResult(state, stage, integrity)
    this.recordGate(state, result)
    this.store.emit(state, 'gate.checked', 'agent', {
      stage,
      ok: result.ok,
      passed: result.passed,
      total: result.total,
      blocking: result.blocking,
    })
    this.store.save(state)
    return { gate: result, current: state.stage }
  }

  recordGate(state, result) {
    state.gates.push({
      stage: result.stage,
      ok: result.ok,
      passed: result.passed,
      total: result.total,
      blocking: result.blocking,
      checks: result.checks,
      ts: result.ts,
    })
  }

  templateApply(args = {}) {
    const templateId = asString(args.template) || asString(args.id)
    const template = getTemplate(templateId)
    if (!template) throw codedError('not_found', `unknown template: ${templateId || '(missing)'}`)
    const vars = {
      topic: asString(args.topic),
      data: asString(args.data),
      paper: asString(args.paper),
      company: asString(args.company),
      name: asString(args.name),
      libs: asString(args.libs),
      strategy: asString(args.strategy),
      claim: asString(args.claim),
      target: asString(args.target),
      lang: args.lang,
    }
    const built = applyTemplate(template, vars)
    const subject = vars.topic || vars.paper || vars.company || vars.name || vars.libs || vars.strategy || vars.claim || vars.target || ''
    const title = subject ? `${built.title}：${subject}` : built.title
    const state = this.store.create({
      title,
      question: built.question,
      scope: built.scope,
      success: built.success,
      tier: built.tier,
      templateId: template.id,
    })
    state.template = {
      id: template.id,
      kind: template.kind,
      deliverables: built.deliverables,
      stages: built.stages,
      gateHints: built.gateHints,
    }
    this.store.emit(state, 'template.applied', 'agent', { templateId: template.id, subject })
    this.store.save(state)
    return {
      campaign: this.store.summaryOf(state),
      prompt: built.prompt,
      deliverables: built.deliverables,
      gateHints: built.gateHints,
      next: 'Paste the prompt into the conversation, then start with rsx_campaign action:"world" and the scoping gate.',
    }
  }

  integrity(campaign) {
    return { integrity: this.store.verify(this.resolve(campaign)) }
  }

  render(campaign) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const integrity = this.store.verify(id)
    const events = this.store.events(state)
    const markdown = renderReport(state, {
      integrity,
      events,
      verifyAudit: (audit) => this.store.verifyAudit(audit),
    })
    const declaration = state.declaration ? renderDeclaration(state) : ''
    const latestAudit = (state.audits || [])[(state.audits || []).length - 1] || null
    return { state, integrity, events, markdown, declaration, audit: latestAudit, matrix: buildMatrix(state) }
  }

  report(campaign) {
    const { markdown, integrity, audit, matrix } = this.render(campaign)
    return { markdown, integrity, audit, matrix }
  }

  write(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const action = asString(args.action, 'render')

    if (action === 'manuscript') {
      return this.manuscript(id, args)
    }

    if (action === 'declaration') {
      const declaration = {
        ai: args.ai === false ? false : true,
        watermark: args.watermark === false ? false : true,
        model: asString(args.model) || 'DeepSeek Harness · dsh-research-suite',
        humanReviewer: asString(args.humanReviewer),
        date: asString(args.date) || utcnow().slice(0, 10),
        notes: asString(args.notes),
      }
      state.declaration = declaration
      this.store.emit(state, 'declaration.set', 'agent', declaration)
      this.store.save(state)
      return { declaration, gate: this.gateResult(state, 'release', this.store.verify(id)) }
    }

    if (action === 'render' || action === 'export') {
      this.store.emit(state, 'report.rendered', 'agent', { action })
      this.store.save(state)
    }
    const integrity = this.store.verify(id)
    const events = this.store.events(state)
    const markdown = renderReport(state, {
      integrity,
      events,
      verifyAudit: (audit) => this.store.verifyAudit(audit),
    })
    const declaration = renderDeclaration(state)
    const latestAudit = (state.audits || [])[(state.audits || []).length - 1] || null
    const matrix = buildMatrix(state)
    const matrixMarkdown = renderMatrixMarkdown(matrix)
    const matrixCsv = renderMatrixCsv(matrix)
    const auditMarkdown = renderAuditMarkdown(latestAudit)
    const bibtex = renderBibtex(state.sources)
    const provenance = buildProvenance(state, { integrity, version: VERSION })
    const roCrate = buildRoCrate(state, { integrity, version: VERSION })
    const dir = ensureDir(this.store.exportsDir(id))
    const reportPath = join(dir, 'REPORT.md')
    writeFileSync(reportPath, markdown, 'utf8')
    const declarationPath = join(dir, 'declaration.md')
    writeFileSync(declarationPath, declaration, 'utf8')
    const campaignPath = join(dir, 'campaign.json')
    writeFileSync(campaignPath, JSON.stringify(state, null, 2), 'utf8')
    const ledgerPath = join(dir, 'ledger.jsonl')
    copyFileSync(this.store.eventsFile(id), ledgerPath)
    const bibtexPath = join(dir, 'references.bib')
    writeFileSync(bibtexPath, bibtex, 'utf8')
    const matrixPath = join(dir, 'MATRIX.md')
    writeFileSync(matrixPath, matrixMarkdown, 'utf8')
    const matrixCsvPath = join(dir, 'matrix.csv')
    writeFileSync(matrixCsvPath, matrixCsv, 'utf8')
    const auditPath = join(dir, 'AUDIT.md')
    writeFileSync(auditPath, auditMarkdown, 'utf8')
    const provenancePath = join(dir, 'provenance.json')
    writeFileSync(provenancePath, JSON.stringify(provenance, null, 2), 'utf8')
    const roCratePath = join(dir, 'ro-crate-metadata.json')
    writeFileSync(roCratePath, JSON.stringify(roCrate, null, 2), 'utf8')

    const paths = {
      dir,
      report: reportPath,
      declaration: declarationPath,
      campaign: campaignPath,
      ledger: ledgerPath,
      bibtex: bibtexPath,
      matrix: matrixPath,
      matrixCsv: matrixCsvPath,
      audit: auditPath,
      provenance: provenancePath,
      roCrate: roCratePath,
    }
    if (action !== 'export') return { paths, chars: markdown.length, gate: this.gateResult(state, 'write', integrity) }

    const artifactDir = ensureDir(join(dir, 'artifacts'))
    const entries = [
      { name: 'REPORT.md', data: markdown },
      { name: 'declaration.md', data: declaration },
      { name: 'campaign.json', data: JSON.stringify(state, null, 2) },
      { name: 'ledger.jsonl', data: readFileSync(ledgerPath) },
      { name: 'references.bib', data: bibtex },
      { name: 'MATRIX.md', data: matrixMarkdown },
      { name: 'matrix.csv', data: matrixCsv },
      { name: 'AUDIT.md', data: auditMarkdown },
      { name: 'provenance.json', data: JSON.stringify(provenance, null, 2) },
      { name: 'ro-crate-metadata.json', data: JSON.stringify(roCrate, null, 2) },
    ]
    const skipped = []
    for (const item of state.artifacts || []) {
      if (item.bytes > 2 * 1024 * 1024) {
        skipped.push(item.id)
        continue
      }
      const source = this.store.artifactPath(id, item.id)
      if (!existsSync(source)) continue
      copyFileSync(source, join(artifactDir, item.id.replace(/^sha256:/u, '')))
      entries.push({ name: `artifacts/${item.id.replace(/^sha256:/u, '')}`, data: readFileSync(source) })
    }
    const zipPath = join(dir, 'BUNDLE.zip')
    const zip = writeZip(zipPath, entries)
    return { paths: { ...paths, bundle: zipPath }, zip, skippedArtifacts: skipped, chars: markdown.length }
  }

  diagnostics() {
    return {
      dataDir: this.store.dir,
      campaigns: this.campaigns().length,
      current: this.store.current(),
      settings: this.store.settings(),
      version: VERSION,
    }
  }

  saveSettings(patch = {}) {
    const allowed = {}
    if (patch.defaultTier && TIERS[patch.defaultTier]) allowed.defaultTier = patch.defaultTier
    if (patch.language === 'zh' || patch.language === 'en') allowed.language = patch.language
    if (typeof patch.allowExec === 'boolean') allowed.allowExec = patch.allowExec
    this.store.saveSettings(allowed)
    return this.store.settings()
  }

  /** Exported for tests and the panel. */
  templates(kind) {
    return listTemplates({ kind })
  }

  /** Rebuild a campaign state from its event log (recovery / integrity demo). */
  replay(campaign) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const events = this.store.events(state)
    return { events: events.length, lastHash: state.lastHash, seq: state.seq }
  }
}
