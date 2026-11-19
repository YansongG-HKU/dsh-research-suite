/**
 * Research program orchestration (0.8).
 *
 * The nine gates answer "may this stage advance?". This module answers a
 * different question: "does the campaign have a reviewable research program?"
 * It records the plan and its perspective coverage, an explicit autonomy
 * policy, the act→observe→decide cycle log, a hypothesis tournament, a rubric
 * evaluation, and a contradiction ledger.
 *
 * Everything here is local, deterministic and declarative. The suite does not
 * run searches, agents or models; it makes the programme those agents followed
 * auditable. An Elo rating is a bookkeeping device for recorded pairwise
 * judgements, not evidence that the winner is true.
 */
import { utcnow } from './util.js'

export const PLAN_PRIORITIES = Object.freeze(['high', 'medium', 'low'])
export const PLAN_STATUSES = Object.freeze(['open', 'active', 'answered', 'abandoned'])
export const CYCLE_DECISIONS = Object.freeze(['continue', 'revise', 'stop', 'escalate'])
export const CONTRADICTION_STATUSES = Object.freeze(['open', 'resolved', 'explained'])
export const QUALITY_MIN = 0.7
export const QUALITY_DIMENSIONS = Object.freeze([
  { id: 'factual_accuracy', label: '事实准确性' },
  { id: 'citation_accuracy', label: '引用准确性' },
  { id: 'completeness', label: '完整性' },
  { id: 'source_quality', label: '来源质量' },
  { id: 'tool_efficiency', label: '工具效率' },
  { id: 'limitations', label: '局限与风险' },
])

function str(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function arr(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []
}

function fail(message, detail) {
  const error = new Error(message)
  error.code = 'invalid_input'
  if (detail !== undefined) error.detail = detail
  throw error
}

function refs(value) {
  return Array.isArray(value) ? value.map((item) => str(item)).filter(Boolean) : []
}

function sourceIds(state) {
  return new Set(arr(state.sources).map((item) => item.id))
}

function check(code, ok, detail) {
  return { code, ok: ok === true, detail: detail || '' }
}

export function planQuestions(state) {
  return arr(state && state.plan && state.plan.questions)
}

export function perspectives(state) {
  return arr(state && state.perspectives)
}

export function autonomyPolicy(state) {
  return state && state.autonomy && typeof state.autonomy === 'object' ? state.autonomy : {}
}

export function cycles(state) {
  return arr(state && state.cycles)
}

export function tournamentMatches(state) {
  return arr(state && state.tournament && state.tournament.matches)
}

export function qualityRows(state) {
  return arr(state && state.quality && state.quality.rows)
}

export function contradictionRows(state) {
  return arr(state && state.contradictions)
}

export function planQuestionFrom(state, args = {}, id = '') {
  const question = str(args.question)
  if (question.length < 8) fail('a plan question needs at least 8 characters')
  const priority = PLAN_PRIORITIES.includes(args.priority) ? args.priority : 'medium'
  const status = PLAN_STATUSES.includes(args.status) ? args.status : 'open'
  const owner = str(args.owner) || 'lead'
  if (owner.length < 2) fail('plan question owner must be at least 2 characters')
  const known = sourceIds(state)
  const coverage = refs(args.coverage)
  const missing = coverage.filter((ref) => !known.has(ref))
  if (missing.length > 0) fail(`plan coverage refs do not resolve to sources: ${missing.join(', ')}`)
  return {
    id: str(args.id) || id || 'G-0001',
    question,
    priority,
    owner,
    status,
    coverage,
    note: str(args.note),
    createdAt: utcnow(),
  }
}

function nextPlanId(questions) {
  const max = questions.reduce((acc, item) => {
    const value = Number(String(item.id || '').replace(/^G-/u, ''))
    return Number.isFinite(value) ? Math.max(acc, value) : acc
  }, 0)
  return `G-${String(max + 1).padStart(4, '0')}`
}

export function applyPlan(state, args = {}) {
  const previous = state.plan && typeof state.plan === 'object' ? state.plan : { objective: '', questions: [] }
  const objective = args.objective !== undefined ? str(args.objective) : str(previous.objective)
  if (objective.length > 2000) fail('plan objective exceeds 2000 characters')
  let questions = arr(previous.questions)
  if (Array.isArray(args.questions)) {
    questions = args.questions.map((row, index) => {
      if (!row || typeof row !== 'object') fail(`plan question ${index + 1} must be an object`)
      return planQuestionFrom(state, row, str(row.id) || `G-${String(index + 1).padStart(4, '0')}`)
    })
  } else if (str(args.question)) {
    questions = questions.concat(planQuestionFrom(state, args, args.id || nextPlanId(questions)))
  }
  if (questions.length > 50) fail('a plan supports at most 50 questions')
  state.plan = { objective, questions, updatedAt: utcnow() }
  return state.plan
}

export function perspectiveFrom(state, args = {}, id = 'O-0001') {
  const name = str(args.name)
  if (name.length < 2) fail('a perspective needs a name of at least 2 characters')
  const stakeholder = str(args.stakeholder) || name
  const question = str(args.question)
  if (question.length < 8) fail('a perspective needs a question of at least 8 characters')
  const known = sourceIds(state)
  const sources = refs(args.sources)
  const missing = sources.filter((ref) => !known.has(ref))
  if (missing.length > 0) fail(`perspective sources do not resolve: ${missing.join(', ')}`)
  return {
    id,
    name,
    stakeholder,
    question,
    sources,
    note: str(args.note),
    at: utcnow(),
  }
}

export function autonomyFrom(state, args = {}) {
  const previous = autonomyPolicy(state)
  const maxCycles = args.maxCycles === undefined ? Number(previous.maxCycles || 3) : Number(args.maxCycles)
  if (!Number.isInteger(maxCycles) || maxCycles < 1 || maxCycles > 50) {
    fail('autonomy maxCycles must be an integer between 1 and 50')
  }
  const stopCriteria = args.stopCriteria !== undefined ? str(args.stopCriteria) : str(previous.stopCriteria)
  if (stopCriteria.length < 12) fail('autonomy stopCriteria must be at least 12 characters')
  const escalation = args.escalation !== undefined ? str(args.escalation) : str(previous.escalation)
  if (escalation.length < 8) fail('autonomy escalation must be at least 8 characters')
  const humanCheckpoints =
    args.humanCheckpoints !== undefined ? str(args.humanCheckpoints) : str(previous.humanCheckpoints)
  if (humanCheckpoints.length < 8) fail('autonomy humanCheckpoints must be at least 8 characters')
  return {
    maxCycles,
    stopCriteria,
    escalation,
    humanCheckpoints,
    owner: str(args.owner) || str(previous.owner) || 'lead',
    updatedAt: utcnow(),
  }
}

export function cycleFrom(state, args = {}, id = 'K-0001') {
  const policy = autonomyPolicy(state)
  if (!policy.maxCycles) fail('set the autonomy policy before logging cycles (action:"autonomy")')
  if (cycles(state).length >= Number(policy.maxCycles)) {
    fail(
      `autonomy maxCycles (${policy.maxCycles}) is exhausted; record a revision of the policy instead of silently exceeding it`,
    )
  }
  const goal = str(args.goal)
  const action = str(args.step) || str(args.actionText)
  const observation = str(args.observation)
  if (goal.length < 8) fail('a cycle needs a goal of at least 8 characters')
  if (action.length < 8) fail('a cycle needs an action of at least 8 characters')
  if (observation.length < 8) fail('a cycle needs an observation of at least 8 characters')
  const decision = str(args.decision)
  if (!CYCLE_DECISIONS.includes(decision)) fail(`cycle decision must be one of ${CYCLE_DECISIONS.join(', ')}`)
  const question = str(args.question)
  if (question && !planQuestions(state).some((item) => item.id === question)) {
    fail(`cycle question does not exist: ${question}`)
  }
  const run = str(args.run)
  if (run && !arr(state.runs).some((item) => item.id === run)) {
    fail(`cycle run does not exist: ${run}`)
  }
  return {
    id,
    goal,
    action,
    observation,
    decision,
    question,
    run,
    note: str(args.note),
    at: utcnow(),
  }
}

export function matchFrom(state, args = {}, id = 'T-0001') {
  const claims = arr(state.claims)
  const a = str(args.a)
  const b = str(args.b)
  for (const [label, idValue] of [
    ['a', a],
    ['b', b],
  ]) {
    if (!claims.some((item) => item.id === idValue)) fail(`tournament ${label} is not a claim: ${idValue}`)
  }
  if (a === b) fail('a tournament match needs two different claims')
  const pair = [a, b].map((claimId) => claims.find((item) => item.id === claimId))
  if (!pair.some((item) => item.kind === 'hypothesis')) {
    fail('a tournament match must include at least one claim of kind "hypothesis"')
  }
  const winner = str(args.winner)
  if (!['a', 'b', 'draw'].includes(winner)) fail('tournament winner must be "a", "b" or "draw"')
  const criterion = str(args.criterion)
  if (criterion.length < 4) fail('a tournament match needs a criterion of at least 4 characters')
  if (str(args.id) && str(args.id) !== id) {
    if (tournamentMatches(state).some((item) => item.id === str(args.id))) fail(`duplicate match id: ${args.id}`)
    id = str(args.id)
  }
  return {
    id,
    a,
    b,
    winner,
    criterion,
    note: str(args.note),
    at: utcnow(),
  }
}

/**
 * Elo over the recorded match order. K is fixed so the same ledger always
 * produces the same rating; a draw is half a win for both sides.
 */
export function rankClaims(state) {
  const claims = new Map(arr(state.claims).map((item) => [item.id, item]))
  const rows = new Map()
  const ensure = (id) => {
    if (!rows.has(id)) {
      rows.set(id, { id, statement: claims.get(id)?.statement || '', kind: claims.get(id)?.kind || '', rating: 1000, wins: 0, losses: 0, draws: 0, matches: 0 })
    }
    return rows.get(id)
  }
  for (const match of tournamentMatches(state)) {
    if (!claims.has(match.a) || !claims.has(match.b)) continue
    const left = ensure(match.a)
    const right = ensure(match.b)
    const expected = 1 / (1 + 10 ** ((right.rating - left.rating) / 400))
    const leftScore = match.winner === 'a' ? 1 : match.winner === 'b' ? 0 : 0.5
    const rightScore = 1 - leftScore
    left.rating += 32 * (leftScore - expected)
    right.rating += 32 * (rightScore - (1 - expected))
    if (match.winner === 'a') {
      left.wins += 1
      right.losses += 1
    } else if (match.winner === 'b') {
      right.wins += 1
      left.losses += 1
    } else {
      left.draws += 1
      right.draws += 1
    }
    left.matches += 1
    right.matches += 1
  }
  const ordered = [...rows.values()]
    .map((row) => ({ ...row, rating: Number(row.rating.toFixed(1)) }))
    .sort((left, right) => right.rating - left.rating || left.id.localeCompare(right.id))
    .map((row, index) => ({ ...row, rank: index + 1 }))
  return {
    ratings: ordered,
    leader: ordered[0] || null,
    matches: tournamentMatches(state).length,
  }
}

export function qualityFrom(state, args = {}, id = 'Y-0001') {
  const reviewer = str(args.reviewer)
  if (reviewer.length < 2) fail('a quality review needs a reviewer of at least 2 characters')
  const raw = args.scores && typeof args.scores === 'object' ? args.scores : {}
  const scores = {}
  const missing = []
  for (const dimension of QUALITY_DIMENSIONS) {
    if (!(dimension.id in raw)) {
      missing.push(dimension.id)
      continue
    }
    const value = Number(raw[dimension.id])
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      fail(`quality score ${dimension.id} must be between 0 and 1`)
    }
    scores[dimension.id] = Number(value.toFixed(3))
  }
  if (missing.length > 0) fail(`quality rubric is missing dimensions: ${missing.join(', ')}`)
  const values = Object.values(scores)
  const overall = Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3))
  const minimum = Math.min(...values)
  return {
    id,
    reviewer,
    scope: str(args.scope) || 'full research package',
    scores,
    minimum,
    overall,
    notes: str(args.notes),
    at: utcnow(),
  }
}

export function contradictionFrom(state, args = {}, id = 'D-0001') {
  const claims = arr(state.claims)
  const claim = str(args.claim)
  if (!claims.some((item) => item.id === claim)) fail(`contradiction claim does not exist: ${claim}`)
  const evidenceA = str(args.evidenceA)
  const evidenceB = str(args.evidenceB)
  if (!evidenceA || !evidenceB) fail('a contradiction needs evidenceA and evidenceB')
  if (evidenceA === evidenceB) fail('a contradiction needs two different evidence refs')
  const resolve = (ref) => {
    if (/^E-\d{4}$/u.test(ref)) return arr(state.evidence).some((item) => item.id === ref)
    if (/^S-\d{4}$/u.test(ref)) return arr(state.sources).some((item) => item.id === ref)
    if (/^R-[0-9a-f]{10}$/u.test(ref)) return arr(state.runs).some((item) => item.id === ref)
    if (/^sha256:[0-9a-f]{64}$/u.test(ref)) return arr(state.artifacts).some((item) => item.id === ref)
    return false
  }
  const missing = [evidenceA, evidenceB].filter((ref) => !resolve(ref))
  if (missing.length > 0) fail(`contradiction evidence refs do not resolve: ${missing.join(', ')}`)
  const status = str(args.status) || str(args.resolutionStatus) || 'open'
  if (!CONTRADICTION_STATUSES.includes(status)) {
    fail(`contradiction status must be one of ${CONTRADICTION_STATUSES.join(', ')}`)
  }
  const resolution = str(args.resolution)
  if (status !== 'open' && resolution.length < 12) {
    fail('a resolved/explained contradiction needs a resolution of at least 12 characters')
  }
  return {
    id,
    claim,
    evidenceA,
    evidenceB,
    status,
    resolution,
    note: str(args.note),
    at: utcnow(),
  }
}

/**
 * The programme-level completeness contract. Each check is independent so the
 * review gate can name exactly what is missing instead of returning one opaque
 * "incomplete" flag.
 */
export function programChecks(state) {
  const plan = state && state.plan && typeof state.plan === 'object' ? state.plan : {}
  const questions = planQuestions(state).filter((item) => item.status !== 'abandoned')
  const mustCover = questions.filter((item) => item.priority !== 'low')
  const knownSources = sourceIds(state)
  const uncovered = mustCover.filter(
    (item) => !Array.isArray(item.coverage) || item.coverage.length === 0 || item.coverage.some((ref) => !knownSources.has(ref)),
  )
  const views = perspectives(state)
  const noSources = views.filter(
    (item) => !Array.isArray(item.sources) || item.sources.length === 0 || item.sources.some((ref) => !knownSources.has(ref)),
  )
  const policy = autonomyPolicy(state)
  const policyOk =
    Number.isInteger(Number(policy.maxCycles)) &&
    Number(policy.maxCycles) >= 1 &&
    str(policy.stopCriteria).length >= 12 &&
    str(policy.escalation).length >= 8 &&
    str(policy.humanCheckpoints).length >= 8
  const claims = arr(state.claims)
  const hypotheses = claims.filter((item) => item.kind === 'hypothesis')
  const matches = tournamentMatches(state)
  const quality = qualityRows(state)
  const latestQuality = quality[quality.length - 1] || null
  const qualityOk =
    Boolean(latestQuality) &&
    Number(latestQuality.overall) >= QUALITY_MIN &&
    QUALITY_DIMENSIONS.every((dimension) => Number.isFinite(Number(latestQuality.scores?.[dimension.id])))
  const openContradictions = contradictionRows(state).filter((item) => item.status === 'open')
  const checks = [
    check('plan_objective', str(plan.objective).length >= 12, 'record a plan objective of at least 12 characters'),
    check('plan_questions', questions.length >= 2, `record at least 2 plan questions, have ${questions.length}`),
    check(
      'plan_coverage',
      uncovered.length === 0,
      uncovered.length === 0
        ? 'every high/medium plan question has a resolving source coverage ref'
        : `uncovered plan questions: ${uncovered.map((item) => item.id).join(', ')}`,
    ),
    check('perspectives', views.length >= 2, `record at least 2 perspectives, have ${views.length}`),
    check(
      'perspective_sources',
      noSources.length === 0,
      noSources.length === 0 ? 'every perspective has resolving sources' : `perspectives without sources: ${noSources.map((item) => item.id).join(', ')}`,
    ),
    check('autonomy_policy', policyOk, 'autonomy needs maxCycles, stopCriteria, escalation and humanCheckpoints'),
    check('cycle_log', cycles(state).length >= 1, 'log at least one act→observe→decide cycle'),
    check(
      'hypothesis_competition',
      hypotheses.length >= 1 && claims.length >= 2 && matches.length >= 1,
      `need a hypothesis, a competing claim and a recorded match (hypotheses ${hypotheses.length}, claims ${claims.length}, matches ${matches.length})`,
    ),
    check(
      'quality_rubric',
      qualityOk,
      latestQuality
        ? `latest rubric overall ${latestQuality.overall} (minimum ${QUALITY_MIN}, all six dimensions required)`
        : 'record a rubric evaluation with all six dimensions',
    ),
    check(
      'contradictions_resolved',
      openContradictions.length === 0,
      openContradictions.length === 0 ? 'no open contradictions' : `open contradictions: ${openContradictions.map((item) => item.id).join(', ')}`,
    ),
  ]
  return checks
}

export function programComplete(state) {
  const checks = programChecks(state)
  const missing = checks.filter((item) => !item.ok).map((item) => item.code)
  return { ok: missing.length === 0, checks, missing }
}

export function programSummary(state) {
  const ranking = rankClaims(state)
  const quality = qualityRows(state)
  return {
    planQuestions: planQuestions(state).length,
    perspectives: perspectives(state).length,
    autonomy: autonomyPolicy(state),
    cycles: cycles(state).length,
    matches: tournamentMatches(state).length,
    qualityRows: quality.length,
    latestQuality: quality[quality.length - 1] || null,
    contradictions: contradictionRows(state).length,
    openContradictions: contradictionRows(state).filter((item) => item.status === 'open').length,
    leader: ranking.leader,
    complete: programComplete(state),
  }
}

function esc(value) {
  return String(value ?? '').replace(/\|/gu, '\\|')
}

function table(headers, rows) {
  const lines = ['| ' + headers.join(' | ') + ' |', '| ' + headers.map(() => '---').join(' | ') + ' |']
  for (const row of rows) lines.push('| ' + row.map((cell) => esc(cell)).join(' | ') + ' |')
  return lines
}

export function renderProgramMarkdown(state) {
  const plan = state.plan && typeof state.plan === 'object' ? state.plan : {}
  const ranking = rankClaims(state)
  const quality = qualityRows(state)
  const contradictions = contradictionRows(state)
  const policy = autonomyPolicy(state)
  const lines = ['# 研究程序', '', '> 本文件记录多智能体科研程序的可审计结构：计划、视角、自治策略、假设锦标赛、质量评分与矛盾台账。评级是记录下来的两两判断，不是真值证明。', '']
  lines.push('## 1. 研究计划', '', plan.objective ? `目标：${plan.objective}` : '目标：未填写', '')
  if (planQuestions(state).length) {
    lines.push(...table(['ID', '问题', '优先级', '负责人', '状态', '证据覆盖'], planQuestions(state).map((item) => [item.id, item.question, item.priority, item.owner, item.status, (item.coverage || []).join(', ') || '—'])), '')
  } else lines.push('（尚未登记计划问题）', '')
  lines.push('## 2. 视角覆盖', '')
  if (perspectives(state).length) {
    lines.push(...table(['ID', '视角', '利益相关方', '问题', '来源'], perspectives(state).map((item) => [item.id, item.name, item.stakeholder, item.question, (item.sources || []).join(', ') || '—'])), '')
  } else lines.push('（尚未登记视角）', '')
  lines.push('## 3. 自治策略', '', ...table(['字段', '值'], [
    ['maxCycles', policy.maxCycles || '—'],
    ['停止条件', policy.stopCriteria || '—'],
    ['升级条件', policy.escalation || '—'],
    ['人类检查点', policy.humanCheckpoints || '—'],
    ['负责人', policy.owner || '—'],
  ]), '')
  lines.push('## 4. 假设锦标赛', '')
  if (ranking.ratings.length) {
    lines.push(...table(['排名', '断言', 'Elo', '胜/负/平', '场次'], ranking.ratings.map((row) => [row.rank, `${row.id} ${row.statement}`, row.rating, `${row.wins}/${row.losses}/${row.draws}`, row.matches])), '')
  } else lines.push('（尚未记录比赛）', '')
  lines.push('## 5. 质量评分', '')
  if (quality.length) {
    lines.push(...table(['ID', '评审人', ...QUALITY_DIMENSIONS.map((item) => item.label), '总分'], quality.map((row) => [row.id, row.reviewer, ...QUALITY_DIMENSIONS.map((item) => row.scores?.[item.id] ?? '—'), row.overall])), '')
  } else lines.push('（尚未评分）', '')
  lines.push('## 6. 矛盾台账', '')
  if (contradictions.length) {
    lines.push(...table(['ID', '断言', '证据 A', '证据 B', '状态', '处置'], contradictions.map((row) => [row.id, row.claim, row.evidenceA, row.evidenceB, row.status, row.resolution || '—'])), '')
  } else lines.push('（尚未登记矛盾）', '')
  lines.push('## 7. 行动循环', '')
  if (cycles(state).length) {
    lines.push(...table(['ID', '目标', '行动', '观察', '决定', '问题/运行'], cycles(state).map((row) => [row.id, row.goal, row.action, row.observation, row.decision, [row.question, row.run].filter(Boolean).join(' / ') || '—'])), '')
  } else lines.push('（尚未记录循环）', '')
  const complete = programComplete(state)
  lines.push('## 8. 程序完整性', '', complete.ok ? '全部程序检查通过。' : `未通过：${complete.missing.join(', ')}`, '')
  return lines.join('\n')
}
