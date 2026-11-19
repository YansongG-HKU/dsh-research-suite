import { join } from 'node:path'
import { homedir } from 'node:os'
import { existsSync } from 'node:fs'

import { ResearchStore } from '../../workspace/dsh-research-suite/lib/ledger.js'
import { ResearchService } from '../../workspace/dsh-research-suite/lib/service.js'
import { resolveConfig } from '../../workspace/dsh-research-suite/lib/config.js'
import { auditSubjectHash } from '../../workspace/dsh-research-suite/lib/subject.js'
import { checkGate } from '../../workspace/dsh-research-suite/lib/gates.js'

const dataDir = join(homedir(), '.dsh', 'research-suite')
const store = new ResearchStore({ dir: dataDir, log: { info() {}, warn() {} } }).init()
const service = new ResearchService({ store, config: resolveConfig({ dataDir }), log: { info() {}, warn() {} } })

const campaigns = []
for (const id of ['rs-5495250c', 'rs-ad07b91f']) {
  const state = store.get(id)
  const integrity = store.verify(id)
  const audit = (state.audits || []).slice(-1)[0] || null
  const signature = audit ? store.verifyAudit(audit) : null
  const release = checkGate(state, 'release', {
    integrity,
    verifyAudit: (item) => store.verifyAudit(item),
  })
  campaigns.push({
    id,
    schema: state.schema,
    stage: state.stage,
    releasedAt: state.releasedAt || null,
    subjectHash: auditSubjectHash(state),
    latestAudit: audit
      ? {
          id: audit.id,
          verdict: audit.verdict,
          counts: audit.counts,
          subjectHash: audit.subjectHash,
          signature: signature ? signature.ok === true : false,
          fresh: audit.subjectHash === auditSubjectHash(state),
        }
      : null,
    release: { ok: release.ok, passed: release.passed, total: release.total, blocking: release.blocking },
    searchLog: (state.searchLog || []).length,
    sensitivity: (state.sensitivity || []).length,
    extractions: (state.extractions || []).length,
    loop: state.loopEvaluation
      ? { score: state.loopEvaluation.score, level: state.loopEvaluation.level, rsiReady: state.loopEvaluation.rsiReady }
      : null,
    chainOk: integrity.chainOk,
    artifactProblems: (integrity.artifactProblems || []).length,
  })
}

const exportDir = join(dataDir, 'campaigns', 'rs-5495250c', 'exports')
const files = {}
for (const name of ['REPORT.md', 'SEARCH.md', 'SENSITIVITY.md', 'AUDIT.md', 'LOOP.md', 'REVIEW_PACKET.md', 'BUNDLE.zip']) {
  files[name] = existsSync(join(exportDir, name))
}
console.log(JSON.stringify({ campaigns, exportFiles: files, generatedAt: new Date().toISOString() }, null, 2))
