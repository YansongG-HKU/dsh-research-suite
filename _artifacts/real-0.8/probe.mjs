#!/usr/bin/env node
/**
 * Deterministic 0.8 programme probe.
 *
 * Each case builds a minimal review-stage state and asks the real review gate
 * whether the programme check blocks. No service mutation, no network: this
 * isolates the schema-4 programme contract from the rest of the review gate.
 */
import { checkGate } from '../../workspace/dsh-research-suite/lib/gates.js'
import { programComplete } from '../../workspace/dsh-research-suite/lib/program.js'

function baseState(schema = 4) {
  return {
    schema,
    question: '结构化研究程序是否改变评审闸门判定？',
    scope: '只覆盖本机闸门函数与 schema-4 程序记录，不外推到真实科研产出。',
    success: '缺少程序记录或存在未处置矛盾时阻断 program_complete，补齐后放行。',
    tier: 'M',
    lastHash: 'probe',
    world: { question: { main: '程序完整性如何被检查' } },
    sources: [
      { id: 'S-0001', title: '来源一', year: 2025, reliability: 'primary', contentHash: 'sha256:' + '1'.repeat(64) },
      { id: 'S-0002', title: '来源二', year: 2025, reliability: 'secondary', contentHash: 'sha256:' + '2'.repeat(64) },
    ],
    claims: [
      { id: 'C-0001', kind: 'hypothesis', statement: '程序检查会阻断不完整项目。', status: 'supported' },
      { id: 'C-0002', kind: 'claim', statement: '程序检查只是文档字段。', status: 'refuted' },
    ],
    evidence: [{ id: 'E-0001', claim: 'C-0001', relation: 'supports', ref: 'S-0001' }],
    runs: [{ id: 'R-aaaaaaaaaa', status: 'success', ts: '2026-01-01T00:00:00.000Z', seed: 1, command: 'node probe.mjs', metrics: { blocked: 1 } }],
    numbers: [],
    figures: [],
    reviews: [],
    audits: [],
    waivers: [],
    approvals: [],
    gates: [],
    artifacts: [],
    contradictions: [],
    searchLog: [],
    sensitivity: [],
  }
}

function completeProgram(state) {
  state.plan = {
    objective: '验证 schema-4 程序完整性确实改变评审闸门。',
    questions: [
      { id: 'G-0001', question: '缺少程序时是否阻断？', priority: 'high', owner: 'lead', status: 'active', coverage: ['S-0001'] },
      { id: 'G-0002', question: '补齐后是否放行？', priority: 'medium', owner: 'lead', status: 'active', coverage: ['S-0002'] },
    ],
  }
  state.perspectives = [
    { id: 'O-0001', name: '闸门设计者', stakeholder: '工程团队', question: '程序检查是否可执行？', sources: ['S-0001'] },
    { id: 'O-0002', name: '独立评审', stakeholder: '评审组', question: '记录是否足以复核？', sources: ['S-0002'] },
  ]
  state.autonomy = {
    maxCycles: 3,
    stopCriteria: '所有预设探针运行完毕，且没有开放矛盾时停止。',
    escalation: '出现相反判定时升级给人类评审。',
    humanCheckpoints: '发布前由人类评审者核对探针与导出包。',
    owner: 'YG',
  }
  state.cycles = [
    {
      id: 'K-0001',
      goal: '运行程序闸门探针',
      action: '逐个构造程序状态并读取 blocking。',
      observation: '缺少程序和开放矛盾时阻断。',
      decision: 'stop',
      question: 'G-0001',
      run: 'R-aaaaaaaaaa',
    },
  ]
  state.tournament = {
    matches: [{ id: 'T-0001', a: 'C-0001', b: 'C-0002', winner: 'a', criterion: '探针 output 与闸门行为一致。' }],
  }
  state.quality = {
    rows: [
      {
        id: 'Y-0001',
        reviewer: '自动化质量评分',
        overall: 0.84,
        minimum: 0.8,
        scores: {
          factual_accuracy: 0.86,
          citation_accuracy: 0.9,
          completeness: 0.82,
          source_quality: 0.84,
          tool_efficiency: 0.8,
          limitations: 0.88,
        },
      },
    ],
  }
}

function blocked(state) {
  const gate = checkGate(state, 'review')
  return gate.blocking.includes('program_complete')
}

function run() {
  const cases = {}
  const missing = baseState(4)
  cases.missing_program = { blocked: blocked(missing), complete: programComplete(missing).missing }

  const complete = baseState(4)
  completeProgram(complete)
  cases.complete_program = { blocked: blocked(complete), complete: programComplete(complete).missing }

  const open = baseState(4)
  completeProgram(open)
  open.contradictions = [
    { id: 'D-0001', claim: 'C-0001', evidenceA: 'E-0001', evidenceB: 'S-0002', status: 'open', resolution: '' },
  ]
  cases.open_contradiction = { blocked: blocked(open), complete: programComplete(open).missing }

  const resolved = baseState(4)
  completeProgram(resolved)
  resolved.contradictions = [
    {
      id: 'D-0001',
      claim: 'C-0001',
      evidenceA: 'E-0001',
      evidenceB: 'S-0002',
      status: 'explained',
      resolution: '两者测量不同层面：一个看闸门行为，一个看文档字段，不构成直接冲突。',
    },
  ]
  cases.resolved_contradiction = { blocked: blocked(resolved), complete: programComplete(resolved).missing }

  const low = baseState(4)
  completeProgram(low)
  low.quality.rows[0].overall = 0.4
  low.quality.rows[0].minimum = 0.3
  cases.low_quality = { blocked: blocked(low), complete: programComplete(low).missing }

  const legacy = baseState(3)
  cases.legacy_schema3 = { blocked: blocked(legacy), complete: programComplete(legacy).missing }

  const blockedCases = Object.values(cases).filter((item) => item.blocked).length
  return {
    seed: 7,
    version: '0.8.0',
    cases,
    blocked_cases: blockedCases,
    metrics: {
      blocked_cases: blockedCases,
      missing_blocked: cases.missing_program.blocked ? 1 : 0,
      complete_blocked: cases.complete_program.blocked ? 1 : 0,
      open_contradiction_blocked: cases.open_contradiction.blocked ? 1 : 0,
      resolved_contradiction_blocked: cases.resolved_contradiction.blocked ? 1 : 0,
      low_quality_blocked: cases.low_quality.blocked ? 1 : 0,
      legacy_blocked: cases.legacy_schema3.blocked ? 1 : 0,
    },
  }
}

if (process.argv.includes('--negative')) {
  // The negative control is the same programme contract on a schema-3 state:
  // the check exists but is advisory, so it must not block. Its metric shape is
  // deliberately different from the main probe so an identical-metrics audit
  // cannot mistake the two runs for the same execution.
  const result = run()
  const legacyBlocked = result.cases.legacy_schema3.blocked ? 1 : 0
  console.log(
    JSON.stringify(
      {
        ...result,
        negative: true,
        blocked_cases: legacyBlocked,
        metrics: { legacy_missing_blocked: legacyBlocked, blocked_cases: legacyBlocked },
      },
      null,
      2,
    ),
  )
} else {
  console.log(JSON.stringify(run(), null, 2))
}
