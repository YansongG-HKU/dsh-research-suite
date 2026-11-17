#!/usr/bin/env node
/**
 * RSI evaluation harness for the research loop.
 *
 * It builds a deterministic, complete campaign through the same service API the
 * agent uses, records a real stdout artifact, evaluates the 12 loop dimensions,
 * and compares the candidate score with a versioned baseline. This is a
 * regression gate for the loop evaluator itself, not a claim that the system is
 * autonomous or generally intelligent.
 *
 * Usage:
 *   node scripts/rsi-eval.mjs
 *   node scripts/rsi-eval.mjs --update-baseline
 *   node scripts/rsi-eval.mjs --baseline path/to/baseline.json --report path/to/report.md
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { VERSION } from '../lib/config.js'
import {
  makeService,
  createCampaign,
  passScoping,
  passSurvey,
  passHypothesis,
  passDesign,
  passExecute,
  passAnalyze,
  passWrite,
  passReview,
  passRelease,
} from '../test/helpers.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const args = process.argv.slice(2)
const updateBaseline = args.includes('--update-baseline')
const baselineArg = args.find((item) => item.startsWith('--baseline='))
const reportArg = args.find((item) => item.startsWith('--report='))
const baselinePath = resolve(ROOT, baselineArg ? baselineArg.slice('--baseline='.length) : '_artifacts/rsi-baseline.json')
const reportPath = resolve(ROOT, reportArg ? reportArg.slice('--report='.length) : '_artifacts/rsi-report.md')

function readBaseline() {
  if (!existsSync(baselinePath)) return null
  try {
    return JSON.parse(readFileSync(baselinePath, 'utf8'))
  } catch {
    return null
  }
}

function buildCandidate() {
  const { service, dir, cleanup } = makeService()
  const id = createCampaign(service)
  passScoping(service, id)
  passSurvey(service, id)
  service.extractionAdd(id, {
    source: 'S-0001',
    dimension: 'sample_size',
    value: 8,
    quote: '这是第 1 篇来源的正文内容，用于测试内容捕获与哈希。',
    locator: 'p.1',
    confidence: 0.8,
  })
  passHypothesis(service, id)
  passDesign(service, id)
  const executed = passExecute(service, id)
  const analyzed = passAnalyze(service, id, executed.main.id)
  passWrite(service, id, analyzed.number.id)
  const stdoutPath = join(dir, 'stdout.txt')
  writeFileSync(stdoutPath, `seed=7 run=${executed.main.id}\npearson_r=0.4461\nnegative_control=ok\n`, 'utf8')
  service.runRecord(id, {
    command: 'node _tmp/rsi-stdout.mjs --seed 7',
    status: 'success',
    seed: 7,
    metrics: { stdout_lines: 3 },
    stdoutPath,
    note: 'RSI harness: captured stdout for the execution dimension',
  })
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
  const result = service.evaluate(id)
  const markdown = service.loopMarkdown(id)
  const state = service.store.get(id)
  const summary = {
    version: state.version,
    harnessVersion: VERSION,
    campaign: 'rsi-fixture',
    score: result.evaluation.score,
    grade: result.evaluation.grade,
    level: result.evaluation.level,
    rsiReady: result.evaluation.rsi.ready,
    gaps: result.evaluation.gaps.map((item) => ({ dimension: item.dimension, id: item.id, detail: item.detail })),
    dimensions: result.evaluation.dimensions.map((item) => ({ id: item.id, score: item.score, passed: item.passed, total: item.total })),
    generatedAt: new Date().toISOString(),
  }
  cleanup()
  return { summary, markdown }
}

const baseline = readBaseline()
const candidate = buildCandidate()
const report = [
  '# RSI research-loop evaluation',
  '',
  `- Candidate score: **${candidate.summary.score}/100** (${candidate.summary.grade}, ${candidate.summary.level})`,
  `- RSI prerequisites: **${candidate.summary.rsiReady ? 'met' : 'not met'}**`,
  baseline ? `- Baseline score: **${baseline.score}/100** (saved ${baseline.savedAt || 'unknown'})` : '- Baseline: none (this run can create one)',
  '',
  '> This harness measures engineering-loop completeness and compares versions. It is not an intelligence measurement and does not authorize autonomous self-modification.',
  '',
  candidate.markdown,
  '',
  '## Harness gaps',
  '',
  ...(candidate.summary.gaps.length
    ? candidate.summary.gaps.map((item) => `- ${item.dimension}/${item.id}: ${item.detail}`)
    : ['- none']),
  '',
].join('\n')

mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, report, 'utf8')

let regression = false
if (baseline && !updateBaseline) {
  if (candidate.summary.score < baseline.score) {
    regression = true
    console.error(`RSI regression: candidate ${candidate.summary.score} < baseline ${baseline.score}`)
  } else if (candidate.summary.score > baseline.score) {
    console.log(`RSI improvement: ${candidate.summary.score} > baseline ${baseline.score}`)
  } else {
    console.log(`RSI score unchanged: ${candidate.summary.score}`)
  }
}
if (updateBaseline) {
  mkdirSync(dirname(baselinePath), { recursive: true })
  writeFileSync(
    baselinePath,
    JSON.stringify({ ...candidate.summary, savedAt: new Date().toISOString() }, null, 2),
    'utf8',
  )
  console.log(`RSI baseline updated: ${baselinePath} (${candidate.summary.score}/100)`)
}

console.log(`score=${candidate.summary.score} grade=${candidate.summary.grade} level=${candidate.summary.level} rsiReady=${candidate.summary.rsiReady}`)
console.log(`report=${reportPath}`)
if (regression) process.exitCode = 1
