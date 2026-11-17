/**
 * Stable digest of everything an automated review actually inspects.
 *
 * The audit itself is stored on the campaign, so it cannot be part of its own
 * subject. Event-chain bookkeeping is deliberately excluded too: checking a
 * gate appends an event, and a review must not go stale just because someone
 * looked at it. Release-time metadata (`stage`, `declaration`, `world`) is also
 * excluded: the audit checks it as advisory findings, but adding a declaration
 * or a dual-use pass must not invalidate a review of the research content. Any
 * substantive edit (source, claim, number, figure, manuscript, artifact
 * registry) changes the digest and invalidates the audit.
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
  return {
    version: AUDIT_SUBJECT_VERSION,
    question: state.question || '',
    scope: state.scope || '',
    success: state.success || '',
    tier: state.tier || '',
    ...(state.numbersAllowlist ? { numbersAllowlist: state.numbersAllowlist } : {}),
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
