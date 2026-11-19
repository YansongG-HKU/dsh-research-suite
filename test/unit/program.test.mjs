import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { checkGate } from '../../lib/gates.js'
import { programComplete, rankClaims, renderProgramMarkdown } from '../../lib/program.js'
import { createTools } from '../../lib/tools.js'
import {
  createCampaign,
  makeService,
  passHypothesis,
  passScoping,
  passSurvey,
} from '../helpers.mjs'

function programCampaign(service) {
  const id = createCampaign(service)
  passScoping(service, id)
  passSurvey(service, id)
  passHypothesis(service, id)
  return id
}

function buildProgram(service, id) {
  service.program(id, {
    action: 'plan',
    objective: '用计划、视角、锦标赛和矛盾台账判断温度效应是否可复核。',
    questions: [
      { question: '20–40°C 升温是否提高初速度？', priority: 'high', owner: 'lead', coverage: ['S-0001', 'S-0002'] },
      { question: '60°C 以上失活是否构成边界条件？', priority: 'medium', owner: 'domain-reviewer', coverage: ['S-0003'] },
    ],
  })
  service.program(id, {
    action: 'perspective',
    name: '动力学实验者',
    stakeholder: '实验团队',
    question: '效应在批间是否稳定？',
    sources: ['S-0001', 'S-0002'],
  })
  service.program(id, {
    action: 'perspective',
    name: '统计评审',
    stakeholder: '独立评审组',
    question: '效应是否可能由批次解释？',
    sources: ['S-0001', 'S-0003'],
  })
  service.program(id, {
    action: 'autonomy',
    maxCycles: 3,
    stopCriteria: '主运行与负对照一致，或达到预注册的 200 次测量后停止。',
    escalation: '出现方向相反的独立证据时升级给人类评审。',
    humanCheckpoints: '发布前由人类评审者核对证据、复现包与局限。',
    owner: 'YG',
  })
  service.program(id, {
    action: 'cycle',
    goal: '检验升温主效应并保留负对照',
    step: '运行主实验并记录种子、指标与 stdout。',
    observation: '主运行方向为正，负对照方向为负。',
    decision: 'continue',
    question: 'G-0001',
  })
  service.program(id, {
    action: 'match',
    a: 'C-0001',
    b: 'C-0002',
    winner: 'a',
    criterion: '主运行与两条独立来源方向一致，负对照不支持随机波动。',
  })
  service.program(id, {
    action: 'quality',
    reviewer: '自动化质量评分',
    scope: '完整研究包',
    scores: {
      factual_accuracy: 0.86,
      citation_accuracy: 0.9,
      completeness: 0.82,
      source_quality: 0.84,
      tool_efficiency: 0.8,
      limitations: 0.88,
    },
  })
  service.program(id, {
    action: 'contradiction',
    claim: 'C-0001',
    evidenceA: 'E-0001',
    evidenceB: 'S-0003',
    resolutionStatus: 'resolved',
    resolution: '两者测量的是不同温度区间；60°C 以上失活不否定 20–40°C 的正效应。',
  })
}

test('program records plan, perspectives, autonomy, cycle, tournament, rubric and contradiction', () => {
  const { service, store, cleanup } = makeService()
  try {
    const id = programCampaign(service)
    const before = programComplete(store.get(id))
    assert.equal(before.ok, false)
    assert.ok(before.missing.includes('plan_objective'))
    assert.ok(before.missing.includes('quality_rubric'))

    buildProgram(service, id)
    const state = store.get(id)
    const complete = programComplete(state)
    assert.equal(complete.ok, true, JSON.stringify(complete.missing))
    assert.equal(state.plan.questions.length, 2)
    assert.equal(state.perspectives.length, 2)
    assert.equal(state.cycles.length, 1)
    assert.equal(state.tournament.matches.length, 1)
    assert.equal(state.quality.rows.length, 1)
    assert.equal(state.contradictions.length, 1)

    const ranking = rankClaims(state)
    assert.equal(ranking.leader.id, 'C-0001')
    assert.equal(ranking.leader.rank, 1)
    assert.ok(ranking.leader.rating > 1000)
    assert.equal(ranking.ratings.find((row) => row.id === 'C-0002').rating < 1000, true)

    const markdown = renderProgramMarkdown(state)
    assert.match(markdown, /研究程序/u)
    assert.match(markdown, /假设锦标赛/u)
    assert.match(markdown, /矛盾台账/u)
    assert.match(markdown, /全部程序检查通过/u)
  } finally {
    cleanup()
  }
})

test('review gate blocks schema-4 campaigns without a complete programme and is advisory for schema 3', () => {
  const { service, store, cleanup } = makeService()
  try {
    const id = createCampaign(service)
    const state = store.get(id)
    const review = checkGate(state, 'review')
    assert.equal(review.blocking.includes('program_complete'), true)
    assert.equal(review.checks.find((item) => item.code === 'program_complete').ok, false)

    state.schema = 3
    store.save(state)
    const legacy = checkGate(store.get(id), 'review')
    const legacyCheck = legacy.checks.find((item) => item.code === 'program_complete')
    assert.equal(legacyCheck.blocking, false)
    assert.equal(legacy.blocking.includes('program_complete'), false)
  } finally {
    cleanup()
  }
})

test('program validation refuses unresolved refs, partial rubrics, self-matches and over-budget cycles', () => {
  const { service, cleanup } = makeService()
  try {
    const id = programCampaign(service)
    assert.throws(
      () => service.program(id, { action: 'plan', objective: '测试计划目标足够长。', question: '问题长度足够。', coverage: ['S-9999'] }),
      (error) => error.code === 'invalid_input',
    )
    assert.throws(
      () => service.program(id, {
        action: 'quality',
        reviewer: '评审',
        scores: { factual_accuracy: 0.8 },
      }),
      (error) => error.code === 'invalid_input',
    )
    assert.throws(
      () => service.program(id, { action: 'match', a: 'C-0001', b: 'C-0001', winner: 'a', criterion: '自比' }),
      (error) => error.code === 'invalid_input',
    )
    service.program(id, {
      action: 'autonomy',
      maxCycles: 1,
      stopCriteria: '达到预注册样本量后停止。',
      escalation: '出现相反证据时升级。',
      humanCheckpoints: '发布前人类复核。',
    })
    service.program(id, {
      action: 'cycle',
      goal: '检验升温主效应是否成立',
      step: '运行主实验并记录指标。',
      observation: '主运行方向为正。',
      decision: 'continue',
    })
    assert.throws(
      () => service.program(id, {
        action: 'cycle',
        goal: '再跑一次',
        step: '重复主实验。',
        observation: '结果稳定。',
        decision: 'stop',
      }),
      (error) => error.code === 'invalid_input',
    )
    assert.throws(
      () => service.program(id, {
        action: 'contradiction',
        claim: 'C-0001',
        evidenceA: 'E-0001',
        evidenceB: 'S-0003',
        resolutionStatus: 'resolved',
        resolution: '太短',
      }),
      (error) => error.code === 'invalid_input',
    )
  } finally {
    cleanup()
  }
})

test('rsx_program tool dispatches actions and maps cycle/contradiction fields', async () => {
  const { service, cleanup } = makeService()
  try {
    const id = programCampaign(service)
    const tools = createTools({ service }).find((tool) => tool.name === 'rsx_program')
    assert.ok(tools)
    const plan = await tools.execute({
      campaign: id,
      action: 'plan',
      objective: '通过工具建立研究程序。',
      questions: [
        { question: '第一个计划问题是什么？', priority: 'high', owner: 'lead', coverage: ['S-0001'] },
        { question: '第二个计划问题是什么？', priority: 'medium', owner: 'lead', coverage: ['S-0002'] },
      ],
    })
    assert.equal(plan.ok, true)
    assert.equal(plan.plan.questions.length, 2)

    const autonomy = await tools.execute({
      campaign: id,
      action: 'autonomy',
      maxCycles: 2,
      stopCriteria: '达到预注册样本量后停止。',
      escalation: '出现相反证据时升级。',
      humanCheckpoints: '发布前人类复核。',
    })
    assert.equal(autonomy.ok, true)

    const cycle = await tools.execute({
      campaign: id,
      action: 'cycle',
      goal: '运行一次主实验并保存输出',
      step: '执行命令并保存 stdout。',
      observation: '指标方向与预测一致。',
      decision: 'continue',
    })
    assert.equal(cycle.ok, true)
    assert.equal(cycle.cycle.action, '执行命令并保存 stdout。')

    const match = await tools.execute({
      campaign: id,
      action: 'match',
      a: 'C-0001',
      b: 'C-0002',
      winner: 'a',
      criterion: '主运行与独立来源一致。',
    })
    assert.equal(match.ok, true)
    assert.equal(match.ranking.leader.id, 'C-0001')

    const quality = await tools.execute({
      campaign: id,
      action: 'quality',
      reviewer: '工具评分',
      scores: {
        factual_accuracy: 0.8,
        citation_accuracy: 0.8,
        completeness: 0.8,
        source_quality: 0.8,
        tool_efficiency: 0.8,
        limitations: 0.8,
      },
    })
    assert.equal(quality.ok, true)
    assert.equal(quality.quality.overall, 0.8)

    const list = await tools.execute({ campaign: id, action: 'list' })
    assert.equal(list.ok, true)
    assert.equal(list.program.qualityRows, 1)

    const contradiction = await tools.execute({
      campaign: id,
      action: 'contradiction',
      claim: 'C-0001',
      evidenceA: 'E-0001',
      evidenceB: 'S-0003',
      resolutionStatus: 'resolved',
      resolution: '不同温度区间，不构成直接冲突。',
    })
    assert.equal(contradiction.ok, true)
    assert.equal(contradiction.contradiction.status, 'resolved')
  } finally {
    cleanup()
  }
})

test('export includes PROGRAM.md and the report carries the programme sections', () => {
  const { service, cleanup } = makeService()
  try {
    const id = programCampaign(service)
    buildProgram(service, id)
    const written = service.write(id, { action: 'render' })
    assert.ok(written.paths.program)
    const markdown = readFileSync(written.paths.program, 'utf8')
    assert.match(markdown, /研究计划/u)
    assert.match(markdown, /行动循环/u)
    const report = service.report(id).markdown
    assert.match(report, /研究计划与视角/u)
    assert.match(report, /假设锦标赛、质量评分与矛盾台账/u)
  } finally {
    cleanup()
  }
})



