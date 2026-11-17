import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

import { ResearchStore } from '../../lib/ledger.js'
import {
  createCampaign,
  manuscriptText,
  passAnalyze,
  passDesign,
  passExecute,
  passHypothesis,
  passRelease,
  passReview,
  passScoping,
  passSurvey,
  passWrite,
  makeService,
} from '../helpers.mjs'

test('full campaign: nine gates, two real blocks, release', () => {
  const { service, store, cleanup } = makeService()
  try {
    const id = createCampaign(service)

    assert.throws(
      () => service.gate(id, { action: 'advance' }),
      (error) => error.code === 'gate_blocked' && error.detail.blocking.includes('world_question'),
    )

    const scoping = passScoping(service, id)
    assert.equal(scoping.stage, 'survey')

    assert.throws(
      () => service.gate(id, { action: 'advance' }),
      (error) => error.code === 'gate_blocked' && error.detail.blocking.includes('min_sources'),
    )

    assert.equal(passSurvey(service, id).stage, 'hypothesis')
    assert.equal(passHypothesis(service, id).stage, 'design')
    assert.equal(passDesign(service, id).stage, 'execute')

    const executed = passExecute(service, id)
    assert.equal(executed.stage, 'analyze')

    const analyzed = passAnalyze(service, id, executed.main.id)
    assert.equal(analyzed.stage, 'write')

    assert.throws(
      () => service.gate(id, { action: 'advance' }),
      (error) => error.code === 'gate_blocked' && error.detail.blocking.includes('manuscript'),
    )

    assert.equal(passWrite(service, id, analyzed.number.id).stage, 'review')
    assert.equal(passReview(service, id).stage, 'release')

    const released = passRelease(service, id)
    assert.equal(released.released, true)
    assert.ok(store.get(id).releasedAt)

    const integrity = store.verify(id)
    assert.equal(integrity.chainOk, true)
    assert.equal(integrity.artifactProblems.length, 0)

    const report = service.report(id)
    assert.match(report.markdown, /## 0\. 状态/u)
    assert.match(report.markdown, /N-0001/u)
    assert.equal(report.integrity.chainOk, true)

    const exported = service.write(id, { action: 'export' })
    assert.ok(existsSync(exported.paths.report))
    assert.ok(existsSync(exported.paths.bundle))
    const zip = readFileSync(exported.paths.bundle)
    assert.equal(zip.readUInt32LE(0), 0x04034b50)
    assert.ok(zip.includes(Buffer.from('REPORT.md')))
  } finally {
    cleanup()
  }
})

test('manuscript gate rejects a hand-typed number', () => {
  const { service, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    passScoping(service, id)
    passSurvey(service, id)
    passHypothesis(service, id)
    passDesign(service, id)
    const executed = passExecute(service, id)
    service.numberAdd(id, { name: 'r', value: 0.4461, trace: `run:${executed.main.id}#pearson_r`, uncertainty: 'CI' })
    service.claimStatus(id, { claim: 'C-0001', status: 'supported' })
    service.claimStatus(id, { claim: 'C-0002', status: 'supported' })
    const handTyped = `${manuscriptText('N-0001').replace('{{N-0001}}', '0.4461')} ${'补充说明'.repeat(40)}`
    service.write(id, { action: 'manuscript', text: handTyped })
    const gate = service.gate(id, { action: 'check', stage: 'write' }).gate
    assert.equal(gate.ok, false)
    assert.ok(gate.blocking.includes('no_orphan_numbers'))
  } finally {
    cleanup()
  }
})

test('campaign list and selection survive a store restart', () => {
  const { service, dir, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const second = service.create({ title: 'second', question: '另一个研究问题足够长吗', tier: 'S' }).campaign.id
    service.select(id)
    assert.equal(service.state().current, id)
    assert.equal(service.campaigns().length, 2)

    const reopened = new ResearchStore({ dir }).init()
    assert.equal(reopened.current(), id)
    assert.equal(reopened.listCampaigns().length, 2)
    assert.equal(reopened.get(second).title, 'second')
    assert.equal(existsSync(`${dir}/index.json`), true)
  } finally {
    cleanup()
  }
})
