import assert from 'node:assert/strict'
import test from 'node:test'

import { budgetOverruns, budgetSummary, chargeBudget, initBudget } from '../../lib/budget.js'
import { getTemplate, listTemplates, fillTemplate, placeholdersOf, TEMPLATES } from '../../lib/templates.js'

test('template library: ten task presets and three method protocols', () => {
  assert.equal(TEMPLATES.length, 13)
  assert.equal(listTemplates({ kind: 'task' }).length, 10)
  assert.equal(listTemplates({ kind: 'method' }).length, 3)
  assert.equal(listTemplates({ kind: 'nope' }).length, 0)
  for (const template of TEMPLATES) {
    assert.match(template.id, /^[a-z0-9-]+$/u)
    assert.ok(template.title.zh && template.title.en)
    assert.ok(template.summary.zh && template.summary.en)
    assert.ok(template.prompt.zh && template.prompt.en)
    assert.ok(['S', 'M', 'L', 'XL'].includes(template.tier))
    assert.ok(Array.isArray(template.stages) && template.stages.length > 0)
    assert.ok(Array.isArray(template.deliverables) && template.deliverables.length > 0)
  }
  assert.equal(getTemplate('lit-review').id, 'lit-review')
  assert.equal(getTemplate('missing'), null)
})

test('template prompts fill a placeholder and leave it explicit when empty', () => {
  const template = getTemplate('ml-pipeline')
  const placeholders = placeholdersOf(template)
  assert.ok(placeholders.length > 0, 'every prompt should declare at least one placeholder')
  const key = placeholders[0]
  const prompt = fillTemplate(template.prompt.zh, { [key]: '小鼠睡眠分期' })
  assert.match(prompt, /小鼠睡眠分期/u)
  assert.doesNotMatch(prompt, new RegExp(`\\[${key.toUpperCase()}\\]`, 'u'))
  const empty = fillTemplate(template.prompt.zh, {})
  assert.match(empty, new RegExp(`\\[${key.toUpperCase()}\\]`, 'u'))
})

test('budget: tier allocation, charging and overrun reporting', () => {
  const budget = initBudget('S')
  assert.equal(budget.tier, 'S')
  assert.equal(budget.agents, 1)
  const total = Object.values(budget.stages).reduce((sum, row) => sum + row.tokensLimit, 0)
  assert.ok(Math.abs(total - 60000) <= 12, `allocation should total 60k, got ${total}`)
  const state = { tier: 'S', budget }
  chargeBudget(state, 'execute', { tokens: 1000, seconds: 30 })
  assert.equal(state.budget.stages.execute.tokensUsed, 1000)
  assert.equal(state.budget.stages.execute.secondsUsed, 30)
  assert.deepEqual(budgetOverruns(state), [])
  chargeBudget(state, 'execute', { tokens: 100000, seconds: 999999 })
  const overruns = budgetOverruns(state)
  assert.equal(overruns.length, 2)
  const summary = budgetSummary(state)
  assert.equal(summary.tokensUsed, 101000)
  assert.ok(summary.ratio > 1)
  assert.equal(summary.overruns.length, 2)
  assert.throws(() => chargeBudget(state, 'nope', { tokens: 1 }), /unknown stage/u)
})
