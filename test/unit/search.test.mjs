import assert from 'node:assert/strict'
import test from 'node:test'

import { checkGate } from '../../lib/gates.js'
import { searchProtocol } from '../../lib/search.js'
import { addSources, createCampaign, makeService, passScoping, passSurvey } from '../helpers.mjs'

test('a schema-3 search log records database, query and screening counts', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const entry = service.searchLog(id, {
      searchKind: 'database',
      database: 'PubMed',
      query: 'enzyme temperature kinetics',
      dateFrom: '2015-01-01',
      dateTo: '2025-12-31',
      hits: 120,
      screened: 40,
      included: 8,
    }).searchLog
    assert.equal(entry.id, 'Q-0001')
    assert.equal(entry.kind, 'database')
    assert.equal(entry.hits, 120)
    assert.equal(entry.screened, 40)
    assert.equal(entry.included, 8)
    const state = service.store.get(id)
    assert.equal(state.searchLog.length, 1)
    assert.equal(searchProtocol(state).ok, true)
  } finally {
    cleanup()
  }
})

test('search counts must be monotonic and non-negative', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    assert.throws(
      () => service.searchLog(id, { query: 'enzyme temperature', hits: 10, screened: 20, included: 2 }),
      (error) => error.code === 'invalid_input',
    )
    assert.throws(
      () => service.searchLog(id, { query: 'enzyme temperature', hits: 10, screened: 5, included: -1 }),
      (error) => error.code === 'invalid_input',
    )
    assert.equal(service.store.get(id).searchLog.length, 0)
    const entry = service.searchLog(id, { disconfirming: true, query: 'null result search' }).searchLog
    assert.equal(entry.kind, 'disconfirming')
    assert.equal(service.store.get(id).search.disconfirming, true)
  } finally {
    cleanup()
  }
})

test('audit flags a schema-3 campaign with no search protocol', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const audit = service.audit(id, { record: false }).audit
    assert.ok(audit.findings.some((row) => row.code === 'search_protocol_missing' && row.severity === 'major'))
  } finally {
    cleanup()
  }
})

test('a legacy disconfirming search is still visible as a Q-legacy protocol row', () => {
  const legacy = searchProtocol({ search: { disconfirming: true, query: 'null result search' } })
  assert.equal(legacy.ok, true)
  assert.equal(legacy.entries[0].id, 'Q-legacy')
  assert.equal(legacy.entries[0].legacy, true)
})

test('the survey gate blocks a schema-3 campaign with no search protocol and passes after a log', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    passScoping(service, id)
    addSources(service, id, 8)
    service.world(id, { action: 'set', kind: 'coverage', key: 'in-vitro', value: 'covered' })
    service.world(id, { action: 'set', kind: 'coverage', key: 'in-vivo', value: 'out of scope' })
    const state = service.store.get(id)
    state.search = {}
    state.searchLog = []
    const blocked = checkGate(state, 'survey')
    assert.ok(blocked.blocking.includes('search_protocol'), JSON.stringify(blocked.blocking))
    assert.equal(passSurvey(service, id).stage, 'hypothesis')
    assert.equal(checkGate(service.store.get(id), 'survey').ok, true)
  } finally {
    cleanup()
  }
})
