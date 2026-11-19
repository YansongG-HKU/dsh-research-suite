#!/usr/bin/env node
/**
 * Exercise the real rsx_campaign action:"next" handler through the tool layer
 * on a throwaway store. This is a planner/control-path acceptance, not a live
 * research run: it proves the primary recommendation changes with the gate and
 * that reading the plan does not write to the ledger.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ResearchStore } from '../../workspace/dsh-research-suite/lib/ledger.js'
import { ResearchService } from '../../workspace/dsh-research-suite/lib/service.js'
import { createTools } from '../../workspace/dsh-research-suite/lib/tools.js'
import { resolveConfig } from '../../workspace/dsh-research-suite/lib/config.js'

const here = dirname(fileURLToPath(import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'rs-0.10-next-'))
const store = new ResearchStore({ dir }).init()
const service = new ResearchService({ store, config: resolveConfig({}), log: { info() {}, warn() {} } })
const tools = createTools({ service })
const campaign = tools.find((item) => item.name === 'rsx_campaign')
const gate = tools.find((item) => item.name === 'rsx_gate')
assert.ok(campaign && gate, 'rsx_campaign and rsx_gate must be registered')

const created = await campaign.execute({
  action: 'create',
  title: '0.10 规划器工具层验收',
  question: '确定性下一步规划器能否随闸门变化给出可执行的单一主推荐？',
  scope: '仅本地临时数据；不访问外部服务，不写真实项目。',
  success: '三个阶段的 next 输出符合预期，且读取计划不增加事件。',
  tier: 'S',
})
assert.equal(created.ok, true)
const id = created.campaign.id

const steps = []
const eventCount = () => store.verify(id).events

const first = await campaign.execute({ action: 'next', campaign: id })
assert.equal(first.ok, true)
assert.equal(first.plan.primary.tool, 'rsx_campaign')
assert.equal(first.plan.primary.args.action, 'world')
assert.equal(first.plan.primary.unblocks.includes('world_question'), true)
steps.push({ phase: 'fresh', stage: first.plan.stage, primary: first.plan.primary, blocking: first.plan.blocking })

const beforeRead = eventCount()
await campaign.execute({ action: 'next', campaign: id })
const afterRead = eventCount()
assert.equal(afterRead, beforeRead, 'next must be read-only')

const world = await campaign.execute({
  action: 'world',
  campaign: id,
  kind: 'question',
  key: 'main',
  value: '确定性下一步规划器能否随闸门变化给出可执行的单一主推荐？',
})
assert.equal(world.ok, true)
await gate.execute({ action: 'advance', campaign: id })
const survey = await campaign.execute({ action: 'next', campaign: id })
assert.equal(survey.plan.stage, 'survey')
assert.equal(survey.plan.primary.tool, 'rsx_search')
assert.equal(survey.plan.primary.args.provider, 'both')
assert.equal(survey.plan.stop.blocked, false)
steps.push({ phase: 'survey', stage: survey.plan.stage, primary: survey.plan.primary, blocking: survey.plan.blocking })

const payload = {
  ok: true,
  generatedAt: new Date().toISOString(),
  tool: 'rsx_campaign',
  action: 'next',
  campaign: id,
  readOnly: true,
  eventsBeforeAfterRead: [beforeRead, afterRead],
  eventsAfterWorldAdvance: eventCount(),
  steps,
  note: 'The host still executes the recommended tool call; next never runs a search, records a cycle or approves a gate.',
}
writeFileSync(join(here, 'tool-planner.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(payload, null, 2))
try {
  rmSync(dir, { recursive: true, force: true })
} catch {
  /* Windows may hold a handle briefly */
}


