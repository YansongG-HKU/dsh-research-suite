#!/usr/bin/env node
/**
 * Read-only evidence collector for the 0.11 human-checkpoint acceptance.
 *
 * Usage:
 *   node scripts/collect-0.11-human.mjs <data-dir> <campaign-id> "<user selection>" <out-file>
 *
 * It reads the materialised state and the append-only event log, re-verifies
 * the chain and writes only the evidence file given by the caller.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { ResearchStore } from '../lib/ledger.js'
import { utcnow } from '../lib/util.js'

const [dir, campaignId, selection, outFile] = process.argv.slice(2)
if (!dir || !campaignId || !outFile) {
  console.error('usage: node scripts/collect-0.11-human.mjs <data-dir> <campaign-id> "<user selection>" <out-file>')
  process.exit(2)
}

const store = new ResearchStore({ dir }).init()
const state = store.get(campaignId)
const integrity = store.verify(campaignId)
const events = readFileSync(join(resolve(dir), 'campaigns', campaignId, 'events.jsonl'), 'utf8')
  .split(/\r?\n/u)
  .filter(Boolean)
  .map((line) => JSON.parse(line))
const pause = (state.loopPauses || []).find((row) => row.id === 'LP-0001') || null
const approval = (state.approvals || []).find((row) => row.id === 'P-0002') || null
const priorApproval = (state.approvals || []).find((row) => row.id === 'P-0001') || null
const audit = (state.audits || []).find((row) => row.id === 'A-0003') || (state.audits || []).slice(-1)[0] || null
const releaseGates = (state.gates || []).filter((row) => row.stage === 'release')
const before = releaseGates.length >= 2 ? releaseGates[releaseGates.length - 2] : null
const after = releaseGates.length >= 1 ? releaseGates[releaseGates.length - 1] : null
const source = (state.sources || []).find((row) => row.id === 'S-0011') || null
const cycle = (state.cycles || []).find((row) => row.id === 'K-0002') || null
const select = (kind) => events.filter((row) => row.kind === kind)

const result = {
  ok:
    integrity.chainOk === true &&
    integrity.stateOk === true &&
    (integrity.artifactProblems || []).length === 0 &&
    Boolean(pause && pause.status === 'resumed' && pause.kind === 'human_checkpoint') &&
    Boolean(approval && approval.subjectHash === (audit && audit.subjectHash)) &&
    Boolean(after && after.ok === true && after.passed === 12 && after.total === 12),
  generatedAt: utcnow(),
  dataDir: resolve(dir),
  campaign: {
    id: state.id,
    title: state.title,
    stage: state.stage,
    seq: state.seq,
    events: integrity.events,
    artifacts: integrity.artifacts,
    chainOk: integrity.chainOk,
    stateOk: integrity.stateOk,
    artifactProblems: integrity.artifactProblems,
    lastHash: state.lastHash,
  },
  revision: {
    source: source
      ? {
          id: source.id,
          title: source.title,
          doi: source.doi,
          url: source.url,
          year: source.year,
          kind: source.kind,
          reliability: source.reliability,
          contentHash: source.contentHash,
          captureMethod: source.captureMethod,
        }
      : null,
    manuscriptChars: state.manuscript ? state.manuscript.chars : null,
    manuscriptArtifact: state.manuscript ? state.manuscript.artifact : null,
    programCycle: cycle,
    audit: audit
      ? {
          id: audit.id,
          ok: audit.ok,
          verdict: audit.verdict,
          counts: audit.counts,
          subjectHash: audit.subjectHash,
          signature: audit.signature,
          keyId: audit.keyId,
        }
      : null,
  },
  pause: pause
    ? {
        id: pause.id,
        status: pause.status,
        kind: pause.kind,
        stage: pause.stage,
        iteration: pause.iteration,
        cycle: pause.cycle,
        maxCycles: pause.maxCycles,
        tool: pause.tool,
        label: pause.label,
        human: pause.human,
        needsInput: pause.needsInput,
        unmapped: pause.unmapped,
        blocking: pause.blocking,
        gateOk: pause.gateOk,
        planHash: pause.planHash,
        at: pause.at,
        resumedAt: pause.resumedAt,
        resumeReason: pause.resumeReason,
      }
    : null,
  approvals: {
    prior: priorApproval
      ? { id: priorApproval.id, subjectHash: priorApproval.subjectHash, createdAt: priorApproval.createdAt }
      : null,
    approval: approval
      ? {
          id: approval.id,
          approver: approval.approver,
          role: approval.role,
          statement: approval.statement,
          subjectHash: approval.subjectHash,
          createdAt: approval.createdAt,
          fresh: approval.subjectHash === (audit && audit.subjectHash),
        }
      : null,
    count: (state.approvals || []).length,
  },
  release: {
    before: before
      ? { ok: before.ok, passed: before.passed, total: before.total, blocking: before.blocking, ts: before.ts }
      : null,
    after: after
      ? { ok: after.ok, passed: after.passed, total: after.total, blocking: after.blocking, ts: after.ts }
      : null,
  },
  loop: {
    status: state.loop && state.loop.status,
    lastStatus: state.loop && state.loop.lastStatus,
    pauseId: state.loop && state.loop.pauseId,
    lastCheckAt: state.loop && state.loop.lastCheckAt,
  },
  userSelection: String(selection || ''),
  events: {
    sourceAdded: select('source.added').slice(-1).map((row) => ({ seq: row.seq, ts: row.ts })),
    manuscriptSet: select('manuscript.set').slice(-1).map((row) => ({ seq: row.seq, ts: row.ts })),
    auditRecorded: select('audit.recorded').slice(-1).map((row) => ({ seq: row.seq, ts: row.ts })),
    programCycle: select('program.cycle').slice(-1).map((row) => ({ seq: row.seq, ts: row.ts })),
    loopPaused: select('loop.paused').map((row) => ({ seq: row.seq, ts: row.ts, payload: row.payload })),
    releaseApproved: select('release.approved').map((row) => ({ seq: row.seq, ts: row.ts, payload: row.payload })),
    loopResumed: select('loop.resumed').map((row) => ({ seq: row.seq, ts: row.ts, payload: row.payload })),
    latest: events.slice(-6).map((row) => ({ seq: row.seq, kind: row.kind, ts: row.ts })),
  },
}

mkdirSync(dirname(resolve(outFile)), { recursive: true })
writeFileSync(resolve(outFile), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(result, null, 2))
