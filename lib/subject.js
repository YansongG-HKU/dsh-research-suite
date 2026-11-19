/**
 * Stable digest of everything an automated review actually inspects.
 *
 * The audit itself is stored on the campaign, so it cannot be part of its own
 * subject. Event-chain bookkeeping is deliberately excluded too: checking a
 * gate appends an event, and a review must not go stale just because someone
 * looked at it. Release-time metadata (`stage`, `declaration`, `world`) is also
 * excluded: the audit checks it as advisory findings, but adding a declaration
 * or a dual-use pass must not invalidate a review of the research content.
 * Domain profile values are substantive: they carry the protocol fields a
 * domain reviewer signs off on, so changing them invalidates the audit.
 */
import { canon, sha256Hex } from './util.js'

export const AUDIT_SUBJECT_VERSION = 1

function pick(source) {
  return {
    id: source.id,
    title: source.title,
    year: source.year,
    kind: source.kind,
    reliability: source.reliability,
    url: source.url,
    doi: source.doi,
    authors: source.authors,
    journal: source.journal,
    bibtexKey: source.bibtexKey,
    contentHash: source.contentHash,
    contentArtifact: source.contentArtifact,
    retracted: source.retracted === true,
    independence: source.independence || null,
    design: source.design || null,
    riskOfBias: source.riskOfBias || null,
    robNote: source.robNote || null,
    lineage: source.lineage || null,
    capturedAt: source.capturedAt || null,
    captureMethod: source.captureMethod || null,
  }
}

function pickArtifact(item) {
  const row = item && typeof item === 'object' ? item : {}
  return {
    id: row.id,
    bytes: row.bytes,
    role: row.role,
    label: row.label,
    description: row.description,
    mime: row.mime,
  }
}

export function auditSubject(state) {
  const searchLog = Array.isArray(state.searchLog) ? state.searchLog : []
  const sensitivity = Array.isArray(state.sensitivity) ? state.sensitivity : []
  const planQuestions = state.plan && Array.isArray(state.plan.questions) ? state.plan.questions : []
  const perspectives = Array.isArray(state.perspectives) ? state.perspectives : []
  const autonomy = state.autonomy && typeof state.autonomy === 'object' ? state.autonomy : {}
  const cycles = Array.isArray(state.cycles) ? state.cycles : []
  const matches = state.tournament && Array.isArray(state.tournament.matches) ? state.tournament.matches : []
  const qualityRows = state.quality && Array.isArray(state.quality.rows) ? state.quality.rows : []
  const contradictions = Array.isArray(state.contradictions) ? state.contradictions : []
  const hasProgram =
    planQuestions.length > 0 ||
    perspectives.length > 0 ||
    Object.keys(autonomy).length > 0 ||
    cycles.length > 0 ||
    matches.length > 0 ||
    qualityRows.length > 0 ||
    contradictions.length > 0
  return {
    version: hasProgram ? 3 : searchLog.length > 0 || sensitivity.length > 0 ? 2 : AUDIT_SUBJECT_VERSION,
    question: state.question || '',
    scope: state.scope || '',
    success: state.success || '',
    tier: state.tier || '',
    domain: state.domain || null,
    domainData: state.domainData || {},
    ...(state.numbersAllowlist ? { numbersAllowlist: state.numbersAllowlist } : {}),
    ...(searchLog.length > 0
      ? {
          searchLog: searchLog.map((row) => ({
            id: row.id,
            kind: row.kind,
            database: row.database,
            query: row.query,
            dateFrom: row.dateFrom,
            dateTo: row.dateTo,
            hits: row.hits,
            screened: row.screened,
            included: row.included,
            disconfirming: row.disconfirming === true,
            notes: row.notes,
            at: row.at,
          })),
        }
      : {}),
    ...(sensitivity.length > 0
      ? {
          sensitivity: sensitivity.map((row) => ({
            id: row.id,
            claim: row.claim || '',
            name: row.name,
            method: row.method,
            specification: row.specification,
            result: row.result,
            direction: row.direction,
            trace: row.trace || '',
            notes: row.notes || '',
            at: row.at,
          })),
        }
      : {}),
    ...(hasProgram
      ? {
          plan: { objective: (state.plan && state.plan.objective) || '', questions: planQuestions },
          perspectives,
          autonomy,
          cycles,
          matches,
          quality: qualityRows,
          contradictions,
        }
      : {}),
    prereg: state.prereg || null,
    manuscript: state.manuscript
      ? {
          title: state.manuscript.title || '',
          text: state.manuscript.text || '',
          artifact: state.manuscript.artifact || null,
          revision: state.manuscript.revision || 0,
        }
      : null,
    sources: (state.sources || []).map(pick),
    claims: state.claims || [],
    evidence: state.evidence || [],
    runs: state.runs || [],
    numbers: state.numbers || [],
    figures: state.figures || [],
    extractions: state.extractions || [],
    artifacts: (state.artifacts || []).map(pickArtifact),
  }
}

export function auditSubjectHash(state) {
  return sha256Hex(canon(auditSubject(state)))
}
