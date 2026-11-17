/**
 * Nine machine-checkable gates.
 *
 * Design contract: a gate is a pure function of the materialised campaign
 * state. It never throws for a normal failing check, it returns one row per
 * check with a stable code, and `blocking` lists only the codes that stop the
 * stage from advancing. Recording the result on the campaign is the service's
 * job, not the gate's.
 */
import { STAGE_ORDER, TIERS } from './config.js'
import { budgetOverruns } from './budget.js'
import { auditSubjectHash } from './subject.js'
import { domainChecks } from './domains.js'

const NUM_REF = /\{\{N-(\d{4})\}\}/gu
const CITE_REF = /\[\[src:(S-\d{4})\]\]/gu
const YEAR = /^(?:19|20)\d{2}$/u

function check(code, ok, detail, blocking = true) {
  return { code, ok: ok === true, detail: detail || '', blocking }
}

function str(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function resolveTrace(state, trace) {
  const text = str(trace)
  if (!text) return { ok: false, reason: 'empty trace' }
  const runMatch = /^run:(R-[0-9a-f]{10})#(.+)$/u.exec(text)
  if (runMatch) {
    const run = (state.runs || []).find((item) => item.id === runMatch[1])
    if (!run) return { ok: false, reason: `run not found: ${runMatch[1]}` }
    const key = runMatch[2]
    if (!run.metrics || typeof run.metrics !== 'object' || !(key in run.metrics)) {
      return { ok: false, reason: `metric not found: ${key}` }
    }
    return { ok: true, kind: 'run', run, key, value: Number(run.metrics[key]) }
  }
  const sourceMatch = /^source:(S-\d{4})(?:#(.*))?$/u.exec(text)
  if (sourceMatch) {
    const source = (state.sources || []).find((item) => item.id === sourceMatch[1])
    if (!source) return { ok: false, reason: `source not found: ${sourceMatch[1]}` }
    return { ok: true, kind: 'source', source, locator: sourceMatch[2] || '' }
  }
  return { ok: false, reason: 'trace must start with run:R-xxxxxxxxxx#metric or source:S-0000' }
}

export function numberMatchesTrace(number, resolved) {
  if (!resolved.ok) return false
  if (resolved.kind !== 'run') return true
  const expected = Number(number.value)
  if (!Number.isFinite(expected) || !Number.isFinite(resolved.value)) return false
  return Math.abs(expected - resolved.value) <= Math.max(1e-9, Math.abs(resolved.value) * 1e-6)
}

export function orphanNumbers(text, knownNumbers, allowlist = '1,2,3') {
  const allowed = new Set(
    String(allowlist || '')
      .split(/[,\s]+/u)
      .map((item) => item.trim())
      .filter(Boolean),
  )
  const stripped = String(text || '')
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/`[^`]*`/gu, ' ')
    .replace(NUM_REF, ' ')
    .replace(CITE_REF, ' ')
  const found = []
  for (const match of stripped.matchAll(/\d+(?:\.\d+)?/gu)) {
    const raw = match[0]
    if (YEAR.test(raw) || allowed.has(raw)) continue
    const at = Math.max(0, match.index - 30)
    found.push({ value: raw, context: stripped.slice(at, match.index + raw.length + 30).replace(/\s+/gu, ' ').trim() })
  }
  return found
}

export function gateScoping(state) {
  return finish('scoping', [
    check('question', str(state.question).length >= 12, 'research question must be at least 12 characters'),
    check('scope', str(state.scope).length >= 12, 'scope / boundaries must be at least 12 characters'),
    check('success', str(state.success).length >= 10, 'success criteria must be at least 10 characters'),
    check('tier', Boolean(TIERS[state.tier]), `unknown effort tier: ${state.tier}`),
    check('world_question', Boolean(state.world && state.world.question && Object.keys(state.world.question).length > 0), 'record the question in the world model (rsx_campaign action:"world")'),
  ], state)
}

export function gateSurvey(state) {
  const sources = state.sources || []
  const primary = sources.filter((item) => item.reliability === 'primary').length
  const recent = sources.filter((item) => Number(item.year) >= 2023).length
  const captured = sources.filter((item) => str(item.contentHash)).length
  const coverage = state.world && state.world.coverage ? Object.keys(state.world.coverage).length : 0
  return finish('survey', [
    check('min_sources', sources.length >= 8, `need 8 sources, have ${sources.length}`),
    check('primary_sources', primary >= 2, `need 2 primary sources, have ${primary}`),
    check('recent_source', recent >= 1, 'need at least one source from 2023 or later'),
    check('content_captured', captured >= Math.min(5, sources.length) && captured > 0, `capture source content (${captured} with content hash)`),
    check('disconfirming_search', state.search && state.search.disconfirming === true, 'run one disconfirming search and record it (rsx_campaign action:"search")'),
    check('coverage_map', coverage >= 2, `map at least two coverage areas, have ${coverage}`),
  ], state)
}

export function gateHypothesis(state) {
  const hypotheses = (state.claims || []).filter((item) => item.kind === 'hypothesis')
  const hypothesis = hypotheses[hypotheses.length - 1]
  if (!hypothesis) {
    return finish('hypothesis', [check('hypothesis', false, 'add a claim with kind:"hypothesis"')], state)
  }
  const supports = (state.evidence || []).filter(
    (item) => item.claim === hypothesis.id && item.relation === 'supports',
  ).length
  const novelty = state.world && state.world.novelty
  return finish('hypothesis', [
    check('falsifier', str(hypothesis.falsifier).length >= 8, 'a hypothesis needs an explicit falsifier'),
    check('kill_criterion', str(hypothesis.killCriterion).length >= 8, 'state the kill criterion'),
    check('predicted_observation', str(hypothesis.predicted).length >= 8, 'state the predicted observation'),
    check('metric', str(hypothesis.metricName).length > 0 && str(hypothesis.metricUnit).length > 0, 'name the primary metric and its unit'),
    check(
      'support',
      supports >= 2,
      `attach at least two supporting evidence rows, have ${supports}`,
    ),
    check('novelty', Boolean(novelty && novelty.checked === true), 'check the nearest prior work and record it under world.novelty'),
  ], state)
}

export function gateDesign(state) {
  const prereg = state.prereg
  if (!prereg) return finish('design', [check('prereg', false, 'write the pre-registration first (rsx_campaign action:"prereg")')], state)
  const controls = Array.isArray(prereg.controls) ? prereg.controls : []
  return finish('design', [
    check('prereg_hypothesis', str(prereg.hypothesisId).length > 0, 'link the pre-registration to a hypothesis id'),
    check('prereg_metric', str(prereg.metric).length > 0, 'pre-register the primary metric'),
    check('prereg_n', Number(prereg.n) >= 1, 'pre-register a sample size / n'),
    check('prereg_analysis', str(prereg.analysisPlan).length >= 12, 'pre-register the analysis plan'),
    check('prereg_stopping', str(prereg.stoppingRule).length >= 6, 'pre-register the stopping rule'),
    check('prereg_seed', prereg.seed !== null && prereg.seed !== '' && Number.isFinite(Number(prereg.seed)), 'pre-register the random seed'),
    check('negative_control', controls.includes('negative'), 'include a negative control in the design'),
    check('env_lock', str(prereg.envLock).length > 0, 'record the environment lock (versions / hardware)'),
  ], state)
}

export function gateExecute(state) {
  const runs = state.runs || []
  const successes = runs.filter((item) => item.status === 'success')
  const seeded = successes.filter((item) => item.seed !== null && item.seed !== undefined && item.seed !== '')
  const withMetrics = successes.filter((item) => item.metrics && Object.keys(item.metrics).length > 0)
  const negative = runs.filter((item) => item.control === 'negative' && item.status === 'success')
  return finish('execute', [
    check('success_run', successes.length >= 1, 'record at least one successful run'),
    check('seed', seeded.length === successes.length && successes.length > 0, 'every successful run must carry its seed'),
    check('metrics', withMetrics.length === successes.length && successes.length > 0, 'every successful run must carry metrics'),
    check('negative_control_run', negative.length >= 1, 'actually run the negative control and record it'),
    check('command_recorded', successes.every((item) => str(item.command).length > 0), 'record the exact command of every success'),
  ], state)
}

export function gateAnalyze(state) {
  const numbers = state.numbers || []
  const unresolved = []
  const mismatched = []
  for (const number of numbers) {
    const resolved = resolveTrace(state, number.trace)
    if (!resolved.ok) unresolved.push(`${number.id}: ${resolved.reason}`)
    else if (!numberMatchesTrace(number, resolved)) mismatched.push(`${number.id}: value does not match ${number.trace}`)
  }
  const uncertainty = numbers.filter((item) => str(item.uncertainty).length > 0).length
  const proposed = (state.claims || []).filter((item) => item.status === 'proposed')
  return finish('analyze', [
    check('numbers_present', numbers.length >= 1, 'register at least one number with a trace'),
    check('trace_resolves', unresolved.length === 0, unresolved.join('; ') || 'all traces resolve'),
    check('trace_matches', mismatched.length === 0, mismatched.join('; ') || 'all traced values match'),
    check('uncertainty', uncertainty >= 1, 'report uncertainty for at least one number'),
    check(
      'claims_resolved',
      proposed.length === 0,
      `every claim needs a final status, still proposed: ${proposed.map((item) => item.id).join(', ')}`,
    ),
  ], state)
}

export function gateWrite(state) {
  const manuscript = state.manuscript && str(state.manuscript.text)
  if (!manuscript || manuscript.length < 200) {
    return finish('write', [check('manuscript', false, 'set a manuscript of at least 200 characters (rsx_write action:"manuscript")')], state)
  }
  const numberRefs = [...manuscript.matchAll(NUM_REF)].map((match) => `N-${match[1]}`)
  const citeRefs = [...manuscript.matchAll(CITE_REF)].map((match) => `src:${match[1]}`)
  const knownNumbers = new Set((state.numbers || []).map((item) => item.id))
  const knownSources = new Set((state.sources || []).map((item) => `src:${item.id}`))
  const missingNumbers = [...new Set(numberRefs)].filter((id) => !knownNumbers.has(id))
  const missingSources = [...new Set(citeRefs)].filter((id) => !knownSources.has(id))
  const orphans = orphanNumbers(manuscript, knownNumbers, state.numbersAllowlist)
  const figures = state.figures || []
  const figureProblems = figures
    .filter((item) => !item.artifact || !item.codeArtifact || !item.dataArtifact)
    .map((item) => item.id)
  return finish('write', [
    check('manuscript', true, `${manuscript.length} characters`),
    check('number_refs', numberRefs.length >= 1, 'reference at least one ledger number as {{N-0001}}'),
    check('number_refs_known', missingNumbers.length === 0, `unknown number refs: ${missingNumbers.join(', ')}`),
    check('cite_refs', citeRefs.length >= 1, 'reference at least one source as [[src:S-0001]]'),
    check('cite_refs_known', missingSources.length === 0, `unknown source refs: ${missingSources.join(', ')}`),
    check('no_orphan_numbers', orphans.length === 0, orphans.map((item) => `${item.value} (…${item.context}…)`).join(' | ')),
    check('figure_provenance', figureProblems.length === 0, `figures need artifact + code + data: ${figureProblems.join(', ')}`),
  ], state)
}

export function gateReview(state, context = {}) {
  const reviews = state.reviews || []
  const adversarial = reviews.filter((item) => item.adversarial === true).length
  const rejected = reviews.filter((item) => item.verdict === 'reject')
  const blocking = []
  for (const review of reviews) {
    for (const issue of review.issues || []) {
      if (issue.severity === 'blocking' && issue.resolved !== true) {
        blocking.push(`${review.id}: ${issue.title || issue.detail || 'blocking issue'}`)
      }
    }
  }
  const proposed = (state.claims || []).filter((item) => item.status === 'proposed')
  const audits = Array.isArray(state.audits) ? state.audits : []
  const latestAudit = audits[audits.length - 1] || null
  const freshAudit = Boolean(latestAudit && latestAudit.subjectHash === auditSubjectHash(state))
  let signature = null
  if (latestAudit && typeof context.verifyAudit === 'function') {
    try {
      signature = context.verifyAudit(latestAudit)
    } catch (error) {
      signature = { ok: false, reason: (error && error.code) || 'signature_error', keyId: null }
    }
  }
  const signatureOk = Boolean(
    latestAudit && (signature ? signature.ok === true : typeof latestAudit.signature === 'string'),
  )
  return finish('review', [
    check(
      'automated_audit',
      Boolean(latestAudit && freshAudit && latestAudit.ok === true && signatureOk),
      latestAudit === null
        ? 'run the automated reviewer first (rsx_review action:"audit")'
        : !freshAudit
          ? 'the latest audit is stale — the ledger changed after it ran; run rsx_review action:"audit" again'
          : !signatureOk
            ? `audit ${latestAudit.id} is not signed by this installation (${signature ? signature.reason : 'unsigned'}) — run rsx_review action:"audit" again`
            : latestAudit.ok
              ? `audit ${latestAudit.id} passed`
              : `audit ${latestAudit.id} blocks: ${(latestAudit.blocking || []).join(', ')}`,
    ),
    check('two_reviews', reviews.length >= 2, `need 2 reviews, have ${reviews.length}`),
    check('adversarial_review', adversarial >= 1, 'at least one review must be adversarial (red team)'),
    check('no_reject', rejected.length === 0, `reviews reject the work: ${rejected.map((item) => item.id).join(', ')}`),
    check('no_blocking_issues', blocking.length === 0, blocking.join('; ')),
    check('claims_resolved', proposed.length === 0, `unresolved claims: ${proposed.map((item) => item.id).join(', ')}`),
  ], state)
}

export function gateRelease(state, context = {}) {
  const upstream = STAGE_ORDER.slice(0, -1).map((stage) => [stage, checkGate(state, stage, context)])
  const failing = upstream.filter(([, result]) => !result.ok).map(([stage]) => stage)
  const declaration = state.declaration || {}
  const contested = (state.claims || []).filter((item) => item.status === 'contested')
  const dualUse = state.world && state.world.safety ? state.world.safety.dual_use : undefined
  const integrity = context.integrity
  return finish('release', [
    check('upstream_gates', failing.length === 0, `failing upstream: ${failing.join(', ')}`),
    check('declaration', Boolean(declaration.ai === true && declaration.watermark === true), 'declare AI assistance and add a watermark'),
    check('declaration_model', str(declaration.model).length > 0, 'name the model / tool used'),
    check('declaration_reviewer', str(declaration.humanReviewer).length > 0, 'name the human reviewer'),
    check('dual_use', dualUse === 'pass', `record world.safety.dual_use = "pass" (current: ${dualUse || 'unset'})`),
    check('budget', budgetOverruns(state).length === 0, budgetOverruns(state).join('; ')),
    check('no_contested_claims', contested.length === 0, contested.map((item) => item.id).join(', ')),
    check(
      'chain_integrity',
      integrity
        ? integrity.chainOk === true &&
            (integrity.artifactProblems || []).length === 0 &&
            integrity.stateOk !== false
        : Boolean(state.lastHash),
      integrity === undefined
        ? (state.lastHash ? 'event chain recorded' : 'no events yet')
        : integrity.chainOk && (integrity.artifactProblems || []).length === 0 && integrity.stateOk !== false
          ? `hash chain, state.json and ${integrity.artifacts || 0} artifacts verified`
          : integrity.stateOk === false
            ? 'state.json stateHash mismatch'
            : integrity.chainOk
              ? `artifact problems: ${(integrity.artifactProblems || []).map((item) => `${item.id} ${item.problem}`).join(', ')}`
              : `event chain broken at seq ${integrity.brokenSeq}`,
    ),
  ], state)
}

function finish(stage, checks, state = null) {
  const all = state ? checks.concat(domainChecks(state, stage)) : checks
  const blocking = all.filter((item) => item.blocking && !item.ok).map((item) => item.code)
  return {
    stage,
    ok: blocking.length === 0,
    checks: all,
    blocking,
    passed: all.filter((item) => item.ok).length,
    total: all.length,
    ts: new Date().toISOString(),
  }
}

const RUNNERS = {
  scoping: gateScoping,
  survey: gateSurvey,
  hypothesis: gateHypothesis,
  design: gateDesign,
  execute: gateExecute,
  analyze: gateAnalyze,
  write: gateWrite,
  review: gateReview,
  release: gateRelease,
}

export function checkGate(state, stage, context = {}) {
  const runner = RUNNERS[stage]
  if (!runner) throw Object.assign(new Error(`unknown gate: ${stage}`), { code: 'invalid_input' })
  return runner(state, context)
}

export function checkAll(state, context = {}) {
  return STAGE_ORDER.map((stage) => checkGate(state, stage, context))
}
