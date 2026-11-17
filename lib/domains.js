/**
 * Domain research profiles.
 *
 * A profile is deliberately data, not prose: every field maps to a stage, and
 * every required field becomes a blocking gate check once a campaign selects
 * that domain. The generic nine-stage pipeline stays unchanged; this layer adds
 * the protocol, reporting and post-release expectations that domain reviewers
 * actually ask for.
 *
 * The standards listed here are alignment targets, not certification claims.
 */
import { STAGE_ORDER } from './config.js'
import { evaluateMonitoring, normalizeMonitoring } from './monitor.js'

export const GENERAL_DOMAIN = 'general'

const label = (zh, en) => ({ zh, en })

const field = (id, stage, zh, en, opts = {}) => ({
  id,
  stage,
  label: label(zh, en),
  type: opts.type || 'text',
  required: opts.required !== false,
  min: opts.min ?? (opts.type === 'number' ? 0 : 8),
  ...opts,
})

const text = (id, stage, zh, en, opts = {}) => field(id, stage, zh, en, { ...opts, type: 'text' })

const number = (id, stage, zh, en, opts = {}) =>
  field(id, stage, zh, en, { ...opts, type: 'number', min: opts.min ?? 0 })

const date = (id, stage, zh, en, opts = {}) =>
  field(id, stage, zh, en, {
    ...opts,
    type: 'date',
    min: 10,
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    patternHint: 'YYYY-MM-DD',
  })

const choice = (id, stage, zh, en, options, opts = {}) =>
  field(id, stage, zh, en, { ...opts, type: 'enum', options, min: opts.min ?? 2 })

const std = (id, title, kind, url, note, opts = {}) => ({ id, title, kind, url, note, ...opts })

const finance = {
  id: 'finance',
  title: label('金融量化与投研', 'Finance and quantitative research'),
  summary: label(
    '把投资研究当成可证伪的实验：先固定数据时点、样本外和成本假设，再谈收益。',
    'Treat investment research as a falsifiable experiment: fix point-in-time data, out-of-sample and cost assumptions before claiming performance.',
  ),
  standards: [
    std('sec-marketing-rule', 'SEC Marketing Rule 206(4)-1', 'regulation', 'https://www.sec.gov/rules/final/2020/ia-5653.pdf', '假设性/回测表现、业绩呈现与利益冲突披露的结构参考'),
    std('gips-2020', 'GIPS 2020', 'industry', 'https://www.gipsstandards.org/', '组合业绩计算与呈现的行业口径'),
    std('deflated-sharpe', 'Deflated Sharpe Ratio', 'method', 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2460551', '多重检验与选择偏差下的夏普比率校正'),
    std('pbo', 'Probability of Backtest Overfitting', 'method', 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2326253', '回测过拟合概率与组合选择'),
  ],
  reportSections: ['数据与 Point-in-Time 口径', '回测协议与执行假设', '交易成本与容量', '多重检验与过拟合', '样本外结果与稳健性', '风险、局限与声明'],
  reviewRoles: [
    { id: 'quant', label: label('量化/回测审查', 'Quant / backtest review') },
    { id: 'risk', label: label('风险/合规审查', 'Risk / compliance review') },
  ],
  monitoring: {
    required: true,
    planMin: 20,
    ownerMin: 2,
    cadenceMin: 2,
    signals: ['drawdown', 'sharpe_decay', 'turnover', 'cost_slippage'],
    guidance: '上线后跟踪回撤、夏普衰减、换手与成本滑点；预先写明降仓/停用阈值和负责人。',
  },
  fields: [
    text('mandate', 'scoping', '投资授权与决策场景', 'Mandate and decision context', { min: 20, help: '谁用这个结论、做什么决策、资金与风险约束是什么' }),
    text('universe', 'scoping', '资产池与交易场所', 'Universe and venues', { min: 12, help: '资产、交易所、时区、可交易性与排除规则' }),
    text('sample_period', 'scoping', '样本期与时间口径', 'Sample period and time basis', { min: 12, help: '起止日期、频率、信号与收益的时间对齐' }),
    text('success_metric', 'scoping', '主指标与判定阈值', 'Primary metric and threshold', { min: 8, help: '主指标（如净夏普）与事先写明的成功阈值' }),
    text('data_sources', 'survey', '数据源与 Point-in-Time 处理', 'Data sources and point-in-time handling', { min: 16, help: '供应商、快照日期、修订/重述与可得时间' }),
    text('survivorship_policy', 'survey', '幸存者偏差与退市处理', 'Survivorship and delisting policy', { min: 12, help: '退市、并购、代码变更与失败样本如何保留' }),
    text('benchmark', 'survey', '基准与无风险利率', 'Benchmark and risk-free rate', { min: 8, help: '基准、无风险利率来源与货币' }),
    text('prior_evidence', 'survey', '先验证据与已知异象', 'Prior evidence and known anomalies', { min: 16, help: '复现了哪些研究、已知失效条件与数据挖掘风险' }),
    date('in_sample_end', 'design', '样本内结束日期', 'In-sample end date', { help: '参数选择/训练数据截止日' }),
    date('oos_start', 'design', '样本外开始日期', 'Out-of-sample start date', { help: '必须晚于样本内结束日' }),
    text('cost_model', 'design', '交易成本与容量模型', 'Cost and capacity model', { min: 16, help: '佣金、点差、冲击、借券费与容量上限' }),
    text('multiple_testing', 'design', '多重检验与过拟合控制', 'Multiple testing and overfitting control', { min: 16, help: '试验次数、校正方法、Deflated Sharpe 或 PBO' }),
    text('execution_assumptions', 'design', '成交与公司行动假设', 'Execution and corporate-action assumptions', { min: 16, help: '成交延迟、涨跌停、停牌、分红拆股与换手约束' }),
    text('engine', 'execute', '回测引擎与版本', 'Backtest engine and version', { min: 8, help: '引擎/自研代码版本与可复现入口' }),
    text('data_snapshot', 'execute', '冻结数据快照', 'Frozen data snapshot', { min: 12, help: '快照路径/哈希、生成日期与字段版本' }),
    text('portfolio_construction', 'execute', '组合构建与再平衡', 'Portfolio construction and rebalancing', { min: 16, help: '权重、约束、再平衡频率与现金处理' }),
    text('risk_metrics', 'analyze', '风险与绩效指标', 'Risk and performance metrics', { min: 16, help: '净夏普、最大回撤、换手、暴露、尾部与容量' }),
    text('out_of_sample_result', 'analyze', '样本外结果与置信区间', 'Out-of-sample result and interval', { min: 16, help: '样本外主指标、区间与相对基准的表现' }),
    text('sensitivity', 'analyze', '参数、成本与 regime 敏感性', 'Parameter, cost and regime sensitivity', { min: 16, help: '参数扰动、成本翻倍、不同市场状态的稳健性' }),
    text('limitations', 'analyze', '局限与失效条件', 'Limitations and failure conditions', { min: 16, help: '什么情况下结论不成立、样本外失效的早期信号' }),
    text('disclaimer', 'write', '回测/假设性表现声明', 'Backtest / hypothetical performance disclaimer', {
      min: 12,
      includeAny: ['不构成投资建议', 'not investment advice'],
      help: '明确回测/假设性表现、数据限制与“不构成投资建议”',
    }),
    text('data_availability', 'write', '数据与代码可用性', 'Data and code availability', { min: 8, help: '哪些可共享、哪些受许可限制、复现所需版本' }),
    text('conflicts', 'release', '利益冲突与资助', 'Conflicts and funding', { min: 8, help: '资助、持仓、客户关系与个人利益' }),
    text('regulatory_status', 'release', '监管定位（研究/营销/建议）', 'Regulatory posture (research/marketing/advice)', { min: 12, help: '这是研究、营销材料还是个性化建议；适用披露' }),
  ],
  rules: [
    {
      id: 'oos_after_in_sample',
      stage: 'design',
      kind: 'date_order',
      left: 'in_sample_end',
      right: 'oos_start',
      detail: '样本外开始日期必须晚于样本内结束日期',
    },
  ],
}

const ai = {
  id: 'ai',
  title: label('人工智能与机器学习', 'AI and machine learning'),
  summary: label(
    '模型不是结论：固定用途边界、数据切分、污染检查、基线与安全评估，才谈可复现的能力声明。',
    'A model is not a result: fix intended use, data splits, contamination checks, baselines and safety evaluation before claiming capability.',
  ),
  standards: [
    std('nist-ai-rmf', 'NIST AI RMF 1.0', 'framework', 'https://www.nist.gov/itl/ai-risk-management-framework', 'Govern / Map / Measure / Manage 四类风险活动'),
    std('nist-genai-profile', 'NIST Generative AI Profile (NIST AI 600-1)', 'framework', 'https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf', '生成式 AI 的治理与测评风险清单'),
    std('iso-42001', 'ISO/IEC 42001:2023', 'management-system', 'https://www.iso.org/standard/81230.html', 'AI 管理体系（AIMS）的结构参考'),
    std('eu-ai-act', 'EU AI Act (Regulation 2024/1689)', 'regulation', 'https://eur-lex.europa.eu/eli/reg/2024/1689/oj', '高风险 AI 的数据治理、记录、人类监督与准确性要求', {
      when: { field: 'risk_tier', in: ['limited', 'high'] },
      whenNote: '低风险原型可先按参考处理；部署前需重新评估',
    }),
    std('neurips-checklist', 'NeurIPS Paper Checklist', 'reporting', 'https://neurips.cc/public/guides/PaperChecklist', '主张、局限、复现与伦理声明'),
    std('model-cards', 'Model Cards for Model Reporting', 'reporting', 'https://arxiv.org/abs/1810.03993', '预期用途、切片表现与限制的结构化卡片'),
  ],
  reportSections: ['预期用途与越界使用', '数据来源、切分与污染', '基线、指标与评估协议', '训练/推理环境与复现', '不确定性与子群', '安全评估、模型卡与监测'],
  reviewRoles: [
    { id: 'ml', label: label('机器学习审查', 'ML review') },
    { id: 'safety', label: label('安全/伦理审查', 'Safety / ethics review') },
  ],
  monitoring: {
    required: true,
    planMin: 20,
    ownerMin: 2,
    cadenceMin: 2,
    signals: ['accuracy_drift', 'data_drift', 'safety_incident', 'eval_regression'],
    guidance: '上线后跟踪数据漂移、精度/校准、子群退化与安全事件；写明回滚与停用条件。',
  },
  fields: [
    text('intended_use', 'scoping', '预期用途与用户', 'Intended use and users', { min: 20, help: '谁在什么场景使用、输入输出、决策影响' }),
    text('out_of_scope', 'scoping', '明确排除的用途', 'Explicitly out-of-scope uses', { min: 12, help: '不应使用的人群、场景与高风险用途' }),
    choice('risk_tier', 'scoping', '风险等级', 'Risk tier', ['low', 'limited', 'high'], { help: '按组织/法规口径分级，并说明理由' }),
    text('human_oversight', 'scoping', '人类监督与申诉路径', 'Human oversight and appeal path', { min: 12, help: '谁复核、何时可推翻、如何申诉' }),
    text('baselines', 'survey', '基线与对照', 'Baselines and comparators', { min: 16, help: '朴素基线、之前方法、同等算力基线' }),
    text('benchmarks', 'survey', '基准与指标口径', 'Benchmarks and metric definitions', { min: 8, help: '数据集版本、指标定义与显著性口径' }),
    text('data_provenance', 'survey', '数据来源与许可', 'Data provenance and licensing', { min: 16, help: '采集方式、同意/许可、敏感属性与保留策略' }),
    text('contamination_check', 'survey', '训练/测试污染检查', 'Train/test contamination check', { min: 16, help: '去重、时间切分、基准泄漏与污染检查结果' }),
    text('data_splits', 'design', '数据切分与防泄漏', 'Data splits and leakage control', { min: 16, help: '训练/验证/测试、分组切分、时间切分与预处理边界' }),
    text('evaluation_protocol', 'design', '评估协议与主指标', 'Evaluation protocol and primary metric', { min: 20, help: '主指标、单次/多次运行、置信区间与决策阈值' }),
    text('seeds', 'design', '随机种子与重复次数', 'Seeds and repetitions', { min: 8, help: '种子列表/数量；报告均值与方差，而非单次最优' }),
    text('compute_budget', 'design', '算力与时间预算', 'Compute and time budget', { min: 8, help: 'GPU/CPU 小时、参数规模与碳/成本约束' }),
    text('environment', 'execute', '软件环境与锁文件', 'Software environment and lockfile', { min: 12, help: '框架/驱动版本、容器镜像与依赖锁' }),
    text('hardware', 'execute', '硬件与并行配置', 'Hardware and parallelism', { min: 8, help: '设备型号、显存、精度与并行策略' }),
    text('inference_params', 'execute', '推理参数与后处理', 'Inference parameters and post-processing', { min: 12, help: '解码/阈值/后处理与任何人工规则' }),
    text('uncertainty', 'analyze', '不确定性与置信区间', 'Uncertainty and confidence intervals', { min: 12, help: '重复运行、bootstrap、校准或贝叶斯区间' }),
    text('ablation', 'analyze', '消融与关键组件', 'Ablations and key components', { min: 16, help: '去掉哪些组件会怎样，避免只报最优组合' }),
    text('subgroup', 'analyze', '子群与公平性切片', 'Subgroups and fairness slices', { min: 16, help: '关键人群/场景的样本量与性能差异' }),
    text('calibration', 'analyze', '校准与阈值行为', 'Calibration and threshold behavior', { min: 12, help: '概率校准、阈值—误差权衡与拒识策略' }),
    text('limitations', 'write', '局限、失效模式与滥用', 'Limitations, failure modes and misuse', { min: 16, help: '分布外、对抗输入、错误代价与滥用路径' }),
    text('model_card', 'write', '模型卡', 'Model card', { min: 16, help: '用途、训练数据、指标、切片、限制与维护者' }),
    text('data_card', 'write', '数据卡/数据说明', 'Data card / datasheet', { min: 16, help: '来源、采集、标注、许可、偏差与敏感信息' }),
    text('license', 'write', '模型与数据许可', 'Model and data license', { min: 8, help: '权重/代码/数据许可与商用限制' }),
    text('safety_eval', 'release', '安全评估与红队结果', 'Safety evaluation and red-team results', { min: 16, help: '越狱、有害输出、数据泄露与工具滥用测试' }),
    text('model_access', 'release', '发布方式与访问控制', 'Release mode and access control', { min: 12, help: '开放权重/API/托管、速率限制与滥用监控' }),
    text('incident_policy', 'release', '事件响应与回滚', 'Incident response and rollback', { min: 12, help: '谁响应、多久、如何回滚/撤下模型' }),
  ],
  rules: [],
}

const medicine = {
  id: 'medicine',
  title: label('医学与临床研究', 'Medicine and clinical research'),
  summary: label(
    '从 PICO 到 GRADE：把注册、伦理、偏倚、缺失数据和报告清单放在结果之前，而不是事后补。',
    'From PICO to GRADE: put registration, ethics, bias, missing data and reporting checklists before results, not after.',
  ),
  standards: [
    std('prisma-2020', 'PRISMA 2020', 'reporting', 'https://www.prisma-statement.org/prisma-2020-statement', '系统综述的 27 项清单与流程图', {
      when: { field: 'study_design', in: ['systematic-review', 'meta-analysis'] },
      whenNote: '仅系统综述/元分析适用',
    }),
    std('consort-2025', 'CONSORT 2025', 'reporting', 'https://jamanetwork.com/journals/jama/fullarticle/2832868', '随机试验报告清单（2025 更新）', {
      when: { field: 'study_design', in: ['rct'] },
      whenNote: '仅随机对照试验适用',
    }),
    std('strobe', 'STROBE', 'reporting', 'https://www.strobe-statement.org/', '观察性研究（队列/病例对照/横断面）报告', {
      when: { field: 'study_design', in: ['cohort', 'case-control', 'cross-sectional'] },
      whenNote: '仅观察性研究适用',
    }),
    std('rob-2', 'Cochrane RoB 2', 'method', 'https://www.riskofbias.info/welcome/rob-2-0-tool', '随机试验五个偏倚域', {
      when: { field: 'study_design', in: ['rct'] },
      whenNote: '仅随机试验适用；观察性研究用 ROBINS-I',
    }),
    std('grade', 'GRADE', 'method', 'https://www.gradeworkinggroup.org/', '证据确定性分级（高/中/低/极低）'),
    std('ich-e6r3', 'ICH E6(R3) GCP', 'regulation', 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents/e6r3-good-clinical-practice-gcp', '良好临床实践、数据治理与质量体系'),
    std('tripod-ai', 'TRIPOD+AI', 'reporting', 'https://www.tripod-statement.org/', '预测模型（含 AI）报告清单', {
      when: { field: 'study_design', in: ['diagnostic', 'prognostic'] },
      whenNote: '仅预测模型/诊断/预后研究适用',
    }),
    std('consort-ai', 'CONSORT-AI', 'reporting', 'https://www.equator-network.org/reporting-guidelines/consort-artificial-intelligence/', 'AI 干预随机试验的扩展清单', {
      when: { field: 'study_design', in: ['rct'] },
      whenNote: '仅 AI 干预随机试验适用',
    }),
  ],
  reportSections: ['PICO 与研究设计', '注册、伦理与方案偏离', '检索、筛选与 PRISMA 流程', '偏倚风险与样本量', '效应量、区间与 GRADE', '报告清单、数据共享与上市后监测'],
  reviewRoles: [
    { id: 'clinical', label: label('临床审查', 'Clinical review') },
    { id: 'statistics', label: label('统计审查', 'Statistical review') },
  ],
  monitoring: {
    required: true,
    planMin: 20,
    ownerMin: 2,
    cadenceMin: 2,
    signals: ['adverse_events', 'protocol_deviations', 'data_quality', 'safety_signal'],
    guidance: '发布/试验后跟踪不良事件、方案偏离与数据质量；写明安全性报告与方案修订的触发条件。',
  },
  fields: [
    text('population', 'scoping', '目标人群与纳排标准', 'Population and eligibility', { min: 8, help: '疾病/人群、纳入排除、招募来源' }),
    text('intervention', 'scoping', '干预/暴露', 'Intervention or exposure', { min: 4, help: '剂量、疗程、实施者与依从性' }),
    text('comparator', 'scoping', '对照', 'Comparator', { min: 4, help: '安慰剂/常规照护/阳性对照' }),
    text('outcomes', 'scoping', '主要与次要结局', 'Primary and secondary outcomes', { min: 12, help: '定义、时点、测量工具与最小临床重要差异' }),
    choice('study_design', 'scoping', '研究设计', 'Study design', ['rct', 'cohort', 'case-control', 'cross-sectional', 'diagnostic', 'prognostic', 'systematic-review', 'meta-analysis', 'other'], { help: '设计决定偏倚工具与报告清单' }),
    text('registration_id', 'scoping', '注册号/注册状态', 'Registration ID or status', { min: 8, help: '试验注册号；未注册需写明原因与时间' }),
    text('ethics_approval', 'scoping', '伦理审批与知情同意', 'Ethics approval and consent', { min: 12, help: '批件号、机构、知情同意/豁免' }),
    text('search_strategy', 'survey', '检索策略与日期', 'Search strategy and dates', { min: 20, help: '数据库、检索式、限定条件、最后检索日', when: { field: 'study_design', in: ['systematic-review', 'meta-analysis'] }, whenNote: '仅系统综述/元分析适用' }),
    text('databases', 'survey', '数据库与灰色文献', 'Databases and grey literature', { min: 8, help: '数据库列表、注册平台、试验报告与手检', when: { field: 'study_design', in: ['systematic-review', 'meta-analysis'] }, whenNote: '仅系统综述/元分析适用' }),
    text('screening', 'survey', '筛选与提取流程', 'Screening and extraction process', { min: 12, help: '双人独立、分歧解决、提取表与预试', when: { field: 'study_design', in: ['systematic-review', 'meta-analysis'] }, whenNote: '仅系统综述/元分析适用' }),
    number('prisma_identified', 'survey', 'PRISMA 识别记录数', 'PRISMA records identified', { min: 1, help: '去重前后的口径要写明', when: { field: 'study_design', in: ['systematic-review', 'meta-analysis'] }, whenNote: '仅系统综述/元分析适用' }),
    number('prisma_included', 'survey', 'PRISMA 纳入研究数', 'PRISMA studies included', { min: 1, help: '纳入数不能大于识别数', when: { field: 'study_design', in: ['systematic-review', 'meta-analysis'] }, whenNote: '仅系统综述/元分析适用' }),
    choice('risk_of_bias_tool', 'survey', '偏倚风险工具', 'Risk-of-bias tool', ['RoB-2', 'ROBINS-I', 'QUADAS-2', 'PROBAST', 'other'], { help: '与设计匹配，不用错工具' }),
    text('sample_size', 'design', '样本量与把握度', 'Sample size and power', { min: 12, help: '效应假设、α、把握度、脱落率与计算工具' }),
    text('randomization', 'design', '随机化与分配隐藏', 'Randomization and allocation concealment', { min: 12, help: '序列生成、分层/区组、分配隐藏', when: { field: 'study_design', in: ['rct'] }, whenNote: '仅随机对照试验适用' }),
    text('blinding', 'design', '盲法', 'Blinding', { min: 12, help: '谁被盲、如何揭盲、盲法失败的处理', when: { field: 'study_design', in: ['rct'] }, whenNote: '仅随机对照试验适用' }),
    choice('analysis_set', 'design', '分析集', 'Analysis set', ['ITT', 'PP', 'safety', 'other'], { help: '主分析集及理由' }),
    text('missing_data', 'design', '缺失数据处理', 'Missing data handling', { min: 12, help: '缺失机制、插补/敏感分析、脱落' }),
    text('data_lock', 'execute', '数据锁定与版本', 'Data lock and version', { min: 12, help: '锁库日期、数据集版本与变更记录' }),
    text('protocol_deviations', 'execute', '方案偏离', 'Protocol deviations', { min: 8, help: '偏离分类、例数、对分析的影响' }),
    text('adverse_events', 'execute', '不良事件与安全性', 'Adverse events and safety', { min: 8, help: 'AE/SAE 定义、例数、严重程度与报告' }),
    choice('effect_measure', 'analyze', '效应量', 'Effect measure', ['RR', 'OR', 'HR', 'MD', 'SMD', 'other'], { help: '与设计/结局匹配' }),
    text('confidence_interval', 'analyze', '置信区间与精度', 'Confidence interval and precision', { min: 12, help: '95% CI、聚类/稳健标准误' }),
    text('multiplicity', 'analyze', '多重性控制', 'Multiplicity control', { min: 12, help: '主要/次要终点、分层检验或校正' }),
    text('risk_of_bias', 'analyze', '偏倚风险判断', 'Risk-of-bias judgement', { min: 12, help: '每个域的判断与支持理由' }),
    choice('certainty', 'analyze', 'GRADE 证据确定性', 'GRADE certainty', ['high', 'moderate', 'low', 'very-low'], { help: '按结局分级并写明降级理由' }),
    text('sensitivity', 'analyze', '敏感性/亚组分析', 'Sensitivity and subgroup analyses', { min: 12, help: '预设 vs 事后、亚组交互与稳健性' }),
    choice('reporting_guideline', 'write', '报告清单', 'Reporting guideline', ['CONSORT-2025', 'STROBE', 'PRISMA-2020', 'TRIPOD+AI', 'CONSORT-AI', 'other'], { help: '与研究设计匹配' }),
    text('checklist', 'write', '清单完成情况', 'Checklist completion', { min: 16, help: '逐项位置/页码，未适用项的理由' }),
    text('funding', 'write', '资助来源', 'Funding', { min: 8, help: '资助方、项目号、资助者角色' }),
    text('conflicts', 'write', '利益冲突', 'Conflicts of interest', { min: 8, help: '作者、机构、申办方的利益关系' }),
    text('data_sharing', 'write', '数据共享与可及性', 'Data sharing and availability', { min: 12, help: '去标识数据、代码、分析计划的可及方式' }),
    text('safety_reporting', 'release', '安全性报告计划', 'Safety reporting plan', { min: 12, help: '向伦理/监管/申办方报告的路径与时限' }),
    text('registration_update', 'release', '注册与方案更新', 'Registration and protocol updates', { min: 8, help: '结果回填、方案修订与版本记录' }),
    text('ethics_statement', 'release', '伦理与利益声明', 'Ethics and interests statement', { min: 12, help: '发表时的伦理批件、知情同意与利益声明' }),
  ],
  rules: [
    {
      id: 'prisma_included_lte_identified',
      stage: 'survey',
      kind: 'compare',
      left: 'prisma_included',
      right: 'prisma_identified',
      op: 'lte',
      detail: 'PRISMA 纳入研究数不能大于识别记录数',
    },
  ],
}

const industrial = {
  id: 'industrial',
  title: label('工业与工程研究', 'Industrial and engineering research'),
  summary: label(
    '把测量系统、实验设计、安全案例和追溯链当成研究的一部分：先证明量得准，再证明结论稳。',
    'Make measurement systems, design of experiments, safety cases and traceability part of the research: prove the measurement before the conclusion.',
  ),
  standards: [
    std('iso-17025', 'ISO/IEC 17025:2017', 'accreditation', 'https://www.iso.org/standard/66912.html', '检测/校准实验室的能力、公正性与结果有效性'),
    std('iatf-16949', 'IATF 16949:2016', 'industry', 'https://www.iatfglobaloversight.org/', '汽车行业质量管理体系；MSA/SPC 为常见核心工具'),
    std('aiag-msa', 'AIAG MSA Manual', 'method', 'https://www.aiag.org/', '测量系统分析：偏倚、线性、稳定性、GR&R'),
    std('iso-13849-1', 'ISO 13849-1:2023', 'safety', 'https://www.iso.org/standard/69883.html', '机械安全控制系统的性能等级（PL）'),
    std('iec-61508', 'IEC 61508', 'safety', 'https://webstore.iec.ch/publication/5515', '功能安全生命周期与 SIL'),
    std('iso-9001', 'ISO 9001:2015', 'management-system', 'https://www.iso.org/standard/62085.html', '质量管理体系的文件化与持续改进'),
  ],
  reportSections: ['系统边界、需求与危害', '测量系统与校准', '实验设计（因子/水平/重复/随机化）', '假设、不确定度与确认运行', '安全案例与可追溯性', '质量记录与生产监测'],
  reviewRoles: [
    { id: 'engineering', label: label('工程审查', 'Engineering review') },
    { id: 'quality', label: label('质量/安全审查', 'Quality / safety review') },
  ],
  monitoring: {
    required: true,
    planMin: 20,
    ownerMin: 2,
    cadenceMin: 2,
    signals: ['spc_alert', 'calibration_due', 'defect_rate', 'safety_incident'],
    guidance: '转产/上线后跟踪 SPC 告警、校准到期、缺陷率与安全事件；写明停线、召回与再验证触发条件。',
  },
  fields: [
    text('system_boundary', 'scoping', '系统边界与对象', 'System boundary and object', { min: 12, help: '设备/工艺/材料边界、接口与不在范围内的部分' }),
    text('operating_context', 'scoping', '运行环境与工况', 'Operating context and conditions', { min: 16, help: '温湿度、负载、班次、供电、维护与极端工况' }),
    text('requirements', 'scoping', '需求与验收指标', 'Requirements and acceptance metrics', { min: 16, help: '功能、性能、可靠性、法规与客户要求' }),
    text('hazards', 'scoping', '危害与失效模式', 'Hazards and failure modes', { min: 12, help: '危险源、失效后果、初始风险与安全相关功能' }),
    text('standards', 'scoping', '适用标准与条款', 'Applicable standards and clauses', { min: 12, help: '标准版本、适用条款与差距说明' }),
    text('prior_art', 'survey', '既有数据与先验试验', 'Prior data and earlier trials', { min: 16, help: '历史批次、供应商数据、试产与已知问题' }),
    text('measurement_plan', 'survey', '测量计划与量具', 'Measurement plan and gauges', { min: 16, help: '被测量、量具、分辨率、采样与操作者' }),
    text('msa', 'survey', '测量系统分析（MSA）', 'Measurement system analysis (MSA)', { min: 12, help: 'GR&R、偏倚、线性、稳定性与接受准则' }),
    text('calibration', 'survey', '校准与溯源', 'Calibration and traceability', { min: 12, help: '校准机构、证书、不确定度与溯源链' }),
    choice('design_type', 'design', '实验设计类型', 'Design type', ['doe', 'full-factorial', 'fractional', 'response-surface', 'acceptance', 'reliability', 'other'], { help: '与问题匹配；观察性数据不能冒充 DOE' }),
    text('factors', 'design', '因子与水平', 'Factors and levels', { min: 16, help: '可控因子、水平、范围与固定条件', when: { field: 'design_type', in: ['doe', 'full-factorial', 'fractional', 'response-surface'] }, whenNote: '仅 DOE/因子实验适用' }),
    text('levels', 'design', '水平设置依据', 'Level rationale', { min: 12, help: '为什么选这些水平、是否覆盖规格边界', when: { field: 'design_type', in: ['doe', 'full-factorial', 'fractional', 'response-surface'] }, whenNote: '仅 DOE/因子实验适用' }),
    number('replicates', 'design', '重复次数', 'Replicates', { min: 2, help: '独立重复（不是同一样品重复测量）', when: { field: 'design_type', in: ['doe', 'full-factorial', 'fractional', 'response-surface', 'reliability'] }, whenNote: '仅需要重复的 DOE/可靠性设计适用' }),
    text('randomization', 'design', '随机化与区组', 'Randomization and blocking', { min: 12, help: '运行顺序、区组、嵌套与盲法', when: { field: 'design_type', in: ['doe', 'full-factorial', 'fractional', 'response-surface'] }, whenNote: '仅 DOE/因子实验适用' }),
    text('acceptance_criteria', 'design', '接受准则与判定规则', 'Acceptance criteria and decision rules', { min: 16, help: '事先写明的合格/不合格阈值与统计判定' }),
    text('safety_review', 'design', '安全评审', 'Safety review', { min: 12, help: '安全相关功能、PL/SIL 目标与评审结论' }),
    text('environment', 'execute', '执行环境与设备状态', 'Execution environment and equipment state', { min: 12, help: '设备编号、夹具、环境记录与停机' }),
    text('raw_data', 'execute', '原始数据与采集', 'Raw data and acquisition', { min: 12, help: '原始文件、采样率、时间同步与不可篡改存储' }),
    text('deviations', 'execute', '偏离与异常处理', 'Deviations and anomalies', { min: 8, help: '偏离、异常点、返工与是否纳入分析' }),
    text('calibration_record', 'execute', '校准记录与有效期', 'Calibration records and validity', { min: 12, help: '试验期间校准状态、到期日与中间核查' }),
    text('effect_estimates', 'analyze', '效应估计与显著性', 'Effect estimates and significance', { min: 12, help: '主效应/交互、效应大小、区间与模型假设' }),
    text('assumptions', 'analyze', '统计假设与诊断', 'Statistical assumptions and diagnostics', { min: 12, help: '正态/等方差/独立性检查与变换' }),
    text('uncertainty', 'analyze', '测量不确定度', 'Measurement uncertainty', { min: 12, help: 'A/B 类分量、合成与扩展不确定度' }),
    text('confirmation_run', 'analyze', '确认运行', 'Confirmation run', { min: 12, help: '在新批次/新条件上验证最优设置，而非只用训练数据' }),
    text('capability', 'analyze', '过程能力与稳定性', 'Process capability and stability', { min: 12, help: 'Cp/Cpk、控制图、批间差异与漂移' }),
    choice('reporting_standard', 'write', '报告/质量体系口径', 'Reporting / QMS basis', ['ISO-17025', 'IATF-16949', 'ISO-9001', 'IEC-61508', 'ISO-13849', 'other'], { help: '按哪套体系组织记录与报告' }),
    text('test_report', 'write', '试验报告', 'Test report', { min: 16, help: '方法、样品、条件、结果、判定与签字' }),
    text('limitations', 'write', '局限与外推边界', 'Limitations and extrapolation boundary', { min: 16, help: '不能外推到哪些材料/工况/批次' }),
    text('safety_case', 'write', '安全案例', 'Safety case', { min: 16, help: '安全目标、证据、残余风险与评审结论' }),
    text('traceability', 'release', '追溯链', 'Traceability chain', { min: 16, help: '样品/批次/设备/校准/数据/报告的单向追溯' }),
    text('quality_record', 'release', '质量记录归档', 'Quality record archiving', { min: 12, help: '记录清单、保存期限、权限与备份' }),
    text('safety_signoff', 'release', '安全签核', 'Safety sign-off', { min: 12, help: '谁批准、依据什么、残余风险是否接受' }),
  ],
  rules: [],
}

export const DOMAINS = Object.freeze([finance, ai, medicine, industrial])

export const DOMAIN_IDS = Object.freeze(DOMAINS.map((domain) => domain.id))

const byId = new Map(DOMAINS.map((domain) => [domain.id, domain]))
const fieldIndex = new Map(
  DOMAINS.map((domain) => [domain.id, new Map(domain.fields.map((item) => [item.id, item]))]),
)

for (const domain of DOMAINS) {
  for (const item of domain.fields) {
    if (!STAGE_ORDER.includes(item.stage)) {
      throw new Error(`domain ${domain.id} field ${item.id} has unknown stage ${item.stage}`)
    }
  }
  for (const rule of domain.rules || []) {
    if (!STAGE_ORDER.includes(rule.stage)) {
      throw new Error(`domain ${domain.id} rule ${rule.id} has unknown stage ${rule.stage}`)
    }
  }
}

export function getDomain(id) {
  return byId.get(String(id || '')) || null
}

export function domainSummary(domain) {
  return {
    id: domain.id,
    title: domain.title,
    summary: domain.summary,
    fieldCount: domain.fields.length,
    requiredFieldCount: domain.fields.filter((item) => item.required !== false).length,
    conditionalFieldCount: domain.fields.filter((item) => item.when).length,
    stages: STAGE_ORDER.filter((stage) => domain.fields.some((item) => item.stage === stage)),
    standards: domain.standards.map((item) => ({
      id: item.id,
      title: item.title,
      kind: item.kind,
      url: item.url,
      ...(item.when ? { when: item.when, whenNote: item.whenNote || '' } : {}),
    })),
    reviewRoles: domain.reviewRoles,
  }
}

export function listDomains() {
  return DOMAINS.map(domainSummary)
}

export function domainDetail(domain) {
  return {
    ...domainSummary(domain),
    reportSections: domain.reportSections,
    monitoring: domain.monitoring,
    fields: domain.fields.map((item) => ({
      id: item.id,
      stage: item.stage,
      label: item.label,
      type: item.type,
      required: item.required !== false,
      min: item.min,
      ...(item.when ? { when: item.when, whenNote: item.whenNote || '' } : {}),
      ...(item.options ? { options: item.options } : {}),
      ...(item.patternHint ? { patternHint: item.patternHint } : {}),
      ...(item.help ? { help: item.help } : {}),
    })),
    rules: (domain.rules || []).map((rule) => ({ ...rule })),
  }
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function numericValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function validDateText(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/**
 * A genuinely inapplicable protocol field may be waived, but only with a
 * written reason: "N/A — cohort design has no randomisation". This keeps the
 * checklist honest for designs that do not have every item, without silently
 * turning a required field into an optional one.
 */
function notApplicableReason(value) {
  const text = stringValue(value)
  const match = text.match(/^(?:n\/?a|不适用)\s*[-—:：]\s*(.+)$/iu)
  if (!match) return null
  const reason = match[1].trim()
  return reason.length >= 6 ? reason : null
}

/**
 * Conditional applicability is data too. A field can depend on one or more
 * protocol choices (for example, PRISMA counts only exist for a systematic
 * review), and a standard can be a reference rather than a requirement for a
 * given design. Conditions are declarative so profiles stay serialisable.
 */
function conditionMatches(condition, state) {
  if (!condition) return true
  if (Array.isArray(condition.all)) return condition.all.every((item) => conditionMatches(item, state))
  if (Array.isArray(condition.any)) return condition.any.some((item) => conditionMatches(item, state))
  if (!condition.field) return true
  const value = fieldValue(state, condition.field)
  const text = value === undefined || value === null ? '' : String(value).trim()
  if (condition.in && !condition.in.map((item) => String(item)).includes(text)) return false
  if (condition.notIn && condition.notIn.map((item) => String(item)).includes(text)) return false
  if (condition.equals !== undefined && text !== String(condition.equals)) return false
  if (condition.present === true && !text) return false
  if (condition.present === false && text) return false
  return true
}

export function fieldApplicability(item, state) {
  if (!item || !item.when) return { applicable: true, reason: '' }
  if (!state) return { applicable: true, reason: '' }
  const applicable = conditionMatches(item.when, state)
  return {
    applicable,
    reason: applicable ? '' : item.whenNote || '按当前研究设计/风险等级，本项不适用',
  }
}

export function fieldApplicable(item, state) {
  return fieldApplicability(item, state).applicable
}

export function standardApplicability(standard, state) {
  if (!standard || !standard.when) return { applicable: true, reason: '' }
  if (!state) return { applicable: true, reason: '' }
  const applicable = conditionMatches(standard.when, state)
  return {
    applicable,
    reason: applicable ? '' : standard.whenNote || '当前设计/风险等级下仅作参考，不作为适用要求',
  }
}

export function fieldValue(state, fieldId) {
  const data = state && state.domainData && typeof state.domainData === 'object' ? state.domainData : {}
  return data[fieldId]
}

export function fieldSatisfied(item, value, state = null) {
  if (item.required === false) return true
  if (!fieldApplicable(item, state)) return true
  if (notApplicableReason(value)) return true
  if (item.type === 'number') {
    const numberValue = numericValue(value)
    if (numberValue === null) return false
    if (numberValue < (item.min ?? 0)) return false
    if (Number.isFinite(item.max) && numberValue > item.max) return false
    return true
  }
  const valueText = stringValue(value)
  if (valueText.length < (item.min ?? 8)) return false
  if (item.type === 'date' && !validDateText(valueText)) return false
  if (item.options && !item.options.includes(valueText)) return false
  if (item.pattern) {
    try {
      if (!new RegExp(item.pattern, 'u').test(valueText)) return false
    } catch {
      return false
    }
  }
  if (item.includeAny && !item.includeAny.some((phrase) => valueText.toLowerCase().includes(String(phrase).toLowerCase()))) {
    return false
  }
  return true
}

export function fieldProblem(item, value, state = null) {
  if (fieldSatisfied(item, value, state)) return ''
  const name = item.label.zh
  const text = stringValue(value)
  if (/^(?:n\/?a|不适用)/iu.test(text)) return `${name}：N/A 必须附至少 6 字理由（N/A — 原因）`
  if (item.type === 'number') {
    const numberValue = numericValue(value)
    if (numberValue === null) return `${name}：请填写数字`
    return `${name}：至少为 ${item.min ?? 0}（当前 ${numberValue}）`
  }
  const valueText = text
  if (!valueText) return `${name}：未填写`
  if (valueText.length < (item.min ?? 8)) return `${name}：至少 ${item.min ?? 8} 个字符（当前 ${valueText.length}）`
  if (item.type === 'date' && !validDateText(valueText)) return `${name}：必须是有效日期 ${item.patternHint || 'YYYY-MM-DD'}`
  if (item.options && !item.options.includes(valueText)) return `${name}：必须是 ${item.options.join(' / ')}`
  if (item.pattern) return `${name}：格式应为 ${item.patternHint || item.pattern}`
  if (item.includeAny) return `${name}：需包含 ${item.includeAny.join(' 或 ')}`
  return `${name}：不符合要求`
}

export function domainMissing(state, { stage = null } = {}) {
  const profile = getDomain(state && state.domain)
  if (!profile) return []
  return profile.fields
    .filter((item) => item.required !== false)
    .filter((item) => fieldApplicable(item, state))
    .filter((item) => !stage || item.stage === stage)
    .filter((item) => !fieldSatisfied(item, fieldValue(state, item.id), state))
    .map((item) => ({
      id: item.id,
      stage: item.stage,
      label: item.label,
      problem: fieldProblem(item, fieldValue(state, item.id), state),
    }))
}

export function domainCompleteness(state) {
  const profile = getDomain(state && state.domain)
  if (!profile) return { required: 0, filled: 0, missing: 0, missingFields: [], notApplicable: 0 }
  const required = profile.fields.filter((item) => item.required !== false && fieldApplicable(item, state))
  const notApplicable = profile.fields.filter((item) => item.required !== false && !fieldApplicable(item, state)).length
  const missingFields = domainMissing(state)
  return {
    required: required.length,
    filled: required.length - missingFields.length,
    missing: missingFields.length,
    missingFields,
    notApplicable,
  }
}

function ruleCheck(profile, state, rule) {
  const fields = new Map(profile.fields.map((item) => [item.id, item]))
  for (const id of [rule.left, rule.right].filter(Boolean)) {
    const item = fields.get(id)
    if (item && !fieldApplicable(item, state)) return null
  }
  if (rule.kind === 'date_order') {
    const left = stringValue(fieldValue(state, rule.left))
    const right = stringValue(fieldValue(state, rule.right))
    if (!validDateText(left) || !validDateText(right)) return null
    const leftTime = Date.parse(left)
    const rightTime = Date.parse(right)
    if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return null
    return { ok: leftTime < rightTime, detail: rule.detail || '日期顺序不正确' }
  }
  if (rule.kind === 'compare') {
    const left = numericValue(fieldValue(state, rule.left))
    const right = numericValue(fieldValue(state, rule.right))
    if (left === null || right === null) return null
    const operations = {
      lt: left < right,
      lte: left <= right,
      gt: left > right,
      gte: left >= right,
      eq: left === right,
    }
    return { ok: operations[rule.op] === true, detail: rule.detail || '数值关系不满足' }
  }
  return null
}

function reviewerName(review) {
  return stringValue(review && review.reviewer)
}

function reviewEligible(review) {
  if (!review || !reviewerName(review)) return false
  if (/^anonymous(?:\s+reviewer)?$/iu.test(reviewerName(review))) return false
  // Reviews written before 0.5 have no identity envelope; keep them usable so
  // an upgrade does not invalidate a project that was already released.
  if (!review.schema || Number(review.schema) < 2) return true
  return (
    stringValue(review.affiliation).length >= 2 &&
    stringValue(review.conflict).length >= 2 &&
    review.independent !== false
  )
}

function roleChecks(profile, state) {
  const reviews = Array.isArray(state.reviews) ? state.reviews : []
  const checks = profile.reviewRoles.map((role) => {
    const found = reviews.filter((review) => review && review.role === role.id)
    const eligible = found.filter(reviewEligible)
    const detail = eligible.length
      ? `${role.label.zh} 已由 ${eligible.map((review) => reviewerName(review)).join('、')} 完成`
      : found.length
        ? `${role.label.zh} 的评审缺少独立身份（姓名、机构、利益冲突声明、independent=true）`
        : `需要 ${role.label.zh} 角色的审查记录`
    return {
      code: `domain_${profile.id}_review_${role.id}`,
      ok: eligible.length > 0,
      detail,
      blocking: true,
    }
  })
  const identities = profile.reviewRoles
    .flatMap((role) =>
      reviews
        .filter((review) => review && review.role === role.id && reviewEligible(review))
        .map((review) => ({ role: role.id, name: reviewerName(review).toLowerCase() })),
    )
  const collision = identities.find((item, index) =>
    identities.some((other, otherIndex) => otherIndex !== index && other.role !== item.role && other.name === item.name),
  )
  if (collision) {
    checks.push({
      code: `domain_${profile.id}_review_independence`,
      ok: false,
      detail: `同一评审人 ${collision.name} 同时签署多个领域角色；需要相互独立的评审人`,
      blocking: true,
    })
  }
  return checks
}

function monitoringChecks(profile, state) {
  if (!profile.monitoring || profile.monitoring.required === false) return []
  const monitoring = normalizeMonitoring(state.monitoring)
  const assessment = evaluateMonitoring(monitoring)
  const plan = monitoring.plan
  const owner = monitoring.owner
  const cadence = monitoring.cadence
  const statusOk = monitoring.status === 'planned' || monitoring.status === 'active'
  const ok =
    statusOk &&
    plan.length >= (profile.monitoring.planMin || 20) &&
    owner.length >= (profile.monitoring.ownerMin || 2) &&
    cadence.length >= (profile.monitoring.cadenceMin || 2) &&
    assessment.alerts.length === 0
  const alertDetail = assessment.alerts.length
    ? `；当前有 ${assessment.alerts.length} 个监测告警：${assessment.alerts.map((item) => `${item.metric} ${item.detail}`).join('；')}`
    : ''
  return [
    {
      code: `domain_${profile.id}_monitoring`,
      ok,
      detail: `发布前需登记监测计划（状态 planned/active、计划≥${profile.monitoring.planMin || 20}字、负责人、频率、无未处理告警）：${profile.monitoring.guidance}${alertDetail}`,
      blocking: true,
    },
  ]
}

export function domainChecks(state, stage) {
  if (!state || !state.domain || state.domain === GENERAL_DOMAIN) return []
  const profile = getDomain(state.domain)
  if (!profile) {
    return [
      {
        code: 'domain_profile',
        ok: false,
        detail: `未知领域档案：${state.domain}`,
        blocking: true,
      },
    ]
  }
  if (!STAGE_ORDER.includes(stage)) return []
  const checks = []
  for (const item of profile.fields) {
    if (item.stage !== stage || item.required === false) continue
    if (!fieldApplicable(item, state)) continue
    const ok = fieldSatisfied(item, fieldValue(state, item.id), state)
    checks.push({
      code: `domain_${profile.id}_${item.id}`,
      ok,
      detail: ok ? `${item.label.zh} 已登记` : fieldProblem(item, fieldValue(state, item.id), state),
      blocking: true,
    })
  }
  for (const rule of profile.rules || []) {
    if (rule.stage !== stage) continue
    const evaluated = ruleCheck(profile, state, rule)
    if (!evaluated) continue
    checks.push({
      code: `domain_${profile.id}_${rule.id}`,
      ok: evaluated.ok,
      detail: evaluated.detail,
      blocking: true,
    })
  }
  if (stage === 'review') checks.push(...roleChecks(profile, state))
  if (stage === 'release') checks.push(...monitoringChecks(profile, state))
  return checks
}

export function domainGateSummary(state, stage = null) {
  const targetStage = stage || (state && state.stage) || 'scoping'
  return {
    domain: state && state.domain ? state.domain : null,
    stage: targetStage,
    checks: domainChecks(state, targetStage),
    completeness: domainCompleteness(state),
  }
}

export function validateDomainValues(profile, values) {
  if (!profile) return { ok: false, values: {}, errors: ['未知领域档案'] }
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    return { ok: false, values: {}, errors: ['values 必须是对象'] }
  }
  const errors = []
  const normalized = {}
  const index = fieldIndex.get(profile.id) || new Map()
  for (const [key, raw] of Object.entries(values)) {
    const item = index.get(key)
    if (!item) {
      errors.push(`未知字段：${key}`)
      continue
    }
    if (raw === null || raw === undefined || raw === '') {
      normalized[key] = item.type === 'number' ? null : ''
      continue
    }
    if (notApplicableReason(raw)) {
      normalized[key] = String(raw).trim()
      continue
    }
    if (/^(?:n\/?a|不适用)/iu.test(String(raw).trim())) {
      errors.push(`${item.label.zh}：N/A 必须附至少 6 字理由（N/A — 原因）`)
      continue
    }
    if (item.type === 'number') {
      const parsed = numericValue(raw)
      if (parsed === null) {
        errors.push(`${item.label.zh}：必须是数字`)
        continue
      }
      if (parsed < (item.min ?? 0)) {
        errors.push(`${item.label.zh}：至少为 ${item.min ?? 0}`)
        continue
      }
      if (Number.isFinite(item.max) && parsed > item.max) {
        errors.push(`${item.label.zh}：最大为 ${item.max}`)
        continue
      }
      normalized[key] = parsed
      continue
    }
    const valueText = String(raw).trim()
    if (valueText.length > 2000) {
      errors.push(`${item.label.zh}：最多 2000 字符`)
      continue
    }
    if (item.options && !item.options.includes(valueText)) {
      errors.push(`${item.label.zh}：必须是 ${item.options.join(' / ')}`)
      continue
    }
    if (item.pattern) {
      let matched = false
      try {
        matched = new RegExp(item.pattern, 'u').test(valueText)
      } catch {
        matched = false
      }
      if (!matched) {
        errors.push(`${item.label.zh}：格式应为 ${item.patternHint || item.pattern}`)
        continue
      }
    }
    if (item.type === 'date' && !validDateText(valueText)) {
      errors.push(`${item.label.zh}：必须是有效日期 ${item.patternHint || 'YYYY-MM-DD'}`)
      continue
    }
    normalized[key] = valueText
  }
  return { ok: errors.length === 0, values: normalized, errors }
}

export function domainValueDefaults(profile) {
  const values = {}
  for (const item of profile.fields) {
    if (item.type === 'number') {
      values[item.id] = Math.max(item.min ?? 0, 1)
      continue
    }
    if (item.type === 'enum') {
      values[item.id] = item.options[0]
      continue
    }
    if (item.type === 'date') {
      values[item.id] = item.id.includes('start') || item.id.includes('oos') ? '2025-01-01' : '2024-12-31'
      continue
    }
    if (item.includeAny) {
      const base = String(item.includeAny[0])
      let value = base
      while (value.length < (item.min ?? 8)) value += ` ${base}`
      values[item.id] = value
      continue
    }
    values[item.id] = '样本内容'.repeat(Math.max(1, Math.ceil((item.min ?? 8) / 4)))
  }
  return values
}

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\|/gu, '\\|')
    .replace(/\r?\n/gu, ' ')
    .slice(0, 180)
}

export function renderDomainMarkdown(state, { compact = false, title = '领域研究档案', includeMonitoring = true } = {}) {
  const lines = [`## ${title}`, '']
  if (!state || !state.domain) {
    lines.push('本活动尚未选择领域档案；当前按通用科研流程运行。')
    return lines.join('\n')
  }
  const profile = getDomain(state.domain)
  if (!profile) {
    lines.push(`领域档案 \`${state.domain}\` 不存在，请重新选择。`)
    return lines.join('\n')
  }
  const completeness = domainCompleteness(state)
  lines.push(`- 领域：**${profile.title.zh}**（\`${profile.id}\`）`)
  lines.push(`- 研究定位：${profile.summary.zh}`)
  lines.push(`- 必填字段：${completeness.filled}/${completeness.required} 已登记`)
  if (completeness.notApplicable > 0) lines.push(`- 按当前设计不适用：${completeness.notApplicable} 项（不要求填写）`)
  lines.push('- 不适用项：写 `N/A — 具体原因`（原因至少 6 字），审计与报告会保留该理由；不要留空。')
  lines.push('')

  lines.push('### 标准与清单对齐')
  lines.push('')
  lines.push('| 标准/框架 | 类型 | 适用性 | 用途 |')
  lines.push('| --- | --- | --- | --- |')
  for (const item of profile.standards) {
    const applicability = standardApplicability(item, state)
    lines.push(
      `| [${escapeCell(item.title)}](${item.url}) | ${escapeCell(item.kind)} | ${applicability.applicable ? '适用' : `参考：${escapeCell(applicability.reason)}`} | ${escapeCell(item.note)} |`,
    )
  }
  lines.push('')

  lines.push('### 报告结构建议')
  lines.push('')
  lines.push(profile.reportSections.map((item) => `- ${item}`).join('\n'))
  lines.push('')

  if (!compact) {
    lines.push('### 字段登记与闸门状态')
    lines.push('')
    lines.push('| 阶段 | 字段 | 状态 | 内容/问题 |')
    lines.push('| --- | --- | --- | --- |')
    for (const stage of STAGE_ORDER) {
      const items = profile.fields.filter((item) => item.stage === stage)
      for (const item of items) {
        const value = fieldValue(state, item.id)
        const applicability = fieldApplicability(item, state)
        const ok = fieldSatisfied(item, value, state)
        const status = !applicability.applicable ? '不适用' : ok ? '已登记' : '待补'
        const content = !applicability.applicable ? applicability.reason : ok ? value : fieldProblem(item, value, state)
        lines.push(
          `| ${stage} | ${escapeCell(item.label.zh)} (\`${item.id}\`) | ${status} | ${escapeCell(content)} |`,
        )
      }
    }
    lines.push('')
  } else if (completeness.missing > 0) {
    lines.push('### 待补必填字段')
    lines.push('')
    for (const item of completeness.missingFields.slice(0, 24)) {
      lines.push(`- \`${item.stage}\` · ${item.label.zh}：${item.problem}`)
    }
    if (completeness.missingFields.length > 24) lines.push(`- …另有 ${completeness.missingFields.length - 24} 项`)
    lines.push('')
  }

  const controlChecks = []
  for (const stage of STAGE_ORDER) {
    for (const check of domainChecks(state, stage)) {
      if (!check.code.startsWith('domain_')) continue
      if (!check.ok) controlChecks.push({ stage, ...check })
    }
  }
  if (controlChecks.length > 0) {
    lines.push('### 未通过的领域检查')
    lines.push('')
    lines.push('| 阶段 | 检查 | 说明 |')
    lines.push('| --- | --- | --- |')
    for (const check of controlChecks) {
      lines.push(`| ${check.stage} | \`${check.code}\` | ${escapeCell(check.detail)} |`)
    }
    lines.push('')
  }

  lines.push('### 审查角色')
  lines.push('')
  lines.push('| 角色 | 要求 | 状态 |')
  lines.push('| --- | --- | --- |')
  const reviews = Array.isArray(state.reviews) ? state.reviews : []
  for (const role of profile.reviewRoles) {
    const found = reviews.filter((review) => review && review.role === role.id)
    lines.push(`| ${escapeCell(role.label.zh)} (\`${role.id}\`) | ${found.length > 0 ? '已完成' : '待完成'} | ${found.length} 条审查 |`)
  }
  lines.push('')

  const monitoring = normalizeMonitoring(state.monitoring)
  if (includeMonitoring) {
    const assessment = evaluateMonitoring(monitoring)
    lines.push('### 发布后监测（闭环）')
    lines.push('')
    lines.push('| 项 | 值 |')
    lines.push('| --- | --- |')
    lines.push(`| 状态 | ${escapeCell(assessment.status)} |`)
    lines.push(`| 计划 | ${escapeCell(monitoring.plan || '未登记')} |`)
    lines.push(`| 负责人 | ${escapeCell(monitoring.owner || '未登记')} |`)
    lines.push(`| 频率 | ${escapeCell(monitoring.cadence || '未登记')} |`)
    lines.push(`| 信号 | ${escapeCell(monitoring.signals.join(', ') || profile.monitoring.signals.join(', '))} |`)
    lines.push(`| 指标 / 观测 | ${monitoring.metrics.length} / ${monitoring.observations.length} |`)
    lines.push(`| 告警 / 缺口 | ${assessment.alerts.length} / ${assessment.gaps.length} |`)
    lines.push(`| 指引 | ${escapeCell(profile.monitoring.guidance)} |`)
    if (monitoring.metrics.length) {
      lines.push('')
      lines.push('| 指标 | 目标/容差 | 最新观测 | 状态 |')
      lines.push('| --- | --- | --- | --- |')
      for (const metric of assessment.metrics) {
        const target = metric.target === null ? `${metric.min ?? '−∞'}..${metric.max ?? '∞'}` : `${metric.target} ± ${metric.tolerance}`
        lines.push(
          `| ${escapeCell(metric.name)} | ${escapeCell(target)} | ${metric.latest ? escapeCell(metric.latest.value) : '—'} | ${escapeCell(metric.status)} |`,
        )
      }
    }
    if (assessment.alerts.length) {
      lines.push('')
      lines.push('> 未处理告警：' + assessment.alerts.map((item) => `${item.metric}（${item.detail}）`).join('；'))
    }
    lines.push('')
  }
  lines.push('> 说明：以上为标准/清单对齐提示，用于组织研究记录；不构成认证、法律或临床合规结论。')
  return lines.join('\n')
}
