/**
 * Research service: the single source of truth shared by the agent tools and
 * the panel routes. Every mutation emits a hash-chained event and persists the
 * materialised state.
 */
import { copyFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  APPROVAL_ROLES,
  ARTIFACT_ROLES,
  CERTAINTY,
  CLAIM_STATUSES,
  CONTRIBUTION_ACTORS,
  LIMITS,
  LINEAGE_RELATIONS,
  RELATIONS,
  RELIABILITY,
  RISK_OF_BIAS,
  SCHEMA_VERSION,
  SOURCE_INDEPENDENCE,
  SOURCE_KINDS,
  STAGE_ORDER,
  TIERS,
  VERSION,
  WAIVER_PROTECTED,
} from './config.js'
import { budgetSummary, chargeBudget, initBudget } from './budget.js'
import { checkGate, numberMatchesTrace, resolveTrace } from './gates.js'
import { checkLoop, loopPauses, nextLoopPauseId, normalizeLoopState, openLoopPause } from './loop-control.js'
import { planNext } from './planner.js'
import { applyTemplate, getTemplate, listTemplates } from './templates.js'
import { renderDeclaration, renderReport } from './report.js'
import { renderAuditMarkdown, runAudit } from './audit.js'
import { auditSubjectHash } from './subject.js'
import {
  activeWaivers,
  approvalFresh,
  preregCore,
  preregHash,
  waiverActive,
  waiverProblems,
} from './rigor.js'
import { buildReviewPacket, checkEntailment } from './review.js'
import { buildReproPackage } from './repro.js'
import { renderSearchMarkdown, searchEntries, searchEntryFrom } from './search.js'
import { sensitivityFrom, sensitivityMarkdown } from './sensitivity.js'
import {
  applyPlan,
  autonomyFrom,
  contradictionFrom,
  cycleFrom,
  matchFrom,
  perspectiveFrom,
  programComplete,
  programSummary,
  qualityFrom,
  rankClaims,
  renderProgramMarkdown,
} from './program.js'
import { compactEvaluation, compactEvaluationHistory, evaluateLoop, renderLoopMarkdown } from './loop.js'
import { buildMatrix, renderMatrixCsv, renderMatrixMarkdown } from './matrix.js'
import { buildProvenance, buildRoCrate } from './provenance.js'
import { parseBibtex, renderBibtex, sourceFromBibEntry } from './bibtex.js'
import {
  MAX_REFERENCE_ENTRIES,
  normalizeReferenceFormat,
  parseReferences,
  renderCslJson,
  renderReferencesMarkdown,
  renderRis,
} from './references.js'
import { normalizeDoi } from './retrieval.js'
import {
  STEWARDSHIP_KEYS,
  mergeStewardship,
  normalizeStewardship,
  renderStewardshipMarkdown,
  stewardshipCompleteness,
  stewardshipSummary,
} from './stewardship.js'
import {
  STAGE_FIELDS,
  applyScreeningDecision,
  assertScreeningCapacity,
  buildPrisma,
  clearDownstreamDecisions,
  normalizeScreening,
  publicCandidate,
  renderPrismaCsv,
  renderPrismaMarkdown,
} from './screening.js'
import {
  MONITORING_STATUSES,
  evaluateMonitoring,
  normalizeMonitoring,
  withMetrics,
  withObservations,
} from './monitor.js'
import {
  DOMAIN_IDS,
  GENERAL_DOMAIN,
  domainChecks,
  domainCompleteness,
  domainDetail,
  domainSummary,
  getDomain,
  listDomains,
  renderDomainMarkdown,
  validateDomainValues,
} from './domains.js'
import { asInt, asNumber, asString, ensureDir, randomHex, sha256Hex, truncate, utcnow } from './util.js'
import { writeZip } from './zip.js'

function codedError(code, message, detail) {
  const error = new Error(message)
  error.code = code
  if (detail !== undefined) error.detail = detail
  return error
}

function renderContributionMarkdown(state) {
  const declaration = state.declaration || {}
  const rows = Array.isArray(declaration.contributions) ? declaration.contributions : []
  const lines = [
    '# AI / 人类贡献矩阵',
    '',
    `- 活动：${state.title}（${state.id}）`,
    `- 声明模型：${declaration.model || '—'}`,
    `- 人工复核人：${declaration.humanReviewer || '—'}`,
    '',
    '| 角色 | 名称 | 负责范围 |',
    '| --- | --- | --- |',
  ]
  if (rows.length === 0) lines.push('| — | — | 未登记 |')
  for (const row of rows) {
    lines.push(`| ${row.actor} | ${String(row.name || '').replace(/\|/gu, '\\|')} | ${String(row.scope || row.role || '').replace(/\|/gu, '\\|')} |`)
  }
  lines.push('', '> 该矩阵记录分工，不构成责任转移：人类批准者对发布结论负责。')
  return lines.join('\n')
}

function normalizeLineage(args = {}) {
  const raw = args.lineage && typeof args.lineage === 'object' ? args.lineage : null
  const derivedFrom = asString(raw ? raw.derivedFrom : args.derivedFrom)
  if (!derivedFrom) return null
  const relation = asString(raw ? raw.relation : args.relation)
  return {
    derivedFrom,
    relation: LINEAGE_RELATIONS.includes(relation) ? relation : 'other',
    note: asString(raw ? raw.note : args.lineageNote),
  }
}

function nextId(state, prefix) {
  const lists = {
    S: state.sources,
    C: state.claims,
    E: state.evidence,
    N: state.numbers,
    F: state.figures,
    Q: state.searchLog,
    R: state.screening && Array.isArray(state.screening.candidates) ? state.screening.candidates : [],
    Z: state.sensitivity,
    G: state.plan && Array.isArray(state.plan.questions) ? state.plan.questions : [],
    O: state.perspectives,
    T: state.tournament && Array.isArray(state.tournament.matches) ? state.tournament.matches : [],
    Y: state.quality && Array.isArray(state.quality.rows) ? state.quality.rows : [],
    D: state.contradictions,
    K: state.cycles,
    V: state.reviews,
    X: state.extractions,
    A: state.audits,
    L: state.loopEvaluations,
    W: state.waivers,
    P: state.approvals,
  }
  const list = lists[prefix] || []
  const max = list.reduce((acc, item) => {
    const num = Number(String(item.id).slice(2))
    return Number.isFinite(num) ? Math.max(acc, num) : acc
  }, 0)
  return `${prefix}-${String(max + 1).padStart(4, '0')}`
}

function loopPayload(state, check, extras = {}) {
  const loop = normalizeLoopState(state)
  return {
    campaign: state.id,
    status: extras.status || check.status,
    reason: extras.reason ?? check.reason,
    code: extras.code ?? check.code,
    stage: check.stage,
    iteration: check.iteration,
    maxCycles: check.maxCycles,
    plan: check.plan,
    primary: check.primary,
    checks: check.checks,
    stop: check.stop,
    integrity: extras.integrity || null,
    loop: {
      status: loop.status,
      pauseId: loop.pauseId,
      pausedAt: loop.pausedAt,
      lastCheckAt: loop.lastCheckAt,
      lastStatus: loop.lastStatus,
      resumed: extras.resumed === true,
      resumeRejected: extras.resumeRejected === true,
      stale: extras.stale === true,
    },
    resumeRejected: extras.resumeRejected === true,
    pause: extras.pause || null,
  }
}

function publicState(state) {
  const { events, ...rest } = state
  const profile = getDomain(state.domain)
  return {
    ...rest,
    domainTitle: profile ? profile.title.zh : null,
    stewardship: stewardshipSummary(state.stewardship),
    schemaVersion: Number(state.schema) || 1,
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

  archivedCampaigns() {
    return this.store.listCampaigns({ includeArchived: true }).filter((row) => row.archived === true)
  }

  state() {
    const archived = this.archivedCampaigns()
    return {
      version: 1,
      apiVersion: 1,
      plugin: 'dsh-research-suite',
      pluginVersion: VERSION,
      schemaVersion: SCHEMA_VERSION,
      current: this.store.current(),
      campaigns: this.campaigns(),
      archivedCampaigns: archived,
      archivedCount: archived.length,
      dataDir: this.store.dir,
      settings: this.store.settings(),
      defaults: { tier: this.config.defaultTier, language: this.config.language },
    }
  }

  /**
   * Read-only portfolio view: one row per campaign with the latest evaluation,
   * audit freshness and monitoring alerts. This is what makes a suite of
   * campaigns reviewable without opening each one.
   */
  portfolio() {
    const rows = this.campaigns().map((summary) => {
      try {
        const state = this.store.get(summary.id)
        const integrity = this.store.verify(summary.id)
        const evaluation = state.loopEvaluation || null
        const audit = (state.audits || [])[(state.audits || []).length - 1] || null
        const monitoring = state.monitoring || {}
        const schema = Number(state.schema) || 1
        const releaseGate = (state.gates || []).filter((gate) => gate && gate.stage === 'release').slice(-1)[0] || null
        const attention = []
        if (audit && audit.subjectHash !== auditSubjectHash(state)) attention.push('stale_audit')
        if (audit && ((audit.counts || {}).blocking || 0) > 0) attention.push('audit_blocking')
        if ((Number(monitoring.alerts) || 0) > 0) attention.push('monitoring_alert')
        if (integrity.chainOk !== true || integrity.stateOk === false) attention.push('integrity')
        if (schema < SCHEMA_VERSION) attention.push('schema')
        return {
          id: state.id,
          title: state.title,
          stage: state.stage,
          domain: state.domain || null,
          schema,
          releasePassed: Boolean(releaseGate && releaseGate.ok === true),
          attention: attention.length > 0,
          attentionReasons: attention,
          updatedAt: state.updatedAt,
          score: evaluation ? evaluation.score : null,
          level: evaluation ? evaluation.level : null,
          rsiReady: Boolean(evaluation && evaluation.rsi && evaluation.rsi.ready),
          audit: audit
            ? {
                id: audit.id,
                verdict: audit.verdict,
                blocking: (audit.counts || {}).blocking || 0,
                major: (audit.counts || {}).major || 0,
                fresh: audit.subjectHash === auditSubjectHash(state),
              }
            : null,
          alerts: Number(monitoring.alerts) || 0,
          coverageGaps: Array.isArray(monitoring.coverageGaps) ? monitoring.coverageGaps.length : 0,
          integrity: {
            chainOk: integrity.chainOk === true,
            stateOk: integrity.stateOk !== false,
            brokenSeq: integrity.brokenSeq ?? null,
          },
          tokensSpent: Number(state.budget && state.budget.spent ? state.budget.spent.tokens : 0) || 0,
        }
      } catch (error) {
        return { id: summary.id, title: summary.title, error: error.message }
      }
    })
    const totals = {
      campaigns: rows.length,
      released: rows.filter((row) => row.releasePassed === true).length,
      l4: rows.filter((row) => typeof row.level === 'string' && row.level.startsWith('L4')).length,
      withAlerts: rows.filter((row) => row.alerts > 0).length,
      staleAudits: rows.filter((row) => row.audit && !row.audit.fresh).length,
      brokenIntegrity: rows.filter((row) => row.integrity && (!row.integrity.chainOk || !row.integrity.stateOk)).length,
      unmigrated: rows.filter((row) => row.schema < SCHEMA_VERSION).length,
      attention: rows.filter((row) => row.attention === true).length,
      archived: this.archivedCampaigns().length,
    }
    return { campaigns: rows, totals }
  }

  /** Evidence / claim / run graph for one campaign (nodes + typed edges). */
  explorationGraph(campaign) {
    const state = this.store.get(this.resolve(campaign))
    const nodes = []
    const edges = []
    const seen = new Set()
    const node = (id, type, label, extra = {}) => {
      if (seen.has(id)) return
      seen.add(id)
      nodes.push({ id, type, label, ...extra })
    }
    for (const claim of state.claims || []) {
      node(claim.id, 'claim', claim.statement, { status: claim.status, kind: claim.kind })
      if (claim.parent) edges.push({ from: claim.id, to: claim.parent, type: 'derives-from' })
    }
    for (const evidence of state.evidence || []) {
      node(evidence.ref, evidence.ref.startsWith('S-') ? 'source' : evidence.ref.startsWith('R-') ? 'run' : 'artifact', evidence.ref)
      edges.push({ from: evidence.claim, to: evidence.ref, type: evidence.relation })
    }
    for (const source of state.sources || []) {
      node(source.id, 'source', source.title, { reliability: source.reliability, independence: source.independence || 'unknown' })
      if (source.lineage && source.lineage.derivedFrom) {
        edges.push({ from: source.id, to: source.lineage.derivedFrom, type: source.lineage.relation || 'derived' })
      }
    }
    for (const run of state.runs || []) {
      node(run.id, 'run', run.command || run.id, { status: run.status, control: run.control || null })
    }
    for (const number of state.numbers || []) {
      node(number.id, 'number', `${number.name}=${number.value}${number.unit || ''}`)
      const match = /^run:(R-[0-9a-f]{10})/u.exec(String(number.trace || ''))
      const sourceMatch = /^source:(S-\d{4})/u.exec(String(number.trace || ''))
      if (match) edges.push({ from: number.id, to: match[1], type: 'traces-to' })
      else if (sourceMatch) edges.push({ from: number.id, to: sourceMatch[1], type: 'traces-to' })
    }
    for (const figure of state.figures || []) {
      node(figure.id, 'figure', figure.title || figure.id)
      if (figure.run) edges.push({ from: figure.id, to: figure.run, type: 'produced-by' })
      if (figure.dataArtifact) edges.push({ from: figure.id, to: figure.dataArtifact, type: 'data' })
    }
    return {
      campaign: state.id,
      nodes,
      edges,
      counts: { nodes: nodes.length, edges: edges.length, claims: (state.claims || []).length, sources: (state.sources || []).length },
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
    const gate = this.gateResult(state, state.stage, integrity)
    return {
      state: publicState(state),
      integrity,
      gate,
      budget: budgetSummary(state),
      next: planNext(state, { gate, integrity }),
    }
  }

  select(campaign) {
    const id = this.resolve(campaign)
    this.store.setCurrent(id)
    return { campaign: this.store.summaryOf(this.store.get(id)) }
  }

  /**
   * Deterministic next-action plan. It reads the same verified gate the panel
   * uses and never writes: the caller decides whether to run the recommended
   * tool calls. Integrity is verified here so a broken ledger stops the plan
   * instead of producing a confident to-do list on top of it.
   */
  next(campaign) {
    const detail = this.get(campaign)
    return {
      plan: detail.next,
      gate: detail.gate,
      integrity: detail.integrity,
      stage: detail.state.stage,
      campaign: detail.state.id,
    }
  }

  /**
   * Host-loop checkpoint. This is the stateful companion to `next`: it checks
   * integrity, budget, the gate and the autonomy cycle budget before every
   * iteration, and records a pause when the primary action needs input, a human
   * or an unmapped gate recipe. It never executes the recommended tool, never
   * approves a human checkpoint and never guesses a missing gate recipe.
   *
   * Resuming is explicit. If the blocking plan is unchanged, `resume:true` is
   * rejected without writing; after the input is supplied (so the plan and its
   * fingerprint change), the same call appends `loop.resumed` and returns the
   * next outcome. A stop (integrity/budget/prereg/cycle budget) always wins and
   * is never converted into a pause record.
   */
  loop(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const integrity = this.store.verify(id)
    const gate = this.gateResult(state, state.stage, integrity)
    const check = checkLoop(state, { gate, integrity })
    const resume = args.resume === true
    const resumeReason = asString(args.reason).slice(0, 500)
    const open = openLoopPause(state)
    const loopState = normalizeLoopState(state)

    // A blocked plan is not a pause: integrity, budget, pre-registration
    // timing, a terminal cycle and cycle-budget exhaustion all stop here.
    if (check.status === 'stop') {
      return loopPayload(state, check, { status: 'stop', integrity })
    }

    // A recorded pause is a human gate. Do not silently walk past it even if
    // the underlying plan changed: an explicit resume is required.
    if (open && !resume) {
      const stale = check.status !== 'pause' || check.planHash !== open.planHash
      return loopPayload(state, check, {
        status: 'pause',
        reason: stale
          ? `${open.id} is still open; the blocking condition changed or cleared, but the loop needs an explicit resume`
          : open.reason,
        code: open.kind,
        pause: open,
        integrity,
        stale,
      })
    }
    if (!open && loopState.status === 'paused' && !resume) {
      return loopPayload(state, check, {
        status: 'pause',
        reason: 'the loop is marked paused but has no open pause record; call resume:true to clear it explicitly',
        code: 'paused',
        integrity,
        stale: true,
      })
    }

    let resumed = false
    if (resume && open) {
      // Refuse to resume while the same blocking condition is still present.
      // This is the guard against "resume" becoming an implicit approval.
      if (check.status === 'pause') {
        return loopPayload(state, check, {
          status: 'pause',
          reason:
            check.planHash === open.planHash
              ? `resume rejected: ${open.id} is unchanged; supply the missing input or complete the human checkpoint first`
              : `resume rejected: a new blocking condition still requires input before the loop can continue`,
          code: open.kind,
          pause: open,
          integrity,
          resumeRejected: true,
        })
      }
      const at = utcnow()
      open.status = 'resumed'
      open.resumedAt = at
      open.resumeReason = resumeReason || 'human supplied the missing input'
      state.loop = {
        status: 'running',
        pauseId: null,
        pausedAt: null,
        lastCheckAt: at,
        lastStatus: check.status,
      }
      this.store.emit(state, 'loop.resumed', 'agent', {
        pause: open.id,
        kind: open.kind,
        stage: check.stage,
        next: check.status,
        reason: open.resumeReason,
      })
      this.store.save(state)
      resumed = true
    }

    // A legacy "paused" flag without a row is cleared by an explicit resume;
    // there is no historical pause to mark.
    if (resume && !open && loopState.status === 'paused') {
      state.loop = {
        status: 'running',
        pauseId: null,
        pausedAt: null,
        lastCheckAt: utcnow(),
        lastStatus: check.status,
      }
      this.store.emit(state, 'loop.resumed', 'agent', {
        pause: null,
        kind: 'legacy_flag',
        stage: check.stage,
        next: check.status,
        reason: resumeReason || 'cleared a paused flag without an open pause record',
      })
      this.store.save(state)
      resumed = true
    }

    if (check.status === 'pause') {
      const at = utcnow()
      const primary = check.primary || {}
      const row = {
        id: nextLoopPauseId(state),
        at,
        status: 'open',
        kind: check.code,
        reason: String(check.reason || '').slice(0, 500),
        detail: String(primary.why || '').slice(0, 500),
        stage: check.stage,
        iteration: check.iteration,
        cycle: check.checks.cycles.used,
        maxCycles: check.checks.cycles.max,
        tool: String(primary.tool || ''),
        args: primary.args && typeof primary.args === 'object' ? primary.args : {},
        label: String(primary.label || ''),
        needsInput: primary.needsInput === true,
        human: primary.human === true,
        unmapped: primary.unmapped === true,
        planHash: check.planHash,
        blocking: check.checks.gate.blocking,
        gateOk: check.checks.gate.ok,
        integrityOk: check.checks.integrity.ok,
        budgetRatio: check.checks.budget.ratio,
      }
      const pauses = loopPauses(state)
      state.loopPauses = [...pauses, row]
      state.loop = {
        status: 'paused',
        pauseId: row.id,
        pausedAt: at,
        lastCheckAt: at,
        lastStatus: 'pause',
      }
      this.store.emit(state, 'loop.paused', 'agent', {
        id: row.id,
        kind: row.kind,
        stage: row.stage,
        tool: row.tool,
        human: row.human,
        needsInput: row.needsInput,
        unmapped: row.unmapped,
        planHash: row.planHash,
        cycle: row.cycle,
        maxCycles: row.maxCycles,
      })
      this.store.save(state)
      // The pause row was appended after the initial verify; report the
      // post-write tail so the caller sees the event it just caused.
      return loopPayload(state, check, { status: 'pause', pause: row, integrity: this.store.verify(id) })
    }

    return loopPayload(state, check, { status: check.status, integrity: this.store.verify(id), resumed })
  }

  stewardshipPayload(state) {
    return {
      campaign: state.id,
      schema: Number(state.schema) || 1,
      stewardship: stewardshipSummary(state.stewardship),
      completeness: stewardshipCompleteness(state.stewardship),
      gate: this.gateResult(state, 'release', this.store.verify(state.id)),
    }
  }

  stewardship(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const requested = asString(args.action, 'get')
    const action = requested === 'stewardship' ? 'set' : requested
    if (action === 'get' || action === 'list') return this.stewardshipPayload(state)
    if (action !== 'set' && action !== 'update') {
      throw codedError('invalid_input', `unknown stewardship action: ${action}`)
    }
    const raw = args.stewardship && typeof args.stewardship === 'object' && !Array.isArray(args.stewardship)
      ? args.stewardship
      : args
    const patch = {}
    for (const key of STEWARDSHIP_KEYS) {
      if (raw[key] !== undefined) patch[key] = raw[key]
    }
    if (Object.keys(patch).length === 0) {
      throw codedError('invalid_input', 'stewardship set needs at least one field', { fields: STEWARDSHIP_KEYS })
    }
    const merged = mergeStewardship(state.stewardship, patch)
    state.stewardship = merged
    this.store.emit(state, 'stewardship.updated', 'agent', {
      fields: Object.keys(patch),
      complete: stewardshipCompleteness(merged).ok,
    })
    this.store.save(state)
    return this.stewardshipPayload(state)
  }

  create(args = {}) {
    const question = asString(args.question)
    const title = asString(args.title) || (question ? question.slice(0, 48) : '未命名研究')
    const tier = TIERS[args.tier] ? args.tier : this.config.defaultTier
    const requestedDomain = asString(args.domain)
    let domain = null
    let domainData = {}
    if (requestedDomain && requestedDomain !== GENERAL_DOMAIN) {
      const profile = getDomain(requestedDomain)
      if (!profile) {
        throw codedError('invalid_input', `unknown domain: ${requestedDomain}`, { available: DOMAIN_IDS })
      }
      if (args.values !== undefined) {
        const validation = validateDomainValues(profile, args.values)
        if (!validation.ok) {
          throw codedError('invalid_input', 'domain values are invalid', { errors: validation.errors })
        }
        domainData = validation.values
      }
      domain = profile.id
    } else if (args.values !== undefined) {
      throw codedError('invalid_input', 'values require a domain profile')
    }
    const initialStewardship =
      args.stewardship === undefined || args.stewardship === null
        ? null
        : mergeStewardship(null, args.stewardship)
    const state = this.store.create({
      title,
      question,
      scope: asString(args.scope),
      success: asString(args.success),
      tier,
      templateId: asString(args.templateId) || null,
      domain,
      domainData,
    })
    if (domain) {
      this.store.emit(state, 'domain.initialized', 'agent', {
        domain,
        fields: Object.keys(domainData),
      })
      this.store.save(state)
    }
    if (initialStewardship) {
      state.stewardship = initialStewardship
      this.store.emit(state, 'stewardship.updated', 'agent', {
        fields: Object.keys(args.stewardship || {}),
        complete: stewardshipCompleteness(initialStewardship).ok,
      })
      this.store.save(state)
    }
    return {
      campaign: this.store.summaryOf(state),
      dir: this.store.dirFor(state.id),
      next: domain
        ? `领域档案 ${domain} 已启用。先补 scoping 字段并运行 rsx_domain action:"check"，再推进闸门。`
        : 'Fill question/scope/success, then rsx_gate action:"check" for scoping.',
    }
  }

  domains() {
    return {
      domains: listDomains(),
      general: {
        id: GENERAL_DOMAIN,
        title: { zh: '通用科研流程', en: 'General research pipeline' },
        summary: { zh: '不加载额外领域字段；仍使用九道通用闸门。', en: 'No extra domain fields; the generic nine gates still apply.' },
      },
    }
  }

  domainPayload(state, stage = null) {
    const profile = getDomain(state.domain)
    const targetStage = stage || state.stage
    return {
      domainId: state.domain || GENERAL_DOMAIN,
      domain: profile ? domainDetail(profile) : null,
      values: state.domainData && typeof state.domainData === 'object' ? state.domainData : {},
      completeness: domainCompleteness(state),
      stage: targetStage,
      checks: domainChecks(state, targetStage),
      gate: this.gateResult(state, targetStage),
    }
  }

  domain(campaign, args = {}) {
    const action = asString(args.action, 'get')
    if (action === 'list') return this.domains()
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    if (action === 'get') return this.domainPayload(state)
    if (action === 'check') {
      const stage = asString(args.stage) || state.stage
      if (!STAGE_ORDER.includes(stage)) {
        throw codedError('invalid_input', `unknown stage: ${stage}`, { stages: STAGE_ORDER })
      }
      return this.domainPayload(state, stage)
    }
    if (action !== 'set') throw codedError('invalid_input', `unknown domain action: ${action}`)
    const requested = asString(args.domain)
    if (!requested) throw codedError('invalid_input', 'domain set needs a domain id (or "general")')
    if (requested === GENERAL_DOMAIN) {
      if (args.values !== undefined) throw codedError('invalid_input', 'values require a domain profile')
      const previous = state.domain || null
      state.domain = null
      state.domainData = {}
      this.store.emit(state, 'domain.cleared', 'agent', { previous })
      this.store.save(state)
      return this.domainPayload(state)
    }
    const profile = getDomain(requested)
    if (!profile) {
      throw codedError('invalid_input', `unknown domain: ${requested}`, { available: DOMAIN_IDS })
    }
    let values = null
    if (args.values !== undefined) {
      const validation = validateDomainValues(profile, args.values)
      if (!validation.ok) {
        throw codedError('invalid_input', 'domain values are invalid', { errors: validation.errors })
      }
      values = validation.values
    }
    const switching = state.domain !== profile.id
    const previous = state.domain || null
    if (switching) {
      state.domain = profile.id
      state.domainData = {}
    }
    if (values) {
      for (const [key, value] of Object.entries(values)) {
        if (value === null) delete state.domainData[key]
        else state.domainData[key] = value
      }
    }
    this.store.emit(state, 'domain.set', 'agent', {
      domain: profile.id,
      previous,
      fields: values ? Object.keys(values) : [],
    })
    this.store.save(state)
    return this.domainPayload(state)
  }

  monitor(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    // Accept both flat monitor arguments and the nested `monitoring` object
    // advertised by the tool schema. Flat fields win over nested defaults.
    if (args.monitoring && typeof args.monitoring === 'object' && !Array.isArray(args.monitoring)) {
      args = { ...args.monitoring, ...args }
    }
    const previous = normalizeMonitoring(state.monitoring)
    let monitoring = previous
    if (args.status !== undefined) {
      const status = asString(args.status)
      if (!MONITORING_STATUSES.includes(status)) {
        throw codedError('invalid_input', `unknown monitoring status: ${status}`, { statuses: MONITORING_STATUSES })
      }
      monitoring.status = status
    }
    for (const key of ['plan', 'owner', 'cadence', 'notes', 'reviewedAt']) {
      if (args[key] !== undefined) {
        const value = asString(args[key])
        const limit = key === 'plan' ? 4000 : key === 'notes' ? 2000 : 160
        if (value.length > limit) throw codedError('invalid_input', `${key} exceeds ${limit} characters`)
        monitoring[key] = value
      }
    }
    if (args.signals !== undefined) {
      const signals = Array.isArray(args.signals)
        ? args.signals.map(String)
        : String(args.signals || '').split(/[,，\s]+/u)
      monitoring.signals = [...new Set(signals.map((item) => item.trim().slice(0, 120)).filter(Boolean))].slice(0, 20)
    }
    if (args.metrics !== undefined) {
      if (!Array.isArray(args.metrics)) throw codedError('invalid_input', 'metrics must be an array')
      for (const item of args.metrics) {
        if (!item || typeof item !== 'object' || !asString(item.name)) {
          throw codedError('invalid_input', 'metric.name is required')
        }
        const hasTarget = Number.isFinite(Number(item.target))
        const hasBound = Number.isFinite(Number(item.min)) || Number.isFinite(Number(item.max))
        if (!hasTarget && !hasBound) {
          throw codedError('invalid_input', `metric ${item.name} needs target, min or max`)
        }
      }
      monitoring = withMetrics(monitoring, args.metrics)
    }
    if (args.observations !== undefined) {
      if (!Array.isArray(args.observations)) throw codedError('invalid_input', 'observations must be an array')
      for (const item of args.observations) {
        if (!item || typeof item !== 'object') throw codedError('invalid_input', 'observation must be an object')
        if (typeof item.metric !== 'string' || !item.metric.trim()) {
          throw codedError('invalid_input', 'observation.metric is required')
        }
        if (!Number.isFinite(Number(item.value))) {
          throw codedError('invalid_input', `observation ${item.metric} value must be numeric`)
        }
      }
      monitoring = withObservations(monitoring, args.observations)
      if (args.reviewedAt === undefined) monitoring.reviewedAt = utcnow()
    }
    monitoring.updatedAt = utcnow()
    const assessment = evaluateMonitoring(monitoring)
    if (args.status === undefined && assessment.alerts.length > 0) monitoring.status = 'alert'
    state.monitoring = monitoring
    this.store.emit(state, 'monitoring.updated', 'agent', {
      status: monitoring.status,
      signals: monitoring.signals,
      metrics: monitoring.metrics.length,
      observations: monitoring.observations.length,
      alerts: assessment.alerts.length,
      gaps: assessment.gaps.length,
    })
    if (monitoring.observations.length > previous.observations.length) {
      this.store.emit(state, 'monitoring.observed', 'agent', {
        added: monitoring.observations.length - previous.observations.length,
        latestAt: assessment.latestAt,
      })
    }
    if (assessment.alerts.length > 0) {
      this.store.emit(state, 'monitoring.alert', 'agent', {
        alerts: assessment.alerts,
        status: monitoring.status,
      })
    }
    let reopened = false
    if (args.reopen === true) {
      if (state.stage === 'release') {
        const reason = asString(args.reason) || `监测告警：${assessment.alerts.map((item) => item.metric).join(', ') || '人工复查'}`
        state.stage = 'analyze'
        state.reopenedAt = utcnow()
        this.store.emit(state, 'loop.reopened', 'agent', { reason, alerts: assessment.alerts.length, at: state.reopenedAt })
        reopened = true
      }
    }
    this.store.save(state)
    return {
      monitoring,
      assessment,
      reopened,
      gate: this.gateResult(state, reopened ? state.stage : 'release', this.store.verify(id)),
      hint: reopened
        ? '已回到 analyze：复核告警、更新分析，然后重新经过 write → review → release。'
        : assessment.alerts.length
          ? '存在未处理告警；用 rsx_campaign action:"monitor" 登记处置，或传 reopen:true 回到 analyze。'
          : '发布后按监测计划复查；观测、告警和处置都会写入事件链。',
    }
  }

  evaluate(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const integrity = this.store.verify(id)
    const evaluation = evaluateLoop(state, {
      integrity,
      verifyAudit: (audit) => this.store.verifyAudit(audit),
      version: VERSION,
    })
    const previous = Array.isArray(state.loopEvaluations) && state.loopEvaluations.length
      ? state.loopEvaluations[state.loopEvaluations.length - 1]
      : null
    evaluation.previousScore = previous ? previous.score : null
    evaluation.delta = previous ? Number((evaluation.score - previous.score).toFixed(1)) : null
    if (args.record === false) {
      return { evaluation, recorded: false, baseline: state.loopBaseline || null }
    }
    evaluation.id = nextId(state, 'L')
    state.loopBaseline = state.loopBaseline || { id: evaluation.id, score: evaluation.score, ts: evaluation.ts, version: VERSION }
    state.loopEvaluation = compactEvaluation(evaluation)
    const history = (state.loopEvaluations || []).map((item) =>
      item && Array.isArray(item.dimensions) ? compactEvaluationHistory(item) : item,
    )
    state.loopEvaluations = [...history, compactEvaluationHistory(evaluation)].slice(-50)
    this.store.emit(state, 'loop.evaluated', 'agent', {
      id: evaluation.id,
      score: evaluation.score,
      grade: evaluation.grade,
      level: evaluation.level,
      delta: evaluation.delta,
      rsiReady: evaluation.rsi.ready,
    })
    this.store.save(state)
    return {
      evaluation,
      recorded: true,
      baseline: state.loopBaseline,
      hint: evaluation.rsi.ready
        ? '已具备自我改进闭环的工程前提；下一步记录一个候选改动，在同一评估器上重跑并比较 delta。'
        : `闭环成熟度 ${evaluation.score}/100；优先处理：${evaluation.nextActions.map((item) => item.action).join('；')}`,
    }
  }

  loopMarkdown(campaign) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    return renderLoopMarkdown(state.loopEvaluation, state)
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

  program(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const action = asString(args.action, 'list')
    if (action === 'list') {
      return { program: programSummary(state) }
    }
    if (action === 'rank') {
      return { ranking: rankClaims(state), program: programSummary(state) }
    }
    if (action === 'plan') {
      state.plan = applyPlan(state, args)
      this.store.emit(state, 'program.plan', 'agent', {
        objective: state.plan.objective,
        questions: state.plan.questions.length,
      })
      this.store.save(state)
      return { plan: state.plan, complete: programComplete(state) }
    }
    if (action === 'perspective') {
      const row = perspectiveFrom(state, args, nextId(state, 'O'))
      state.perspectives = [...(Array.isArray(state.perspectives) ? state.perspectives : []), row]
      this.store.emit(state, 'program.perspective', 'agent', { id: row.id, name: row.name, sources: row.sources.length })
      this.store.save(state)
      return { perspective: row, complete: programComplete(state) }
    }
    if (action === 'autonomy') {
      state.autonomy = autonomyFrom(state, args)
      this.store.emit(state, 'program.autonomy', 'agent', {
        maxCycles: state.autonomy.maxCycles,
        owner: state.autonomy.owner,
      })
      this.store.save(state)
      return { autonomy: state.autonomy, complete: programComplete(state) }
    }
    if (action === 'cycle') {
      const row = cycleFrom(state, args, nextId(state, 'K'))
      state.cycles = [...(Array.isArray(state.cycles) ? state.cycles : []), row]
      this.store.emit(state, 'program.cycle', 'agent', {
        id: row.id,
        decision: row.decision,
        question: row.question,
        run: row.run,
      })
      this.store.save(state)
      return { cycle: row, complete: programComplete(state) }
    }
    if (action === 'match') {
      const row = matchFrom(state, args, nextId(state, 'T'))
      const tournament = state.tournament && typeof state.tournament === 'object' ? state.tournament : { matches: [] }
      tournament.matches = [...(Array.isArray(tournament.matches) ? tournament.matches : []), row]
      state.tournament = tournament
      this.store.emit(state, 'program.match', 'agent', {
        id: row.id,
        a: row.a,
        b: row.b,
        winner: row.winner,
        criterion: row.criterion,
      })
      this.store.save(state)
      return { match: row, ranking: rankClaims(state), complete: programComplete(state) }
    }
    if (action === 'quality') {
      const row = qualityFrom(state, args, nextId(state, 'Y'))
      const quality = state.quality && typeof state.quality === 'object' ? state.quality : { rows: [] }
      quality.rows = [...(Array.isArray(quality.rows) ? quality.rows : []), row]
      state.quality = quality
      this.store.emit(state, 'program.quality', 'agent', {
        id: row.id,
        reviewer: row.reviewer,
        overall: row.overall,
      })
      this.store.save(state)
      return { quality: row, complete: programComplete(state) }
    }
    if (action === 'contradiction') {
      const row = contradictionFrom(state, args, nextId(state, 'D'))
      state.contradictions = [...(Array.isArray(state.contradictions) ? state.contradictions : []), row]
      this.store.emit(state, 'program.contradiction', 'agent', {
        id: row.id,
        claim: row.claim,
        status: row.status,
      })
      this.store.save(state)
      return { contradiction: row, complete: programComplete(state) }
    }
    throw codedError('invalid_input', `unknown program action: ${action}`)
  }

  search(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    if (args.disconfirming !== true) {
      throw codedError('invalid_input', 'this action records a disconfirming search; pass disconfirming:true')
    }
    const entry = this.addSearchEntry(state, { ...args, disconfirming: true, searchKind: args.searchKind || 'disconfirming' })
    state.search = { ...state.search, disconfirming: true, query: entry.query, at: entry.at }
    this.store.emit(state, 'search.disconfirming', 'agent', {
      query: entry.query,
      search: entry.id,
      hits: entry.hits,
      included: entry.included,
    })
    this.store.save(state)
    return { search: state.search, searchLog: entry, entries: searchEntries(state) }
  }

  searchLog(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const entry = this.addSearchEntry(state, args)
    if (entry.disconfirming) {
      state.search = { ...state.search, disconfirming: true, query: entry.query, at: entry.at }
    }
    this.store.emit(state, 'search.logged', 'agent', {
      search: entry.id,
      kind: entry.kind,
      database: entry.database,
      query: entry.query,
    })
    this.store.save(state)
    return { searchLog: entry, entries: searchEntries(state) }
  }

  addSearchEntry(state, args) {
    let entry
    try {
      entry = searchEntryFrom(args, nextId(state, 'Q'))
    } catch (error) {
      if (error && error.code === 'invalid_input') throw codedError('invalid_input', error.message, error.detail)
      throw error
    }
    state.searchLog = [...(Array.isArray(state.searchLog) ? state.searchLog : []), entry]
    return entry
  }

  prereg(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const spec = args.spec && typeof args.spec === 'object' ? args.spec : args
    const previous = state.prereg && typeof state.prereg === 'object' ? state.prereg : null
    const candidate = {
      hypothesisId:
        asString(spec.hypothesisId) ||
        (previous && previous.hypothesisId) ||
        (state.claims.find((item) => item.kind === 'hypothesis') || {}).id ||
        '',
      metric: asString(spec.metric) || (previous && previous.metric) || '',
      n: asInt(spec.n, previous ? previous.n : 0),
      analysisPlan: asString(spec.analysisPlan) || (previous && previous.analysisPlan) || '',
      stoppingRule: asString(spec.stoppingRule) || (previous && previous.stoppingRule) || '',
      seed: spec.seed === 0 ? 0 : spec.seed === undefined ? (previous ? previous.seed : NaN) : asInt(spec.seed, NaN),
      controls: Array.isArray(spec.controls)
        ? spec.controls.map(String)
        : previous && Array.isArray(previous.controls)
          ? previous.controls
          : [],
      envLock: asString(spec.envLock) || (previous && previous.envLock) || '',
      alpha: asString(spec.alpha) || (previous && previous.alpha) || '',
      power: asString(spec.power) || (previous && previous.power) || '',
      effectSize: asString(spec.effectSize) || (previous && previous.effectSize) || '',
      test: asString(spec.test) || (previous && previous.test) || '',
      lockedAt: previous && previous.lockedAt ? previous.lockedAt : utcnow(),
      amendments: previous && Array.isArray(previous.amendments) ? previous.amendments.slice() : [],
    }
    if (!Number.isFinite(candidate.seed)) candidate.seed = null
    const hash = preregHash(candidate)
    const lockedHash = previous && previous.lockedHash ? previous.lockedHash : hash
    let amendedNow = false
    if (previous && previous.lockedHash && hash !== previous.lockedHash) {
      if (args.amend !== true) {
        throw codedError(
          'prereg_locked',
          'pre-registration is locked; pass amend:true with a reason to record an amendment instead of silently editing the protocol',
          { lockedHash: previous.lockedHash, nextHash: hash },
        )
      }
      const reason = asString(args.reason)
      if (reason.length < 12) throw codedError('invalid_input', 'a protocol amendment needs a reason of at least 12 characters')
      candidate.amendments.push({
        at: utcnow(),
        reason,
        from: previous.hash || previous.lockedHash,
        to: hash,
        summary: preregCore(candidate),
      })
      amendedNow = true
    }
    candidate.hash = hash
    candidate.lockedHash = lockedHash
    state.prereg = candidate
    this.store.emit(state, amendedNow ? 'prereg.amended' : 'prereg.locked', 'agent', {
      hypothesisId: candidate.hypothesisId,
      metric: candidate.metric,
      hash,
      lockedHash,
      amendments: candidate.amendments.length,
    })
    this.store.save(state)
    const gate = this.gateResult(state, 'design')
    return { prereg: candidate, gate }
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
      const tokens = asInt(args.tokens)
      const seconds = asInt(args.seconds)
      const row = chargeBudget(state, stage, { tokens, seconds })
      state.costs = Array.isArray(state.costs) ? state.costs : []
      state.costs.push({ stage, tokens, seconds, at: utcnow(), note: asString(args.note) })
      this.store.emit(state, 'budget.charged', 'agent', { stage, tokens, seconds, note: asString(args.note) })
      this.store.save(state)
      return { stage, row, budget: budgetSummary(state), costs: state.costs.length }
    }
    return { budget: budgetSummary(state), costs: Array.isArray(state.costs) ? state.costs : [] }
  }

  /**
   * Server-side counterpart to the panel action rail. Export is a delivery
   * action: the release gate and an open pause apply. Archive is a reversible
   * lifecycle action: only the archive bit and another writer can refuse it.
   * The reason order is archive, busy, then pause/release for export. A held
   * `.write.lock` is the server's only observable "busy" state.
   */
  actionGate(campaign, action, options = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const isArchive = action === 'archive'
    const name = isArchive ? 'archive' : 'export'
    const open = openLoopPause(state)
    const paused = state.loop?.status === 'paused' || Boolean(open)
    const archived = state.archived === true
    const busy = options?.busy === true || existsSync(this.store.lockFile(id))
    // Export is a delivery action and needs a passing release gate. Archive is
    // a lifecycle action: it shelves the campaign (reversibly) and must remain
    // available for blocked or paused work. Both refuse archived/busy states.
    const checked = isArchive ? null : this.gateResult(state, 'release', this.store.verify(id))
    const gate = checked
      ? {
          stage: 'release',
          ok: checked.ok === true,
          passed: Number(checked.passed) || 0,
          total: Number(checked.total) || 0,
          blocking: Array.isArray(checked.blocking) ? checked.blocking.slice(0, 8) : [],
        }
      : null
    const reason = archived
      ? 'archived'
      : busy
        ? 'busy'
        : isArchive
          ? null
          : paused
            ? 'paused'
            : !gate.ok
              ? 'release'
              : null
    const blockingText = gate && gate.blocking.length ? `; blocking: ${gate.blocking.join(', ')}` : ''
    const message =
      reason === 'paused'
        ? `${name} is blocked: ${open ? `${open.id} is open (${open.kind || 'pause'})` : 'the campaign loop is paused'}`
        : reason === 'archived'
          ? `${name} is blocked: the campaign is archived`
          : reason === 'release'
            ? `${name} is blocked: the release gate has not passed (${gate.passed}/${gate.total}${blockingText})`
            : reason === 'busy'
              ? `${name} is blocked: the campaign is busy (a writer holds the lock)`
              : `${name} is allowed`
    return {
      ok: reason === null,
      action: name,
      campaign: id,
      reason,
      message,
      gate,
      pause: open ? { id: open.id, kind: open.kind || null, reason: open.reason || null, status: open.status || null } : null,
      archived,
      busy,
    }
  }

  archive(campaign) {
    const id = this.resolve(campaign)
    const gate = this.actionGate(id, 'archive')
    if (!gate.ok) throw codedError('action_blocked', gate.message, gate)
    const state = this.store.archive(id)
    return { campaign: this.store.summaryOf(state), archived: true }
  }

  unarchive(campaign) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    if (state.archived !== true) {
      return { campaign: this.store.summaryOf(state), archived: false, changed: false }
    }
    if (existsSync(this.store.lockFile(id))) {
      throw codedError('action_blocked', 'unarchive is blocked: the campaign is busy (a writer holds the lock)', {
        action: 'unarchive',
        campaign: id,
        reason: 'busy',
      })
    }
    const restored = this.store.unarchive(id)
    return { campaign: this.store.summaryOf(restored), archived: false, changed: true }
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
    const lineage = normalizeLineage(args)
    if (lineage && lineage.derivedFrom && !state.sources.some((item) => item.id === lineage.derivedFrom)) {
      throw codedError('not_found', `lineage.derivedFrom must reference an existing source: ${lineage.derivedFrom}`)
    }
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
      independence: SOURCE_INDEPENDENCE.includes(args.independence) ? args.independence : 'unknown',
      design: asString(args.design),
      riskOfBias: RISK_OF_BIAS.includes(args.riskOfBias) ? args.riskOfBias : 'not-assessed',
      robNote: asString(args.robNote),
      lineage,
      capturedAt: content ? asString(args.capturedAt) || utcnow() : '',
      captureMethod: content ? asString(args.captureMethod) || 'inline' : '',
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

  sourceUpdate(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const sourceId = asString(args.source) || asString(args.id)
    const source = state.sources.find((item) => item.id === sourceId)
    if (!source) throw codedError('not_found', `source not found: ${sourceId}`)
    if (args.independence !== undefined) {
      if (!SOURCE_INDEPENDENCE.includes(args.independence)) {
        throw codedError('invalid_input', `independence must be one of ${SOURCE_INDEPENDENCE.join(', ')}`)
      }
      source.independence = args.independence
    }
    if (args.riskOfBias !== undefined) {
      if (!RISK_OF_BIAS.includes(args.riskOfBias)) {
        throw codedError('invalid_input', `riskOfBias must be one of ${RISK_OF_BIAS.join(', ')}`)
      }
      source.riskOfBias = args.riskOfBias
    }
    if (args.design !== undefined) source.design = asString(args.design)
    if (args.robNote !== undefined) source.robNote = asString(args.robNote)
    if (args.capturedAt !== undefined) source.capturedAt = asString(args.capturedAt)
    if (args.captureMethod !== undefined) source.captureMethod = asString(args.captureMethod)
    if (args.lineage !== undefined || args.derivedFrom !== undefined) {
      const lineage = normalizeLineage(args)
      if (lineage && lineage.derivedFrom && !state.sources.some((item) => item.id === lineage.derivedFrom)) {
        throw codedError('not_found', `lineage.derivedFrom must reference an existing source: ${lineage.derivedFrom}`)
      }
      source.lineage = lineage
    }
    source.updatedAt = utcnow()
    this.store.emit(state, 'source.updated', 'agent', {
      id: source.id,
      independence: source.independence,
      riskOfBias: source.riskOfBias,
      lineage: source.lineage,
    })
    this.store.save(state)
    return { source }
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

  /**
   * Import a reference-manager export. BibTeX is the legacy path; CSL-JSON
   * and RIS are what Zotero, EndNote and most review tools actually emit.
   */
  sourceImport(campaign, args = {}) {
    const id = this.resolve(campaign)
    const text =
      asString(args.data) || asString(args.references) || asString(args.bibtex)
    if (!text.trim()) throw codedError('invalid_input', 'import data is required')
    const parsed = parseReferences(text, args.format || 'auto')
    if (parsed.entries.length === 0) {
      throw codedError('invalid_input', `no parsable ${parsed.format} source records`)
    }
    if (parsed.format !== 'bibtex' && parsed.entries.length > MAX_REFERENCE_ENTRIES) {
      throw codedError('invalid_input', `${parsed.format} import accepts at most ${MAX_REFERENCE_ENTRIES} entries`)
    }
    if (parsed.format === 'bibtex') {
      const result = this.sourceImportBibtex(id, { ...args, bibtex: text })
      return { format: 'bibtex', ...result }
    }
    const state = this.store.get(id)
    const existingDoi = new Set(state.sources.map((item) => String(item.doi || '').toLowerCase()).filter(Boolean))
    const existingTitle = new Set(state.sources.map((item) => String(item.title || '').trim().toLowerCase()).filter(Boolean))
    const imported = []
    const items = []
    const skipped = []
    for (const fields of parsed.entries) {
      const titleKey = String(fields.title || '').trim().toLowerCase()
      const doiKey = String(fields.doi || '').toLowerCase()
      if (!fields.title) {
        skipped.push({ title: '', reason: 'missing_title' })
        continue
      }
      if ((doiKey && existingDoi.has(doiKey)) || (!doiKey && titleKey && existingTitle.has(titleKey))) {
        skipped.push({ title: fields.title, reason: 'duplicate' })
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
      this.store.emit(fresh, 'references.imported', 'agent', {
        format: parsed.format,
        imported: imported.length,
        skipped: skipped.length,
      })
      this.store.save(fresh)
    }
    return { format: parsed.format, imported, items, skipped, counts: { sources: this.store.get(id).sources.length } }
  }

  /** Record one title/abstract/full-text decision, or a duplicate candidate. */
  sourceScreen(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const previous = state.screening
    try {
      return this.mutateScreening(state, args)
    } catch (error) {
      if (previous === undefined) delete state.screening
      else state.screening = previous
      throw error
    }
  }

  mutateScreening(state, args = {}) {
    const screening = normalizeScreening(state)
    const candidates = screening.candidates
    state.screening = { candidates }

    const requested = asString(args.candidate)
    let candidate = requested ? candidates.find((item) => item.id === requested) : null
    if (requested && !candidate) throw codedError('not_found', `screening candidate not found: ${requested}`)

    const sourceId = asString(args.source)
    const source = sourceId ? state.sources.find((item) => item.id === sourceId) : null
    if (sourceId && !source) throw codedError('not_found', `source not found: ${sourceId}`)

    const duplicateOf = asString(args.duplicateOf)
    const target = duplicateOf ? candidates.find((item) => item.id === duplicateOf) : null
    if (duplicateOf && !target) throw codedError('not_found', `retained candidate not found: ${duplicateOf}`)
    if (target && target.duplicateOf) {
      throw codedError('invalid_input', `duplicateOf must point at a retained candidate, not ${target.id}`)
    }

    const stage = asString(args.stage)
    const decision = asString(args.decision)
    const hasDecision = Boolean(stage || decision)

    if (candidate && duplicateOf && candidate.duplicateOf !== duplicateOf) {
      throw codedError('invalid_input', `candidate ${candidate.id} already points at ${candidate.duplicateOf || 'no duplicate'}`)
    }
    if (duplicateOf && hasDecision) {
      throw codedError('invalid_input', 'a duplicate is removed before screening; create it without stage/decision and screen the retained candidate')
    }

    let created = false
    if (!candidate) {
      const title = truncate(
        asString(args.title) || (source ? source.title : '') || (target ? target.title : ''),
        500,
      ).text
      const doi = truncate(
        normalizeDoi(asString(args.doi) || (source ? source.doi : '') || (target ? target.doi : '')),
        200,
      ).text
      const yearValue = asInt(args.year, source && source.year ? source.year : target && target.year ? target.year : 0)
      const year = yearValue > 0 && yearValue < 3000 ? yearValue : null
      if (!title) {
        throw codedError('invalid_input', 'a candidate needs a title (pass title or link source)')
      }

      if (!duplicateOf) {
        const key = title.trim().toLowerCase()
        const match = candidates.find(
          (item) =>
            !item.duplicateOf &&
            ((doi && item.doi && normalizeDoi(item.doi) === doi) || (!doi && item.title.trim().toLowerCase() === key)),
        )
        if (match) {
          candidate = match
          if (sourceId && !candidate.source) candidate.source = sourceId
        } else {
          if (!hasDecision) throw codedError('invalid_input', 'stage and decision are required for a new candidate')
          assertScreeningCapacity(candidates)
          candidate = {
            id: nextId(state, 'R'),
            title,
            doi,
            year,
            source: sourceId || '',
            duplicateOf: '',
            decisions: { title: null, abstract: null, fullText: null },
            createdAt: utcnow(),
            updatedAt: utcnow(),
          }
          candidates.push(candidate)
          created = true
        }
      } else {
        const existingDuplicate = candidates.find(
          (item) =>
            item.duplicateOf === duplicateOf &&
            ((doi && normalizeDoi(item.doi) === doi) || (!doi && item.title.trim().toLowerCase() === title.trim().toLowerCase())),
        )
        if (existingDuplicate) {
          candidate = existingDuplicate
        } else {
          assertScreeningCapacity(candidates)
          candidate = {
            id: nextId(state, 'R'),
            title,
            doi,
            year,
            source: sourceId || (target ? target.source : '') || '',
            duplicateOf,
            decisions: { title: null, abstract: null, fullText: null },
            createdAt: utcnow(),
            updatedAt: utcnow(),
          }
          candidates.push(candidate)
          created = true
        }
      }
    } else {
      if (sourceId && !candidate.source) candidate.source = sourceId
      if (candidate.duplicateOf) {
        if (hasDecision) {
          throw codedError('invalid_input', `candidate ${candidate.id} is a duplicate and was removed before screening`)
        }
      } else if (!hasDecision) {
        throw codedError('invalid_input', 'stage and decision are required for a screened candidate')
      }
    }

    if (!candidate.duplicateOf && hasDecision) {
      try {
        applyScreeningDecision(candidate, args)
      } catch (error) {
        if (error && error.code === 'invalid_input') throw codedError('invalid_input', error.message, error.detail)
        throw error
      }
    }
    let cleared = []
    const recorded = candidate.duplicateOf ? null : candidate.decisions && candidate.decisions[STAGE_FIELDS[stage]]
    if (recorded && recorded.decision !== 'include') {
      cleared = clearDownstreamDecisions(candidate, stage)
    }
    candidate.updatedAt = utcnow()
    state.screening = { candidates }
    const prisma = buildPrisma(state)
    this.store.emit(state, candidate.duplicateOf ? 'screening.duplicate' : 'screening.decided', 'agent', {
      candidate: candidate.id,
      stage: candidate.duplicateOf ? '' : stage,
      decision: candidate.duplicateOf ? '' : decision,
      reason: asString(args.reason),
      duplicateOf: candidate.duplicateOf || '',
      reviewer: recorded ? recorded.reviewer : '',
      note: recorded ? recorded.note : '',
      cleared,
      created,
    })
    this.store.save(state)
    return {
      candidate: publicCandidate(candidate),
      counts: prisma.counts,
      complete: prisma.complete,
      duplicate: Boolean(candidate.duplicateOf),
      created,
    }
  }

  /** Read-only PRISMA 2020 flow data, including the candidate records. */
  screeningPrisma(campaign) {
    const id = this.resolve(campaign)
    return buildPrisma(this.store.get(id))
  }

  /** Export the ledger in a portable reference format. */
  sourceReferences(campaign, format = 'bibtex') {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const normalized = normalizeReferenceFormat(format, 'bibtex')
    if (normalized === 'bibtex') {
      return { ...this.sourceBibtex(id), format: 'bibtex', content: renderBibtex(state.sources) }
    }
    if (normalized === 'csl-json') {
      return { format: 'csl-json', content: renderCslJson(state.sources), sources: state.sources.length }
    }
    if (normalized === 'ris') {
      return { format: 'ris', content: renderRis(state.sources), sources: state.sources.length }
    }
    throw codedError('invalid_input', `unsupported reference format: ${format}`)
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
      warrant: asString(args.warrant),
      counterEvidence: asString(args.counterEvidence),
      certainty: CERTAINTY.includes(args.certainty) ? args.certainty : '',
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

  claimUpdate(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const claimId = asString(args.claim) || asString(args.id)
    const claim = state.claims.find((item) => item.id === claimId)
    if (!claim) throw codedError('not_found', `claim not found: ${claimId}`)
    if (args.warrant !== undefined) claim.warrant = asString(args.warrant)
    if (args.counterEvidence !== undefined) claim.counterEvidence = asString(args.counterEvidence)
    if (args.certainty !== undefined) {
      if (args.certainty && !CERTAINTY.includes(args.certainty)) {
        throw codedError('invalid_input', `certainty must be one of ${CERTAINTY.join(', ')} (or empty)`)
      }
      claim.certainty = asString(args.certainty)
    }
    if (args.parent !== undefined) claim.parent = asString(args.parent)
    if (args.falsifier !== undefined) claim.falsifier = asString(args.falsifier)
    if (args.killCriterion !== undefined) claim.killCriterion = asString(args.killCriterion)
    if (args.predicted !== undefined) claim.predicted = asString(args.predicted)
    claim.updatedAt = utcnow()
    this.store.emit(state, 'claim.updated', 'agent', {
      id: claim.id,
      certainty: claim.certainty,
      hasWarrant: Boolean(claim.warrant),
      hasCounterEvidence: Boolean(claim.counterEvidence),
    })
    this.store.save(state)
    return { claim }
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

  sensitivityAdd(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const claimId = asString(args.claim)
    if (claimId && !state.claims.some((item) => item.id === claimId)) {
      throw codedError('not_found', `claim not found: ${claimId}`)
    }
    let row
    try {
      row = sensitivityFrom({ ...args, claim: claimId }, nextId(state, 'Z'))
    } catch (error) {
      if (error && error.code === 'invalid_input') throw codedError('invalid_input', error.message, error.detail)
      throw error
    }
    if (row.trace) {
      const resolved = resolveTrace(state, row.trace)
      if (!resolved.ok) throw codedError('trace_unresolved', resolved.reason, { trace: row.trace })
    }
    state.sensitivity = [...(Array.isArray(state.sensitivity) ? state.sensitivity : []), row]
    this.store.emit(state, 'sensitivity.recorded', 'agent', {
      id: row.id,
      claim: row.claim,
      direction: row.direction,
      trace: row.trace,
    })
    this.store.save(state)
    return { sensitivity: row, rows: state.sensitivity }
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

  runAttach(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const runId = asString(args.id)
    const run = state.runs.find((item) => item.id === runId)
    if (!run) throw codedError('not_found', `run not found: ${runId}`)
    const stdoutPath = asString(args.stdoutPath)
    if (!stdoutPath) throw codedError('invalid_input', 'stdoutPath is required to attach run output')
    if (!existsSync(stdoutPath)) throw codedError('not_found', `stdout file not found: ${stdoutPath}`)
    const previous = run.stdoutArtifact || null
    const artifact = this.store.addArtifact(state, stdoutPath, 'stdout', { label: run.id })
    run.stdoutArtifact = artifact.id
    run.stdoutAttachedAt = utcnow()
    this.store.emit(state, 'run.stdout_attached', 'agent', {
      id: run.id,
      artifact: artifact.id,
      bytes: artifact.bytes,
      previous,
    })
    this.store.save(state)
    return {
      run,
      artifact: artifact.id,
      bytes: artifact.bytes,
      replaced: previous,
      note: args.note ? asString(args.note) : 'stdout attached by exact command replay; metrics must match the recorded run',
    }
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

  reviewPacket(campaign) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const latest = (state.audits || [])[(state.audits || []).length - 1] || null
    const packet = buildReviewPacket(state, { audit: latest, integrity: this.store.verify(id) })
    return { packet, markdown: packet.markdown, entailment: checkEntailment(state) }
  }

  reviewEntailment(campaign) {
    const state = this.store.get(this.resolve(campaign))
    return { entailment: checkEntailment(state) }
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

    if (action === 'waivers') {
      return {
        waivers: state.waivers || [],
        active: [...activeWaivers(state).keys()],
        problems: waiverProblems(state),
        protected: WAIVER_PROTECTED,
      }
    }

    if (action === 'waive') {
      const code = asString(args.code)
      if (!code) throw codedError('invalid_input', 'waive requires code (a failing check id)')
      const candidate = {
        id: nextId(state, 'W'),
        code,
        reason: asString(args.reason),
        approvedBy: asString(args.approvedBy),
        expiresAt: asString(args.expiresAt),
        scope: asString(args.scope) || 'campaign',
        createdAt: utcnow(),
      }
      const known = new Set(
        STAGE_ORDER.flatMap((stage) => checkGate(state, stage).checks.map((item) => item.code)),
      )
      if (!known.has(code)) throw codedError('invalid_input', `unknown check code: ${code}`)
      const problems = waiverProblems({ waivers: [candidate] })
      if (problems.length > 0) {
        throw codedError('invalid_input', `waiver rejected: ${problems.map((item) => item.problem).join(', ')}`, problems)
      }
      if (!waiverActive(candidate)) {
        throw codedError('invalid_input', 'waiver rejected: expiry must be today or later')
      }
      state.waivers = Array.isArray(state.waivers) ? state.waivers : []
      state.waivers.push(candidate)
      this.store.emit(state, 'gate.waived', 'agent', candidate)
      this.store.save(state)
      return { waiver: candidate, gate: this.gateResult(state, state.stage) }
    }

    if (action === 'approvals') {
      const rows = (state.approvals || []).map((item) => ({ ...item, fresh: approvalFresh(state, item) }))
      return { approvals: rows, latest: rows[rows.length - 1] || null }
    }

    if (action === 'approve') {
      const approver = asString(args.approver)
      if (approver.length < 2) throw codedError('invalid_input', 'approve requires the approver name')
      const role = asString(args.role)
      if (!APPROVAL_ROLES.includes(role)) throw codedError('invalid_input', `role must be one of ${APPROVAL_ROLES.join(', ')}`)
      const statement = asString(args.statement)
      if (statement.length < 12) throw codedError('invalid_input', 'approval statement must be at least 12 characters')
      const declaration = state.declaration || {}
      if (declaration.model && approver.toLowerCase() === String(declaration.model).toLowerCase()) {
        throw codedError('invalid_input', 'the model that produced the work cannot approve it; name the human accountable')
      }
      const approval = {
        id: nextId(state, 'P'),
        approver,
        role,
        statement,
        scope: asString(args.scope) || 'campaign',
        subjectHash: auditSubjectHash(state),
        createdAt: utcnow(),
      }
      state.approvals = Array.isArray(state.approvals) ? state.approvals : []
      state.approvals.push(approval)
      this.store.emit(state, 'release.approved', 'agent', { id: approval.id, approver, role, subjectHash: approval.subjectHash })
      this.store.save(state)
      return { approval: { ...approval, fresh: true }, gate: this.gateResult(state, state.stage) }
    }

    if (action === 'review') {
      const review = {
        id: nextId(state, 'V'),
        schema: 2,
        reviewer: asString(args.reviewer) || 'anonymous reviewer',
        role: asString(args.role),
        affiliation: asString(args.affiliation),
        conflict: asString(args.conflict),
        independent: args.independent !== false,
        qualification: asString(args.qualification),
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
      waived: result.waived || [],
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
    const requestedDomain = asString(args.domain) || built.domain || null
    let domain = null
    if (requestedDomain && requestedDomain !== GENERAL_DOMAIN) {
      const profile = getDomain(requestedDomain)
      if (!profile) {
        throw codedError('invalid_input', `unknown domain: ${requestedDomain}`, { available: DOMAIN_IDS })
      }
      domain = profile.id
    }
    const state = this.store.create({
      title,
      question: built.question,
      scope: built.scope,
      success: built.success,
      tier: built.tier,
      templateId: template.id,
      domain,
    })
    state.template = {
      id: template.id,
      kind: template.kind,
      domain: domain || null,
      deliverables: built.deliverables,
      stages: built.stages,
      gateHints: built.gateHints,
    }
    this.store.emit(state, 'template.applied', 'agent', { templateId: template.id, subject, domain })
    this.store.save(state)
    return {
      campaign: this.store.summaryOf(state),
      prompt: built.prompt,
      domain: domain ? domainSummary(getDomain(domain)) : null,
      deliverables: built.deliverables,
      gateHints: built.gateHints,
      next: domain
        ? 'Paste the prompt into the conversation, then fill rsx_domain fields and run the scoping gate.'
        : 'Paste the prompt into the conversation, then start with rsx_campaign action:"world" and the scoping gate.',
    }
  }

  campaignLockInfo(id) {
    const file = this.store.lockFile(id)
    if (!existsSync(file)) return null
    try {
      const info = statSync(file)
      let holder = null
      try {
        holder = JSON.parse(readFileSync(file, 'utf8'))
      } catch {
        holder = null
      }
      const ageMs = Math.max(0, Date.now() - info.mtimeMs)
      return {
        file,
        ageMs,
        stale: ageMs > this.store.lockStaleMs,
        holder: holder && typeof holder === 'object' ? { pid: holder.pid ?? null, at: holder.ts || null } : null,
      }
    } catch (error) {
      if (error && error.code === 'ENOENT') return null
      return { file, ageMs: null, stale: false, unreadable: true, error: error.message }
    }
  }

  /**
   * Read-only integrity and health scan. It never repairs anything: a report
   * that says "stale index" is useful precisely because the next command is an
   * explicit `reindex`, not a silent write during a diagnostic.
   */
  doctor() {
    const started = Date.now()
    const all = this.store.listCampaigns({ includeArchived: true })
    const bounded = all.slice(0, LIMITS.maxDoctorCampaigns)
    const hasSigningKey = existsSync(join(this.store.dir, 'signing-key.json'))
    const rows = []
    for (const summary of bounded) {
      const id = summary.id
      const issues = []
      const issue = (code, severity, detail, ref = id) => issues.push({ code, severity, detail, ref })
      let state = null
      let integrity = null
      let schema = null
      let completeness = null
      let latestAudit = null
      let auditFresh = null
      let auditSigned = null
      let lock = null
      try {
        state = this.store.get(id)
        schema = Number(state.schema) || 1
        integrity = this.store.verify(id)
        completeness = stewardshipCompleteness(state.stewardship)
        lock = this.campaignLockInfo(id)
        if (state.id !== id) issue('id_mismatch', 'error', `state.id=${state.id} but directory=${id}`)
        if (!integrity.chainOk) {
          issue('chain_broken', 'error', `event chain breaks at seq ${integrity.brokenSeq}`)
        }
        if (integrity.stateOk === false) {
          issue('state_hash_mismatch', 'error', (integrity.stateProblems || []).map((item) => item.problem).join(', '))
        }
        for (const problem of integrity.artifactProblems || []) {
          issue(`artifact_${problem.problem}`, 'error', `artifact ${problem.id}: ${problem.problem}`, problem.id)
        }
        if (schema > SCHEMA_VERSION) {
          issue('schema_future', 'error', `schema ${schema} is newer than this plugin (${SCHEMA_VERSION})`)
        } else if (schema < SCHEMA_VERSION) {
          issue(
            'schema_outdated',
            'info',
            `schema ${schema} can be migrated to ${SCHEMA_VERSION} with rsx_campaign action:"migrate"`,
          )
        }
        latestAudit = (state.audits || [])[(state.audits || []).length - 1] || null
        if (latestAudit) {
          auditFresh = latestAudit.subjectHash === auditSubjectHash(state)
          if (!auditFresh) issue('stale_audit', 'warning', `latest audit ${latestAudit.id || '?'} no longer matches the campaign`)
          if (hasSigningKey) {
            try {
              auditSigned = this.store.verifyAudit(latestAudit).ok === true
            } catch {
              auditSigned = false
            }
            if (!auditSigned) issue('audit_signature_invalid', 'warning', `latest audit ${latestAudit.id || '?'} does not verify with this installation`)
          }
        }
        if (lock && lock.stale) {
          issue('stale_lock', 'warning', `write lock is older than ${this.store.lockStaleMs} ms`, id)
        } else if (lock) {
          issue('active_lock', 'info', `a writer holds the lock (age ${lock.ageMs} ms)`, id)
        }
        if (schema >= SCHEMA_VERSION && state.stage === 'release' && !completeness.ok) {
          issue('stewardship_incomplete', 'warning', completeness.missing.map((item) => item.label).join('、'))
        }
        if (state.archived === true) issue('archived', 'info', 'campaign is archived')
      } catch (error) {
        issue(error.code || 'unreadable', 'error', error.message)
      }
      const errors = issues.filter((item) => item.severity === 'error').length
      const warnings = issues.filter((item) => item.severity === 'warning').length
      rows.push({
        id,
        title: summary.title,
        stage: summary.stage,
        archived: summary.archived === true,
        schema,
        targetSchema: SCHEMA_VERSION,
        canMigrate: schema !== null && schema < SCHEMA_VERSION,
        seq: integrity ? integrity.events : null,
        stateOk: integrity ? integrity.stateOk !== false : false,
        chainOk: integrity ? integrity.chainOk === true : false,
        artifacts: integrity ? integrity.artifacts : null,
        artifactProblems: integrity ? (integrity.artifactProblems || []).length : null,
        audit: latestAudit
          ? { id: latestAudit.id || null, fresh: auditFresh, signed: auditSigned, verdict: latestAudit.verdict || null }
          : null,
        stewardship: completeness
          ? { ok: completeness.ok, percent: completeness.percent, missing: completeness.missingFields }
          : null,
        lock: lock ? { stale: lock.stale, ageMs: lock.ageMs, pid: lock.holder ? lock.holder.pid : null } : null,
        errors,
        warnings,
        ok: errors === 0,
        issues,
      })
    }
    const index = this.store.indexIntegrity()
    const checks = []
    const pushCheck = (code, ok, detail, severity = 'error') => {
      checks.push({ code, ok: ok === true, detail: detail || '', severity })
    }
    pushCheck('data_dir', existsSync(this.store.dir), existsSync(this.store.dir) ? this.store.dir : 'data directory is missing')
    pushCheck('index_consistent', index.ok, index.ok ? `${index.indexed} indexed / ${index.dirs} directories` : `missing=${index.missing.length}, orphan=${index.orphan.length}, duplicated=${index.duplicated.length}`)
    if (hasSigningKey) {
      try {
        this.store.signingKey()
        pushCheck('signing_key', true, 'local audit signing key is readable')
      } catch (error) {
        pushCheck('signing_key', false, error.message)
      }
    } else {
      pushCheck('signing_key', true, 'no audit signing key yet; it will be created on the first audit', 'info')
    }
    pushCheck('campaign_limit', all.length < LIMITS.maxCampaigns, `${all.length}/${LIMITS.maxCampaigns} campaigns`, 'info')
    if (all.length > bounded.length) {
      pushCheck('doctor_bounded', true, `scanned ${bounded.length}/${all.length} campaigns (bounded)`, 'info')
    }
    const errors = checks.filter((item) => item.severity === 'error' && !item.ok).length + rows.reduce((sum, row) => sum + row.errors, 0)
    const warnings = rows.reduce((sum, row) => sum + row.warnings, 0)
    const stale = rows.filter((row) => row.canMigrate)
    return {
      ok: errors === 0,
      healthy: errors === 0 && warnings === 0,
      version: VERSION,
      schemaVersion: SCHEMA_VERSION,
      generatedAt: utcnow(),
      ms: Date.now() - started,
      checks,
      index,
      counts: {
        campaigns: rows.length,
        scanned: rows.length,
        errors,
        warnings,
        staleLocks: rows.filter((row) => row.lock && row.lock.stale).length,
        staleAudits: rows.filter((row) => row.audit && row.audit.fresh === false).length,
        unmigrated: stale.length,
      },
      campaigns: rows,
      next: [
        ...(index.ok ? [] : [{ action: 'reindex', reason: 'index.json differs from the campaign directories' }]),
        ...(stale.length ? [{ action: 'migrate', reason: `${stale.length} campaign(s) can move to schema ${SCHEMA_VERSION}` }] : []),
      ],
    }
  }

  /** Rebuild index.json from the campaign directories. Never touches state. */
  reindex() {
    const dirs = this.store.listCampaignDirs()
    const rows = []
    const skipped = []
    const previous = new Map(this.store.listCampaigns({ includeArchived: true }).map((row) => [row.id, row]))
    for (const id of dirs) {
      try {
        if (!existsSync(this.store.stateFile(id))) throw codedError('not_found', `state.json is missing for ${id}`)
        const state = this.store.get(id)
        rows.push(this.store.summaryOf(state))
      } catch (error) {
        skipped.push({ id, code: error.code || 'unreadable', error: error.message })
        // Keep the last known index row for an unreadable campaign instead of
        // silently dropping it from the list; the directory and state remain
        // the source of truth and doctor still reports the skipped id.
        if (previous.has(id)) rows.push(previous.get(id))
      }
    }
    if (rows.length === 0 && dirs.length > 0) {
      throw codedError('nothing_to_index', 'no campaign state could be read; index.json was left unchanged', { dirs: dirs.length })
    }
    const current = this.store.current()
    const fallback = rows.find((row) => row.archived !== true) || rows[0]
    const chosen = rows.some((row) => row.id === current) ? current : fallback ? fallback.id : null
    const index = this.store.rebuildIndex(rows, chosen)
    return {
      ok: skipped.length === 0,
      indexed: rows.length,
      skipped,
      current: index.current,
      integrity: this.store.indexIntegrity(),
    }
  }

  /**
   * Explicit schema migration. This is the only path that changes an old
   * campaign's contract: it verifies first, writes a state+ledger backup, then
   * records campaign.migrated in the same hash chain. A dry run is in-memory.
   */
  migrate(campaign, args = {}) {
    const id = this.resolve(campaign)
    const state = this.store.get(id)
    const from = Number(state.schema) || 1
    if (from > SCHEMA_VERSION) {
      throw codedError('unsupported_schema', `campaign schema ${from} is newer than ${SCHEMA_VERSION}`, {
        campaign: id,
        schema: from,
        target: SCHEMA_VERSION,
      })
    }
    if (from === SCHEMA_VERSION) {
      return {
        migrated: false,
        alreadyCurrent: true,
        campaign: id,
        from,
        to: SCHEMA_VERSION,
        stewardship: stewardshipSummary(state.stewardship),
        completeness: stewardshipCompleteness(state.stewardship),
      }
    }
    const integrity = this.store.verify(id)
    if (
      integrity.chainOk !== true ||
      integrity.stateOk === false ||
      (integrity.artifactProblems || []).length > 0
    ) {
      throw codedError('integrity_blocked', 'migration is blocked until chain, state and artifacts verify', {
        campaign: id,
        chainOk: integrity.chainOk,
        stateOk: integrity.stateOk,
        artifactProblems: integrity.artifactProblems,
      })
    }
    const patch =
      args.stewardship && typeof args.stewardship === 'object' && !Array.isArray(args.stewardship)
        ? args.stewardship
        : {}
    const merged = mergeStewardship(state.stewardship, patch)
    const completeness = stewardshipCompleteness(merged)
    const program = from < 4 ? programComplete(state) : null
    if (args.dryRun === true) {
      return {
        migrated: false,
        dryRun: true,
        campaign: id,
        from,
        to: SCHEMA_VERSION,
        missing: completeness.missing,
        stewardship: stewardshipSummary(merged),
        program: program ? { ok: program.ok, missing: program.missing } : null,
        backup: null,
      }
    }
    const backup = this.store.backup(id, { reason: `schema ${from}→${SCHEMA_VERSION}` })
    const at = utcnow()
    const migration = {
      from,
      to: SCHEMA_VERSION,
      at,
      version: VERSION,
      backup: { name: backup.name, sha256: backup.sha256, bytes: backup.bytes },
    }
    state.schema = SCHEMA_VERSION
    state.stewardship = merged
    state.migrations = Array.isArray(state.migrations) ? state.migrations : []
    state.migrations.push(migration)
    this.store.emit(state, 'campaign.migrated', 'agent', {
      from,
      to: SCHEMA_VERSION,
      backup: migration.backup,
      stewardshipComplete: completeness.ok,
    })
    this.store.save(state)
    return {
      migrated: true,
      campaign: id,
      from,
      to: SCHEMA_VERSION,
      migration,
      backup: { name: backup.name, sha256: backup.sha256, bytes: backup.bytes, pruned: backup.pruned },
      stewardship: stewardshipSummary(merged),
      completeness,
      program: program ? { ok: program.ok, missing: program.missing } : null,
      gate: this.gateResult(state, 'release', this.store.verify(id)),
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
      const humanReviewer = asString(args.humanReviewer)
      const contributions = Array.isArray(args.contributions)
        ? args.contributions
            .filter((item) => item && CONTRIBUTION_ACTORS.includes(item.actor) && asString(item.role))
            .map((item) => ({
              actor: item.actor,
              role: asString(item.role),
              name: asString(item.name),
              scope: asString(item.scope),
            }))
        : [
            {
              actor: 'ai',
              role: 'drafting / analysis / code',
              name: asString(args.model) || 'DeepSeek Harness · dsh-research-suite',
              scope: asString(args.notes) || '按活动记录生成分析、代码与初稿',
            },
            ...(humanReviewer
              ? [{ actor: 'human', role: 'review / approval', name: humanReviewer, scope: '对结论、发布与合规负责' }]
              : []),
          ]
      const declaration = {
        ai: args.ai === false ? false : true,
        watermark: args.watermark === false ? false : true,
        model: asString(args.model) || 'DeepSeek Harness · dsh-research-suite',
        humanReviewer,
        date: asString(args.date) || utcnow().slice(0, 10),
        notes: asString(args.notes),
        contributions,
      }
      state.declaration = declaration
      this.store.emit(state, 'declaration.set', 'agent', declaration)
      this.store.save(state)
      return { declaration, gate: this.gateResult(state, 'release', this.store.verify(id)) }
    }

    if (action === 'repro') {
      return {
        repro: buildReproPackage(state),
        gate: this.gateResult(state, state.stage, this.store.verify(id)),
      }
    }

    if (action === 'packet') {
      return this.reviewPacket(id)
    }

    if (action === 'render' || action === 'export') {
      this.store.emit(state, 'report.rendered', 'agent', { action })
      this.store.save(state)
    }
    const integrity = this.store.verify(id)
    const events = this.store.events(state)
    const prisma = buildPrisma(state)
    const markdown = renderReport(state, {
      integrity,
      events,
      prisma,
      verifyAudit: (audit) => this.store.verifyAudit(audit),
    })
    const declaration = renderDeclaration(state)
    const stewardshipMarkdown = renderStewardshipMarkdown(state)
    const latestAudit = (state.audits || [])[(state.audits || []).length - 1] || null
    const matrix = buildMatrix(state)
    const matrixMarkdown = renderMatrixMarkdown(matrix)
    const matrixCsv = renderMatrixCsv(matrix)
    const auditMarkdown = renderAuditMarkdown(latestAudit)
    const bibtex = renderBibtex(state.sources)
    const cslJson = renderCslJson(state.sources)
    const ris = renderRis(state.sources)
    const prismaJson = JSON.stringify(prisma, null, 2)
    const prismaMarkdownText = renderPrismaMarkdown(prisma)
    const prismaCsv = renderPrismaCsv(prisma)
    const provenance = buildProvenance(state, { integrity, version: VERSION })
    const roCrate = buildRoCrate(state, { integrity, version: VERSION })
    const repro = buildReproPackage(state)
    const packet = buildReviewPacket(state, { audit: latestAudit, integrity })
    const aiContribution = renderContributionMarkdown(state)
    const searchMarkdown = renderSearchMarkdown(state)
    const sensitivityMarkdownText = sensitivityMarkdown(state)
    const programMarkdown = renderProgramMarkdown(state)
    const dir = ensureDir(this.store.exportsDir(id))
    const reportPath = join(dir, 'REPORT.md')
    writeFileSync(reportPath, markdown, 'utf8')
    const searchPath = join(dir, 'SEARCH.md')
    writeFileSync(searchPath, searchMarkdown, 'utf8')
    const sensitivityPath = join(dir, 'SENSITIVITY.md')
    writeFileSync(sensitivityPath, sensitivityMarkdownText, 'utf8')
    const programPath = join(dir, 'PROGRAM.md')
    writeFileSync(programPath, programMarkdown, 'utf8')
    const declarationPath = join(dir, 'declaration.md')
    writeFileSync(declarationPath, declaration, 'utf8')
    const campaignPath = join(dir, 'campaign.json')
    writeFileSync(campaignPath, JSON.stringify(state, null, 2), 'utf8')
    const ledgerPath = join(dir, 'ledger.jsonl')
    copyFileSync(this.store.eventsFile(id), ledgerPath)
    const bibtexPath = join(dir, 'references.bib')
    writeFileSync(bibtexPath, bibtex, 'utf8')
    const cslJsonPath = join(dir, 'references.csl.json')
    writeFileSync(cslJsonPath, cslJson, 'utf8')
    const risPath = join(dir, 'references.ris')
    writeFileSync(risPath, ris, 'utf8')
    const prismaJsonPath = join(dir, 'PRISMA.json')
    writeFileSync(prismaJsonPath, prismaJson, 'utf8')
    const prismaMarkdownPath = join(dir, 'PRISMA.md')
    writeFileSync(prismaMarkdownPath, prismaMarkdownText, 'utf8')
    const prismaCsvPath = join(dir, 'PRISMA.csv')
    writeFileSync(prismaCsvPath, prismaCsv, 'utf8')
    const matrixPath = join(dir, 'MATRIX.md')
    writeFileSync(matrixPath, matrixMarkdown, 'utf8')
    const matrixCsvPath = join(dir, 'matrix.csv')
    writeFileSync(matrixCsvPath, matrixCsv, 'utf8')
    const auditPath = join(dir, 'AUDIT.md')
    writeFileSync(auditPath, auditMarkdown, 'utf8')
    const domainMarkdown = state.domain ? renderDomainMarkdown(state) : ''
    const domainPath = state.domain ? join(dir, 'DOMAIN.md') : null
    if (domainPath) writeFileSync(domainPath, domainMarkdown, 'utf8')
    const loopMarkdown = state.loopEvaluation ? renderLoopMarkdown(state.loopEvaluation, state) : ''
    const loopPath = state.loopEvaluation ? join(dir, 'LOOP.md') : null
    if (loopPath) writeFileSync(loopPath, loopMarkdown, 'utf8')
    const provenancePath = join(dir, 'provenance.json')
    writeFileSync(provenancePath, JSON.stringify(provenance, null, 2), 'utf8')
    const roCratePath = join(dir, 'ro-crate-metadata.json')
    writeFileSync(roCratePath, JSON.stringify(roCrate, null, 2), 'utf8')
    const reproPath = join(dir, 'REPRO.md')
    writeFileSync(reproPath, repro.markdown, 'utf8')
    const reproJsonPath = join(dir, 'repro.json')
    writeFileSync(
      reproJsonPath,
      JSON.stringify({ ...repro, markdown: undefined }, null, 2),
      'utf8',
    )
    const checksumsPath = join(dir, 'checksums.txt')
    writeFileSync(checksumsPath, `${repro.checksums.join('\n')}\n`, 'utf8')
    const packetPath = join(dir, 'REVIEW_PACKET.md')
    writeFileSync(packetPath, packet.markdown, 'utf8')
    const contributionPath = join(dir, 'AI_CONTRIBUTION.md')
    writeFileSync(contributionPath, aiContribution, 'utf8')
    const stewardshipPath = join(dir, 'STEWARDSHIP.md')
    writeFileSync(stewardshipPath, stewardshipMarkdown, 'utf8')

    const paths = {
      dir,
      report: reportPath,
      search: searchPath,
      sensitivity: sensitivityPath,
      program: programPath,
      declaration: declarationPath,
      campaign: campaignPath,
      ledger: ledgerPath,
      bibtex: bibtexPath,
      cslJson: cslJsonPath,
      ris: risPath,
      prismaJson: prismaJsonPath,
      prismaMarkdown: prismaMarkdownPath,
      prismaCsv: prismaCsvPath,
      matrix: matrixPath,
      matrixCsv: matrixCsvPath,
      audit: auditPath,
      ...(domainPath ? { domain: domainPath } : {}),
      ...(loopPath ? { loop: loopPath } : {}),
      provenance: provenancePath,
      roCrate: roCratePath,
      repro: reproPath,
      reproJson: reproJsonPath,
      checksums: checksumsPath,
      packet: packetPath,
      contribution: contributionPath,
      stewardship: stewardshipPath,
    }
    if (action !== 'export') return { paths, chars: markdown.length, gate: this.gateResult(state, 'write', integrity) }

    const manifestFiles = Object.entries(paths)
      .filter(([key, value]) => key !== 'dir' && typeof value === 'string' && existsSync(value))
      .map(([key, value]) => ({
        role: key,
        path: value.slice(dir.length + 1).replace(/\\/gu, '/'),
        bytes: statSync(value).size,
        sha256: sha256Hex(readFileSync(value)),
      }))
      .sort((a, b) => a.path.localeCompare(b.path))
    const manifest = {
      format: 'dsh-research-suite/export-manifest/1',
      plugin: { name: 'dsh-research-suite', version: VERSION, schemaVersion: SCHEMA_VERSION },
      campaign: {
        id: state.id,
        title: state.title,
        schema: Number(state.schema) || 1,
        seq: state.seq || 0,
        lastHash: state.lastHash || null,
        stateHash: state.stateHash || null,
        released: Boolean(state.releasedAt),
      },
      generatedAt: utcnow(),
      files: manifestFiles,
      omitted: [
        'MANIFEST.json (self; a file cannot contain its own hash)',
        'BUNDLE.zip (self; the archive contains this manifest)',
        'artifacts/* (content-addressed; listed in campaign.json and bundled when within the archive budget)',
      ],
      gate: this.gateResult(state, 'release', integrity),
    }
    const manifestPath = join(dir, 'MANIFEST.json')
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
    paths.manifest = manifestPath

    if (statSync(ledgerPath).size > LIMITS.maxBundlePayloadBytes) {
      throw codedError('too_large', 'ledger is too large for BUNDLE.zip; the standalone export is available')
    }
    const artifactDir = ensureDir(join(dir, 'artifacts'))
    const entries = [
      { name: 'REPORT.md', data: markdown },
      { name: 'SEARCH.md', data: searchMarkdown },
      { name: 'SENSITIVITY.md', data: sensitivityMarkdownText },
      { name: 'PROGRAM.md', data: programMarkdown },
      { name: 'declaration.md', data: declaration },
      { name: 'STEWARDSHIP.md', data: stewardshipMarkdown },
      { name: 'MANIFEST.json', data: readFileSync(manifestPath) },
      { name: 'campaign.json', data: JSON.stringify(state, null, 2) },
      { name: 'ledger.jsonl', data: readFileSync(ledgerPath) },
      { name: 'references.bib', data: bibtex },
      { name: 'references.csl.json', data: cslJson },
      { name: 'references.ris', data: ris },
      { name: 'PRISMA.json', data: prismaJson },
      { name: 'PRISMA.md', data: prismaMarkdownText },
      { name: 'PRISMA.csv', data: prismaCsv },
      { name: 'MATRIX.md', data: matrixMarkdown },
      { name: 'matrix.csv', data: matrixCsv },
      { name: 'AUDIT.md', data: auditMarkdown },
      ...(domainMarkdown ? [{ name: 'DOMAIN.md', data: domainMarkdown }] : []),
      ...(loopMarkdown ? [{ name: 'LOOP.md', data: loopMarkdown }] : []),
      { name: 'provenance.json', data: JSON.stringify(provenance, null, 2) },
      { name: 'ro-crate-metadata.json', data: JSON.stringify(roCrate, null, 2) },
      { name: 'REPRO.md', data: repro.markdown },
      { name: 'repro.json', data: JSON.stringify({ ...repro, markdown: undefined }, null, 2) },
      { name: 'checksums.txt', data: `${repro.checksums.join('\n')}\n` },
      { name: 'REVIEW_PACKET.md', data: packet.markdown },
      { name: 'AI_CONTRIBUTION.md', data: aiContribution },
    ]
    let remainingBytes = LIMITS.maxBundlePayloadBytes
    for (const entry of entries) remainingBytes -= Buffer.byteLength(entry.data)
    if (remainingBytes < 0) {
      throw codedError('too_large', 'reports and ledger exceed the BUNDLE.zip size limit; the standalone export is available')
    }
    const skipped = []
    const maxBundledArtifactBytes = 2 * 1024 * 1024
    for (const item of state.artifacts || []) {
      const limit = Math.min(maxBundledArtifactBytes, remainingBytes)
      if (item.bytes > limit) {
        skipped.push(item.id)
        continue
      }
      const source = this.store.artifactPath(id, item.id)
      if (!existsSync(source)) continue
      const data = this.store.readArtifactBytes(id, item.id, { maxBytes: limit, expectedHash: item.id })
      if (!data) continue
      const name = item.id.replace(/^sha256:/u, '')
      writeFileSync(join(artifactDir, name), data)
      entries.push({ name: `artifacts/${name}`, data })
      remainingBytes -= data.length
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
      pluginVersion: VERSION,
      apiVersion: 1,
      schemaVersion: SCHEMA_VERSION,
      tools: 16,
    }
  }

  saveSettings(patch = {}) {
    const allowed = {}
    if (patch.defaultTier && TIERS[patch.defaultTier]) allowed.defaultTier = patch.defaultTier
    if (patch.language === 'zh' || patch.language === 'en') allowed.language = patch.language
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
