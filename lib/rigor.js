/**
 * Research-rigor primitives shared by gates, audit and the loop evaluator.
 *
 * The point of this module is to turn practices that are usually prose
 * ("consider bias", "the claim is warranted", "a human approved this") into
 * data with a fixed shape. Data can be checked, compared and waived
 * explicitly; prose cannot. Schema 1 campaigns predate these fields and are
 * treated as advisory so an upgrade never invalidates a released project.
 */
import {
  CORE_SCHEMA,
  FEATURE_SCHEMA,
  PROGRAM_SCHEMA,
  STEWARDSHIP_SCHEMA,
  LINEAGE_RELATIONS,
  RISK_OF_BIAS,
  SOURCE_INDEPENDENCE,
  WAIVER_PROTECTED,
} from './config.js'
import { auditSubjectHash } from './subject.js'
import { canon, sha256Hex } from './util.js'

export function schemaOf(state) {
  const value = Number(state && state.schema)
  return Number.isFinite(value) && value > 0 ? value : 1
}

export function isCoreSchema(state) {
  return schemaOf(state) >= CORE_SCHEMA
}

export function isFeatureSchema(state) {
  return schemaOf(state) >= FEATURE_SCHEMA
}

export function isProgramSchema(state) {
  return schemaOf(state) >= PROGRAM_SCHEMA
}

export function isStewardshipSchema(state) {
  return schemaOf(state) >= STEWARDSHIP_SCHEMA
}

function str(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function arr(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []
}

const CLAIM_RIGOR_CODES = new Set([
  'claim_warrant',
  'claim_counter_evidence',
  'claim_certainty',
  'claim_contested_ignored',
  'hypothesis_warrant',
])

/**
 * Toulmin's missing middle: evidence does not support a claim by itself, the
 * warrant is the rule that licenses the step. `counterEvidence` records that a
 * counter search happened even when it found nothing, and `certainty` is the
 * GRADE-style judgement for the body of evidence, not for the hypothesis.
 */
export function claimRigor(claim, evidenceRows = []) {
  const gaps = []
  const rows = arr(evidenceRows).filter((item) => item.claim === claim.id)
  const supports = rows.filter((item) => item.relation === 'supports').length
  const refutes = rows.filter((item) => item.relation === 'refutes').length
  const settled = claim.status === 'supported' || claim.status === 'contested' || claim.status === 'refuted'
  if (claim.kind === 'hypothesis' && !str(claim.warrant)) {
    gaps.push({
      code: 'hypothesis_warrant',
      severity: 'major',
      detail: `${claim.id} 缺少 warrant：证据通过什么规则支持这个假设？`,
    })
  }
  if ((claim.kind === 'hypothesis' || settled) && !str(claim.counterEvidence)) {
    gaps.push({
      code: 'claim_counter_evidence',
      severity: 'major',
      detail: `${claim.id} 没有记录反向证据检索（即使结论是“未发现反例”也要写）。`,
    })
  }
  if (claim.status === 'supported' || claim.status === 'contested') {
    if (!str(claim.warrant)) {
      gaps.push({
        code: 'claim_warrant',
        severity: 'major',
        detail: `${claim.id} 标为 ${claim.status}，但没有 warrant 说明证据为何支持结论。`,
      })
    }
    if (!str(claim.certainty)) {
      gaps.push({
        code: 'claim_certainty',
        severity: 'minor',
        detail: `${claim.id} 缺少 certainty（high/moderate/low/very-low）。`,
      })
    }
  }
  if (claim.status === 'supported' && refutes > 0) {
    gaps.push({
      code: 'claim_contested_ignored',
      severity: 'major',
      detail: `${claim.id} 仍有 ${refutes} 条 refutes 证据，却标为 supported；请改为 contested 或说明为何反证不成立。`,
    })
  }
  if (settled && supports === 0 && claim.status !== 'refuted') {
    gaps.push({
      code: 'claim_without_support',
      severity: 'major',
      detail: `${claim.id} 标为 ${claim.status}，但没有 supports 证据行。`,
    })
  }
  return { supports, refutes, gaps }
}

export function claimGapCodes(claim, evidenceRows = []) {
  return claimRigor(claim, evidenceRows).gaps.map((item) => item.code)
}

/**
 * Source lineage and risk of bias. `independence` is what stops eight rows
 * from one press release counting as eight independent confirmations.
 */
export function sourceRigor(source, sourcesById = new Map()) {
  const gaps = []
  const independence = str(source.independence) || 'unknown'
  const rob = str(source.riskOfBias) || 'not-assessed'
  if (!SOURCE_INDEPENDENCE.includes(independence)) {
    gaps.push({ code: 'source_independence_invalid', severity: 'minor', detail: `${source.id} independence=${independence} 非法。` })
  }
  if (!RISK_OF_BIAS.includes(rob)) {
    gaps.push({ code: 'source_rob_invalid', severity: 'minor', detail: `${source.id} riskOfBias=${rob} 非法。` })
  }
  if (source.reliability === 'primary') {
    if (independence === 'unknown') {
      gaps.push({
        code: 'source_independence',
        severity: 'major',
        detail: `${source.id} 是 primary，但没有声明独立于其他来源。`,
      })
    }
    if (!str(source.design)) {
      gaps.push({ code: 'source_design', severity: 'minor', detail: `${source.id} 缺少 study design（设计决定偏倚风险）。` })
    }
    if (rob === 'not-assessed') {
      gaps.push({ code: 'source_rob', severity: 'major', detail: `${source.id} 没有评估 risk of bias。` })
    }
    if ((rob === 'high' || rob === 'some-concerns') && !str(source.robNote)) {
      gaps.push({
        code: 'source_rob_note',
        severity: 'major',
        detail: `${source.id} 的 risk of bias=${rob}，但没有写具体理由和影响。`,
      })
    }
  }
  const lineage = source.lineage && typeof source.lineage === 'object' ? source.lineage : null
  if (lineage && str(lineage.derivedFrom)) {
    if (!LINEAGE_RELATIONS.includes(str(lineage.relation))) {
      gaps.push({ code: 'source_lineage_relation', severity: 'minor', detail: `${source.id} lineage.relation 非法。` })
    }
    if (!sourcesById.has(lineage.derivedFrom)) {
      gaps.push({
        code: 'source_lineage_missing',
        severity: 'major',
        detail: `${source.id} 声称源自 ${lineage.derivedFrom}，但该来源不在台账中。`,
      })
    }
  }
  if (str(source.contentHash) && !str(source.capturedAt)) {
    gaps.push({ code: 'source_capture_receipt', severity: 'minor', detail: `${source.id} 有正文哈希，但没有 capturedAt 捕获时间。` })
  }
  return gaps
}

export function independentPrimarySources(state) {
  return arr(state && state.sources).filter(
    (item) => item.reliability === 'primary' && str(item.independence) === 'independent',
  )
}

export function assessedPrimarySources(state) {
  return arr(state && state.sources).filter(
    (item) => item.reliability === 'primary' && str(item.riskOfBias) && str(item.riskOfBias) !== 'not-assessed',
  )
}

/** The locked part of a pre-registration: drift here is a protocol amendment. */
export function preregCore(prereg) {
  const row = prereg && typeof prereg === 'object' ? prereg : {}
  const controls = Array.isArray(row.controls) ? row.controls.map(String).slice().sort() : []
  return {
    hypothesisId: str(row.hypothesisId),
    metric: str(row.metric),
    n: Number.isFinite(Number(row.n)) ? Number(row.n) : 0,
    analysisPlan: str(row.analysisPlan),
    stoppingRule: str(row.stoppingRule),
    seed: row.seed === null || row.seed === undefined || row.seed === '' ? null : Number(row.seed),
    controls,
    envLock: str(row.envLock),
    alpha: str(row.alpha),
    power: str(row.power),
    effectSize: str(row.effectSize),
    test: str(row.test),
  }
}

export function preregHash(prereg) {
  return sha256Hex(canon(preregCore(prereg)))
}

export function preregDrift(prereg) {
  if (!prereg || !str(prereg.lockedHash) || !str(prereg.hash)) return null
  if (prereg.lockedHash === prereg.hash) return null
  const amendments = arr(prereg.amendments)
  const last = amendments[amendments.length - 1] || null
  return {
    from: prereg.lockedHash,
    to: prereg.hash,
    amended: Boolean(last && str(last.reason)),
    lastReason: last ? str(last.reason) : '',
  }
}

export function today() {
  return new Date().toISOString().slice(0, 10)
}

export function waiverActive(waiver, now = today()) {
  if (!waiver || typeof waiver !== 'object') return false
  if (str(waiver.reason).length < 20) return false
  if (str(waiver.approvedBy).length < 2) return false
  const expiresAt = str(waiver.expiresAt)
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(expiresAt)) return false
  return expiresAt >= now
}

export function waiverProblems(state) {
  const problems = []
  for (const waiver of arr(state && state.waivers)) {
    const code = str(waiver.code)
    if (!code) {
      problems.push({ code: '', problem: 'missing_code', waiver })
      continue
    }
    if (WAIVER_PROTECTED.includes(code)) {
      problems.push({ code, problem: 'protected', waiver })
      continue
    }
    if (str(waiver.reason).length < 20) problems.push({ code, problem: 'reason_too_short', waiver })
    if (str(waiver.approvedBy).length < 2) problems.push({ code, problem: 'no_approver', waiver })
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(str(waiver.expiresAt))) {
      problems.push({ code, problem: 'no_expiry', waiver })
    }
  }
  return problems
}

/** Expiry is history, not corruption: an expired waiver stays in the record. */
export function expiredWaivers(state) {
  return arr(state && state.waivers).filter(
    (waiver) =>
      /^\d{4}-\d{2}-\d{2}$/u.test(str(waiver.expiresAt)) &&
      !waiverActive(waiver) &&
      waiverProblems({ waivers: [waiver] }).length === 0,
  )
}

export function activeWaivers(state) {
  const map = new Map()
  for (const waiver of arr(state && state.waivers)) {
    if (waiverProblems({ waivers: [waiver] }).length > 0) continue
    if (!waiverActive(waiver)) continue
    map.set(str(waiver.code), waiver)
  }
  return map
}

/**
 * Apply active waivers to a gate result. A waived check is still shown (with
 * its original detail) and still recorded, but it no longer blocks. Protected
 * codes never reach this map because `waiverProblems` rejects them.
 */
export function applyWaivers(checks, state) {
  const waivers = activeWaivers(state)
  if (waivers.size === 0) return { checks, waived: [] }
  const waived = []
  const next = checks.map((item) => {
    if (item.ok || item.blocking === false) return item
    const waiver = waivers.get(item.code)
    if (!waiver) return item
    waived.push({ code: item.code, reason: waiver.reason, approvedBy: waiver.approvedBy, expiresAt: waiver.expiresAt })
    return {
      ...item,
      ok: true,
      waived: true,
      originalDetail: item.detail,
      detail: `[waived until ${waiver.expiresAt}] ${item.detail}`,
    }
  })
  return { checks: next, waived }
}

export function approvalFresh(state, approval) {
  if (!approval || typeof approval !== 'object') return false
  if (!str(approval.approver) || !str(approval.role) || str(approval.statement).length < 12) return false
  if (!str(approval.subjectHash)) return false
  return approval.subjectHash === auditSubjectHash(state)
}

export function latestApproval(state) {
  const approvals = arr(state && state.approvals)
  return approvals[approvals.length - 1] || null
}

export function approvalProblems(state) {
  const problems = []
  for (const approval of arr(state && state.approvals)) {
    if (!str(approval.approver)) problems.push({ code: 'approval_approver', approval })
    if (!str(approval.role)) problems.push({ code: 'approval_role', approval })
    if (str(approval.statement).length < 12) problems.push({ code: 'approval_statement', approval })
    if (!approvalFresh(state, approval)) problems.push({ code: 'approval_stale', approval })
  }
  return problems
}

export function isRigorCode(code) {
  return CLAIM_RIGOR_CODES.has(code)
}
