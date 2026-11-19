#!/usr/bin/env node
/**
 * Cross-domain RSI suite.
 *
 * Runs one general campaign and one campaign per domain profile through the
 * same nine gates, then reports score / level / readiness. The point is not a
 * bigger number: it is that a domain profile can actually reach release with
 * its protocol, role reviews and monitoring filled in, and that a failure is
 * reported as a named gap rather than hidden behind a general fixture.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { domainValueDefaults, getDomain } from '../lib/domains.js'
import { evaluateLoop } from '../lib/loop.js'
import { resolveConfig } from '../lib/config.js'
import { ResearchStore } from '../lib/ledger.js'
import { ResearchService } from '../lib/service.js'
import {
  createCampaign,
  passAnalyze,
  passDesign,
  passExecute,
  passHypothesis,
  passRelease,
  passReview,
  passScoping,
  passStewardship,
  passSurvey,
  passWrite,
  seedProgram,
} from '../test/helpers.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT_DIR = join(ROOT, '_artifacts')
const DOMAINS = ['finance', 'ai', 'medicine', 'industrial']

function tempService() {
  const dir = join(ROOT, '_artifacts', `.rsi-suite-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const store = new ResearchStore({ dir }).init()
  const service = new ResearchService({ store, config: resolveConfig({}), log: { info() {}, warn() {} } })
  return { dir, store, service }
}

function fullDomainCampaign(service, domainId) {
  const profile = getDomain(domainId)
  if (!profile) throw new Error(`unknown domain: ${domainId}`)
  const created = service.create({
    title: `${profile.title.zh} · 跨领域 RSI 夹具`,
    question: '领域协议下的主效应是否在预注册的样本与口径中成立？',
    scope: '只覆盖夹具定义的样本、口径与测量系统，不外推到其他地区或时段。',
    success: '主指标方向与预注册一致，且负对照不出现同等效应。',
    tier: 'M',
    domain: domainId,
    values: domainValueDefaults(profile),
  })
  const id = created.campaign.id
  passScoping(service, id)
  passSurvey(service, id)
  service.extractionAdd(id, {
    source: 'S-0001',
    dimension: 'sample_size',
    value: 8,
    quote: '这是第 1 篇来源的正文内容。',
    locator: 'p.1',
    confidence: 0.8,
  })
  passHypothesis(service, id)
  passDesign(service, id)
  const executed = passExecute(service, id)
  const analyzed = passAnalyze(service, id, executed.main.id)
  passWrite(service, id, analyzed.number.id)
  seedProgram(service, id)
  const roles = profile.reviewRoles
  roles.forEach((role, index) => {
    service.gate(id, {
      action: 'review',
      reviewer: `${role.id} 独立评审`,
      role: role.id,
      affiliation: '独立评审组',
      conflict: 'none',
      independent: true,
      adversarial: index === roles.length - 1,
      verdict: 'accept',
      issues: [{ severity: 'minor', title: '补充口径说明', resolved: true }],
      notes: `${profile.title.zh} 领域角色评审通过。`,
    })
  })
  service.audit(id)
  service.gate(id, { action: 'advance' })
  const signals = profile.monitoring.signals
  service.monitor(id, {
    plan: '上线后按周监测主指标、漂移与安全事件，越过容差即回滚并重新分析。',
    owner: 'YG',
    cadence: 'weekly',
    status: 'active',
    reviewedAt: new Date().toISOString().slice(0, 10),
    signals,
    metrics: signals.map((name) => ({ name, target: 1, tolerance: 0.5, direction: 'max', unit: 'index' })),
    observations: signals.map((name) => ({ metric: name, value: 1, at: new Date().toISOString().slice(0, 10), note: '夹具观测' })),
  })
  passStewardship(service, id)
  service.world(id, { action: 'set', kind: 'safety', key: 'dual_use', value: 'pass' })
  service.write(id, {
    action: 'declaration',
    ai: true,
    watermark: true,
    model: 'DeepSeek Harness test',
    humanReviewer: 'YG',
  })
  service.audit(id)
  service.gate(id, {
    action: 'approve',
    approver: 'YG',
    role: 'human-reviewer',
    statement: '已核对领域协议、角色评审与监测，批准发布。',
  })
  const released = service.gate(id, { action: 'advance' })
  return { id, domain: domainId, released: released.released === true }
}

function generalCampaign(service) {
  const id = createCampaign(service)
  passScoping(service, id)
  passSurvey(service, id)
  service.extractionAdd(id, {
    source: 'S-0001',
    dimension: 'sample_size',
    value: 8,
    quote: '这是第 1 篇来源的正文内容。',
    locator: 'p.1',
    confidence: 0.8,
  })
  passHypothesis(service, id)
  passDesign(service, id)
  const executed = passExecute(service, id)
  const analyzed = passAnalyze(service, id, executed.main.id)
  passWrite(service, id, analyzed.number.id)
  passReview(service, id)
  passRelease(service, id)
  service.monitor(id, {
    status: 'active',
    plan: '发布后每周复查主指标与负对照；出现漂移则暂停使用并回到 analyze 重新评估。',
    owner: 'YG',
    cadence: 'weekly',
    signals: ['accuracy'],
    metrics: [{ name: 'accuracy', target: 0.9, tolerance: 0.02, direction: 'higher' }],
    observations: [{ metric: 'accuracy', value: 0.95, at: '2026-01-01T00:00:00.000Z' }],
  })
  service.evaluate(id)
  return { id, domain: null, released: true }
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const { dir, store, service } = tempService()
  const results = []
  try {
    const general = generalCampaign(service)
    results.push(summary(service, store, general))
    for (const domain of DOMAINS) {
      const created = fullDomainCampaign(service, domain)
      results.push(summary(service, store, created))
    }
  } finally {
    try {
      store.close?.()
    } catch {
      /* optional hook */
    }
    if (existsSync(dir)) {
      // Keep the suite deterministic and avoid a growing _artifacts directory.
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* ignore cleanup failure */
      }
    }
  }
  const ready = results.every((row) => row.ok && row.rsiReady && row.score >= 90)
  const report = { generatedAt: new Date().toISOString(), ready, results }
  writeFileSync(join(OUT_DIR, 'rsi-suite.json'), JSON.stringify(report, null, 2), 'utf8')
  writeFileSync(join(OUT_DIR, 'rsi-suite.md'), render(report), 'utf8')
  console.log(`RSI suite: ${results.filter((row) => row.ok).length}/${results.length} ready=${ready}`)
  for (const row of results) {
    console.log(
      `  ${row.domain || 'general'}: score=${row.score} level=${row.level} rsi=${row.rsiReady} blocked=${row.blocking.join(',') || '-'}`,
    )
  }
  return ready ? 0 : 1
}

function summary(service, store, created) {
  const state = store.get(created.id)
  const evaluation = evaluateLoop(state, {
    integrity: store.verify(created.id),
    verifyAudit: (audit) => store.verifyAudit(audit),
  })
  service.evaluate(created.id)
  const release = service.gate(created.id, { action: 'check', stage: 'release' }).gate
  return {
    id: created.id,
    domain: created.domain,
    ok: evaluation.score >= 90 && release.ok === true,
    score: evaluation.score,
    grade: evaluation.grade,
    level: evaluation.level,
    rsiReady: Boolean(evaluation.rsi && evaluation.rsi.ready),
    gaps: Array.isArray(evaluation.gaps) ? evaluation.gaps : [],
    blocking: release.blocking || [],
  }
}

function render(report) {
  const lines = [
    '# 跨领域 RSI 套件',
    '',
    `- 生成时间：${report.generatedAt}`,
    `- 结论：${report.ready ? '全部领域达到 L4 可审计闭环' : '存在未达标领域'}`,
    '',
    '| 活动 | 领域 | 分数 | 等级 | RSI | 阻断 |',
    '| --- | --- | ---: | --- | --- | --- |',
  ]
  for (const row of report.results) {
    lines.push(`| ${row.id} | ${row.domain || 'general'} | ${row.score} | ${row.level} | ${row.rsiReady ? 'yes' : 'no'} | ${row.blocking.join(', ') || '—'} |`)
  }
  lines.push('', '> 套件只证明：同一套九道闸门、领域协议、角色评审和监测可以在每个领域夹具上端到端闭合。它不证明任何领域结论为真。')
  return lines.join('\n')
}

process.exitCode = main()

