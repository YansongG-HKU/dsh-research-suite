/** Effort tiers and per-stage budget accounting. */
import { STAGE_ORDER, STAGE_SHARE, TIERS } from './config.js'

export function initBudget(tier = 'M') {
  const spec = TIERS[tier] || TIERS.M
  const stages = {}
  for (const stage of STAGE_ORDER) {
    stages[stage] = {
      tokensLimit: Math.round(spec.tokens * STAGE_SHARE[stage]),
      secondsLimit: Math.round(spec.seconds * STAGE_SHARE[stage]),
      tokensUsed: 0,
      secondsUsed: 0,
    }
  }
  return { tier: TIERS[tier] ? tier : 'M', agents: spec.agents, stages }
}

export function chargeBudget(state, stage, { tokens = 0, seconds = 0 } = {}) {
  if (!state.budget || !state.budget.stages) state.budget = initBudget(state.tier)
  const row = state.budget.stages[stage]
  if (!row) throw Object.assign(new Error(`unknown stage: ${stage}`), { code: 'invalid_stage' })
  row.tokensUsed += Math.max(0, Math.trunc(tokens))
  row.secondsUsed += Math.max(0, Math.trunc(seconds))
  return row
}

export function budgetOverruns(state) {
  const budget = state.budget || initBudget(state.tier)
  const out = []
  for (const stage of STAGE_ORDER) {
    const row = budget.stages[stage]
    if (!row) continue
    if (row.tokensUsed > row.tokensLimit) out.push(`${stage} tokens ${row.tokensUsed} > ${row.tokensLimit}`)
    if (row.secondsUsed > row.secondsLimit) out.push(`${stage} seconds ${row.secondsUsed} > ${row.secondsLimit}`)
  }
  return out
}

export function budgetSummary(state) {
  const budget = state.budget || initBudget(state.tier)
  let tokensLimit = 0
  let tokensUsed = 0
  let secondsLimit = 0
  let secondsUsed = 0
  for (const stage of STAGE_ORDER) {
    const row = budget.stages[stage]
    if (!row) continue
    tokensLimit += row.tokensLimit
    tokensUsed += row.tokensUsed
    secondsLimit += row.secondsLimit
    secondsUsed += row.secondsUsed
  }
  return {
    tier: budget.tier,
    agents: budget.agents,
    tokensLimit,
    tokensUsed,
    secondsLimit,
    secondsUsed,
    ratio: tokensLimit > 0 ? tokensUsed / tokensLimit : 0,
    stages: budget.stages,
    overruns: budgetOverruns(state),
  }
}
