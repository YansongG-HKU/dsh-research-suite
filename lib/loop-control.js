/**
 * Host-loop checkpoint (0.11).
 *
 * `planNext` answers "what is the best next call"; this module answers "may the
 * host start another iteration at all?". It combines the deterministic plan
 * with the four preconditions the loop must check every time — ledger
 * integrity, stage budget, the current gate and the autonomy cycle budget — and
 * turns a recommendation that needs input, a human or an unmapped check into a
 * pause instead of letting the host guess.
 *
 * It is pure: no clock is read, no tool is executed and no state is written.
 * Persisting the pause belongs to the service, which can add the event-chain
 * record only after this function has said the ledger is trustworthy.
 */
import { budgetSummary } from './budget.js'
import { preregTiming } from './gates.js'
import { planNext } from './planner.js'
import { canon, sha256Hex } from './util.js'

export const LOOP_OUTCOMES = Object.freeze(['continue', 'pause', 'stop', 'ready'])
export const PAUSE_KINDS = Object.freeze(['needs_input', 'human_checkpoint', 'unmapped_gate'])
export const LOOP_STATES = Object.freeze(['idle', 'running', 'paused', 'ready', 'stopped'])

function str(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function arr(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []
}

function finite(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

/**
 * Defaults for campaigns created before the loop controller existed and
 * defensive normalisation for a hand-edited campaign. Never mutates state.
 */
export function normalizeLoopState(state) {
  const raw = state && state.loop && typeof state.loop === 'object' && !Array.isArray(state.loop) ? state.loop : {}
  const status = LOOP_STATES.includes(raw.status) ? raw.status : 'idle'
  return {
    status,
    pauseId: str(raw.pauseId) || null,
    pausedAt: str(raw.pausedAt) || null,
    lastCheckAt: str(raw.lastCheckAt) || null,
    lastStatus: LOOP_OUTCOMES.includes(raw.lastStatus) ? raw.lastStatus : null,
  }
}

export function loopPauses(state) {
  return arr(state && state.loopPauses)
}

export function openLoopPause(state) {
  return [...loopPauses(state)].reverse().find((item) => item.status === 'open') || null
}

export function nextLoopPauseId(state) {
  const max = loopPauses(state).reduce((acc, item) => {
    const match = /^LP-(\d+)$/u.exec(str(item.id))
    return match ? Math.max(acc, Number(match[1])) : acc
  }, 0)
  return `LP-${String(max + 1).padStart(4, '0')}`
}

export function planFingerprint(plan) {
  if (!plan || typeof plan !== 'object') return null
  return sha256Hex(canon(plan))
}

export function pauseKindFor(primary) {
  if (!primary || typeof primary !== 'object') return null
  if (primary.human === true) return 'human_checkpoint'
  if (primary.unmapped === true) return 'unmapped_gate'
  if (primary.needsInput === true) return 'needs_input'
  return null
}

function integrityProblems(integrity) {
  if (!integrity || typeof integrity !== 'object') return []
  const problems = []
  if (integrity.chainOk === false) problems.push(`event chain broken at seq ${integrity.brokenSeq ?? '?'}`)
  if (integrity.stateOk === false) problems.push('state.json stateHash mismatch')
  for (const item of arr(integrity.artifactProblems)) {
    problems.push(`artifact ${item.id || '?'} ${item.problem || 'problem'}`)
  }
  return problems
}

function blockingCodes(gate) {
  if (!gate || typeof gate !== 'object' || !Array.isArray(gate.blocking)) return []
  return gate.blocking.map((item) => str(item)).filter(Boolean)
}

/**
 * Check whether one more host iteration is allowed.
 *
 * Precedence follows `planNext`: integrity, pre-registration timing, budget,
 * a passing release gate, a terminal cycle decision and the cycle budget all
 * stop the loop before any pause classification happens. A pause is therefore
 * never used to bypass a stop.
 */
export function checkLoop(state, context = {}) {
  if (!state || typeof state !== 'object') {
    throw Object.assign(new Error('checkLoop requires a campaign state'), { code: 'invalid_input' })
  }
  const gate = context.gate && typeof context.gate === 'object' ? context.gate : null
  const integrity = context.integrity && typeof context.integrity === 'object' ? context.integrity : null
  const plan = planNext(state, { gate, integrity })
  const budget = budgetSummary(state)
  const timing = preregTiming(state)
  const cycles = arr(state.cycles)
  const policy = state.autonomy && typeof state.autonomy === 'object' ? state.autonomy : {}
  const maxCycles = finite(policy.maxCycles)
  const integrityIssues = integrityProblems(integrity)
  const blocking = blockingCodes(gate)
  const primary = plan.primary || null
  const kind = pauseKindFor(primary)
  const iteration = cycles.length + 1
  const checks = {
    integrity: {
      ok: integrityIssues.length === 0,
      chainOk: integrity ? integrity.chainOk === true : null,
      stateOk: integrity ? integrity.stateOk !== false : null,
      artifacts: integrity ? Number(integrity.artifacts) || 0 : 0,
      problems: integrityIssues,
    },
    budget: {
      ok: budget.overruns.length === 0,
      tier: budget.tier,
      ratio: Number(budget.ratio.toFixed(4)),
      tokensUsed: budget.tokensUsed,
      tokensLimit: budget.tokensLimit,
      secondsUsed: budget.secondsUsed,
      secondsLimit: budget.secondsLimit,
      overruns: budget.overruns,
    },
    prereg: {
      ok: timing.ok === true,
      detail: timing.detail,
    },
    gate: {
      ok: gate ? gate.ok === true : null,
      stage: str(gate && gate.stage) || str(state.stage) || 'scoping',
      blocking,
      passed: gate && Number.isFinite(Number(gate.passed)) ? Number(gate.passed) : null,
      total: gate && Number.isFinite(Number(gate.total)) ? Number(gate.total) : null,
    },
    cycles: {
      ok: !(maxCycles !== null && maxCycles > 0 && cycles.length >= maxCycles),
      used: cycles.length,
      max: maxCycles,
    },
  }
  const result = {
    stage: plan.stage,
    status: 'continue',
    reason: '',
    code: null,
    iteration,
    maxCycles,
    primary,
    steps: plan.steps,
    plan,
    planHash: planFingerprint(plan),
    pauseKind: kind,
    checks,
    stop: plan.stop,
  }

  if (plan.stop.blocked) {
    return { ...result, status: 'stop', code: plan.stop.code || 'stopped', reason: plan.stop.reason || 'the planner is blocked' }
  }
  if (plan.stop.ready) {
    return { ...result, status: 'ready', code: plan.stop.code || 'ready', reason: plan.stop.reason || 'all gates pass' }
  }
  if (!primary) {
    return { ...result, status: 'stop', code: 'no_action', reason: 'the planner has no primary action for the current state' }
  }
  if (kind) {
    const why = str(primary.why)
    const label = str(primary.label) || primary.tool
    const unblocks = Array.isArray(primary.unblocks) ? primary.unblocks.filter(Boolean).join(', ') : ''
    const detail =
      kind === 'human_checkpoint'
        ? `primary action "${label}" is a human checkpoint; a person must complete or approve it, the loop cannot sign it`
        : kind === 'unmapped_gate'
          ? `the planner has no specific recipe for ${unblocks || 'this check'}; inspect the gate instead of guessing a fix`
          : `primary action "${label}" contains input that the host must supply before it is run${why ? `: ${why}` : ''}`
    return { ...result, status: 'pause', code: kind, reason: detail }
  }
  return { ...result, reason: str(primary.why) || 'the primary action is deterministic and needs no human or placeholder input' }
}

