/**
 * Deterministic next-action planner (0.10).
 *
 * The suite records a research programme; it does not call a model. This module
 * turns the recorded state + the current gate into a short, ordered list of
 * concrete tool calls. It is the "orchestrator" half of the loop: the host agent
 * still decides, runs commands and writes evidence, but it no longer has to
 * reconstruct what the gate needs from a long checklist.
 *
 * Design sources: Anthropic's orchestrator-worker pattern (decompose, delegate,
 * verify citations), Google Co-Scientist's generate→debate→evolve loop and
 * tournament, Kosmos's world model + next-question loop, PaperQA2's
 * contradiction-first review, STORM's multi-perspective questions and
 * AI Scientist-v2's experiment→review cycle. This module borrows the control
 * structure only; it makes no claim about those systems' measured effects.
 *
 * Invariants:
 * - deterministic: same state → same plan (no clocks in the decision path);
 * - one primary action, a few alternatives, never a wall of TODOs;
 * - human checkpoints are marked, never auto-approved;
 * - integrity, budget and pre-registration timing failures stop the loop
 *   instead of recommending a workaround.
 */
import { STAGE_ORDER } from './config.js'
import { budgetSummary } from './budget.js'
import { programComplete } from './program.js'
import { preregTiming } from './gates.js'

const STAGE_INDEX = Object.freeze(
  Object.fromEntries(STAGE_ORDER.map((stage, index) => [stage, index])),
)

function str(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function arr(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : []
}

function bool(value) {
  return value === true
}

function short(value, max = 120) {
  const text = str(value).replace(/\s+/gu, ' ')
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function firstSource(state, predicate) {
  return arr(state.sources).find(predicate) || null
}

function latestClaim(state, kind, predicate = () => true) {
  const rows = arr(state.claims).filter((item) => (kind ? item.kind === kind : true) && predicate(item))
  return rows[rows.length - 1] || null
}

function planQuery(state) {
  const question = arr(state.plan && state.plan.questions).find((item) => item.status !== 'abandoned')
  return short(question && question.question ? question.question : state.question, 200) || 'research question'
}

function step(tool, args, meta = {}) {
  return {
    tool,
    args: args && typeof args === 'object' ? args : {},
    phase: meta.phase || 'gate',
    priority: Number.isFinite(Number(meta.priority)) ? Number(meta.priority) : 50,
    label: str(meta.label) || tool,
    why: str(meta.why),
    unblocks: Array.isArray(meta.unblocks) ? meta.unblocks.filter(Boolean) : [],
    needsInput: bool(meta.needsInput),
    human: bool(meta.human),
    unmapped: bool(meta.unmapped),
    risk: ['low', 'medium', 'high'].includes(meta.risk) ? meta.risk : 'low',
    followUps: Array.isArray(meta.followUps) ? meta.followUps : [],
  }
}

function update(key, label, why) {
  return step('rsx_campaign', { action: 'update', [key]: `<${label}>` }, {
    label: `填写${label}`,
    why,
    unblocks: [key],
    needsInput: true,
  })
}

/**
 * Map one failing gate check to an actionable tool call. The mapping is
 * intentionally explicit: a planner that silently guesses is worse than a
 * checklist, because the guess looks authoritative.
 */
function actionsForCheck(state, check) {
  const code = str(check && check.code)
  const detail = str(check && check.detail)
  const sources = arr(state.sources)
  const primary = firstSource(state, (item) => item.reliability === 'primary')
  const unassessed = sources.find((item) => item.reliability === 'primary' && !['low', 'some-concerns', 'high'].includes(str(item.riskOfBias)))
  const unknownIndependence = sources.find((item) => item.reliability === 'primary' && !['independent', 'derived', 'same-group'].includes(str(item.independence)))
  const captureless = sources.find((item) => !str(item.contentHash) && !str(item.content))
  const hypothesis = latestClaim(state, 'hypothesis')

  switch (code) {
    case 'question':
      return [update('question', '研究问题', 'scoping requires a question of at least 12 characters')]
    case 'scope':
      return [update('scope', '范围/边界', 'scoping requires scope and boundaries')]
    case 'success':
      return [update('success', '成功标准', 'scoping requires falsifiable success criteria')]
    case 'world_question':
      return [
        step('rsx_campaign', { action: 'world', kind: 'question', key: 'main', value: short(state.question, 200) || '<research question>' }, {
          label: '登记世界模型问题',
          why: 'the world model has no question yet; scoping checks it',
          unblocks: ['world_question'],
          needsInput: str(state.question).length < 12,
        }),
      ]
    case 'tier':
      return [step('rsx_campaign', { action: 'update', tier: '<S|M|L|XL>' }, { label: '选择工作量档位', why: detail, needsInput: true, unblocks: ['tier'] })]
    case 'min_sources':
      return [
        step('rsx_search', { query: planQuery(state), limit: 10, provider: 'both' }, {
          label: '检索候选文献',
          why: `survey needs 8 sources (currently ${sources.length}); search first, then register what you actually read`,
          unblocks: ['min_sources', 'primary_sources', 'recent_source'],
          followUps: [
            { tool: 'rsx_source', args: { action: 'add', title: '<candidate title>', year: '<year>', kind: 'paper' }, note: 'register only inspected candidates' },
          ],
        }),
      ]
    case 'primary_sources':
      return [
        step('rsx_search', { query: planQuery(state), limit: 12, provider: 'both' }, {
          label: '检索一手研究',
          why: `survey needs 2 primary sources (currently ${sources.filter((item) => item.reliability === 'primary').length}); prefer papers/reports over reviews`,
          unblocks: ['primary_sources'],
        }),
      ]
    case 'recent_source':
      return [
        step('rsx_search', { query: planQuery(state), limit: 8, provider: 'both', yearFrom: 2023 }, {
          label: '检索 2023 年后的来源',
          why: 'survey requires at least one source from 2023 or later',
          unblocks: ['recent_source'],
        }),
      ]
    case 'content_captured':
      return [
        step('rsx_source', { action: 'update', id: captureless ? captureless.id : '<S-0001>', path: '<captured-text-file>' }, {
          label: '保存来源正文',
          why: 'citations are checked against captured text; a title/metadata record alone is not enough',
          unblocks: ['content_captured'],
          needsInput: true,
        }),
      ]
    case 'disconfirming_search':
      return [
        step('rsx_campaign', { action: 'search', disconfirming: true, query: `<${planQuery(state)} 反证/负结果>`, database: 'OpenAlex', hits: 0, screened: 0, included: 0 }, {
          label: '执行并记录反证检索',
          why: 'survey requires one recorded disconfirming search, including a null result',
          unblocks: ['disconfirming_search'],
          needsInput: true,
        }),
      ]
    case 'search_protocol':
      return [
        step('rsx_campaign', { action: 'searchLog', database: 'OpenAlex', query: planQuery(state), dateFrom: '<YYYY-MM-DD>', dateTo: '<YYYY-MM-DD>', hits: 0, screened: 0, included: 0 }, {
          label: '记录检索协议',
          why: detail || 'every search needs database, query, date window and hit/screened/included counts',
          unblocks: ['search_protocol'],
          needsInput: true,
        }),
      ]
    case 'coverage_map':
      return [
        step('rsx_campaign', { action: 'world', kind: 'coverage', key: '<coverage-area>', value: '<which sources cover it>' }, {
          label: '登记覆盖地图',
          why: 'survey requires at least two mapped coverage areas',
          unblocks: ['coverage_map'],
          needsInput: true,
        }),
      ]
    case 'source_independence':
      return [
        step('rsx_source', { action: 'update', id: unknownIndependence ? unknownIndependence.id : '<S-0001>', independence: 'independent' }, {
          label: '声明来源独立性',
          why: detail || 'two primary sources must be declared independent, or their lineage explained',
          unblocks: ['source_independence'],
          needsInput: true,
        }),
      ]
    case 'source_rob':
      return [
        step('rsx_source', { action: 'update', id: unassessed ? unassessed.id : (primary ? primary.id : '<S-0001>'), riskOfBias: 'low', robNote: '<why this judgement holds>' }, {
          label: '评估偏倚风险',
          why: detail || 'every primary source needs a risk-of-bias judgement',
          unblocks: ['source_rob'],
          needsInput: true,
        }),
      ]
    case 'hypothesis':
      return [
        step('rsx_claim', { action: 'add', kind: 'hypothesis', statement: '<testable hypothesis>', falsifier: '<observation that would refute it>', killCriterion: '<when to abandon the line>', predicted: '<predicted observation>', metricName: '<metric>', metricUnit: '<unit>', warrant: '<why evidence supports the claim>', counterEvidence: '<counter-evidence search + null result>' }, {
          label: '登记可检验假设',
          why: 'hypothesis gate needs a hypothesis claim with a falsifier and kill criterion',
          unblocks: ['hypothesis', 'falsifier', 'kill_criterion', 'predicted_observation', 'metric'],
          needsInput: true,
        }),
      ]
    case 'falsifier':
    case 'kill_criterion':
    case 'predicted_observation':
    case 'metric':
      return [
        step('rsx_claim', {
          action: 'update',
          claim: hypothesis ? hypothesis.id : '<C-0001>',
          ...(code === 'falsifier' ? { falsifier: '<observation that would refute it>' } : {}),
          ...(code === 'kill_criterion' ? { killCriterion: '<when to abandon the line>' } : {}),
          ...(code === 'predicted_observation' ? { predicted: '<predicted observation>' } : {}),
          ...(code === 'metric' ? { metricName: '<metric>', metricUnit: '<unit>' } : {}),
        }, {
          label: '补齐假设字段',
          why: detail || `hypothesis check ${code} is failing`,
          unblocks: [code],
          needsInput: true,
        }),
      ]
    case 'support':
      if (sources.length < 2) {
        return [
          step('rsx_search', { query: planQuery(state), limit: 8, provider: 'both' }, {
            label: '先补充来源',
            why: 'supporting evidence needs a source; the survey is still thin',
            unblocks: ['min_sources', 'support'],
          }),
        ]
      }
      return [
        step('rsx_evidence', { action: 'add', claim: hypothesis ? hypothesis.id : '<C-0001>', relation: 'supports', ref: (primary || sources[0]).id, locator: '<page/section>', quote: '<exact passage>' }, {
          label: '挂接支持证据',
          why: 'hypothesis needs two supporting evidence rows with exact quotes',
          unblocks: ['support'],
          needsInput: true,
        }),
      ]
    case 'novelty':
      return [
        step('rsx_campaign', { action: 'world', kind: 'novelty', key: 'nearest', value: '<nearest prior work + how this differs>' }, {
          label: '登记新颖性核查',
          why: 'hypothesis gate requires a novelty check recorded under world.novelty',
          unblocks: ['novelty'],
          needsInput: true,
        }),
      ]
    case 'hypothesis_warrant':
    case 'claim_counter_evidence':
      return [
        step('rsx_claim', {
          action: 'update',
          claim: hypothesis ? hypothesis.id : '<C-0001>',
          ...(code === 'hypothesis_warrant' ? { warrant: '<the rule licensing evidence → hypothesis>' } : { counterEvidence: '<search + null result>' }),
        }, {
          label: code === 'hypothesis_warrant' ? '写清 warrant' : '记录反证检索',
          why: detail || `claim rigour check ${code} is failing`,
          unblocks: [code],
          needsInput: true,
        }),
      ]
    case 'alternatives':
      return [
        step('rsx_claim', { action: 'add', kind: 'claim', statement: '<competing explanation>', warrant: '<what would support it>', counterEvidence: '<search + null result>' }, {
          label: '登记竞争解释',
          why: 'hypothesis needs a competing claim or a documented abandoned line',
          unblocks: ['alternatives'],
          needsInput: true,
        }),
      ]
    case 'prereg':
      return [preregStep(state, detail)]
    case 'prereg_hypothesis':
    case 'prereg_metric':
    case 'prereg_n':
    case 'prereg_analysis':
    case 'prereg_stopping':
    case 'prereg_seed':
    case 'negative_control':
    case 'env_lock':
    case 'prereg_stats':
      return [preregStep(state, detail)]
    case 'prereg_lock':
      return [preregStep(state, 'lock the pre-registration before the next run')]
    case 'success_run':
      return [
        step('rsx_run', { action: 'record', command: '<exact command>', status: 'success', seed: 7, metrics: { '<metric>': 0 } }, {
          label: '记录一次真实运行',
          why: 'execute gate needs a successful run with command, seed and metrics',
          unblocks: ['success_run', 'seed', 'metrics', 'command_recorded'],
          needsInput: true,
        }),
      ]
    case 'prereg_before_run':
      return [
        step('rsx_gate', { action: 'check', stage: 'execute' }, {
          label: '预注册晚于数据：停止并升级',
          why: 'the pre-registration was locked after the first run; this cannot be repaired by editing timestamps',
          unblocks: [],
          human: true,
          risk: 'high',
        }),
      ]
    case 'seed':
    case 'metrics':
    case 'command_recorded':
      return [
        step('rsx_run', { action: 'record', command: '<exact command of that run>', status: 'success', seed: 7, metrics: { '<metric>': 0 } }, {
          label: '补录运行元数据',
          why: detail || 'every successful run needs an exact command, a seed and metrics',
          unblocks: [code],
          needsInput: true,
        }),
      ]
    case 'negative_control_run':
      return [
        step('rsx_run', { action: 'record', command: '<negative-control command>', status: 'success', seed: 7, control: 'negative', metrics: { '<metric>': 0 } }, {
          label: '运行并记录负对照',
          why: 'execute gate requires a real negative-control run, not only a design mention',
          unblocks: ['negative_control_run'],
          needsInput: true,
        }),
      ]
    case 'run_stdout':
      return [
        step('rsx_run', { action: 'attach', id: '<R-xxxxxxxxxx>', stdoutPath: '<absolute-path-to-stdout>' }, {
          label: '附上原始 stdout',
          why: 'the release package must be replayable from captured output',
          unblocks: ['run_stdout'],
          needsInput: true,
        }),
      ]
    case 'repro_manifest':
      return [
        step('rsx_run', { action: 'record', command: '<exact command>', status: 'success', seed: 7, metrics: { '<metric>': 0 } }, {
          label: '补齐可复现运行',
          why: 'every success needs its exact command and seed for reproduction',
          unblocks: ['repro_manifest'],
          needsInput: true,
        }),
      ]
    case 'numbers_present':
      return [
        step('rsx_number', { action: 'add', name: '<metric name>', value: 0, unit: '<unit>', uncertainty: '<CI/SD/SE>', trace: 'run:<R-xxxxxxxxxx>#<metric>' }, {
          label: '登记带轨迹的数字',
          why: 'analyze gate needs at least one number whose trace resolves to a real run metric',
          unblocks: ['numbers_present', 'trace_resolves', 'trace_matches'],
          needsInput: true,
        }),
      ]
    case 'trace_resolves':
    case 'trace_matches':
    case 'uncertainty':
      return [
        step('rsx_number', { action: 'add', name: '<metric name>', value: 0, unit: '<unit>', uncertainty: '<CI/SD/SE>', trace: 'run:<R-xxxxxxxxxx>#<metric>' }, {
          label: '重登数字以修复轨迹',
          why: detail || 'every number needs a resolving trace and reported uncertainty',
          unblocks: [code],
          needsInput: true,
        }),
      ]
    case 'claims_resolved':
      return [
        step('rsx_claim', { action: 'status', claim: '<C-0001>', status: '<supported|contested|refuted>', reason: '<why>' }, {
          label: '给断言定状态',
          why: detail || 'every claim must leave proposed before analyze/review',
          unblocks: ['claims_resolved', 'no_contested_claims'],
          needsInput: true,
        }),
      ]
    case 'claim_warrant':
    case 'claim_certainty':
    case 'claim_counter_evidence':
    case 'claim_contested_ignored':
      return [
        step('rsx_claim', {
          action: 'update',
          claim: '<C-0001>',
          ...(code === 'claim_warrant' ? { warrant: '<rule licensing evidence → claim>' } : {}),
          ...(code === 'claim_certainty' ? { certainty: '<high|moderate|low|very-low>' } : {}),
          ...(code === 'claim_counter_evidence' ? { counterEvidence: '<search + null result>' } : {}),
          ...(code === 'claim_contested_ignored' ? { certainty: 'low', counterEvidence: '<explain the refuting evidence>' } : {}),
        }, {
          label: '补齐断言严谨性',
          why: detail || `claim rigour check ${code} is failing`,
          unblocks: [code],
          needsInput: true,
        }),
      ]
    case 'sensitivity':
      return [
        step('rsx_claim', { action: 'sensitivity', claim: '<C-0001>', name: '<robustness check>', method: '<leave-one-out / alternative-model / subgroup>', specification: '<what changed>', result: '<result>', direction: '<consistent|attenuated|reversed|inconclusive>', trace: 'run:<R-xxxxxxxxxx>#<metric>' }, {
          label: '记录敏感性检验',
          why: detail || 'schema-3 analyze gate needs at least one recorded robustness check',
          unblocks: ['sensitivity'],
          needsInput: true,
        }),
      ]
    case 'sensitivity_traces':
      return [
        step('rsx_claim', { action: 'sensitivity', claim: '<C-0001>', name: '<repaired check>', method: '<method>', specification: '<spec>', result: '<result>', direction: 'consistent', trace: 'run:<R-xxxxxxxxxx>#<metric>' }, {
          label: '修复敏感性轨迹',
          why: detail || 'every supplied sensitivity trace must resolve',
          unblocks: ['sensitivity_traces'],
          needsInput: true,
        }),
      ]
    case 'manuscript':
      return [
        step('rsx_write', { action: 'manuscript', title: '<title>', text: '<≥200 characters, numbers as {{N-0001}}, sources as [[src:S-0001]]>' }, {
          label: '写稿件',
          why: 'write gate needs a manuscript of at least 200 characters',
          unblocks: ['manuscript'],
          needsInput: true,
        }),
      ]
    case 'number_refs':
    case 'number_refs_known':
    case 'cite_refs':
    case 'cite_refs_known':
    case 'no_orphan_numbers':
      return [
        step('rsx_write', { action: 'manuscript', title: '<title>', text: '<corresponding manuscript with resolvable {{N-…}} and [[src:S-…]] refs>' }, {
          label: '修正稿件引用',
          why: detail || 'manuscript numbers/sources must resolve to the ledger',
          unblocks: [code],
          needsInput: true,
        }),
      ]
    case 'figure_provenance':
      return [
        step('rsx_figure', { action: 'add', path: '<figure-file>', codePath: '<code-file>', dataPath: '<data-file>', run: '<R-xxxxxxxxxx>', title: '<figure title>', caption: '<caption>' }, {
          label: '补齐图表来源',
          why: 'every figure needs figure + code + data provenance',
          unblocks: ['figure_provenance'],
          needsInput: true,
        }),
      ]
    case 'automated_audit':
      return [
        step('rsx_review', { action: 'audit' }, {
          label: '运行自动审查',
          why: detail || 'review gate needs a fresh signed audit over the current ledger',
          unblocks: ['automated_audit'],
        }),
      ]
    case 'two_reviews':
      return [
        step('rsx_gate', { action: 'review', reviewer: '<reviewer>', affiliation: '<affiliation>', conflict: 'none', independent: true, adversarial: false, verdict: '<accept|minor|major>', notes: '<review>' }, {
          label: '登记独立评审',
          why: detail || 'review gate needs two reviews',
          unblocks: ['two_reviews'],
          needsInput: true,
        }),
      ]
    case 'adversarial_review':
      return [
        step('rsx_gate', { action: 'review', reviewer: '<red-team reviewer>', affiliation: '<affiliation>', conflict: 'none', independent: true, adversarial: true, verdict: '<accept|minor|major>', issues: [{ severity: 'major', title: '<strongest objection>', detail: '<why>', resolved: false }], notes: '<red-team review>' }, {
          label: '登记红队评审',
          why: 'at least one review must be adversarial',
          unblocks: ['adversarial_review'],
          needsInput: true,
        }),
      ]
    case 'no_reject':
    case 'no_blocking_issues':
      return [
        step('rsx_gate', { action: 'review', reviewer: '<follow-up reviewer>', affiliation: '<affiliation>', conflict: 'none', independent: true, adversarial: false, verdict: 'minor', issues: [{ severity: 'minor', title: '<issue>', detail: '<evidence it is resolved>', resolved: true }], notes: '<residual issues resolved>' }, {
          label: '处理评审阻断',
          why: detail || 'a reject or unresolved blocking issue stops the review gate',
          unblocks: [code],
          needsInput: true,
        }),
      ]
    case 'program_complete':
      return programActions(state)
    case 'declaration':
      return [
        step('rsx_write', { action: 'declaration', ai: true, watermark: true, model: '<model/tool>', humanReviewer: '<named human>' }, {
          label: '签署 AI 参与声明',
          why: 'release needs AI assistance, a watermark and a named human reviewer',
          unblocks: ['declaration', 'declaration_model', 'declaration_reviewer'],
          needsInput: true,
          human: true,
        }),
      ]
    case 'declaration_model':
    case 'declaration_reviewer':
      return [
        step('rsx_write', { action: 'declaration', ai: true, watermark: true, model: '<model/tool>', humanReviewer: '<named human>' }, {
          label: '补齐声明字段',
          why: detail || `release check ${code} is failing`,
          unblocks: [code],
          needsInput: true,
          human: true,
        }),
      ]
    case 'dual_use':
      return [
        step('rsx_campaign', { action: 'world', kind: 'safety', key: 'dual_use', value: 'pass' }, {
          label: '人工确认双重用途审查',
          why: 'release requires an explicit dual-use pass; do not let the model self-certify this',
          unblocks: ['dual_use'],
          human: true,
          risk: 'medium',
        }),
      ]
    case 'budget':
      return [
        step('rsx_campaign', { action: 'status' }, {
          label: '预算超限：停止并复核档位',
          why: detail || 'a stage budget is exhausted; raise the tier on a new campaign rather than hiding the overrun',
          unblocks: [],
          human: true,
          risk: 'high',
        }),
      ]
    case 'no_contested_claims':
      return [
        step('rsx_claim', { action: 'status', claim: '<C-0001>', status: '<supported|refuted>', reason: '<resolve or explain the contradiction>' }, {
          label: '解决有争议断言',
          why: detail || 'release cannot ship contested claims without resolution',
          unblocks: ['no_contested_claims'],
          needsInput: true,
        }),
      ]
    case 'human_approval':
      return [
        step('rsx_gate', { action: 'approve', approver: '<human name>', role: 'human-reviewer', statement: '<what was checked and approved>' }, {
          label: '取得人工批准',
          why: detail || 'release requires a fresh human approval bound to the current audit subject',
          unblocks: ['human_approval'],
          needsInput: true,
          human: true,
        }),
      ]
    case 'ai_contribution':
      return [
        step('rsx_write', { action: 'declaration', ai: true, watermark: true, model: '<model/tool>', humanReviewer: '<named human>', contributions: [{ actor: 'ai', role: 'drafting', name: '<model>' }, { actor: 'human', role: 'review', name: '<human>' }] }, {
          label: '记录 AI/人类贡献矩阵',
          why: 'release requires at least one AI role and one human role',
          unblocks: ['ai_contribution'],
          needsInput: true,
          human: true,
        }),
      ]
    case 'waiver_hygiene':
      return [
        step('rsx_gate', { action: 'waivers' }, {
          label: '检查豁免卫生',
          why: detail || 'an expired or invalid waiver must be cleaned up, not silently ignored',
          unblocks: ['waiver_hygiene'],
        }),
      ]
    case 'chain_integrity':
      return [
        step('rsx_campaign', { action: 'status' }, {
          label: '完整性失败：停止',
          why: 'event chain/state/artifact integrity failed; do not auto-repair or continue',
          unblocks: [],
          human: true,
          risk: 'high',
        }),
      ]
    case 'upstream_gates':
      return [
        step('rsx_gate', { action: 'history' }, {
          label: '上游闸门未过：先回到失败阶段',
          why: detail || 'release recomputes every upstream gate; fix the failing stage rather than the release record',
          unblocks: ['upstream_gates'],
          needsInput: true,
        }),
      ]
    case 'repro_package':
      return [
        step('rsx_run', { action: 'record', command: '<exact command>', status: 'success', seed: 7, metrics: { '<metric>': 0 } }, {
          label: '补齐复现包',
          why: 'release needs exact commands, seeds, an env lock and captured stdout',
          unblocks: ['repro_package'],
          needsInput: true,
        }),
      ]
    default:
      break
  }

  if (code.startsWith('domain_')) {
    return [
      step('rsx_domain', { action: 'check', stage: state.stage }, {
        label: '补齐领域协议字段',
        why: detail || `domain check ${code} is failing; set the field with rsx_domain action:"set"`,
        unblocks: [code],
        needsInput: true,
      }),
    ]
  }
  // Unknown checks still get a truthful "inspect" action, never a fabricated fix.
  return [
    step('rsx_gate', { action: 'check', stage: state.stage }, {
      label: `检查未映射项 ${code}`,
      why: detail || 'the planner has no specific recipe for this check',
      unblocks: [code],
      needsInput: true,
      unmapped: true,
    }),
  ]
}

function preregStep(state, detail) {
  const prereg = state.prereg && typeof state.prereg === 'object' ? state.prereg : {}
  const hypothesis = latestClaim(state, 'hypothesis')
  return step('rsx_campaign', {
    action: 'prereg',
    spec: {
      hypothesisId: prereg.hypothesisId || (hypothesis ? hypothesis.id : '<C-0001>'),
      metric: prereg.metric || '<primary metric>',
      n: prereg.n || 0,
      analysisPlan: prereg.analysisPlan || '<analysis plan ≥12 chars>',
      stoppingRule: prereg.stoppingRule || '<stopping rule>',
      seed: prereg.seed ?? 7,
      controls: Array.isArray(prereg.controls) && prereg.controls.length ? prereg.controls : ['negative'],
      envLock: prereg.envLock || '<versions / hardware>',
      alpha: prereg.alpha || '0.05',
      power: prereg.power || '0.8',
      effectSize: prereg.effectSize || '<expected effect size>',
      test: prereg.test || '<test>',
    },
  }, {
    label: '写入并锁定预注册',
    why: detail || 'design gate checks the pre-registration field by field',
    unblocks: ['prereg', 'prereg_hypothesis', 'prereg_metric', 'prereg_n', 'prereg_analysis', 'prereg_stopping', 'prereg_seed', 'negative_control', 'env_lock', 'prereg_lock', 'prereg_stats'],
    needsInput: true,
  })
}

function programActions(state) {
  const complete = programComplete(state)
  const missing = complete.missing
  const planCodes = ['plan_objective', 'plan_questions', 'plan_coverage'].filter((code) => missing.includes(code))
  const plan = state.plan && typeof state.plan === 'object' ? state.plan : {}
  const existingQuestions = arr(plan.questions)
  const source = arr(state.sources)[0]
  const questions = existingQuestions.length
    ? existingQuestions.map((item) => ({
        ...item,
        coverage: Array.isArray(item.coverage) && item.coverage.length ? item.coverage : (source ? [source.id] : []),
      }))
    : [
        { question: '<question 1>', priority: 'high', owner: 'lead', coverage: source ? [source.id] : [] },
        { question: '<question 2>', priority: 'medium', owner: 'reviewer', coverage: source ? [source.id] : [] },
      ]
  const map = {
    perspectives: () => step('rsx_program', { action: 'perspective', name: '<perspective>', stakeholder: '<stakeholder>', question: '<question>', sources: source ? [source.id] : [] }, { phase: 'program', label: '登记利益相关方视角', why: 'programme needs at least two perspectives', unblocks: ['perspectives'], needsInput: true }),
    perspective_sources: () => step('rsx_program', { action: 'perspective', name: '<perspective>', stakeholder: '<stakeholder>', question: '<question>', sources: source ? [source.id] : [] }, { phase: 'program', label: '给视角挂来源', why: 'every perspective needs at least one resolving source', unblocks: ['perspective_sources'], needsInput: true }),
    autonomy_policy: () => step('rsx_program', { action: 'autonomy', maxCycles: 4, stopCriteria: '<when the loop stops>', escalation: '<when to escalate>', humanCheckpoints: '<where a human must confirm>', owner: '<owner>' }, { phase: 'program', label: '写自治策略', why: 'autonomy needs maxCycles, stopCriteria, escalation and humanCheckpoints', unblocks: ['autonomy_policy'], needsInput: true }),
    cycle_log: () => step('rsx_program', { action: 'cycle', goal: '<goal>', step: '<action taken>', observation: '<what happened>', decision: 'continue', question: '<G-0001>' }, { phase: 'program', label: '记录一次行动循环', why: 'programme needs at least one act→observe→decide cycle', unblocks: ['cycle_log'], needsInput: true }),
    hypothesis_competition: () => step('rsx_program', { action: 'match', a: '<C-0001>', b: '<C-0002>', winner: '<a|b|draw>', criterion: '<pairwise criterion>' }, { phase: 'program', label: '登记假设锦标赛', why: 'programme needs a hypothesis, a competing claim and a match', unblocks: ['hypothesis_competition'], needsInput: true }),
    quality_rubric: () => step('rsx_program', { action: 'quality', reviewer: '<reviewer>', scope: '<scope>', scores: { factual_accuracy: 0.8, citation_accuracy: 0.8, completeness: 0.8, source_quality: 0.8, tool_efficiency: 0.8, limitations: 0.8 } }, { phase: 'program', label: '记录六维质量评分', why: 'programme needs a six-dimension rubric with overall ≥0.7', unblocks: ['quality_rubric'], needsInput: true }),
    contradictions_resolved: () => step('rsx_program', { action: 'contradiction', claim: '<C-0001>', evidenceA: '<E-0001>', evidenceB: '<E-0002>', status: 'resolved', resolution: '<how it was resolved>' }, { phase: 'program', label: '解决矛盾', why: 'open contradictions block the programme', unblocks: ['contradictions_resolved'], needsInput: true }),
  }
  const out = []
  if (planCodes.length) {
    out.push(
      step('rsx_program', {
        action: 'plan',
        objective: str(plan.objective) || '<objective ≥12 chars>',
        questions,
      }, {
        phase: 'program',
        label: planCodes.includes('plan_questions') || planCodes.includes('plan_coverage') ? '建立研究计划并挂来源' : '填写研究计划目标',
        why: 'programme needs an objective and at least two questions with resolving source coverage',
        unblocks: planCodes,
        needsInput: true,
      }),
    )
  }
  for (const code of missing) {
    if (planCodes.includes(code)) continue
    out.push(map[code] ? map[code]() : step('rsx_program', { action: 'list' }, { phase: 'program', label: `检查程序项 ${code}`, why: 'the planner has no specific recipe for this programme check', unblocks: [code], needsInput: true, unmapped: true }))
  }
  return out
}

function dedupe(steps) {
  const seen = new Set()
  const out = []
  for (const item of steps) {
    if (!item) continue
    const key = `${item.tool}|${JSON.stringify(item.args)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function stopState(state, gate, budget, context = {}) {
  const integrity = context.integrity || state.integrity
  if (integrity && (integrity.chainOk === false || integrity.stateOk === false || (integrity.artifactProblems || []).length > 0)) {
    return { ready: false, blocked: true, escalate: true, code: 'integrity', reason: 'event chain / state / artifact integrity failed; stop and inspect before doing anything else' }
  }
  const timing = preregTiming(state)
  if (!timing.ok) {
    return { ready: false, blocked: true, escalate: true, code: 'prereg_timing', reason: timing.detail }
  }
  if (budget.overruns.length > 0) {
    return { ready: false, blocked: true, escalate: true, code: 'budget', reason: `budget overrun: ${budget.overruns.join('; ')}` }
  }
  // A passing release gate means the cycle log's final "stop" is the intended
  // terminal state of a completed programme, not a block on exporting it.
  if (gate && gate.ok && state.stage === 'release') {
    return { ready: true, blocked: false, escalate: false, code: 'released', reason: 'all gates pass; export the package and hand it to the human reviewer' }
  }
  const cycles = arr(state.cycles)
  const latest = cycles[cycles.length - 1]
  if (latest && latest.decision === 'stop') {
    return { ready: false, blocked: true, escalate: false, code: 'cycle_stop', reason: `latest cycle ${latest.id || ''} decided to stop` }
  }
  if (latest && latest.decision === 'escalate') {
    return { ready: false, blocked: true, escalate: true, code: 'cycle_escalate', reason: `latest cycle ${latest.id || ''} asked for human escalation` }
  }
  const policy = state.autonomy && typeof state.autonomy === 'object' ? state.autonomy : {}
  const maxCycles = Number(policy.maxCycles)
  if (Number.isFinite(maxCycles) && maxCycles > 0 && cycles.length >= maxCycles) {
    return { ready: false, blocked: true, escalate: true, code: 'cycle_budget', reason: `cycle budget exhausted (${cycles.length}/${maxCycles}); stop or raise the policy explicitly` }
  }
  return { ready: false, blocked: false, escalate: false, code: null, reason: '' }
}

export function planNext(state, context = {}) {
  if (!state || typeof state !== 'object') {
    throw Object.assign(new Error('planNext requires a campaign state'), { code: 'invalid_input' })
  }
  const stage = STAGE_ORDER.includes(state.stage) ? state.stage : 'scoping'
  const gate = context.gate && typeof context.gate === 'object' ? context.gate : null
  const program = context.program && typeof context.program === 'object' ? context.program : programComplete(state)
  const budget = budgetSummary(state)
  const stop = stopState(state, gate, budget, context)
  const blocking = gate && Array.isArray(gate.blocking) ? gate.blocking : []
  const checks = gate && Array.isArray(gate.checks) ? gate.checks : []
  const failures = checks.filter((item) => item && item.blocking === true && item.ok === false)

  if (stop.blocked) {
    return {
      stage,
      gateOk: gate ? gate.ok === true : null,
      blocking,
      programMissing: program.missing || [],
      primary: null,
      steps: [],
      stop,
      budget: { ratio: budget.ratio, overruns: budget.overruns },
      policy: state.autonomy || null,
    }
  }

  let steps = []
  if (!gate) {
    steps.push(step('rsx_gate', { action: 'check' }, { label: '先检查当前闸门', why: 'the planner was called without a gate result' }))
  } else if (!gate.ok) {
    for (const failure of failures) {
      steps.push(...actionsForCheck(state, failure))
    }
  } else if (stage === 'release') {
    steps.push(
      step('rsx_write', { action: 'export' }, {
        label: '导出研究包',
        why: 'every gate passed; bundle the report, ledger, audit and provenance for handoff',
        unblocks: [],
      }),
      step('rsx_campaign', { action: 'monitor' }, {
        label: '记录发布后监控',
        why: 'the loop closes after release; register metrics and review cadence',
        unblocks: [],
        needsInput: true,
      }),
    )
  } else {
    const nextStage = STAGE_ORDER[STAGE_INDEX[stage] + 1]
    steps.push(step('rsx_gate', { action: 'advance' }, { label: `推进到 ${nextStage}`, why: `stage ${stage} has no blocking checks; record the advance`, unblocks: [] }))
  }

  // Programme records are the second control plane. Build them alongside the
  // gate once the survey exists; at review they are mandatory and are expanded
  // from the exact missing codes.
  if (STAGE_INDEX[stage] >= STAGE_INDEX.survey) {
    const programSteps = programActions(state)
    if (!program.ok) {
      steps.push(...programSteps)
    }
  }

  steps = dedupe(steps)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      if (a.phase === b.phase) return 0
      return a.phase === 'gate' ? -1 : 1
    })
    .slice(0, 8)

  return {
    stage,
    gateOk: gate ? gate.ok === true : null,
    blocking,
    programMissing: program.missing || [],
    primary: steps[0] || null,
    steps,
    stop,
    budget: { ratio: budget.ratio, overruns: budget.overruns },
    policy: state.autonomy || null,
  }
}

/** Human-readable one-liner for the panel / CLI. */
export function nextSummary(plan) {
  if (!plan) return ''
  if (plan.stop && plan.stop.blocked) return `STOP: ${plan.stop.reason}`
  if (plan.stop && plan.stop.ready) return 'READY: export and hand off to the human reviewer'
  const primary = plan.primary
  if (!primary) return 'No action: the planner has no recommendation for this state'
  return `${primary.human ? '[human] ' : ''}${primary.label}: ${primary.tool} ${JSON.stringify(primary.args)}`
}



