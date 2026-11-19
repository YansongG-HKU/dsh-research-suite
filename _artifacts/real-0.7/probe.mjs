#!/usr/bin/env node
/**
 * Real 0.7 acceptance probe: does a schema-3 gate actually block when the new
 * protocol records are missing, and does it pass when they are present?
 *
 * This runs the plugin's own service and pure gate functions in isolated temp
 * stores. It does not call the model and does not fabricate metrics: the JSON
 * printed here is the measured outcome of those calls.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { checkGate } from '../../workspace/dsh-research-suite/lib/gates.js'
import { ResearchStore } from '../../workspace/dsh-research-suite/lib/ledger.js'
import { ResearchService } from '../../workspace/dsh-research-suite/lib/service.js'
import { resolveConfig } from '../../workspace/dsh-research-suite/lib/config.js'
import {
  addSources,
  createCampaign,
  passDesign,
  passExecute,
  passHypothesis,
  passScoping,
} from '../../workspace/dsh-research-suite/test/helpers.mjs'

const negativeOnly = process.argv.includes('--negative')

function tempService() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-rs-0.7-probe-'))
  const store = new ResearchStore({ dir }).init()
  const service = new ResearchService({ store, config: resolveConfig({}), log: { info() {}, warn() {} } })
  return { dir, store, service }
}

function withProbe(name, fn) {
  const { dir, store, service } = tempService()
  try {
    return fn({ dir, store, service })
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* Windows may hold a handle briefly */
    }
  }
}

function prepareSurvey(service) {
  const id = createCampaign(service)
  passScoping(service, id)
  addSources(service, id, 8)
  service.world(service.store.get(id).id, { action: 'set', kind: 'coverage', key: 'in-vitro', value: 'probe coverage A' })
  service.world(id, { action: 'set', kind: 'coverage', key: 'in-vivo', value: 'probe coverage B' })
  return id
}

function missingSearch() {
  return withProbe('missing-search', ({ service }) => {
    const id = prepareSurvey(service)
    const gate = checkGate(service.store.get(id), 'survey')
    return {
      blocked: gate.blocking.includes('search_protocol'),
      blocking: gate.blocking,
    }
  })
}

function withSearch() {
  return withProbe('with-search', ({ service }) => {
    const id = prepareSurvey(service)
    service.search(id, {
      disconfirming: true,
      query: 'schema three gate null result',
      database: 'local-probe',
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      hits: 5,
      screened: 5,
      included: 4,
    })
    const gate = checkGate(service.store.get(id), 'survey')
    return {
      blocked: gate.blocking.includes('search_protocol'),
      blocking: gate.blocking,
    }
  })
}

function prepareAnalyze(service) {
  const id = prepareSurvey(service)
  service.search(id, {
    disconfirming: true,
    query: 'schema three gate null result',
    database: 'local-probe',
    dateFrom: '2026-01-01',
    dateTo: '2026-12-31',
    hits: 5,
    screened: 5,
    included: 4,
  })
  service.gate(id, { action: 'advance' })
  passHypothesis(service, id)
  passDesign(service, id)
  const executed = passExecute(service, id)
  service.numberAdd(id, {
    name: 'Pearson r',
    value: 0.4461,
    unit: 'r',
    uncertainty: 'deterministic fixture value',
    trace: `run:${executed.main.id}#pearson_r`,
  })
  service.claimStatus(id, { claim: 'C-0001', status: 'supported' })
  service.claimStatus(id, { claim: 'C-0002', status: 'supported' })
  return { id, runId: executed.main.id }
}

function missingSensitivity() {
  return withProbe('missing-sensitivity', ({ service }) => {
    const { id } = prepareAnalyze(service)
    const gate = checkGate(service.store.get(id), 'analyze')
    return {
      blocked: gate.blocking.includes('sensitivity'),
      blocking: gate.blocking,
    }
  })
}

function withSensitivity() {
  return withProbe('with-sensitivity', ({ service }) => {
    const { id, runId } = prepareAnalyze(service)
    service.sensitivityAdd(id, {
      claim: 'C-0001',
      name: 'schema one negative control',
      method: 'negative-control',
      specification: '把同一缺失检索的 state 标为早期 schema 后重跑 gate。',
      result: '同一缺失在早期 schema 上不阻断，说明差异来自版本化契约。',
      direction: 'consistent',
      trace: `run:${runId}#pearson_r`,
    })
    const gate = checkGate(service.store.get(id), 'analyze')
    return {
      blocked: gate.blocking.includes('sensitivity'),
      blocking: gate.blocking,
    }
  })
}

function legacyNegativeControl() {
  return withProbe('legacy-negative', ({ service }) => {
    const id = prepareSurvey(service)
    const state = service.store.get(id)
    state.schema = 1
    state.search = { disconfirming: true, query: 'legacy null search', at: new Date().toISOString() }
    state.searchLog = []
    const gate = checkGate(state, 'survey')
    return {
      blocked: gate.blocking.includes('search_protocol'),
      blocking: gate.blocking,
    }
  })
}

if (negativeOnly) {
  const result = legacyNegativeControl()
  console.log(
    JSON.stringify(
      {
        seed: 7,
        mode: 'negative',
        legacy_missing_search_blocked: result.blocked ? 1 : 0,
        blocked: result.blocked,
        note: '早期 schema 的同一缺失检索不阻断 survey（版本化契约的负对照）。',
      },
      null,
      2,
    ),
  )
} else {
  const cases = {
    missing_search: missingSearch(),
    with_search: withSearch(),
    missing_sensitivity: missingSensitivity(),
    with_sensitivity: withSensitivity(),
    legacy_negative: legacyNegativeControl(),
  }
  const metrics = {
    missing_search_blocked: cases.missing_search.blocked ? 1 : 0,
    with_search_passed: cases.with_search.blocked ? 0 : 1,
    missing_sensitivity_blocked: cases.missing_sensitivity.blocked ? 1 : 0,
    with_sensitivity_passed: cases.with_sensitivity.blocked ? 0 : 1,
    legacy_missing_search_blocked: cases.legacy_negative.blocked ? 1 : 0,
    probe_cases: Object.keys(cases).length,
  }
  console.log(
    JSON.stringify(
      {
        seed: 7,
        mode: 'main',
        metrics,
        blocked_cases:
          metrics.missing_search_blocked +
          metrics.missing_sensitivity_blocked +
          (metrics.with_search_passed ? 0 : 1) +
          (metrics.with_sensitivity_passed ? 0 : 1),
        cases,
        notes: {
          missing_search: '缺少检索协议时 survey 闸门阻断',
          with_search: '补齐检索协议后 survey 闸门放行',
          missing_sensitivity: '缺少敏感性记录时 analyze 闸门阻断',
          with_sensitivity: '补齐敏感性记录后 analyze 闸门放行',
          legacy_negative: '早期 schema 项目上同一缺失不阻断，只作为 advisory',
        },
      },
      null,
      2,
    ),
  )
}
